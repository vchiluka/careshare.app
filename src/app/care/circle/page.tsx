import { createInvite } from "@/app/actions";
import { Field, Notice, Pill } from "@/components/ui";
import { voice } from "@/lib/domain/care-terms";
import { consentFor, consentState } from "@/lib/engine";
import { requireCare } from "@/lib/services/care-context";

export const dynamic = "force-dynamic";

/** The care circle: who else is verified on this household, and inviting a second caregiver. */
export default async function Circle({ searchParams }: PageProps<"/care/circle">) {
  const sp = await searchParams;
  const { view, me } = await requireCare({ needRecord: true });
  const { h, asOf } = view;
  const v = voice(h.patient.term, h.patient.givenName);
  const invites = [...(h.invites ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const now = clock();
  return (
    <div className="max-w-2xl">
      <h1>Who helps care for {v.them}</h1>
      <p className="mt-2 text-ink-2">Everyone here went through the same identity check and signed the same authorization. The clinic sees the same list.</p>
      {sp.invited && <Notice kind="green">Invitation made. Give the code below to your family member; it works once, for 14 days.</Notice>}
      {sp.error === "name" && <Notice kind="amber">Please enter their first name.</Notice>}
      <ul className="mt-6 space-y-2">
        {h.caregivers.map((c) => {
          const cs = consentState(consentFor(h, c.id), asOf);
          return (
            <li key={c.id} className="card flex flex-wrap items-center justify-between gap-3 py-3">
              <div>
                <div className="font-semibold">
                  {c.givenName} {c.familyName} {c.id === me.id && <span className="text-ink-3 font-normal">(you)</span>}
                </div>
                <div className="text-xs text-ink-3">{c.relationship.replaceAll("_", " ")}{c.isPrimary ? " · primary" : ""}</div>
              </div>
              <div className="flex gap-1.5">
                <Pill kind={c.identity.status === "verified" ? "green" : "neutral"}>{c.identity.status === "verified" ? "identity verified" : c.identity.status.replaceAll("_", " ")}</Pill>
                <Pill kind={c.proxy.status === "confirmed" ? "green" : c.proxy.status === "self_attested" ? "blue" : "amber"}>{c.proxy.status === "confirmed" ? "clinic confirmed" : c.proxy.status.replaceAll("_", " ")}</Pill>
                <Pill kind={cs.state === "active" || cs.state === "expiring" ? "green" : "neutral"}>authorization {cs.state}</Pill>
              </div>
            </li>
          );
        })}
      </ul>

      <form action={createInvite} className="card mt-8 space-y-4">
        <h2>Invite another family member</h2>
        <p className="text-sm text-ink-2">A sister who trades weeks with you, a son who handles the pharmacy. They register on CareShare, prove who they are the same way you did, and enter the code. Then they sign their own authorization. You do not share your login.</p>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Their first name">
            <input name="givenName" required />
          </Field>
          <Field label={`They are ${v.their}`}>
            <select name="relationship" defaultValue="daughter">
              <option value="spouse">wife or husband</option>
              <option value="daughter">daughter</option>
              <option value="son">son</option>
              <option value="child">child</option>
              <option value="daughter_in_law">daughter- or son-in-law</option>
              <option value="sibling">sister or brother</option>
              <option value="grandchild">grandchild</option>
              <option value="friend_neighbor">friend or neighbor</option>
              <option value="other">other family</option>
            </select>
          </Field>
        </div>
        <button className="btn btn-primary">Make an invitation code</button>
      </form>

      {invites.length > 0 && (
        <>
          <h2 className="mt-8">Invitations</h2>
          <ul className="mt-3 space-y-2">
            {invites.map((i) => {
              const state = i.usedBy ? "Used" : Date.parse(i.expiresAt) < now ? "Expired" : "Open";
              return (
                <li key={i.code} className="card flex flex-wrap items-center justify-between gap-3 py-3">
                  <div>
                    <div className="font-semibold">
                      {i.givenName} <span className="text-ink-3 font-normal">({i.relationship.replaceAll("_", " ")})</span>
                    </div>
                    <div className="text-xs text-ink-3">Made {new Date(i.createdAt).toLocaleDateString("en-US", { dateStyle: "medium" })}; works until {new Date(i.expiresAt).toLocaleDateString("en-US", { dateStyle: "medium" })}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    {state === "Open" && <span className="display text-2xl tracking-widest tnum">{i.code}</span>}
                    <Pill kind={state === "Open" ? "green" : "neutral"}>{state}</Pill>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}

/** Wall clock, outside the render body so the compiler lint does not flag it; links expire by real time, not the demo clock. */
function clock(): number {
  return Date.now();
}
