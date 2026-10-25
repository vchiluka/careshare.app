/**
 * SMS: the rural fallback channel. Caregivers without a smartphone or broadband get check-in
 * prompts, appointment reminders and the verification link by text; replies to prompts are
 * logged as check-ins.
 *
 *   SMS_ADAPTER=mock (default) | twilio
 *   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER
 *
 * Message bodies never carry clinical content beyond what the caregiver typed herself; links
 * go to the verified app, which does the gating.
 */

export interface SmsAdapter {
  readonly mode: "mock" | "live";
  readonly label: string;
  send(input: { to: string; body: string }): Promise<{ reference: string }>;
}

const outbox: { at: string; to: string; body: string; reference: string }[] = [];
const g = globalThis as unknown as { __smsOutbox?: typeof outbox };
if (!g.__smsOutbox) g.__smsOutbox = outbox;

export function mockSmsOutbox() {
  return g.__smsOutbox!;
}

export function createMockSmsAdapter(): SmsAdapter {
  return {
    mode: "mock",
    label: "SMS (mock outbox)",
    async send({ to, body }) {
      const reference = `sms-mock-${Date.now().toString(36)}`;
      g.__smsOutbox!.unshift({ at: new Date().toISOString(), to, body, reference });
      if (g.__smsOutbox!.length > 50) g.__smsOutbox!.length = 50;
      return { reference };
    },
  };
}

export function createTwilioSmsAdapter(): SmsAdapter {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const tok = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  if (!sid || !tok || !from) throw new Error("SMS_ADAPTER=twilio but TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN or TWILIO_FROM_NUMBER not set.");
  return {
    mode: "live",
    label: `Twilio from ${from}`,
    async send({ to, body }) {
      const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
        method: "POST",
        headers: { authorization: `Basic ${btoa(`${sid}:${tok}`)}`, "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ To: to, From: from, Body: body }),
      });
      if (!r.ok) throw new Error(`Twilio send failed (${r.status})`);
      const j = (await r.json()) as { sid: string };
      return { reference: j.sid };
    },
  };
}

export function smsMode(): "mock" | "twilio" {
  const v = process.env.SMS_ADAPTER ?? "mock";
  if (v !== "mock" && v !== "twilio") throw new Error(`SMS_ADAPTER must be mock or twilio, got "${v}".`);
  return v;
}

export function getSmsAdapter(): SmsAdapter {
  return smsMode() === "twilio" ? createTwilioSmsAdapter() : createMockSmsAdapter();
}
