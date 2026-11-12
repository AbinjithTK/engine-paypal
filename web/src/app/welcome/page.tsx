"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Me = { role: "owner" | "expert"; demo: boolean; name?: string; email?: string; onboarded: boolean } | null;

const go = (path: string) => window.location.assign(new URL(path, window.location.origin).toString());

type Step = { title: string; hint: string; fields: Field[] };
type Field = { key: string; label: string; placeholder?: string; long?: boolean; type?: string; optional?: boolean; help?: string };

const OWNER: Step[] = [
  {
    title: "Your company",
    hint: "This starts your Company Brain. Every brief your experts get is built from it.",
    fields: [
      { key: "company", label: "Company name", placeholder: "Northwind Coffee" },
      { key: "about", label: "What does it do?", placeholder: "We roast specialty coffee in small batches and sell bags online and to cafes.", long: true },
    ],
  },
  {
    title: "Your customers and voice",
    hint: "So the work sounds like you. You can skip any of these and add them later.",
    fields: [
      { key: "customers", label: "Who buys from you?", placeholder: "Home brewers who care about origin, and independent cafes.", long: true, optional: true },
      { key: "voice", label: "How do you sound?", placeholder: "Warm, plain, a bit nerdy about origins.", optional: true },
      { key: "avoid", label: "Words to avoid", placeholder: "elevate, supercharge, artisanal", optional: true },
    ],
  },
  {
    title: "Payments",
    hint: "You approve each payment in PayPal. Money is held, then paid to the expert only after you sign off.",
    fields: [
      {
        key: "paypalEmail",
        label: "PayPal email for your invoices",
        placeholder: "you@company.com",
        type: "email",
        optional: true,
        help: "Engine sends a paid invoice here after each job. Leave it empty to use your sign-in email.",
      },
    ],
  },
];

const EXPERT: Step[] = [
  {
    title: "What you do",
    hint: "Companies and their Matcher read this to decide who fits their work.",
    fields: [
      { key: "headline", label: "One line about your work", placeholder: "Brand and launch strategist for food and drink brands" },
      { key: "skills", label: "Skills, separated by commas", placeholder: "Positioning, Launch planning, Copywriting" },
    ],
  },
  {
    title: "Your track record",
    hint: "Specific beats impressive. The Matcher quotes this when it explains why you fit.",
    fields: [
      { key: "pastWork", label: "Past work, one per line", placeholder: "Launched wholesale for a tea company: 30 cafes in 3 months", long: true },
      { key: "aiTools", label: "How you work with AI", placeholder: "Research and drafts with Claude, every line edited by me", optional: true },
    ],
  },
  {
    title: "Rate and payouts",
    hint: "You're paid through PayPal when your work passes review and the company signs off. Engine takes 0% from experts.",
    fields: [
      { key: "dayRateUsd", label: "Day rate in US dollars", placeholder: "600", type: "number" },
      { key: "location", label: "Where you're based", placeholder: "Lisbon, remote", optional: true },
      { key: "paypalEmail", label: "PayPal email for payouts", placeholder: "you@example.com", type: "email" },
    ],
  },
];

export default function Welcome() {
  const [me, setMe] = useState<Me | undefined>(undefined);
  const [step, setStep] = useState(0);
  const [v, setV] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Reading who is signed in is the external system this effect syncs with.
    void fetch("/api/auth", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (j.me?.onboarded) go(j.me.role === "owner" ? "/app" : "/work");
        else setMe(j.me ?? null);
      })
      .catch(() => setErr("Couldn't reach Engine. Refresh to try again."));
  }, []);

  if (me === undefined)
    return (
      <main className="mw-main" style={{ maxWidth: 640 }}>
        <p className="soft">Loading…</p>
      </main>
    );
  if (me === null || me.demo)
    return (
      <main className="mw-main" style={{ maxWidth: 640 }}>
        <h1 className="h1">Create an account first</h1>
        <p className="soft" style={{ marginBottom: 24 }}>Onboarding is for new accounts.</p>
        <Link className="btn p" href="/login?new=1">
          Create an account
        </Link>
      </main>
    );

  const steps = me.role === "owner" ? OWNER : EXPERT;
  const s = steps[step];
  const last = step === steps.length - 1;
  const ready = s.fields.every((f) => f.optional || (v[f.key] ?? "").trim().length > 0);

  async function finish() {
    setBusy(true);
    setErr(null);
    const payload = me!.role === "owner" ? { action: "onboard_owner", ...v } : { action: "onboard_expert", ...v, dayRateUsd: Number(v.dayRateUsd) };
    try {
      const r = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setBusy(false);
        return setErr(j.error || "That didn't go through. Try again.");
      }
      go(j.next || "/");
    } catch {
      setBusy(false);
      setErr("Couldn't reach Engine. Check your connection and try again.");
    }
  }

  return (
    <>
      <header className="mw-top">
        <Link href="/" className="mw-logo">
          <i aria-hidden="true" />
          Engine
        </Link>
      </header>
      <main className="mw-main" style={{ maxWidth: 680 }}>
        <ol className="steps-bar" aria-label="Progress">
          {steps.map((x, i) => (
            <li key={x.title} aria-current={i === step ? "step" : undefined} className={i < step ? "done" : ""}>
              <i aria-hidden="true" />
              <span>{x.title}</span>
            </li>
          ))}
        </ol>

        <p className="label">
          Step {step + 1} of {steps.length}
        </p>
        <h1 className="h1">
          {step === 0 ? (
            <>
              Welcome, <em>{(me.name ?? "").split(" ")[0] || "there"}</em>
            </>
          ) : (
            s.title
          )}
        </h1>
        <p className="soft" style={{ marginBottom: 32 }}>
          {step === 0 ? `${s.title}. ${s.hint}` : s.hint}
        </p>

        <form
          className="card pad-lg stack-lg"
          onSubmit={(e) => {
            e.preventDefault();
            if (!ready) return;
            if (last) void finish();
            else setStep(step + 1);
          }}
        >
          {s.fields.map((f) => (
            <label key={f.key} className="field">
              <span>
                {f.label}
                {f.optional && <span className="faint" style={{ fontWeight: 400 }}> · optional</span>}
              </span>
              {f.long ? (
                <textarea value={v[f.key] ?? ""} onChange={(e) => setV({ ...v, [f.key]: e.target.value })} placeholder={f.placeholder} />
              ) : (
                <input
                  type={f.type === "number" ? "number" : "text"}
                  inputMode={f.type === "email" ? "email" : f.type === "number" ? "numeric" : undefined}
                  value={v[f.key] ?? ""}
                  onChange={(e) => setV({ ...v, [f.key]: e.target.value })}
                  placeholder={f.placeholder}
                />
              )}
              {f.help && <small className="faint">{f.help}</small>}
            </label>
          ))}

          {err && (
            <p role="alert" style={{ color: "var(--danger)" }}>
              {err}
            </p>
          )}

          <div className="between">
            {step > 0 ? (
              <button type="button" className="btn ghost" onClick={() => setStep(step - 1)}>
                Back
              </button>
            ) : (
              <span />
            )}
            <button className="btn p" disabled={!ready || busy}>
              {busy ? "Setting up…" : last ? (me.role === "owner" ? "Create my company" : "Create my profile") : "Continue"}
            </button>
          </div>
        </form>
      </main>
    </>
  );
}
