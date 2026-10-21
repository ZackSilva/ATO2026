import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { forwardApi } from "./api-proxy";

const browserOrigin = "https://slabtrak.example";
const upstreamFetch = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubEnv("API_SERVICE_URL", undefined);
  vi.stubEnv("API_INTERNAL_URL", undefined);
  vi.stubEnv("VERCEL", undefined);
  upstreamFetch.mockReset();
  upstreamFetch.mockImplementation(async () => Response.json({ ok: true }));
  vi.stubGlobal("fetch", upstreamFetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function incoming(path = "/api/auth/me", init: RequestInit = {}) {
  return new Request(`${browserOrigin}${path}`, init);
}

function forwarded() {
  expect(upstreamFetch).toHaveBeenCalledTimes(1);
  const [url, options] = upstreamFetch.mock.calls[0];
  return { url: String(url), options: options!, headers: new Headers(options!.headers) };
}

// No Content-Length: the proxy must count stream bytes rather than trust metadata.
function chunked(path: string, method: string, sizes: number[], headers: HeadersInit = {}) {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const size of sizes) controller.enqueue(new Uint8Array(size).fill(42));
      controller.close();
    },
  });
  return incoming(path, { method, body, headers, duplex: "half" } as RequestInit & { duplex: "half" });
}

test("binding is selected at request runtime and retains its deployment prefix", async () => {
  vi.stubEnv("VERCEL", "1");
  vi.stubEnv("API_INTERNAL_URL", "http://docker-api:8000");
  vi.stubEnv("API_SERVICE_URL", "https://internal.example/deployment/one");
  await forwardApi(incoming("/api/cards?search=a%2Bb&side=back&revision=2"));
  expect(forwarded().url).toBe("https://internal.example/deployment/one/api/cards?search=a%2Bb&side=back&revision=2");

  upstreamFetch.mockClear();
  vi.stubEnv("API_SERVICE_URL", "https://next.example/runtime/");
  await forwardApi(incoming());
  expect(forwarded().url).toBe("https://next.example/runtime/api/auth/me");
});

test("local mode uses Docker runtime configuration or the loopback default", async () => {
  await forwardApi(incoming());
  expect(forwarded().url).toBe("http://127.0.0.1:8000/api/auth/me");
  upstreamFetch.mockClear();
  vi.stubEnv("API_INTERNAL_URL", "http://api:8000");
  await forwardApi(incoming());
  expect(forwarded().url).toBe("http://api:8000/api/auth/me");
});

test("Vercel fails closed without its binding even when a local fallback exists", async () => {
  vi.stubEnv("VERCEL", "1");
  vi.stubEnv("API_INTERNAL_URL", "http://api:8000");
  const result = await forwardApi(incoming());
  expect(result.status).toBe(503);
  expect(result.headers.get("cache-control")).toBe("no-store");
  expect(await result.json()).toEqual({ detail: "The API connection is not configured. Please retry later." });
  expect(upstreamFetch).not.toHaveBeenCalled();
});

test.each([
  "not-a-url", "file:///etc/passwd", "ftp://api.example", "https://user:secret@api.example",
  "https://api.example/?token=private", "https://api.example/#fragment",
])("invalid backend configuration fails without exposing its value: %s", async value => {
  vi.stubEnv("API_SERVICE_URL", value);
  const result = await forwardApi(incoming());
  expect(result.status).toBe(503);
  expect(await result.json()).toEqual({ detail: "The API connection is not configured. Please retry later." });
  expect(upstreamFetch).not.toHaveBeenCalled();
});

test.each([
  "/api//other.example/cards?url=https%3A%2F%2Fother.example",
  "/api/cards/%2F%2Fother.example/photo?side=back",
  "/api/cards?next=//other.example&next=https://other.example",
])("client-controlled paths and queries cannot change the backend: %s", async path => {
  vi.stubEnv("API_SERVICE_URL", "https://internal.example/prefix/");
  await forwardApi(incoming(path));
  const target = new URL(forwarded().url);
  expect(target.origin).toBe("https://internal.example");
  expect(target.pathname).toBe(`/prefix${new URL(`${browserOrigin}${path}`).pathname}`);
  expect(target.search).toBe(new URL(`${browserOrigin}${path}`).search);
});

test.each(["/api/../private", "/api/%2e%2e/private", "/outside", "/api"])(
  "paths outside the API namespace are rejected: %s", async path => {
    const result = await forwardApi(incoming(path));
    expect(result.status).toBe(404);
    expect(result.headers.get("cache-control")).toBe("no-store");
    expect(upstreamFetch).not.toHaveBeenCalled();
  },
);

test.each([browserOrigin, "https://foreign.example", null])("browser Origin is preserved, including absence: %s", async origin => {
  const headers = new Headers({ Cookie: "slabtrak_session=private-session", "X-CSRF-Token": "csrf-proof", "Content-Type": "application/json" });
  if (origin) headers.set("Origin", origin);
  const body = JSON.stringify({ notes: "Card update" });
  await forwardApi(incoming("/api/cards/card-id", { method: "PUT", headers, body }));
  const sent = forwarded();
  expect(sent.headers.get("origin")).toBe(origin);
  expect(sent.headers.get("cookie")).toBe("slabtrak_session=private-session");
  expect(sent.headers.get("x-csrf-token")).toBe("csrf-proof");
  expect(sent.headers.get("content-type")).toBe("application/json");
  expect(new TextDecoder().decode(sent.options.body as Uint8Array)).toBe(body);
  expect(sent.options.method).toBe("PUT");
  expect(sent.options.cache).toBe("no-store");
  expect(sent.options.redirect).toBe("manual");
  expect(sent.options.signal).toBeInstanceOf(AbortSignal);
});

test("binary photo uploads retain every byte and both concurrency/side parameters", async () => {
  const bytes = new Uint8Array([0, 255, 128, 13, 10, 0, 42]);
  await forwardApi(incoming("/api/cards/card-id/photo?revision=7&side=back", {
    method: "PUT", body: bytes, headers: { "Content-Type": "application/octet-stream" },
  }));
  const sent = forwarded();
  expect(sent.url).toBe("http://127.0.0.1:8000/api/cards/card-id/photo?revision=7&side=back");
  expect(sent.headers.get("content-type")).toBe("application/octet-stream");
  expect(sent.options.body).toEqual(bytes);
});

test("login and logout cookies remain separate and retain browser security attributes", async () => {
  const cookies = [
    "slabtrak_session=new-session; Path=/; HttpOnly; Secure; SameSite=Lax",
    "old_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Lax",
  ];
  const headers = new Headers();
  for (const cookie of cookies) headers.append("Set-Cookie", cookie);
  upstreamFetch.mockResolvedValue(new Response(null, { status: 204, headers }));
  const result = await forwardApi(incoming("/api/auth/logout", { method: "POST" }));
  expect(result.status).toBe(204);
  expect(result.body).toBeNull();
  expect(result.headers.getSetCookie()).toEqual(cookies);
});

test.each([401, 403, 409, 429])("API errors retain status, safe body, and retry metadata: %s", async status => {
  upstreamFetch.mockResolvedValue(Response.json({ detail: "Explicit API error" }, {
    status, headers: { "Retry-After": "17", "Cache-Control": "public, max-age=600" },
  }));
  const result = await forwardApi(incoming());
  expect(result.status).toBe(status);
  expect(result.headers.get("retry-after")).toBe("17");
  expect(result.headers.get("cache-control")).toBe("no-store");
  expect(await result.json()).toEqual({ detail: "Explicit API error" });
});

test("HEAD forwards its method and headers without constructing a response body", async () => {
  upstreamFetch.mockResolvedValue(new Response(null, { headers: { "Content-Type": "image/jpeg" } }));
  const result = await forwardApi(incoming("/api/cards/card-id/photo", { method: "HEAD" }));
  expect(forwarded().options.method).toBe("HEAD");
  expect(forwarded().options.body).toBeUndefined();
  expect(result.body).toBeNull();
  expect(result.headers.get("content-type")).toBe("image/jpeg");
});

test("photo reads preserve binary data while removing stale compression and framing metadata", async () => {
  const bytes = new Uint8Array([255, 216, 0, 128, 255, 217]);
  upstreamFetch.mockResolvedValue(new Response(bytes, { headers: {
    "Content-Type": "image/jpeg", "Content-Encoding": "gzip", "Content-Length": "999",
    "Connection": "keep-alive", "Keep-Alive": "timeout=5", "Transfer-Encoding": "chunked",
    "X-Content-Type-Options": "nosniff", "Referrer-Policy": "same-origin",
  } }));
  const result = await forwardApi(incoming("/api/cards/card-id/photo"));
  expect(new Uint8Array(await result.arrayBuffer())).toEqual(bytes);
  for (const header of ["content-encoding", "content-length", "connection", "keep-alive", "transfer-encoding"]) {
    expect(result.headers.has(header)).toBe(false);
  }
  expect(result.headers.get("content-type")).toBe("image/jpeg");
  expect(result.headers.get("x-content-type-options")).toBe("nosniff");
  expect(result.headers.get("referrer-policy")).toBe("same-origin");
  expect(result.headers.get("cache-control")).toBe("no-store");
});

test("untrusted host, forwarding, and transport request headers are not relayed", async () => {
  await forwardApi(incoming("/api/cards", { headers: {
    Host: "foreign.example", "X-Forwarded-Host": "foreign.example", "X-Forwarded-Proto": "http",
    "X-Forwarded-For": "127.0.0.1", Connection: "keep-alive", "Keep-Alive": "timeout=5",
    "Transfer-Encoding": "chunked", "Content-Length": "100", Authorization: "Bearer browser-input",
  } }));
  const { headers } = forwarded();
  for (const name of ["host", "x-forwarded-host", "x-forwarded-proto", "x-forwarded-for", "connection", "keep-alive", "transfer-encoding", "content-length", "authorization"]) {
    expect(headers.has(name)).toBe(false);
  }
});

test("Connection-nominated request headers are not promoted to end-to-end headers", async () => {
  await forwardApi(incoming("/api/cards", { headers: {
    Connection: "cookie, x-csrf-token", Cookie: "slabtrak_session=transport-only", "X-CSRF-Token": "transport-only",
    Origin: browserOrigin,
  } }));
  const { headers } = forwarded();
  expect(headers.has("cookie")).toBe(false);
  expect(headers.has("x-csrf-token")).toBe(false);
  expect(headers.get("origin")).toBe(browserOrigin);
});

test("Connection-nominated response headers are not promoted to end-to-end headers", async () => {
  upstreamFetch.mockResolvedValue(Response.json({ ok: true }, { headers: {
    Connection: "set-cookie, retry-after", "Set-Cookie": "transport-only=value; Path=/", "Retry-After": "10",
  } }));
  const result = await forwardApi(incoming());
  expect(result.headers.has("set-cookie")).toBe(false);
  expect(result.headers.has("retry-after")).toBe(false);
  expect(result.headers.get("content-type")).toContain("application/json");
});

test.each([301, 302, 303, 307, 308])("redirects never trigger another fetch or expose internal locations: %s", async status => {
  const cancel = vi.fn();
  const body = new ReadableStream({ cancel });
  upstreamFetch.mockResolvedValue(new Response(body, { status, headers: { Location: "https://private.example/internal" } }));
  const result = await forwardApi(incoming());
  expect(forwarded().options.redirect).toBe("manual");
  expect(result.status).toBe(502);
  expect(result.headers.has("location")).toBe(false);
  expect(result.headers.get("cache-control")).toBe("no-store");
  expect(await result.json()).toEqual({ detail: "The API returned an unexpected redirect." });
  expect(cancel).toHaveBeenCalledTimes(1);
});

test.each([
  ["/api/auth/login", "POST", 4096],
  ["/api/cards", "POST", 32768],
  ["/api/cards/card-id", "PUT", 32768],
  ["/api/cards/card-id/photo?revision=1&side=back", "PUT", 4 * 1024 * 1024],
] as const)("chunked requests accept the exact byte limit for %s", async (path, method, maximum) => {
  const result = await forwardApi(chunked(path, method, [maximum - 1, 1]));
  expect(result.status).toBe(200);
  expect((forwarded().options.body as Uint8Array).byteLength).toBe(maximum);
});

test.each([
  ["/api/auth/login", "POST", 4096],
  ["/api/cards", "POST", 32768],
  ["/api/cards/card-id", "PUT", 32768],
  ["/api/cards/card-id/photo?revision=1&side=back", "PUT", 4 * 1024 * 1024],
] as const)("chunked requests exceeding the byte limit are rejected before forwarding: %s", async (path, method, maximum) => {
  const result = await forwardApi(chunked(path, method, [maximum, 1], { "Content-Length": "1" }));
  expect(result.status).toBe(413);
  expect(result.headers.get("cache-control")).toBe("no-store");
  expect(await result.json()).toEqual({ detail: "Request is too large." });
  expect(upstreamFetch).not.toHaveBeenCalled();
});

test("network failures do not expose backend configuration or transport details", async () => {
  vi.stubEnv("API_SERVICE_URL", "https://private.example/internal");
  upstreamFetch.mockRejectedValue(new Error("connect ECONNREFUSED private.example:443 secret-header"));
  const result = await forwardApi(incoming());
  expect(result.status).toBe(503);
  expect(result.headers.get("cache-control")).toBe("no-store");
  expect(await result.json()).toEqual({ detail: "Could not reach SlabTrak. Please retry." });
});

test("client disconnection is connected to the upstream cancellation signal", async () => {
  const controller = new AbortController();
  await forwardApi(incoming("/api/cards", { signal: controller.signal }));
  const signal = forwarded().options.signal!;
  expect(signal.aborted).toBe(false);
  controller.abort();
  expect(signal.aborted).toBe(true);
});
