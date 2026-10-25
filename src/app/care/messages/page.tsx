import { caregiverSendMessage } from "@/app/actions";
import { Field } from "@/components/ui";
import { requireCare } from "@/lib/services/care-context";

export const dynamic = "force-dynamic";

function fmtAt(at: string) {
  const d = new Date(at);
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
}

export default async function CareMessages() {
  const { view, me } = await requireCare({ needRecord: true });
  const msgs = [...view.h.messages].sort((a, b) => a.at.localeCompare(b.at));
  return (
    <div>
      <h1>Messages</h1>
      <p className="mt-2 text-ink-2">Secure messages with {view.site.orgName}. Answered during clinic hours; for anything urgent, call {view.site.phone}.</p>
      <div className="mt-6 space-y-3">
        {msgs.map((m) => (
          <div key={m.id} className={`max-w-[85%] rounded-2xl px-4 py-3 ${m.from === "caregiver" ? "ml-auto bg-accent-2" : "bg-white border border-rule"}`}>
            <div className="text-sm text-ink-3 flex justify-between gap-4">
              <span>{m.from === "caregiver" ? (m.authorId === me.id ? "You" : m.authorName) : m.authorName}</span>
              <span className="tnum">{fmtAt(m.at)}</span>
            </div>
            <div className="mt-1">{m.body}</div>
          </div>
        ))}
        {msgs.length === 0 && <p className="text-ink-3">No messages yet.</p>}
      </div>
      <form action={caregiverSendMessage} className="card mt-6 space-y-3">
        <Field label="Write to the care team">
          <textarea name="body" required placeholder="What is on your mind?" />
        </Field>
        <button className="btn btn-primary">Send</button>
      </form>
    </div>
  );
}
