import Link from "next/link";

export const dynamic = "force-dynamic";

/** Stand-in for Medicare.gov's Blue Button 2.0 authorization screen. */
export default async function MockBlueButton({ searchParams }: PageProps<"/mock/bluebutton">) {
  const sp = await searchParams;
  const state = String(sp.state ?? "");
  const cb = `/api/medicare/callback?state=${encodeURIComponent(state)}`;
  return (
    <div className="min-h-screen bg-[#0b2a4a] text-white flex items-center justify-center p-6">
      <div className="max-w-md w-full rounded-2xl bg-white text-ink p-8">
        <div className="text-xs uppercase tracking-wide text-ink-3">Simulated Medicare.gov</div>
        <h1 className="mt-1">Share Medicare data with CareShare?</h1>
        <p className="mt-3 text-ink-2">CareShare is requesting read access to Part A, B and D claims and coverage so the care team can reconcile medications. You can revoke this any time at Medicare.gov.</p>
        <ul className="mt-4 text-sm text-ink-2 list-disc pl-5">
          <li>Claims and coverage (ExplanationOfBenefit, Coverage, Patient)</li>
          <li>Authorized by the beneficiary or their verified representative</li>
        </ul>
        <div className="mt-6 grid gap-2">
          <Link href={`${cb}&code=ok`} className="btn btn-primary btn-lg">
            Simulate: allow
          </Link>
          <Link href={`${cb}&code=deny`} className="btn btn-secondary">
            Simulate: deny
          </Link>
        </div>
        <p className="text-xs text-ink-3 mt-4">
          Set <code>BLUEBUTTON_ADAPTER=live</code> with sandbox credentials to use the real CMS sandbox and its synthetic beneficiaries.
        </p>
      </div>
    </div>
  );
}
