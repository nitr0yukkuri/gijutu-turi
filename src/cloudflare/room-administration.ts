import { listRoomReservations } from "./d1-store.js";
import { readSmallJson } from "./read-small-json.js";
import type { CloudflareEnv } from "./types.js";

const roomPattern = /^sea_[a-f0-9]{32}$/;
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
});

// The secret is created for a migration window, never embedded in the client.
// Its absolute expiry closes these routes even if an operator forgets to remove it.
function authorized(request: Request, token: string | undefined): boolean {
  const match = token?.match(/^(\d{13})\.[A-Za-z0-9_-]{43}$/);
  return Boolean(match && Number(match[1]) > Date.now() && request.headers.get("Authorization") === `Bearer ${token}`);
}

export async function handleRoomAdministration(request: Request, env: CloudflareEnv): Promise<Response> {
  if (!authorized(request, env.MIGRATION_ADMIN_TOKEN)) return json({ error: "not_found" }, 404);
  const url = new URL(request.url);
  let input: Record<string, unknown>;
  if (url.pathname === "/api/admin/rooms" && request.method === "GET") {
    input = Object.fromEntries(url.searchParams);
    if ([...url.searchParams.keys()].some(key => url.searchParams.getAll(key).length !== 1)) return json({ error: "invalid_request" }, 400);
  } else if (url.pathname === "/api/admin/rooms/reconcile" && request.method === "POST") {
    const body = await readSmallJson(request);
    if (!body.ok) return json({ error: body.error }, body.status);
    if (!body.value || typeof body.value !== "object" || Array.isArray(body.value)) return json({ error: "invalid_request" }, 400);
    input = body.value as Record<string, unknown>;
  } else return json({ error: "not_found" }, 404);

  const cursor = input.cursor ?? "";
  const limit = input.limit === undefined ? 10 : request.method === "GET" ? Number(input.limit) : input.limit;
  const apply = input.apply ?? false;
  if (Object.keys(input).some(key => !["cursor", "limit", "apply"].includes(key))
    || typeof cursor !== "string" || cursor !== "" && !roomPattern.test(cursor)
    || typeof limit !== "number" || !Number.isInteger(limit) || limit < 1 || limit > 20
    || typeof apply !== "boolean" || request.method === "GET" && apply) return json({ error: "invalid_request" }, 400);

  const reservations = await listRoomReservations(env.DB, cursor, limit);
  const rooms: Array<Record<string, unknown>> = [];
  // Keep outstanding subrequests bounded under the Worker connection limit.
  for (let index = 0; index < reservations.length; index += 4) {
    const batch = await Promise.all(reservations.slice(index, index + 4).map(async reservation => {
      if (!roomPattern.test(reservation.room_id) || !Number.isFinite(Date.parse(reservation.created_at))) {
        return { roomId: reservation.room_id, error: "invalid_reservation" };
      }
      try {
        const stub = env.OCEAN_ROOMS.get(env.OCEAN_ROOMS.idFromName(reservation.room_id));
        const response = await stub.fetch(new Request(`https://ocean-room.internal/_admin/${apply ? "reconcile" : "inspect"}`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roomId: reservation.room_id, createdAt: reservation.created_at }),
        }));
        if (!response.ok) return { roomId: reservation.room_id, error: "inspection_failed", status: response.status };
        return { roomId: reservation.room_id, createdAt: reservation.created_at, ...await response.json() as Record<string, unknown> };
      } catch {
        // A failed or unsupported legacy snapshot must not hide the results of
        // other rooms that may already have been reconciled in this batch.
        return { roomId: reservation.room_id, error: "inspection_failed" };
      }
    }));
    rooms.push(...batch);
  }
  return json({ apply, rooms, nextCursor: reservations.length === limit ? reservations.at(-1)?.room_id : null });
}
