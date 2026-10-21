// Resolve service bindings per request: Vercel does not provide them at build time.
function apiTarget(incoming: URL): URL {
  const binding = process.env.API_SERVICE_URL;
  const configured = binding || (process.env.VERCEL ? undefined : process.env.API_INTERNAL_URL || "http://127.0.0.1:8000");
  if (!configured) throw new Error("API service binding is unavailable.");
  const base = new URL(configured);
  if (!["http:", "https:"].includes(base.protocol) || base.username || base.password || base.search || base.hash) {
    throw new Error("Invalid API service URL.");
  }
  // Preserve any deployment-specific binding prefix and the API's existing /api routes.
  base.pathname = `${base.pathname.replace(/\/$/, "")}/`;
  const target = new URL(incoming.pathname.slice(1), base);
  target.search = incoming.search;
  return target;
}

function failure(status: number, detail: string): Response {
  return Response.json({ detail }, { status, headers: { "Cache-Control": "no-store" } });
}

function connectionHeaders(headers: Headers): Set<string> {
  return new Set((headers.get("connection") || "").split(",").map(name => name.trim().toLowerCase()));
}

class PayloadTooLarge extends Error {}

async function requestBody(request: Request): Promise<Uint8Array<ArrayBuffer> | undefined> {
  if (request.method === "GET" || request.method === "HEAD") return undefined;
  const path = new URL(request.url).pathname;
  const maximum = request.method === "PUT" && /^\/api\/cards\/[^/]+\/photo$/.test(path)
    ? 4 * 1024 * 1024 : path.startsWith("/api/auth/") ? 4096 : 32768;
  const reader = request.body?.getReader();
  if (!reader) return undefined;
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximum) {
        await reader.cancel();
        throw new PayloadTooLarge();
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
  return result;
}

export async function forwardApi(request: Request): Promise<Response> {
  let target: URL;
  try {
    const incoming = new URL(request.url);
    if (!incoming.pathname.startsWith("/api/")) return failure(404, "API route not found.");
    target = apiTarget(incoming);
  } catch {
    return failure(503, "The API connection is not configured. Please retry later.");
  }
  // Preserve browser authentication and CSRF evidence; never replace the Origin header.
  const headers = new Headers();
  const requestHops = connectionHeaders(request.headers);
  for (const name of ["accept", "content-type", "cookie", "origin", "x-csrf-token"]) {
    const value = request.headers.get(name);
    if (value !== null && !requestHops.has(name)) headers.set(name, value);
  }
  try {
    const upstream = await fetch(target, {
      method: request.method,
      headers,
      body: await requestBody(request),
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(60_000)]),
    });
    // API routes have no redirects. Do not forward credentials or redirect browsers to an internal URL.
    if (upstream.status >= 300 && upstream.status < 400) {
      await upstream.body?.cancel();
      return failure(502, "The API returned an unexpected redirect.");
    }
    const responseHeaders = new Headers();
    const responseHops = connectionHeaders(upstream.headers);
    for (const name of ["content-type", "content-disposition", "x-content-type-options", "referrer-policy", "retry-after"]) {
      const value = upstream.headers.get(name);
      if (value !== null && !responseHops.has(name)) responseHeaders.set(name, value);
    }
    if (!responseHops.has("set-cookie")) {
      for (const cookie of upstream.headers.getSetCookie()) responseHeaders.append("set-cookie", cookie);
    }
    responseHeaders.set("Cache-Control", "no-store");
    return new Response(request.method === "HEAD" ? null : upstream.body, { status: upstream.status, headers: responseHeaders });
  } catch (error) {
    if (error instanceof PayloadTooLarge) return failure(413, "Request is too large.");
    return failure(503, "Could not reach SlabTrak. Please retry.");
  }
}
