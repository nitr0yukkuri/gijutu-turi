import { useCallback, useEffect, useRef, useState } from "react";
import { freshOceanState, type OceanState } from "./types";

type OceanMessage = {
  type: "ocean";
  state: OceanState;
  serverNow: number;
  controllers: number;
  displays: number;
};

export function useOceanSession() {
  const controllerId = new URLSearchParams(location.search).get("controller");
  const isPhone = Boolean(controllerId);
  const socketRef = useRef<WebSocket | null>(null);
  const retryRef = useRef<number | undefined>();
  const closingRef = useRef(false);
  const [state, setState] = useState<OceanState>(freshOceanState);
  const [online, setOnline] = useState(false);
  const [controllerCount, setControllerCount] = useState(0);
  const [displayConnected, setDisplayConnected] = useState(true);
  const [roomId, setRoomId] = useState(controllerId ?? "");

  const send = useCallback((input: Record<string, unknown>) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify(input));
    return true;
  }, []);

  useEffect(() => {
    let retries = 0;
    closingRef.current = false;
    const connect = async () => {
      try {
        let id = controllerId;
        if (!id) {
          const response = await fetch("/api/ocean-sessions", { method: "POST" });
          if (!response.ok) throw new Error("room");
          id = (await response.json() as { id: string }).id;
        }
        if (!/^sea_[a-f0-9]{32}$/.test(id)) throw new Error("link");
        setRoomId(id);
        const url = new URL("/ocean-ws", location.href);
        url.protocol = location.protocol === "https:" ? "wss:" : "ws:";
        url.searchParams.set("room", id);
        url.searchParams.set("role", isPhone ? "controller" : "display");
        const socket = new WebSocket(url);
        socketRef.current = socket;
        socket.addEventListener("open", () => { retries = 0; setOnline(true); });
        socket.addEventListener("message", event => {
          try {
            const message = JSON.parse(event.data) as OceanMessage;
            if (message.type !== "ocean") return;
            setState(message.state);
            setControllerCount(message.controllers);
            setDisplayConnected(message.displays > 0);
          } catch { /* malformed server input is ignored by the client */ }
        });
        socket.addEventListener("close", () => {
          setOnline(false);
          if (closingRef.current) return;
          if (!isPhone) setRoomId("");
          if (retries++ < 4) retryRef.current = window.setTimeout(connect, 1000 + retries * 500);
        });
        socket.addEventListener("error", () => setOnline(false));
      } catch {
        setOnline(false);
        if (retries++ < 4) retryRef.current = window.setTimeout(connect, 1000 + retries * 500);
      }
    };
    void connect();
    return () => {
      closingRef.current = true;
      window.clearTimeout(retryRef.current);
      socketRef.current?.close();
    };
  }, [controllerId, isPhone]);

  return { controllerId, isPhone, state, online, controllerCount, displayConnected, roomId, send };
}
