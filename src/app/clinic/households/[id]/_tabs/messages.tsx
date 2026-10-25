import { clinicSendMessage } from "@/app/actions";
import { Field, Section } from "@/components/ui";
import type { HouseholdView } from "@/lib/services/household-view";

function fmtAt(at: string) {
  return new Date(at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
}

export function MessagesTab({ view }: { view: HouseholdView }) {
  const { h, primary } = view;
  const msgs = [...h.messages].sort((a, b) => a.at.localeCompare(b.at));
  if (!primary || primary.proxy.status !== "confirmed") return <p className="text-sm text-ink-3">Secure messaging opens once the caregiver is verified and confirmed as representative.</p>;
  return (
    <div className="max-w-3xl">
      <Section title={`Secure messages with ${primary.givenName}`}>
        <div className="space-y-3">
          {msgs.map((m) => (
            <div key={m.id} className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${m.from === "clinic" ? "ml-auto bg-slate-2" : "bg-white border border-rule"}`}>
              <div className="text-xs text-ink-3 flex justify-between gap-4">
                <span>{m.authorName}</span>
                <span className="tnum">
                  {fmtAt(m.at)}
                  {m.from === "caregiver" && !m.readAt ? " · unread" : ""}
                </span>
              </div>
              <div className="mt-1">{m.body}</div>
            </div>
          ))}
          {msgs.length === 0 && <p className="text-sm text-ink-3">No messages yet.</p>}
        </div>
        <form action={clinicSendMessage} className="card mt-5 space-y-3">
          <input type="hidden" name="householdId" value={h.id} />
          <Field label="Reply"><textarea name="body" required placeholder="Keep it short and specific; she reads this on a phone." /></Field>
          <button className="btn btn-primary">Send (marks her messages read)</button>
        </form>
        <p className="text-xs text-ink-3 mt-2">A reply with clinical content counts as a contact; log it under Contacts with the minutes.</p>
      </Section>
    </div>
  );
}
