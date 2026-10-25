/** Date helpers over ISO YYYY-MM-DD strings. No timezone math; the demo clock is a date. */

export function daysBetween(a: string, b: string): number {
  const da = Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10));
  const db = Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10));
  return Math.round((db - da) / 86400000);
}

export function addDays(a: string, n: number): string {
  const d = new Date(Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10)));
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function monthOf(a: string): string {
  return a.slice(0, 7);
}

export function ageOn(birthDate: string, asOf: string): number {
  let age = +asOf.slice(0, 4) - +birthDate.slice(0, 4);
  if (asOf.slice(5) < birthDate.slice(5)) age -= 1;
  return age;
}

export function fmtDate(a?: string): string {
  if (!a) return "—";
  const d = new Date(Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10)));
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export function fmtMonth(m: string): string {
  const d = new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7) - 1, 1));
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}
