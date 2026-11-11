import type { Builder, Company, Expert } from "./types";

export function seedCompany(): Company {
  return {
    name: process.env.ENGINE_COMPANY_NAME || "Northwind Coffee",
    owner: process.env.ENGINE_OWNER_NAME || "Maya",
    ownerEmail: process.env.PAYPAL_CLIENT_EMAIL || "",
    onboarded: false,
  };
}

/**
 * Expert profiles for the sandbox demo. Payouts to Priya land in the sandbox
 * freelancer account; set PAYPAL_EXPERT_EMAILS (comma-separated, in this
 * order after Priya) to give the others real sandbox accounts too. Without it
 * their payouts sit unclaimed in the sandbox, which PayPal returns after 30 days.
 */
export function seedExperts(): Expert[] {
  const extra = (process.env.PAYPAL_EXPERT_EMAILS || "").split(",").map((s) => s.trim()).filter(Boolean);
  const mail = (i: number, fallback: string) => extra[i] || fallback;
  return [
    {
      id: "doer_priya",
      name: process.env.DEMO_DOER_NAME || "Priya Nair",
      email: process.env.PAYPAL_FREELANCER_EMAIL || "sb-yojzx53750041@personal.example.com",
      headline: "Brand and launch strategist for small food and drink brands",
      skills: ["Marketing strategy", "Positioning", "Launch planning", "B2B outreach", "Copywriting"],
      pastWork: ["Wholesale launch for a Seattle tea company, 31 cafes signed in 6 weeks", "Positioning for two coffee subscription brands"],
      dayRateUsd: 650,
      available: true,
      aiTools: "Researches and drafts with Claude, decides strategy and edits by hand",
      location: "Bengaluru, works US hours",
    },
    {
      id: "doer_marco",
      name: "Marco Silva",
      email: mail(0, "marco.silva@example.com"),
      headline: "Conversion copywriter: landing pages, product pages, email",
      skills: ["Copywriting", "Email marketing", "Landing pages", "Brand voice"],
      pastWork: ["Rewrote checkout and product pages for a DTC roaster, +18% conversion", "Welcome email series for a meal kit"],
      dayRateUsd: 520,
      available: true,
      aiTools: "First drafts with ChatGPT, every line rewritten in the client's voice",
      location: "Lisbon",
    },
    {
      id: "doer_aisha",
      name: "Aisha Rahman",
      email: mail(1, "aisha.rahman@example.com"),
      headline: "Product and web designer, accessibility first",
      skills: ["Web design", "Figma", "Accessibility", "Design systems", "Webflow"],
      pastWork: ["Redesigned a wholesale ordering portal", "WCAG AA audit and fixes for a Shopify store"],
      dayRateUsd: 700,
      available: true,
      aiTools: "Generates layout options with AI, designs the final in Figma",
      location: "London",
    },
    {
      id: "doer_dev",
      name: "Dev Patel",
      email: mail(2, "dev.patel@example.com"),
      headline: "Full-stack engineer for Shopify and Next.js stores",
      skills: ["Shopify", "Next.js", "TypeScript", "Integrations", "Analytics"],
      pastWork: ["Built a B2B wholesale price list on Shopify", "Funnel analytics with GA4 and Segment"],
      dayRateUsd: 800,
      available: true,
      aiTools: "Codes with Claude Code and reviews every diff",
      location: "Toronto",
    },
    {
      id: "doer_lena",
      name: "Lena Hoffmann",
      email: mail(3, "lena.hoffmann@example.com"),
      headline: "Commercial lawyer for small businesses (Oregon bar)",
      skills: ["Contracts", "Wholesale terms", "Privacy policy", "Company formation"],
      pastWork: ["Wholesale supply agreements for three Portland roasters", "LLC formation and operating agreements"],
      dayRateUsd: 1200,
      available: false,
      aiTools: "Uses AI for first-pass clause review; signs off every document herself",
      location: "Portland",
    },
    {
      id: "doer_kenji",
      name: "Kenji Mori",
      email: mail(4, "kenji.mori@example.com"),
      headline: "Food and product photographer",
      skills: ["Product photography", "Art direction", "Photo editing"],
      pastWork: ["Natural-light catalogue for a specialty roaster", "Cafe interiors for a hospitality group"],
      dayRateUsd: 900,
      available: true,
      aiTools: "Retouches with AI tools, shoots on location",
      location: "Portland",
    },
  ];
}

/** The freelancer used in the sandbox demo. Their payout lands in this account. */
export const DEMO_DOER = {
  id: "doer_priya",
  name: process.env.DEMO_DOER_NAME || "Priya",
  email: process.env.PAYPAL_FREELANCER_EMAIL || "sb-yojzx53750041@personal.example.com",
};

/**
 * The builders: AI agents, each owning one part of the company.
 * None can move money. Money moves only on a passed review, from the
 * job's own approved amounts, in code the agents cannot call.
 */
export function seedBuilders(): Builder[] {
  return [
    {
      id: "scoper",
      name: "Scoper",
      building: "Jobs",
      job: "Turns a request into acceptance criteria and a fair price, using the Brain and past PayPal sales.",
      schedule: "When you post work",
      mode: "ask",
      canMoveMoney: false,
      tools: ["brain.read", "paypal.list_transactions"],
      runs: [],
      approvedUnchanged: 0,
    },
    {
      id: "reviewer",
      name: "Reviewer",
      building: "Jobs",
      job: "Checks submitted work against every criterion and the brand voice. Has no payment tools.",
      schedule: "When work is submitted",
      mode: "auto",
      canMoveMoney: false,
      tools: ["brain.read(job slice)"],
      runs: [],
      approvedUnchanged: 0,
    },
    {
      id: "bookkeeper",
      scheduled: true,
      usesAi: false,
      name: "Bookkeeper",
      building: "Money",
      job: "Writes and records the invoice for every paid job, and reads PayPal sales so the Brain knows real prices.",
      schedule: "After every payment, and daily 09:00",
      mode: "auto",
      canMoveMoney: false,
      tools: ["paypal.create_invoice", "paypal.send_invoice", "paypal.record_payment_for_invoice", "paypal.list_transactions"],
      runs: [],
      approvedUnchanged: 0,
    },
    {
      id: "librarian",
      scheduled: true,
      usesAi: false,
      name: "Librarian",
      building: "Company Brain",
      job: "Keeps the Company Brain current: adds what reviews and client answers teach, flags conflicts, retires stale facts.",
      schedule: "After every review, and every Monday",
      mode: "ask",
      canMoveMoney: false,
      tools: ["brain.read", "brain.propose"],
      runs: [],
      approvedUnchanged: 0,
    },
    {
      id: "scout",
      // Each run is a few AI calls, so it runs on a schedule only if the owner turns that on.
      scheduled: false,
      usesAi: true,
      name: "Scout",
      building: "Ideas",
      job: "Your forward-deployed engineer. Looks at how the company runs and suggests the work worth getting done next, and the next builder worth adding.",
      schedule: "Daily 09:00, if you turn it on",
      mode: "suggest",
      canMoveMoney: false,
      tools: ["brain.read", "paypal.list_invoices", "paypal.list_transactions"],
      runs: [],
      approvedUnchanged: 0,
    },
  ];
}
