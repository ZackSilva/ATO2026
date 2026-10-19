import { cp } from "node:fs/promises";

// Next.js's standalone server needs static assets alongside its server bundle.
await cp(".next/static", ".next/standalone/.next/static", { recursive: true });
