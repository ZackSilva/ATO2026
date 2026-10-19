import { afterEach, expect, test, vi } from "vitest";
import { api, ApiError } from "./api";

afterEach(() => vi.unstubAllGlobals());

test("a failed HTML proxy response is a readable error, not a JSON crash", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>upstream failed</html>", { status: 502 })));
  await expect(api("/auth/me")).rejects.toMatchObject({ status: 502, message: "The request could not be completed. Please try again." });
});

test("validation inputs are never displayed as error details", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ detail: [{ input: "sensitive value" }] }, { status: 422 })));
  await expect(api("/auth/login")).rejects.toThrow("The request could not be completed.");
});

test("logout accepts an empty 204 response", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
  await expect(api("/auth/logout", { method: "POST" })).resolves.toBeUndefined();
});

test("network errors preserve an actionable status without leaking request contents", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("internal connection details")));
  await expect(api("/auth/me")).rejects.toBeInstanceOf(ApiError);
  await expect(api("/auth/me")).rejects.toMatchObject({ status: 0, message: "Could not reach SlabTrak. Check your connection and try again." });
});
