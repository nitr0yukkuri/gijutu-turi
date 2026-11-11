import { pathToFileURL } from "node:url";

type RoomResult = { action?: string; error?: string };
type PageResult = { apply: boolean; rooms: RoomResult[]; nextCursor: string | null };

function adminOrigin(value: string): string {
  const url = new URL(value);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  const project = /^gijutu-turi(?:-[a-z0-9-]+)?\.nitr0yukkuri\.workers\.dev$/.test(url.hostname);
  if (!["http:", "https:"].includes(url.protocol) || !local && (!project || url.protocol !== "https:") || url.username || url.password
    || url.pathname !== "/" || url.search || url.hash) throw new Error("unsupported_room_admin_origin");
  return url.origin;
}

export async function reconcileRooms(options: {
  origin: string; token: string; apply: boolean; fetcher?: typeof fetch;
}) {
  const origin = adminOrigin(options.origin);
  if (!/^\d{13}\.[A-Za-z0-9_-]{43}$/.test(options.token)
    || Number(options.token.split(".", 1)[0]) <= Date.now()) throw new Error("missing_or_expired_migration_admin_token");
  const fetcher = options.fetcher ?? fetch;
  const seenCursors = new Set<string>();
  const actions: Record<string, number> = Object.create(null) as Record<string, number>;
  let cursor = "";
  let inspected = 0;
  let failures = 0;
  for (let pageNumber = 0; pageNumber < 256; pageNumber++) {
    const response = await fetcher(origin + "/api/admin/rooms/reconcile", {
      method: "POST", headers: { Authorization: `Bearer ${options.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ cursor, limit: 20, apply: options.apply }),
      redirect: "error", signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`room_admin_http_${response.status}`);
    const page = await response.json() as PageResult;
    if (page.apply !== options.apply || !Array.isArray(page.rooms)
      || page.nextCursor !== null && (typeof page.nextCursor !== "string" || !/^sea_[a-f0-9]{32}$/.test(page.nextCursor))) {
      throw new Error("invalid_room_admin_response");
    }
    for (const room of page.rooms) {
      inspected++;
      if (room.error) failures++;
      const action = room.action ?? "inspection_failed";
      actions[action] = (actions[action] ?? 0) + 1;
    }
    if (page.nextCursor === null) return { apply: options.apply, inspected, failures, actions: { ...actions } };
    if (seenCursors.has(page.nextCursor)) throw new Error("repeated_room_admin_cursor");
    seenCursors.add(page.nextCursor);
    cursor = page.nextCursor;
  }
  throw new Error("room_admin_page_limit_reached");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  if (args.some(argument => argument !== "--apply")) throw new Error("unsupported_room_admin_argument");
  const result = await reconcileRooms({
    origin: process.env.ROOM_ADMIN_ORIGIN ?? "https://gijutu-turi.nitr0yukkuri.workers.dev",
    token: process.env.MIGRATION_ADMIN_TOKEN ?? "", apply: args.includes("--apply"),
  });
  // Aggregate output deliberately excludes room IDs and the administration secret.
  console.log(JSON.stringify(result, null, 2));
  if (result.failures > 0) process.exitCode = 1;
}
