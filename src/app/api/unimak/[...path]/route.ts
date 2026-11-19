import type { NextRequest } from "next/server";
import { proxyToUnimak } from "@/server/unimak-proxy";

type Ctx = RouteContext<"/api/unimak/[...path]">;

async function handle(req: NextRequest, ctx: Ctx): Promise<Response> {
  const { path } = await ctx.params;
  return proxyToUnimak(req, path, {
    UNIMAK_API_URL: process.env.UNIMAK_API_URL,
    ALLOW_PROD_WRITES: process.env.ALLOW_PROD_WRITES,
    VERCEL_ENV: process.env.VERCEL_ENV,
  });
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
