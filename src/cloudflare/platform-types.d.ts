export {};

declare global {
  interface ExecutionContext {
    waitUntil(promise: Promise<unknown>): void;
  }
  interface WebSocketPair {
    0: WebSocket;
    1: WebSocket;
  }
  var WebSocketPair: { new (): WebSocketPair };
}
