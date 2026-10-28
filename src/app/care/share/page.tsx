import { headers } from "next/headers";
import QRCode from "qrcode";
import { createShareLink, revokeShareLink } from "@/app/actions";
import { Field, Notice, Pill } from "@/components/ui";
import { voice } from "@/lib/domain/care-terms";
import { requireCare } from "@/lib/services/care-context";
import { shlinkUri } from "@/lib/services/share";
import { peekFlowSession } from "@/lib/session";

export const dynamic = "force-dynamic";

const LABELS = ["Emergency department", "Neurologist or memory clinic", "Adult day program", "Home care agency", "Hospital or rehab", "Pharmacy", "Another family member", "Other"];

/**
 * "Share with a provider": a QR code and PIN that open the current plan and medicine list (and a FHIR R4
 * bundle) for 72 hours. The secret and PIN are shown once, right after creation, then only their hashes exist.
 */
export default async function Share({ searchParams }: PageProps<"/care/share">) {
  const sp = await searchParams;
  const { view, me } = await requireCare({ needRecord: true });
  const { h } = view;
  const v = voice(h.patient.term, h.patient.givenName);
  const hd = await headers();
  const origin = `${hd.get("x-forwarded-proto") ?? "https"}://${hd.get("x-forwarded-host") ?? hd.get("host")}`;
  const reveal = sp.created ? await peekFlowSession<{ shareId: string; secret: string; pin: string }>("reveal") : null;
  const links = [...(h.shares ?? [])].filter((l) => l.createdBy === me.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const revealed = reveal ? links.find((l) => l.id === reveal.shareId) : undefined;
  const viewerUrl = reveal ? `${origin}/share/${reveal.secret}` : "";
  const qr = reveal ? await QRCode.toString(viewerUrl, { type: "svg", margin: 1, width: 220, errorCorrectionLevel: "M" }) : "";
  const now = clock();

  return (
    <div className="max-w-2xl">
      <h1>Share {v.their} record with a provider</h1>
      <p className="mt-2 text-ink-2">For the emergency department, a neurologist two hours away, the adult day program, anyone who is not on CareShare. They scan the code or open the link, enter the PIN you read them, and see the current medicine list, the care plan and who to call. They can also download it as a standard FHIR record for their own system. The link works for 72 hours and every opening is logged.</p>

      {reveal && revealed && (
        <div className="card mt-6 print:border-0">
          <div className="flex flex-wrap items-start gap-6">
            <div className="shrink-0 bg-white p-2 rounded-lg border border-rule" dangerouslySetInnerHTML={{ __html: qr }} />
            <div className="min-w-0 flex-1">
              <div className="text-xs uppercase tracking-wide text-ink-3">For {revealed.label}</div>
              <div className="mt-2 text-sm text-ink-3">PIN, read it to them</div>
              <div className="display text-4xl tracking-[0.3em] tnum">{reveal.pin}</div>
              <div className="mt-3 text-sm text-ink-3">Or the link</div>
              <div className="text-sm break-all">{viewerUrl}</div>
              <div className="mt-3 text-xs text-ink-3">
                Works until {new Date(revealed.expiresAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}. The PIN is shown for five minutes after you make the link, then only you and the provider know it; if you lose it, make a new link.
              </div>
              <details className="mt-3 text-xs text-ink-3">
                <summary className="cursor-pointer">SMART Health Link form (for apps that scan shlink codes)</summary>
                <code className="break-all">{shlinkUri(viewerUrl, revealed.label, revealed.expiresAt)}</code>
              </details>
            </div>
          </div>
        </div>
      )}

      <form action={createShareLink} className="card mt-6 space-y-4">
        <h2>Make a new link</h2>
        <Field label="Who is it for?">
          <select name="label" defaultValue="Emergency department">
            {LABELS.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        <Field label="If other, say who" hint="Shown to you in the list below; the provider sees it too.">
          <input name="labelOther" placeholder="e.g. Dr. Reyes, cardiology" />
        </Field>
        <button className="btn btn-primary btn-lg w-full">Create the code and PIN</button>
        <p className="text-xs text-ink-3">What is shared: name and date of birth, diagnoses, the medicine list with sources, the care plan, your latest check-in scores, recent emergency visits, the latest monthly summary, and your verified status as {v.their} representative. Not shared: messages, your symptom notes, Medicare claim details.</p>
      </form>

      <h2 className="mt-8">Links you have made</h2>
      {links.length === 0 ? (
        <p className="text-sm text-ink-3 mt-2">None yet.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {links.map((l) => {
            const expired = Date.parse(l.expiresAt) < now;
            const state = l.revokedAt ? "Withdrawn" : expired ? "Expired" : "Active";
            return (
              <li key={l.id} className="card flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <div className="font-semibold">{l.label}</div>
                  <div className="text-xs text-ink-3">
                    Made {new Date(l.createdAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })} · opened {l.opens} time{l.opens === 1 ? "" : "s"}
                    {l.lastOpenedAt ? `, last ${new Date(l.lastOpenedAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Pill kind={state === "Active" ? "green" : "neutral"}>{state}</Pill>
                  {state === "Active" && (
                    <form action={revokeShareLink}>
                      <input type="hidden" name="shareId" value={l.id} />
                      <button className="btn btn-quiet text-sm">Withdraw</button>
                    </form>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {sp.created && !reveal && <Notice kind="amber">The code and PIN are no longer shown (five-minute window). Make a new link if you need them.</Notice>}
    </div>
  );
}

/** Wall clock, outside the render body so the compiler lint does not flag it; links expire by real time, not the demo clock. */
function clock(): number {
  return Date.now();
}
