import "server-only";

import { json } from "./gemini";
import type { Db, Expert, Job, Match } from "./types";

/**
 * The Matcher: ranks experts for a job from their profiles.
 *
 * Gemini reads each profile against the brief, the role and the skills, and
 * gives a score with a one-line reason the founder can check. If the model is
 * unavailable, skill overlap ranks them instead, and the reason says so.
 * Matching only suggests: the founder decides who to invite.
 */

function words(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2),
  );
}

function overlap(job: Job, e: Expert): number {
  const want = words(`${job.role ?? ""} ${job.skills.join(" ")} ${job.title}`);
  const have = words(`${e.headline} ${e.skills.join(" ")} ${e.pastWork.join(" ")}`);
  let n = 0;
  for (const w of want) if (have.has(w)) n++;
  return want.size ? n / want.size : 0;
}

function profile(e: Expert): string {
  return (
    `[${e.id}] ${e.name}: ${e.headline}. Skills: ${e.skills.join(", ")}. Past work: ${e.pastWork.join("; ")}. ` +
    `Day rate about $${e.dayRateUsd}. ${e.available ? "Available" : "Not available now"}. Works with AI: ${e.aiTools}.`
  );
}

export async function matchExperts(db: Db, job: Job, exclude: string[] = []): Promise<Match[]> {
  const pool = db.experts.filter((e) => !exclude.includes(e.id));
  if (pool.length === 0) return [];
  try {
    const r = await json<{ matches: { id: string; score: number; reason: string }[] }>({
      system:
        "You match human experts to a job for a small company. Score each expert 0 to 100 on how well they fit this specific job and role, " +
        "from their skills and past work. Give a one-sentence reason a founder can check, naming the specific past work or skill that fits, " +
        "or what is missing. Mark down experts who are not available. Return the best 4 at most, best first. Never invent facts about an expert.",
      prompt:
        `Job: ${job.title}\nRole: ${job.role ?? "Expert"}\nSkills wanted: ${job.skills.join(", ")}\n${job.brief.slice(0, 1500)}\n` +
        `Budget for this job: $${job.priceCents / 100}\n\nExperts:\n${pool.map(profile).join("\n")}`,
      schema: {
        type: "object",
        properties: {
          matches: {
            type: "array",
            items: {
              type: "object",
              properties: { id: { type: "string" }, score: { type: "number" }, reason: { type: "string" } },
              required: ["id", "score", "reason"],
            },
          },
        },
        required: ["matches"],
      },
    });
    const ids = new Set(pool.map((e) => e.id));
    const out = r.matches
      .filter((m) => ids.has(m.id))
      .map((m) => ({ expertId: m.id, score: Math.max(0, Math.min(100, Math.round(m.score))), reason: m.reason.trim().slice(0, 240) }))
      .sort((a, b) => b.score - a.score);
    if (out.length) return [...new Map(out.map((m) => [m.expertId, m])).values()].slice(0, 4);
  } catch {
    /* fall through to skill overlap */
  }
  return pool
    .map((e) => ({ e, s: overlap(job, e) * (e.available ? 1 : 0.6) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, 4)
    .map(({ e, s }) => ({
      expertId: e.id,
      score: Math.round(s * 100),
      reason: `Skill overlap only (the AI matcher was unavailable): ${e.skills.slice(0, 3).join(", ")}.`,
    }));
}
