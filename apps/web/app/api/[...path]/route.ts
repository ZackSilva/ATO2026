import { forwardApi } from "../../../lib/api-proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = forwardApi;
export const HEAD = forwardApi;
export const POST = forwardApi;
export const PUT = forwardApi;
export const PATCH = forwardApi;
export const DELETE = forwardApi;
export const OPTIONS = forwardApi;
