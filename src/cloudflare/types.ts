import type { FishSpeciesId } from "../fish-species.js";

export interface D1Result<T = Record<string, unknown>> {
  success: boolean;
  results: T[];
  meta?: { changes?: number };
}

export interface D1PreparedStatement {
  bind(...values: Array<string | number | boolean | null>): D1PreparedStatement;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  first<T = Record<string, unknown>>(column?: string): Promise<T | null>;
  run(): Promise<D1Result>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = Record<string, unknown>>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
}

export interface DurableSocket extends WebSocket {
  serializeAttachment(value: unknown): void;
  deserializeAttachment(): unknown;
}

export interface DurableObjectStorage {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<boolean>;
  deleteAlarm(): Promise<void>;
  setAlarm(time: number | Date): Promise<void>;
}

export interface DurableObjectState {
  storage: DurableObjectStorage;
  acceptWebSocket(socket: WebSocket, tags?: string[]): void;
  getWebSockets(tag?: string): DurableSocket[];
  waitUntil(promise: Promise<unknown>): void;
  blockConcurrencyWhile<T>(callback: () => Promise<T>): Promise<T>;
}

export interface DurableObjectStub {
  fetch(request: Request): Promise<Response>;
}

export interface DurableObjectNamespace {
  idFromName(name: string): unknown;
  get(id: unknown): DurableObjectStub;
}

export interface StaticAssets {
  fetch(request: Request): Promise<Response>;
}

export interface CloudflareEnv {
  DB: D1Database;
  ASSETS: StaticAssets;
  OCEAN_ROOMS: DurableObjectNamespace;
  FRONTEND_ORIGIN?: string;
}

export type OceanRoomCreatePayload = { roomId: string; playerId: string; fishId?: FishSpeciesId; waterway?: "sea" | "river" };
