export type PlayerSession = { playerId: string; token: string };

const playerIdKey = "gijutu.player-id";
const playerTokenKey = "gijutu.player-session-token";
const tokenPattern = /^[A-Za-z0-9_-]{43}$/;

let memorySession: PlayerSession | undefined;
let pendingSession: Promise<PlayerSession> | undefined;

const readStoredSession = (): PlayerSession | undefined => {
  try {
    const playerId = localStorage.getItem(playerIdKey);
    const token = localStorage.getItem(playerTokenKey);
    return playerId && /^player_[a-z0-9-]{12,80}$/.test(playerId) && token && tokenPattern.test(token)
      ? { playerId, token }
      : undefined;
  } catch {
    return undefined;
  }
};

const readLegacyPlayerId = (): string | undefined => {
  try {
    const playerId = localStorage.getItem(playerIdKey);
    return playerId && /^player_[a-z0-9-]{12,80}$/.test(playerId) ? playerId : undefined;
  } catch {
    return undefined;
  }
};

export function ensurePlayerSession(endpoint: string): Promise<PlayerSession> {
  const stored = readStoredSession();
  if (stored) {
    memorySession = stored;
    return Promise.resolve(stored);
  }
  if (memorySession) return Promise.resolve(memorySession);
  if (pendingSession) return pendingSession;

  pendingSession = (async () => {
    const legacyPlayerId = readLegacyPlayerId();
    const createSession = (playerId?: string) => fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(playerId ? { playerId } : {}),
      cache: "no-store",
    });
    let response = await createSession(legacyPlayerId);
    // A legacy ID can already belong to a session whose token was removed.
    // Create a fresh anonymous identity so that lost browser storage does not
    // leave the game stuck in an endless 409 retry loop.
    if (response.status === 409 && legacyPlayerId) response = await createSession();
    if (!response.ok) throw new Error(response.status === 409 ? "player_session_exists" : "player_session_unavailable");

    const value: unknown = await response.json();
    if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("invalid_player_session");
    const candidate = value as Record<string, unknown>;
    if (typeof candidate.playerId !== "string" || !/^player_[a-z0-9-]{12,80}$/.test(candidate.playerId)
      || typeof candidate.token !== "string" || !tokenPattern.test(candidate.token)) {
      throw new Error("invalid_player_session");
    }
    const session = { playerId: candidate.playerId, token: candidate.token };
    memorySession = session;
    try {
      localStorage.setItem(playerIdKey, session.playerId);
      localStorage.setItem(playerTokenKey, session.token);
    } catch {
      // Keep the new anonymous identity for this tab when persistent storage is unavailable.
    }
    return session;
  })().finally(() => {
    pendingSession = undefined;
  });

  return pendingSession;
}
