import { OceanFishingGame, type OceanAction, type OceanPhase, type OceanFishingGameSnapshot } from "../ocean-game.js";
import { isFishSpeciesId, randomActiveFishSpeciesId, type FishSpeciesId } from "../fish-species.js";
import { canContinueAfterCatchSave, oceanCommandSchema, type OceanMessage, type CatchSaveStatus } from "../ocean-contract.js";
import { recordCatch } from "./d1-store.js";
import type { CloudflareEnv, DurableObjectState, DurableSocket } from "./types.js";
import { ESCAPE_ANIMATION_MS } from "../ocean-timing.js";

type ClientAttachment = {
  role: "display" | "controller";
  reelUntil: number;
  lastRodPumpAt: number;
  windowAt: number;
  messages: number;
};

type QueuedCommand = { socket: DurableSocket; action: OceanAction };
type StoredRoom = {
  id: string;
  playerId: string;
  game: OceanFishingGameSnapshot;
  rodStroke: number;
  catchSaveStatus: CatchSaveStatus;
  catchEvent?: { eventKey: string; fishId: FishSpeciesId };
};

const ROOM_STORAGE_KEY = "room";
const ROOM_IDLE_TTL_MS = 30 * 60_000;
const ESCAPE_ANIMATION_SECONDS = ESCAPE_ANIMATION_MS / 1000;
const ACTIVE_PHASES = new Set<OceanPhase>(["casting", "waiting", "biting", "fighting", "retrieving"]);

function allowedOrigin(origin: string | null, host: string | null, configured: string | undefined): boolean {
  if (!origin) return true;
  try {
    const parsed = new URL(origin);
    const allowed = new Set((configured ?? "").split(",").map(value => value.trim()).filter(Boolean));
    return parsed.host === host || allowed.has("*") || allowed.has(origin);
  } catch {
    return false;
  }
}

function isActive(room: StoredRoom): boolean {
  return ACTIVE_PHASES.has(room.game.state.phase)
    || room.game.state.phase === "escaped" && room.game.escapeAge < ESCAPE_ANIMATION_SECONDS;
}

function canControl(role: ClientAttachment["role"], controllerCount: number): boolean {
  return role === "controller" || role === "display" && controllerCount === 0;
}

function canQueue(action: OceanAction, phase: OceanPhase, controls: boolean, hasDisplay: boolean): boolean {
  const resultReset = action.action === "reset" && (phase === "caught" || phase === "escaped");
  return hasDisplay && (controls || resultReset);
}

export class OceanRoom {
  private room?: StoredRoom;
  private loading?: Promise<StoredRoom | undefined>;
  private readonly commands: QueuedCommand[] = [];
  private tickTimer?: ReturnType<typeof setTimeout>;
  private lastStoredAt = 0;
  private catchWritePromise?: Promise<void>;

  constructor(private readonly state: DurableObjectState, private readonly env: CloudflareEnv) {}

  private async getRoom(): Promise<StoredRoom | undefined> {
    if (this.room) return this.room;
    if (!this.loading) {
      this.loading = this.state.storage.get<StoredRoom>(ROOM_STORAGE_KEY).then(stored => {
        if (stored) {
          this.room = { ...stored, game: stored.game };
          this.game = OceanFishingGame.restore(stored.game);
          this.lastStoredAt = Date.now();
        }
        return this.room;
      }).finally(() => { this.loading = undefined; });
    }
    return this.loading;
  }

  private game?: OceanFishingGame;

  private async persist(force = false): Promise<void> {
    const room = this.room;
    if (!room || !this.game) return;
    if (!force && Date.now() - this.lastStoredAt < 2_000) return;
    room.game = this.game.serialize();
    await this.state.storage.put(ROOM_STORAGE_KEY, room);
    this.lastStoredAt = Date.now();
  }

  private clients(): DurableSocket[] {
    return this.state.getWebSockets();
  }

  private attachment(socket: DurableSocket): ClientAttachment | undefined {
    try {
      const value = socket.deserializeAttachment() as ClientAttachment | undefined;
      return value && (value.role === "display" || value.role === "controller") ? value : undefined;
    } catch {
      return undefined;
    }
  }

  private roleCount(role: ClientAttachment["role"]): number {
    return this.clients().filter(socket => this.attachment(socket)?.role === role).length;
  }

  private broadcast(): void {
    const room = this.room;
    const game = this.game;
    if (!room || !game) return;
    const sockets = this.clients();
    const message: OceanMessage = {
      type: "ocean",
      state: game.wireSnapshot(),
      rodStroke: room.rodStroke,
      serverNow: Date.now(),
      controllers: this.roleCount("controller"),
      displays: this.roleCount("display"),
      catchSaveStatus: game.state.phase === "caught" ? room.catchSaveStatus : "none",
    };
    const payload = JSON.stringify(message);
    for (const socket of sockets) {
      if (socket.readyState !== WebSocket.OPEN || socket.bufferedAmount >= 64_000) continue;
      try { socket.send(payload); } catch { try { socket.close(1011, "send_failed"); } catch { /* already closed */ } }
    }
  }

  private scheduleTick(delay = 50): void {
    if (this.tickTimer !== undefined) return;
    if (!this.clients().length) return;
    this.tickTimer = setTimeout(() => {
      this.tickTimer = undefined;
      this.state.waitUntil(this.tick());
    }, delay);
  }

  private async writeCatch(): Promise<void> {
    const room = this.room;
    const event = room?.catchEvent;
    if (!room || !event || room.catchSaveStatus === "saved") return;
    if (this.catchWritePromise) return this.catchWritePromise;

    this.catchWritePromise = (async () => {
      room.catchSaveStatus = "pending";
      this.broadcast();
      await this.persist(true);
      try {
        await recordCatch(this.env.DB, room.playerId, event.fishId, event.eventKey);
        room.catchSaveStatus = "saved";
      } catch (error) {
        console.error("Unable to record fish catch", error instanceof Error ? error.message : "unknown_error");
        room.catchSaveStatus = "failed";
      }
      await this.persist(true);
      this.broadcast();
      if (room.catchSaveStatus === "saved") this.scheduleTick(0);
    })();
    try {
      await this.catchWritePromise;
    } finally {
      this.catchWritePromise = undefined;
    }
  }

  private async tick(): Promise<void> {
    const room = await this.getRoom();
    const game = this.game;
    if (!room || !game || !this.clients().length) return;
    const now = Date.now();
    const previous = game.state.phase;
    const saveLocked = game.state.phase === "caught" && !canContinueAfterCatchSave(room.catchSaveStatus);

    if (this.roleCount("display") > 0 && !saveLocked) {
      const queued = this.commands.splice(0);
      for (const command of queued) {
        if (!this.clients().includes(command.socket)) continue;
        if (game.action(command.action, now)) {
          for (const socket of this.clients()) {
            const attachment = this.attachment(socket);
            if (attachment) socket.serializeAttachment({ ...attachment, reelUntil: 0 });
          }
        }
      }
      const reeling = this.clients().some(socket => (this.attachment(socket)?.reelUntil ?? 0) > now);
      game.step(0.05, reeling, now);
    }

    const phase = game.state.phase;
    if (previous !== "caught" && phase === "caught") {
      room.catchEvent = { eventKey: `${room.id}:${game.state.revision}`, fishId: game.state.fishId };
      room.catchSaveStatus = "pending";
      this.broadcast();
      this.state.waitUntil(this.writeCatch());
    }
    if (previous !== phase || phase !== "idle" && phase !== "caught" && phase !== "escaped" || game.isEscapeAnimating()) {
      this.broadcast();
    } else if (game.state.resultAt && now - game.state.resultAt < 150) {
      this.broadcast();
    }

    room.game = game.serialize();
    const forceSave = previous !== phase;
    await this.persist(forceSave);
    if (isActive(room) || this.commands.length > 0) this.scheduleTick(50);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/create" && request.method === "POST") {
      const input = await request.json().catch(() => null) as Partial<{ roomId: string; playerId: string; fishId: string }> | null;
      if (!input || typeof input.roomId !== "string" || !/^sea_[a-f0-9]{32}$/.test(input.roomId)
        || typeof input.playerId !== "string" || !/^player_[a-z0-9-]{12,80}$/.test(input.playerId)
        || input.fishId !== undefined && !isFishSpeciesId(input.fishId)) return new Response("Bad Request", { status: 400 });
      if (await this.getRoom()) return new Response("Conflict", { status: 409 });
      const fishId = input.fishId as FishSpeciesId | undefined;
      this.game = new OceanFishingGame(Math.random, fishId ?? randomActiveFishSpeciesId(), fishId ? "fixed" : "rotate");
      this.room = {
        id: input.roomId,
        playerId: input.playerId,
        game: this.game.serialize(),
        rodStroke: 0,
        catchSaveStatus: "none",
      };
      await this.persist(true);
      await this.state.storage.setAlarm(Date.now() + ROOM_IDLE_TTL_MS);
      return new Response(null, { status: 201 });
    }

    const upgrade = request.headers.get("Upgrade")?.toLowerCase() === "websocket";
    const room = await this.getRoom();
    if (!room || !this.game) return new Response("Not Found", { status: 404 });
    if (!upgrade || url.pathname !== "/ocean-ws") return new Response("Upgrade Required", { status: 426 });
    const role = url.searchParams.get("role");
    const originAllowed = allowedOrigin(request.headers.get("Origin"), request.headers.get("Host") ?? url.host, this.env.FRONTEND_ORIGIN);
    if ((role !== "display" && role !== "controller") || !originAllowed || this.clients().length >= 8
      || role === "controller" && this.roleCount("controller") >= 1) return new Response("Forbidden", { status: 403 });
    await this.state.storage.deleteAlarm();
    if (room.catchSaveStatus === "pending" && room.catchEvent) {
      this.state.waitUntil(this.writeCatch());
    }
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1] as DurableSocket;
    this.state.acceptWebSocket(server, [role]);
    server.serializeAttachment({ role, reelUntil: 0, lastRodPumpAt: 0, windowAt: Date.now(), messages: 0 } satisfies ClientAttachment);
    this.broadcast();
    if (isActive(room)) this.scheduleTick(50);
    await this.persist(true);
    return new Response(null, { status: 101, webSocket: client } as ResponseInit & { webSocket: WebSocket });
  }

  async webSocketMessage(socket: DurableSocket, message: string | ArrayBuffer): Promise<void> {
    const room = await this.getRoom();
    const game = this.game;
    if (!room || !game || typeof message !== "string") return;
    const now = Date.now();
    const attachment = this.attachment(socket);
    if (!attachment) return;
    if (now - attachment.windowAt >= 1000) { attachment.windowAt = now; attachment.messages = 0; }
    if (++attachment.messages > 40) { socket.serializeAttachment(attachment); return; }
    socket.serializeAttachment(attachment);
    let value: unknown;
    try { value = JSON.parse(message); } catch { return; }
    const parsed = oceanCommandSchema.safeParse(value);
    if (!parsed.success) return;
    const input = parsed.data;

    if (input.action === "retry-catch-save") {
      if (game.state.phase === "caught" && room.catchSaveStatus === "failed" && room.catchEvent) {
        room.catchSaveStatus = "none";
        this.state.waitUntil(this.writeCatch());
      }
      return;
    }
    if (game.state.phase === "caught" && !canContinueAfterCatchSave(room.catchSaveStatus)) return;
    const controllerCount = this.roleCount("controller");
    const controls = canControl(attachment.role, controllerCount);
    if (input.action === "rod-pump") {
      if (!controls || !this.roleCount("display") || game.state.phase !== "fighting" || now - attachment.lastRodPumpAt < 300) return;
      attachment.lastRodPumpAt = now;
      socket.serializeAttachment(attachment);
      room.rodStroke++;
      this.broadcast();
      return;
    }
    if (input.action === "reel") {
      if (!controls) return;
      attachment.reelUntil = input.held && game.state.phase === "fighting" ? now + 400 : 0;
      socket.serializeAttachment(attachment);
      if (game.state.phase === "fighting") this.scheduleTick(0);
      return;
    }
    if (!canQueue(input, game.state.phase, controls, this.roleCount("display") > 0)) return;
    if (this.commands.length < 16) this.commands.push({ socket, action: input });
    this.scheduleTick(0);
  }

  async webSocketClose(socket: DurableSocket): Promise<void> {
    this.onSocketClosed(socket);
  }

  async webSocketError(socket: DurableSocket): Promise<void> {
    this.onSocketClosed(socket);
  }

  private onSocketClosed(socket: DurableSocket): void {
    for (let index = this.commands.length - 1; index >= 0; index--) {
      if (this.commands[index]?.socket === socket) this.commands.splice(index, 1);
    }
    this.state.waitUntil((async () => {
      const room = await this.getRoom();
      await this.persist(true);
      this.broadcast();
      if (this.clients().length === 0 && room) {
        await this.state.storage.setAlarm(Date.now() + ROOM_IDLE_TTL_MS);
      } else if (room && isActive(room)) {
        this.scheduleTick(50);
      }
    })());
  }

  async alarm(): Promise<void> {
    if (this.clients().length > 0) return;
    const room = await this.getRoom();
    if (!room) return;
    if (room.catchEvent && room.catchSaveStatus !== "saved") {
      try { await this.writeCatch(); } catch { /* retry on the next alarm */ }
      if (!canContinueAfterCatchSave(room.catchSaveStatus)) {
        await this.state.storage.setAlarm(Date.now() + ROOM_IDLE_TTL_MS);
        return;
      }
    }
    await this.state.storage.delete(ROOM_STORAGE_KEY);
    const { deleteOceanRoom } = await import("./d1-store.js");
    await deleteOceanRoom(this.env.DB, room.id);
    this.room = undefined;
    this.game = undefined;
  }
}