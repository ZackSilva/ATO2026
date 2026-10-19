export type Session = { username: string; csrf_token: string; expires_at: string };

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      ...options,
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Content-Type": "application/json", ...options.headers },
    });
  } catch {
    throw new ApiError(0, "Could not reach SlabTrak. Check your connection and try again.");
  }
  if (!response.ok) {
    // Only display the API's explicit text error, never raw HTML or validation input.
    let message = "The request could not be completed. Please try again.";
    try {
      const body: unknown = await response.json();
      if (body && typeof body === "object" && "detail" in body && typeof body.detail === "string") {
        message = body.detail;
      }
    } catch { /* A failed proxy can return HTML rather than JSON. */ }
    throw new ApiError(response.status, message);
  }
  return response.status === 204 ? undefined as T : response.json();
}
