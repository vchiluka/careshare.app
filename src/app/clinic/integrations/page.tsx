import { Pill, Section } from "@/components/ui";
import { blueButtonMode } from "@/lib/integrations/bluebutton";
import { directoryMode } from "@/lib/integrations/directory";
import { ehrMode } from "@/lib/integrations/fhir";
import { identityMode } from "@/lib/integrations/identity";
import { mockSmsOutbox, smsMode } from "@/lib/integrations/sms";
import { storeDriver } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Shows every seam, its mode, and what live needs. Never shows secret values. */
export default function Integrations() {
  const set = (k: string) => (process.env[k] ? "set" : "missing");
  const rows: { seam: string; mode: string; live: boolean; needs: string[]; notes: string }[] = [
    { seam: "Store", mode: storeDriver(), live: storeDriver() === "postgres", needs: ["STORE_DRIVER=postgres", "DATABASE_URL"], notes: "Memory driver holds the synthetic seed per process; every deploy resets. Postgres driver (Drizzle) is the first production step." },
    { seam: "Identity: CLEAR", mode: identityMode("clear"), live: identityMode("clear") === "live", needs: ["IDENTITY_CLEAR=live", `CLEAR_CLIENT_ID (${set("CLEAR_CLIENT_ID")})`, `CLEAR_CLIENT_SECRET (${set("CLEAR_CLIENT_SECRET")})`, `CLEAR_REDIRECT_URI (${set("CLEAR_REDIRECT_URI")})`, `CLEAR_ISSUER (${set("CLEAR_ISSUER")})`, "CLEAR_SCOPES, CLEAR_ACR_VALUES (optional)"], notes: "CLEAR Verified OIDC, authorization code + PKCE, ID token verified against JWKS. Redirect URI: /api/identity/callback/clear." },
    { seam: "Identity: ID.me", mode: identityMode("idme"), live: identityMode("idme") === "live", needs: ["IDENTITY_IDME=live", `IDME_CLIENT_ID (${set("IDME_CLIENT_ID")})`, `IDME_CLIENT_SECRET (${set("IDME_CLIENT_SECRET")})`, `IDME_REDIRECT_URI (${set("IDME_REDIRECT_URI")})`, `IDME_ISSUER (${set("IDME_ISSUER")})`, "IDME_SCOPES (the IAL2/AAL2 scope your account is provisioned for)"], notes: "Same OIDC implementation. Sandbox issuer is api.idmelabs.com; production api.id.me. Redirect URI: /api/identity/callback/idme." },
    { seam: "Medicare: Blue Button 2.0", mode: blueButtonMode(), live: blueButtonMode() === "live", needs: ["BLUEBUTTON_ADAPTER=live", `BB_CLIENT_ID (${set("BB_CLIENT_ID")})`, `BB_CLIENT_SECRET (${set("BB_CLIENT_SECRET")})`, `BB_REDIRECT_URI (${set("BB_REDIRECT_URI")})`, "BB_BASE_URL (sandbox default)"], notes: "Part D fills (EOB type pde) and Coverage pulled at authorization; refresh tokens need the Postgres store. Redirect URI: /api/medicare/callback." },
    { seam: "EHR (FHIR R4)", mode: ehrMode(), live: ehrMode() !== "mock", needs: ["EHR_ADAPTER=generic-fhir", `FHIR_BASE_URL (${set("FHIR_BASE_URL")})`, `FHIR_CLIENT_ID (${set("FHIR_CLIENT_ID")})`, `FHIR_PRIVATE_KEY_PEM (${set("FHIR_PRIVATE_KEY_PEM")})`, "FHIR_KEY_ID, FHIR_SCOPES"], notes: "SMART Backend Services (private_key_jwt). Patient match, Condition/Encounter read, CarePlan and DocumentReference write. Partner EHR vendor to be confirmed; any certified R4 server works." },
    { seam: "Community directory", mode: directoryMode(), live: directoryMode() !== "mock", needs: ["DIRECTORY_ADAPTER=virginianavigator", `VN_API_BASE_URL (${set("VN_API_BASE_URL")})`, `VN_API_KEY (${set("VN_API_KEY")})`], notes: "Mock listings carry VirginiaNavigator-style listing ids. Live adapter awaits a data-feed agreement; closed-loop outcomes post back with no PHI." },
    { seam: "SMS", mode: smsMode(), live: smsMode() !== "mock", needs: ["SMS_ADAPTER=twilio", `TWILIO_ACCOUNT_SID (${set("TWILIO_ACCOUNT_SID")})`, `TWILIO_AUTH_TOKEN (${set("TWILIO_AUTH_TOKEN")})`, `TWILIO_FROM_NUMBER (${set("TWILIO_FROM_NUMBER")})`], notes: "Rural fallback channel: verification links, check-in prompts, reminders. Message bodies carry no clinical content." },
  ];
  const outbox = mockSmsOutbox();
  return (
    <div>
      <h1>Integrations</h1>
      <p className="mt-1 text-ink-2 max-w-3xl">Every external seam sits behind an interface with a mock. Switching to live is an environment change, never a code change in a page. Secret values are never displayed; only whether they are set. Signing cookies: CARESHARE_SECRET ({set("CARESHARE_SECRET")}).</p>
      <table className="data mt-6">
        <thead>
          <tr>
            <th>Seam</th>
            <th>Mode</th>
            <th>To go live</th>
            <th>Notes</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.seam}>
              <td className="font-semibold">{r.seam}</td>
              <td>
                <Pill kind={r.live ? "green" : "neutral"}>{r.mode}</Pill>
              </td>
              <td>
                <ul className="text-xs text-ink-2 space-y-0.5">
                  {r.needs.map((n) => (
                    <li key={n}>
                      <code>{n}</code>
                    </li>
                  ))}
                </ul>
              </td>
              <td className="text-sm text-ink-2">{r.notes}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <Section title="SMS outbox (mock)" aside={<span className="text-sm text-ink-3">{outbox.length} messages this process</span>}>
        {outbox.length === 0 ? (
          <p className="text-sm text-ink-3">No texts sent yet. Send one from a household&rsquo;s Caregiver tab.</p>
        ) : (
          <ul className="text-sm divide-y divide-rule">
            {outbox.map((m) => (
              <li key={m.reference} className="py-2">
                <span className="text-ink-3 tnum">{m.at.slice(11, 19)}</span> → {m.to}: {m.body}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
