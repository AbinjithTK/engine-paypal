/**
 * Engine data model for the PayPal build.
 *
 * Money is ALWAYS integer cents (USD). Never a float.
 */

export type BrainSection =
  | "company"
  | "customers"
  | "voice"
  | "avoid"
  | "offer"
  | "pricing"
  | "rules"
  | "private";

/** Sections an outside doer can never receive, whatever the job. */
export const PRIVATE_SECTIONS: BrainSection[] = ["private"];

export type FactSource =
  | { kind: "interview" }
  | { kind: "founder" }
  | { kind: "website"; url?: string }
  | { kind: "review"; jobId: string }
  | { kind: "client_answer"; jobId: string }
  | { kind: "paypal"; detail: string }
  | { kind: "document"; docId: string; title: string };

/** A file, a repo file or a page the owner gave the Brain. */
export type Doc = {
  id: string;
  title: string;
  origin: "upload" | "github" | "website" | "text";
  uri?: string;
  bytes: number;
  /** Never shared with any job, whatever is searched. */
  private: boolean;
  chunkCount: number;
  factCount: number;
  createdAt: string;
  indexedIn?: "local" | "elastic";
};

/** A passage of a document. The unit that search returns. */
export type Chunk = {
  id: string;
  docId: string;
  title: string;
  text: string;
  private: boolean;
};

/** A tool or service the company works with, named in briefs for experts' agents. */
export type Connector = {
  id: string;
  kind: "mcp" | "github" | "tool";
  name: string;
  url?: string;
  /** What it is for, in plain words. Used to match it to jobs. */
  purpose: string;
  createdAt: string;
};

/** A company-specific playbook: how this company wants a kind of work done. */
export type Skill = {
  id: string;
  name: string;
  /** When it applies, in plain words. */
  when: string;
  body: string;
  createdAt: string;
};

export type SearchMode = "local" | "elastic";

/** A human expert who can be matched to work. */
export type Expert = {
  id: string;
  name: string;
  /** PayPal email payouts go to. */
  email: string;
  headline: string;
  skills: string[];
  /** What they have done, in short lines. Matching reads these. */
  pastWork: string[];
  /** Indicative day rate in whole USD, for the matcher's sense of fit. */
  dayRateUsd: number;
  available: boolean;
  /** How they work with AI, e.g. "Drafts with Claude, edits by hand". */
  aiTools: string;
  location: string;
  /** A seeded demo account, not a real person. */
  demo?: boolean;
};

export type Invite = {
  expertId: string;
  at: string;
  /** 0 to 100, from the matcher. */
  score: number;
  reason: string;
  status: "invited" | "accepted" | "declined" | "closed";
};

export type Match = { expertId: string; score: number; reason: string };

export type Fact = {
  id: string;
  section: BrainSection;
  text: string;
  source: FactSource;
  confirmed: boolean;
  createdAt: string;
  /** When set, this fact contradicts another and needs the founder. */
  conflictsWith?: string;
  retired?: boolean;
};

export type Gap = {
  id: string;
  jobId?: string;
  question: string;
  askedBy: string;
  answer?: string;
  createdAt: string;
};

export type CriterionResult = {
  criterion: string;
  pass: boolean;
  reason: string;
};

export type Review = {
  at: string;
  model: string;
  /** The checks the AI can verify. All must pass before a person looks. */
  results: CriterionResult[];
  passed: boolean;
  summary: string;
  /** Phrases the reviewer flagged as off-brand; fed back into the Brain. */
  flaggedPhrases: string[];
  /** Notes for the person signing off, one per judgement criterion. Never a verdict. */
  advisory?: { criterion: string; note: string }[];
  /** Places the work reads as generic AI output, for the person to weigh. */
  genericSignals?: string[];
};

/** A person's decision on the judgement criteria. Money waits for this. */
export type Signoff = {
  at: string;
  by: string;
  approved: boolean;
  note?: string;
};

export type Submission = {
  at: string;
  by: string;
  artefact?: string;
  content: string;
  notes?: string;
  review?: Review;
  signoff?: Signoff;
};

export type JobState =
  | "draft" // scoped, waiting for the client to approve in PayPal
  | "funded" // PayPal authorization held
  | "taken" // a doer is on it
  | "in_review"
  | "signoff" // AI checks passed; a person judges taste, strategy, soundness
  | "changes" // review failed, money still held
  | "passed" // review passed, inside the appeal window
  | "paying"
  | "paid"
  | "appealed"
  | "cancelled";

export type Payee = {
  name: string;
  email: string;
  /** Integer cents. */
  amountCents: number;
  role: string;
};

export type JobEvent = { at: string; by: string; text: string; kind?: "money" | "ai" | "person" | "system" };

export type Job = {
  id: string;
  title: string;
  request: string;
  brief: string;
  /** Checks the AI verifies (sections present, words avoided, facts right). */
  criteria: string[];
  /** Calls only a person can make (taste, strategy, legal soundness). */
  judgement: string[];
  /** Who signs off the judgement criteria. Defaults to the founder. */
  signer?: { name: string; role: string };
  /** Milestones of one bigger project share a projectId. */
  project?: { id: string; title: string; step: number; of: number };
  /** The team role this job fills, e.g. "Copywriter". */
  role?: string;
  /** Experts the matcher suggested, best first. */
  matches?: Match[];
  invites?: Invite[];
  /** A later milestone stays locked until the one before it is paid. */
  locked?: boolean;
  /** What the doers receive, integer cents. */
  priceCents: number;
  /** Engine's fee on top, integer cents. */
  feeCents: number;
  state: JobState;
  skills: string[];
  /** Brain fact ids this job may see. */
  factIds: string[];
  /** Document passages found for this job at scoping time. */
  chunkIds?: string[];
  connectorIds?: string[];
  skillIds?: string[];
  doer?: { id: string; name: string; email: string };
  payees: Payee[];
  submissions: Submission[];
  paypal: {
    orderId?: string;
    approveUrl?: string;
    authorizationId?: string;
    authorizationExpires?: string;
    captureId?: string;
    payoutBatchId?: string;
    payoutStatus?: string;
    invoiceId?: string;
    invoiceUrl?: string;
    clientEmail?: string;
    clientName?: string;
  };
  /** Set when a founder must answer before the work can be scoped well. */
  question?: string;
  priceReason?: string;
  /** ISO time after which a passed job releases on its own. */
  releaseAt?: string;
  createdAt: string;
  events: JobEvent[];
};

export type NoticeKind = "approval" | "suggestion" | "done";

export type Notice = {
  id: string;
  kind: NoticeKind;
  title: string;
  why: string;
  /** Short action name the UI maps to a call. */
  action?: "release" | "signoff" | "fund_next" | "invite" | "post_job" | "answer_gap" | "confirm_fact" | "resolve_conflict" | "build_agent" | "open_job";
  ref?: string;
  builder?: string;
  createdAt: string;
  resolved?: boolean;
  undoable?: boolean;
};

export type BuilderMode = "suggest" | "ask" | "auto";

export type BuilderRun = {
  at: string;
  summary: string;
  ok: boolean;
  tools: string[];
};

/** Plain names for the parts of the company. Older data stored the village names. */
const AREA: Record<string, string> = {
  Workshop: "Jobs",
  Vault: "Money",
  Library: "Company Brain",
  "Post office": "Questions",
  "Tax office": "Taxes",
  Market: "Sales",
  "Town hall": "Ideas",
};
export const AREAS = ["Jobs", "Money", "Company Brain", "Questions", "Taxes", "Sales", "Ideas"] as const;
export function areaName(building: string): string {
  return AREA[building] ?? building;
}

export type Builder = {
  id: string;
  name: string;
  building: string;
  job: string;
  schedule: string;
  mode: BuilderMode;
  canMoveMoney: false;
  tools: string[];
  runs: BuilderRun[];
  approvedUnchanged: number;
  paused?: boolean;
  /** Runs on the daily schedule. Off means only when the owner presses Run now. */
  scheduled?: boolean;
  /** Each run calls an AI model, so it costs credits. */
  usesAi?: boolean;
  /** Set for builders the owner made (or added from Scout): what it reads on each run. */
  resources?: BuilderResources;
};

/** Exactly what a builder may read. Private facts and documents are never included. */
export type BuilderResources = {
  /** Brain sections it reads; empty means none. */
  sections: string[];
  docIds: string[];
  connectorIds: string[];
  skillIds: string[];
  /** Reads recent PayPal sales through list_transactions. */
  paypalSales: boolean;
};

export type AccessEntry = {
  at: string;
  actor: string;
  tool: string;
  target?: string;
  allowed: boolean;
  note?: string;
};

export type Company = {
  name: string;
  owner: string;
  ownerEmail: string;
  onboarded: boolean;
  /** Where document passages are searched. Local always works; Elastic scales. */
  search?: SearchMode;
};

export type Interview = { role: "engine" | "founder"; text: string; at: string }[];

export type Db = {
  /**
   * Random per store, set on first load. Job ids restart at 1 in every
   * company (and in the demo after each restart), so PayPal request keys
   * combine this with the job id to stay unique.
   */
  instance?: string;
  version: 1;
  company: Company;
  facts: Fact[];
  gaps: Gap[];
  jobs: Job[];
  notices: Notice[];
  builders: Builder[];
  access: AccessEntry[];
  interview: Interview;
  docs: Doc[];
  chunks: Chunk[];
  connectors: Connector[];
  skills: Skill[];
  experts: Expert[];
  seq: number;
};
