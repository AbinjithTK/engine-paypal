/**
 * The people layer. One source for the board, the assign picker and the
 * directory, so a worker never looks different in two places.
 *
 * `prd.md` §12.3 is explicit that supply is hand-recruited at this stage, so
 * this is a real small pool rather than generated filler.
 *
 * `agents` is capability 11 from `prd.md` §1.3: a contractor who builds their
 * own reusable agent has productised their taste. It is the thing that makes
 * a profile worth browsing rather than just matching against.
 */

import type { RewardAppetite } from "./blocks";
import { money, type Money } from "./money";

export type Availability = "open" | "limited" | "booked";

export type PortfolioPiece = {
  title: string;
  /** What they were actually responsible for. Not a job title. */
  role: string;
  outcome: string;
  year: number;
};

export type Person = {
  id: string;
  name: string;
  initials: string;
  headline: string;
  location: string;
  skills: string[];
  /** Hourly guide, integer minor units. Never a float. DESIGN.md §5.1 */
  rateFrom: Money;
  availability: Availability;
  /** Share of tasks passing review first time, in basis points. */
  firstPassBps: number;
  tasksDone: number;
  /** Reusable agents this person built and carries between clients. */
  agents: string[];
  portfolio: PortfolioPiece[];
  /** Has worked for this company before. Drives the "Your team" roster. */
  hired: boolean;
  /** What they will take. Someone who takes equity is betting on the vision. */
  appetite: RewardAppetite;
  /**
   * Equity earned across companies. This is the thing a marketplace cannot
   * offer: not a gig history, a portfolio of ownership.
   */
  holdings: { company: string; equity: Money }[];
};

export const PEOPLE: Person[] = [
  {
    id: "worker-1",
    name: "Priya N",
    appetite: "either",
    holdings: [
      { company: "Northwind Tools", equity: money(75, "EQUITY") },
      { company: "Kettle", equity: money(120, "EQUITY") },
    ],
    initials: "PN",
    headline: "Product designer who ships the build, not the mockup",
    location: "Bengaluru, IN",
    skills: ["Design", "Webflow", "Design systems"],
    rateFrom: money(6_500, "USD"),
    availability: "open",
    firstPassBps: 9_400,
    tasksDone: 17,
    agents: ["Brand-voice copy reviewer", "Contrast and focus-order checker"],
    portfolio: [
      {
        title: "Pricing page for a dev-tools startup",
        role: "Sole designer, shipped to production in Webflow",
        outcome: "Conversion 1.4% to 2.6% over six weeks",
        year: 2026,
      },
      {
        title: "Design system for a 4-person team",
        role: "Tokens, 22 components, docs",
        outcome: "New screens went from days to hours",
        year: 2025,
      },
    ],
    hired: true,
  },
  {
    id: "worker-2",
    name: "Marco S",
    appetite: "equity",
    holdings: [{ company: "Northwind Tools", equity: money(200, "EQUITY") }],
    initials: "MS",
    headline: "Positioning and copy for products that are hard to explain",
    location: "Lisbon, PT",
    skills: ["Copy", "Positioning", "Landing pages"],
    rateFrom: money(7_000, "USD"),
    availability: "open",
    firstPassBps: 8_800,
    tasksDone: 23,
    agents: ["Message-test loop", "Jargon stripper"],
    portfolio: [
      {
        title: "Repositioned an API company away from feature-led copy",
        role: "Interviews, narrative, all page copy",
        outcome: "Demo requests up 40% quarter on quarter",
        year: 2026,
      },
      {
        title: "Onboarding email sequence, 6 mails",
        role: "Sequence design and writing",
        outcome: "Activation 31% to 44%",
        year: 2025,
      },
    ],
    hired: true,
  },
  {
    id: "worker-3",
    name: "Dee K",
    appetite: "cash",
    holdings: [],
    initials: "DK",
    headline: "Analytics engineer. Makes funnels legible before you change them",
    location: "Manchester, UK",
    skills: ["Analytics", "SQL", "dbt", "Instrumentation"],
    rateFrom: money(8_000, "USD"),
    availability: "booked",
    firstPassBps: 9_100,
    tasksDone: 11,
    agents: ["Funnel baseline reporter"],
    portfolio: [
      {
        title: "Instrumented a checkout funnel end to end",
        role: "Event schema, dbt models, dashboard",
        outcome: "Found a 19% drop-off nobody had measured",
        year: 2026,
      },
    ],
    hired: true,
  },
  {
    id: "worker-4",
    name: "Aisha R",
    appetite: "either",
    holdings: [{ company: "Sundial", equity: money(45, "EQUITY") }],
    initials: "AR",
    headline: "Front-end engineer, accessibility-first",
    location: "Nairobi, KE",
    skills: ["React", "TypeScript", "Accessibility", "Next.js"],
    rateFrom: money(7_500, "USD"),
    availability: "open",
    firstPassBps: 9_600,
    tasksDone: 29,
    agents: ["Axe-and-keyboard audit runner", "Bundle-budget watcher"],
    portfolio: [
      {
        title: "Rebuilt a booking flow to WCAG AA",
        role: "Lead engineer, audit and remediation",
        outcome: "Keyboard completion 61% to 98%",
        year: 2026,
      },
      {
        title: "Cut a marketing site's JS by 70%",
        role: "Performance work",
        outcome: "LCP 4.1s to 1.2s on 3G",
        year: 2025,
      },
    ],
    hired: false,
  },
  {
    id: "worker-5",
    name: "Tomás V",
    appetite: "equity",
    holdings: [],
    initials: "TV",
    headline: "Growth ops. Sets up the boring machinery that compounds",
    location: "Buenos Aires, AR",
    skills: ["Lifecycle", "Automation", "CRM", "Paid"],
    rateFrom: money(5_500, "USD"),
    availability: "limited",
    firstPassBps: 8_200,
    tasksDone: 14,
    agents: ["Lifecycle audit"],
    portfolio: [
      {
        title: "Built the whole lifecycle stack for a solo founder",
        role: "Strategy and implementation",
        outcome: "Trial to paid 8% to 14%",
        year: 2026,
      },
    ],
    hired: false,
  },
];

export const AVAILABILITY: Record<
  Availability,
  { label: string; tone: "success" | "warning" | "neutral" }
> = {
  open: { label: "Open to work", tone: "success" },
  limited: { label: "Limited", tone: "warning" },
  booked: { label: "Booked", tone: "neutral" },
};

export function personById(id: string): Person | undefined {
  return PEOPLE.find((p) => p.id === id);
}

export function firstPassLabel(bps: number): string {
  return `${(bps / 100).toFixed(0)}% first pass`;
}

/**
 * Manual browse needs to be as good as agent search, per the founder who wants
 * to read a portfolio rather than trust a shortlist. Plain substring matching
 * across the fields a human would actually scan.
 */
export function searchPeople(
  people: Person[],
  query: string,
  filters: { skill?: string; availability?: Availability } = {},
): Person[] {
  const q = query.trim().toLowerCase();

  return people.filter((p) => {
    if (filters.skill && !p.skills.includes(filters.skill)) return false;
    if (filters.availability && p.availability !== filters.availability) return false;
    if (!q) return true;

    return (
      p.name.toLowerCase().includes(q) ||
      p.headline.toLowerCase().includes(q) ||
      p.location.toLowerCase().includes(q) ||
      p.skills.some((s) => s.toLowerCase().includes(q)) ||
      p.agents.some((a) => a.toLowerCase().includes(q)) ||
      p.portfolio.some(
        (w) =>
          w.title.toLowerCase().includes(q) ||
          w.outcome.toLowerCase().includes(q) ||
          w.role.toLowerCase().includes(q),
      )
    );
  });
}

export const ALL_SKILLS = Array.from(
  new Set(PEOPLE.flatMap((p) => p.skills)),
).sort();
