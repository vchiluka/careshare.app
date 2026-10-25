import Link from "next/link";

export const dynamic = "force-dynamic";

/**
 * Stand-in for the identity vendor's hosted flow. In live mode the caregiver never sees this page:
 * the authorize URL points at CLEAR or ID.me, and they redirect back to the same callback.
 */
export default async function MockIdentity({ searchParams }: PageProps<"/mock/identity">) {
  const sp = await searchParams;
  const state = String(sp.state ?? "");
  const brand = sp.brand === "clear" ? "CLEAR" : "ID.me";
  const cb = `/api/identity/callback/${sp.brand === "clear" ? "clear" : "idme"}?state=${encodeURIComponent(state)}`;
  const steps = brand === "CLEAR" ? ["Scan the front and back of your ID", "Take a short video selfie", "Confirm your phone number"] : ["Upload your driver's license", "Take a selfie", "Verify your phone, or join a video call with a Trusted Referee"];
  return (
    <div className="min-h-screen bg-[#111827] text-white flex items-center justify-center p-6">
      <div className="max-w-md w-full rounded-2xl bg-white text-ink p-8">
        <div className="text-xs uppercase tracking-wide text-ink-3">Simulated vendor page</div>
        <h1 className="mt-1">{brand} identity verification</h1>
        <p className="mt-3 text-ink-2">CareShare is asking {brand} to verify your identity at IAL2 and share only a verified-identity reference and your name and date of birth.</p>
        <ol className="mt-4 list-decimal pl-5 space-y-1 text-ink-2">
          {steps.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
        <div className="mt-6 grid gap-2">
          <Link href={`${cb}&code=ok`} className="btn btn-primary btn-lg">
            Simulate: verified at IAL2 / AAL2
          </Link>
          <Link href={`${cb}&code=fail`} className="btn btn-secondary">
            Simulate: document check failed
          </Link>
          <Link href={`${cb}&code=cancel`} className="btn btn-quiet">
            Simulate: caregiver gave up
          </Link>
        </div>
        <p className="text-xs text-ink-3 mt-4">
          Switch <code>IDENTITY_{brand === "CLEAR" ? "CLEAR" : "IDME"}=live</code> with sandbox credentials in the environment and this page is replaced by the real vendor flow.
        </p>
      </div>
    </div>
  );
}
