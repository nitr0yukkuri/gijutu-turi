export const isPlayerId = (value) => /^player_[a-z0-9-]{12,80}$/.test(value);
