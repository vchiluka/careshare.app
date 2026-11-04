/**
 * GET /api/health: liveness for the uptime monitor and the promotion smoke test.
 * Reports the store driver, the newest applied migration and any pending ones. No data, no PHI.
 */
import { getRepository } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const h = await getRepository().health();
    return Response.json(
      { ok: h.ok, store: h.driver, schemaVersion: h.schemaVersion ?? null, pendingMigrations: h.pendingMigrations, env: process.env.VERCEL_ENV ?? "local" },
      { status: h.ok ? 200 : 503, headers: { "cache-control": "no-store" } },
    );
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : "store unavailable" }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
