import Link from "next/link";
import type { CareTier, Severity, Signal } from "@/lib/domain/types";
import { TIER_SHORT } from "@/lib/engine";

const tone = {
  neutral: "bg-paper-2 text-ink-2",
  green: "bg-green-2 text-green",
  amber: "bg-amber-2 text-amber",
  red: "bg-red-2 text-red",
  blue: "bg-blue-2 text-blue",
  slate: "bg-slate-2 text-slate",
  accent: "bg-accent-2 text-accent-ink",
} as const;
export type Tone = keyof typeof tone;

export function Pill({ children, kind = "neutral", title }: { children: React.ReactNode; kind?: Tone; title?: string }) {
  return (
    <span title={title} className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${tone[kind]}`}>
      {children}
    </span>
  );
}

export function severityTone(s: Severity): Tone {
  return s === "critical" ? "red" : s === "warning" ? "amber" : "blue";
}

export function TierPill({ tier }: { tier: CareTier | null }) {
  if (!tier) return <Pill>No tier yet</Pill>;
  const k: Tone = tier === "HIGH_DYAD" ? "red" : tier === "MODERATE_DYAD" || tier === "MOD_HIGH_INDIVIDUAL" ? "amber" : "green";
  return <Pill kind={k}>{TIER_SHORT[tier]}</Pill>;
}

export function Section({ title, children, aside, id }: { title: string; children: React.ReactNode; aside?: React.ReactNode; id?: string }) {
  return (
    <section className="mt-8" id={id}>
      <div className="flex items-baseline justify-between gap-4 border-b border-rule pb-2 mb-4">
        <h2>{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function Stat({ label, value, sub, tone: t }: { label: string; value: React.ReactNode; sub?: string; tone?: "red" | "amber" | "green" }) {
  const color = t === "red" ? "text-red" : t === "amber" ? "text-amber" : t === "green" ? "text-green" : "text-ink";
  return (
    <div className="border-l-2 border-rule pl-3">
      <div className={`display text-3xl leading-none tnum ${color}`}>{value}</div>
      <div className="text-sm text-ink-2 mt-1">{label}</div>
      {sub && <div className="text-xs text-ink-3">{sub}</div>}
    </div>
  );
}

export function Meter({ value, max, label, tone: t = "green" }: { value: number; max: number; label?: string; tone?: "green" | "amber" | "red" | "slate" }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const color = { green: "bg-green", amber: "bg-amber", red: "bg-red", slate: "bg-slate" }[t];
  return (
    <div className="w-full">
      {label && (
        <div className="flex justify-between text-xs text-ink-3 mb-1">
          <span>{label}</span>
          <span className="tnum">{Math.round(pct)}%</span>
        </div>
      )}
      <div className="h-2 w-full rounded-full bg-paper-2 overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function SignalList({ signals, compact = false, owner }: { signals: Signal[]; compact?: boolean; owner?: "clinic" | "caregiver" }) {
  const xs = owner ? signals.filter((s) => s.owner === owner || s.owner === "both") : signals;
  if (xs.length === 0) return <p className="text-sm text-ink-3">Nothing needs attention right now.</p>;
  return (
    <ul className={`flex flex-col ${compact ? "gap-1.5" : "gap-3"}`}>
      {xs.map((s) => (
        <li key={s.key} className="flex gap-3">
          <span className={`mt-2 h-2.5 w-2.5 shrink-0 rounded-full ${s.severity === "critical" ? "bg-red" : s.severity === "warning" ? "bg-amber" : "bg-blue"}`} />
          <div className="min-w-0">
            <div className={compact ? "text-sm truncate" : ""}>{s.message}</div>
            {!compact && <div className="text-sm text-ink-3 mt-0.5">Next: {s.action}</div>}
          </div>
        </li>
      ))}
    </ul>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-ink-3 py-6 text-center border border-dashed border-rule rounded-xl">{children}</p>;
}

export function Notice({ kind = "blue", children }: { kind?: Tone; children: React.ReactNode }) {
  return <div className={`rounded-xl px-4 py-3 text-sm ${tone[kind]}`}>{children}</div>;
}

export function Tabs({ base, tabs, current, param = "tab" }: { base: string; tabs: { key: string; label: string; count?: number }[]; current: string; param?: string }) {
  return (
    <nav className="tabs mt-6" aria-label="Sections">
      {tabs.map((t) => (
        <Link key={t.key} href={`${base}?${param}=${t.key}`} aria-current={current === t.key ? "page" : undefined}>
          {t.label}
          {t.count ? <span className="ml-1.5 text-xs text-ink-3 tnum">{t.count}</span> : null}
        </Link>
      ))}
    </nav>
  );
}

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <span className="text-xs font-normal text-ink-3">{hint}</span>}
    </label>
  );
}

export function Button({ children, kind = "primary", size, type = "submit", name, value, formAction, href }: { children: React.ReactNode; kind?: "primary" | "secondary" | "quiet" | "danger"; size?: "lg"; type?: "submit" | "button"; name?: string; value?: string; formAction?: (fd: FormData) => void | Promise<void>; href?: string }) {
  const cls = `btn btn-${kind} ${size === "lg" ? "btn-lg" : ""}`;
  if (href) return <Link href={href} className={cls}>{children}</Link>;
  return (
    <button type={type} className={cls} name={name} value={value} formAction={formAction}>
      {children}
    </button>
  );
}

export function KV({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5 text-sm">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-ink-3">{k}</dt>
          <dd className="min-w-0">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
