const MAX_JSON_BODY_BYTES = 1024;

export type SmallJsonResult =
  | { ok: true; value: unknown }
  | { ok: false; status: 400 | 413 | 415; error: "invalid_json" | "payload_too_large" | "unsupported_media_type" };

type SmallJsonError = "invalid_json" | "payload_too_large" | "unsupported_media_type";

const failure = (status: 400 | 413 | 415, error: SmallJsonError): SmallJsonResult => ({
  ok: false,
  status,
  error,
});

async function cancelBody(request: Request): Promise<void> {
  try { await request.body?.cancel(); } catch { /* The caller already has its response. */ }
}

export async function readSmallJson(request: Request): Promise<SmallJsonResult> {
  const contentType = (request.headers.get("content-type") ?? "").split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/json") return failure(415, "unsupported_media_type");

  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_JSON_BODY_BYTES) {
    await cancelBody(request);
    return failure(413, "payload_too_large");
  }

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  const body = request.body;
  if (body) {
    const reader = body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        totalBytes += value.byteLength;
        if (totalBytes > MAX_JSON_BODY_BYTES) {
          await reader.cancel().catch(() => undefined);
          return failure(413, "payload_too_large");
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try { return { ok: true, value: JSON.parse(new TextDecoder().decode(bytes)) as unknown }; }
  catch { return failure(400, "invalid_json"); }
}
