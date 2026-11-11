import Link from "next/link";

import "./app/marrow.css";
import { sans, serif } from "./fonts";

export const metadata = {
  title: "Engine: expert work, checked twice, paid through PayPal",
  description:
    "Post work in plain words. A human expert directs it with their own AI tools. Engine's AI checks it, you sign off, and PayPal pays them.",
};

const STEPS = [
  {
    n: "1",
    t: "Say what you need",
    d: "In plain words. The Scoper reads your Company Brain and writes the brief, the checks, the calls only a person can make, and a fair price. Big projects become milestones.",
  },
  {
    n: "2",
    t: "PayPal holds the money",
    d: "You approve in PayPal. The money is authorized and held, not charged. The expert knows it is there before they start.",
  },
  {
    n: "3",
    t: "A team, matched for you",
    d: "Each role gets experts ranked from their profiles, with the reason they fit. You drag the ones you want onto the team; they accept in their dashboard and direct the work with their own AI.",
  },
  {
    n: "4",
    t: "Checked twice",
    d: "Engine's AI verifies every check and quotes what fails. Then you, or a second expert for legal or regulated work, judge taste, strategy and soundness.",
  },
  {
    n: "5",
    t: "Paid the moment you sign off",
    d: "PayPal captures the hold and pays everyone on the job through Payouts. The Bookkeeper writes the invoice and marks it paid.",
  },
];

const PAYPAL = [
  ["Orders API, authorize", "Holds the client's money for each job or milestone"],
  ["Payments API, capture and void", "Charges exactly the held amount on sign-off, or releases it on cancel"],
  ["Payouts API", "Pays the expert and anyone they split with. The job id is the batch id, so a retry can't pay twice"],
  ["Agent Toolkit, invoices", "create_invoice, send_invoice and record_payment_for_invoice for every paid job"],
  ["Agent Toolkit, transactions", "list_transactions feeds real prices back into the Brain and the Scout"],
  ["Reporting API, balance", "Shows what the business holds, next to what is held for jobs"],
];

const RULES = [
  "No AI tool in Engine can move money. Capture and payout run in plain code, only after the checks pass and a person signs off.",
  "The Reviewer has no tools at all. It reads the work and returns a verdict on the checks, and notes on the judgement calls.",
  "Amounts and recipients come from the approved job, never from a model.",
  "A freelancer's agent sees open funded jobs and its own, and only the Brain facts chosen for that job. Private facts never leave.",
  "Every agent call is logged, allowed or refused, and shown on the job.",
];

export default function Landing() {
  return (
    <div className={`mw ${serif.variable} ${sans.variable}`}>
      <header className="mw-top">
        <Link href="/" className="mw-logo">
          <i aria-hidden="true" />
          Engine
        </Link>
        <span className="mw-sandbox" title="A demo company on PayPal's test system. No real money moves.">PayPal sandbox · test money</span>
        <nav className="mw-nav" aria-label="Main">
          <a href="#how">How it works</a>
          <a href="#paypal">PayPal</a>
          <a href="#agents">Agents</a>
        </nav>
        <div className="mw-res">
          <Link className="btn p s" href="/app">
            Open the app
          </Link>
        </div>
      </header>

      <main className="mw-main" style={{ maxWidth: 1080 }}>
        <section style={{ padding: "56px 0 40px", maxWidth: 820 }}>
          <p className="label">For founders who hire experts</p>
          <h1 className="h1" style={{ fontSize: 60, lineHeight: 1.05 }}>
            Expert work, checked twice, paid through <em>PayPal</em>.
          </h1>
          <p className="soft" style={{ fontSize: 18, margin: "14px 0 26px", maxWidth: 640 }}>
            AI does the heavy lifting. People set the direction and the standard. Engine checks the work against your brief, you sign
            off, and PayPal pays the expert straight away.
          </p>
          <div className="row" style={{ flexWrap: "wrap" }}>
            <Link className="btn p" href="/app">
              Try it in the sandbox
            </Link>
            <Link className="btn" href="/app/connect">
              Connect an AI agent
            </Link>
          </div>
        </section>

        <section className="card pad" aria-label="Example review" style={{ marginBottom: 56 }}>
          <div className="between" style={{ flexWrap: "wrap" }}>
            <div>
              <p className="label">What a review looks like</p>
              <p className="h3" style={{ marginTop: 4 }}>
                Subscription page copy, round 1
              </p>
            </div>
            <span className="pill pa">Changes asked, money still held</span>
          </div>
          <div className="divide" style={{ marginTop: 10 }}>
            <div className="crit">
              <span className="mk n" aria-label="Fail">
                ✕
              </span>
              <div>
                <p style={{ fontWeight: 600 }}>The words &lsquo;supercharge&rsquo; and &lsquo;elevate&rsquo; are not used</p>
                <p className="soft" style={{ fontSize: 14 }}>
                  The copy opens with &ldquo;Elevate your mornings&rdquo; and ends with &ldquo;supercharge your brew&rdquo;.
                </p>
              </div>
            </div>
            <div className="crit">
              <span className="mk n" aria-label="Fail">
                ✕
              </span>
              <div>
                <p style={{ fontWeight: 600 }}>The $11 first month is stated clearly</p>
                <p className="soft" style={{ fontSize: 14 }}>
                  The first-month price does not appear anywhere in the copy.
                </p>
              </div>
            </div>
            <div className="crit">
              <span className="mk w" aria-label="Person decides">
                ?
              </span>
              <div>
                <p style={{ fontWeight: 600 }}>Does it sound like Northwind? (the founder decides)</p>
                <p className="soft" style={{ fontSize: 14 }}>
                  Note for the founder: the tone is generic and could belong to any coffee brand.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section id="how" style={{ marginBottom: 56 }}>
          <p className="label">How it works</p>
          <h2 className="h2">
            From a sentence to a <em>paid</em> invoice
          </h2>
          <div className="huts" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", marginTop: 16 }}>
            {STEPS.map((s) => (
              <div key={s.n} className="hut" style={{ padding: "14px 16px" }}>
                <div className="t">
                  <span>
                    {s.n}. {s.t}
                  </span>
                </div>
                <div className="d" style={{ fontSize: 13.5, marginTop: 6 }}>
                  {s.d}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="grid2" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", marginBottom: 56 }}>
          <div className="card pad stack">
            <p className="label">Two layers of review</p>
            <p className="h3">The AI checks what can be checked</p>
            <p className="soft">
              Sections present, words to avoid, facts that match your business, word limits. Each one passes or fails with the exact
              words quoted, and the expert gets the notes.
            </p>
            <p className="h3">A person judges the rest</p>
            <p className="soft">
              Taste, strategy, whether it would persuade your customers, legal soundness. The AI writes notes to help, and flags lines
              that read as generic. It never decides these.
            </p>
          </div>
          <div className="card pad stack">
            <p className="label">Company Brain</p>
            <p className="h3">Explain your business once</p>
            <p className="soft">
              A short interview, or your website, becomes facts with sources: what you sell, who buys, your voice, words to avoid.
              Each job gets only the facts it needs, and anything marked never shared stays private.
            </p>
            <p className="h3">It learns from every job</p>
            <p className="soft">
              Answers to freelancers&apos; questions, phrases a review flagged and prices from PayPal all come back in, so the next
              brief starts better.
            </p>
          </div>
        </section>

        <section className="card pad" style={{ marginBottom: 56 }}>
          <p className="label">Milestones for bigger work</p>
          <h2 className="h2">
            A launch, a website, a company setup. <em>Paid</em> step by step.
          </h2>
          <p className="soft" style={{ maxWidth: 760 }}>
            Engine splits big work into milestones. Each one is held in PayPal only when the one before it is paid, so no hold sits
            idle past PayPal&apos;s 29-day limit, and the same expert carries the project from start to finish.
          </p>
        </section>

        <section id="paypal" style={{ marginBottom: 56 }}>
          <p className="label">Built on PayPal</p>
          <h2 className="h2">
            PayPal moves the money. <em>Code</em> decides when.
          </h2>
          <div className="card divide" style={{ marginTop: 14 }}>
            {PAYPAL.map(([api, what]) => (
              <div key={api} className="between pad" style={{ alignItems: "flex-start", flexWrap: "wrap" }}>
                <p style={{ fontWeight: 600, minWidth: 240 }}>{api}</p>
                <p className="soft" style={{ flex: "1 1 360px" }}>
                  {what}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section id="agents" className="grid2" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", marginBottom: 56 }}>
          <div className="card pad stack">
            <p className="label">Bring your own agent</p>
            <p className="h3">Experts never have to open Engine</p>
            <p className="soft">
              Claude Code, Kiro or Cursor connects to Engine&apos;s MCP server. The agent finds funded jobs, reads the brief and the
              Brain facts for that job, asks the founder a question if it must, and submits the work. The review comes back in the same
              call.
            </p>
            <div>
              <Link className="btn s" href="/app/connect">
                See the setup
              </Link>
            </div>
          </div>
          <div className="card pad stack">
            <p className="label">Builders</p>
            <p className="h3">AI that runs the back office</p>
            <p className="soft">
              The Scoper, Reviewer, Bookkeeper, Librarian and Scout each own one part of the company, on a schedule or when something
              happens. You set how much each does on its own. None of them can move money.
            </p>
          </div>
        </section>

        <section className="card pad" style={{ marginBottom: 40 }}>
          <p className="label">Rules that hold for every call</p>
          <ul style={{ margin: "10px 0 0", paddingLeft: 20 }}>
            {RULES.map((r) => (
              <li key={r} style={{ padding: "4px 0" }}>
                {r}
              </li>
            ))}
          </ul>
        </section>

        <section className="between" style={{ flexWrap: "wrap", paddingBottom: 20 }}>
          <p className="faint" style={{ maxWidth: 640 }}>
            Running on PayPal&apos;s sandbox. No real money moves. Engine is a marketplace and does not give legal, tax or financial
            advice. AI by Gemini, with Nebius as a fallback.
          </p>
          <Link className="btn p" href="/app">
            Open the app
          </Link>
        </section>
      </main>
    </div>
  );
}
