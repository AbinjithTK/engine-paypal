/**
 * The freelancer side.
 *
 * A server component, so it reads the same store the MCP server reads. The
 * founder side still holds board state locally, which is a real gap — one
 * source of truth is item 2 in GAPS.md.
 */

import { FreelancerView, type OpenRow } from "@/components/freelancer-view";
import { cashPart, equityPart } from "@/lib/blocks";
import { formatMoney, money } from "@/lib/money";
import { personById } from "@/lib/people";
import { openWork, outcomeOf, scopedKnowledge, workFor } from "@/lib/store";

const ME = "worker-2"; // Marco S. Auth is the first gap in GAPS.md.

export default function WorkPage() {
  const me = personById(ME);

  const toRow = (w: ReturnType<typeof openWork>[number]): OpenRow => {
    const outcome = outcomeOf(w.id)?.data as
      | { text?: string; measure?: string; current?: string; target?: string }
      | undefined;

    const cash = cashPart(w.data.reward);
    const eq = equityPart(w.data.reward);

    return {
      id: w.id,
      title: w.data.title,
      brief: w.data.brief,
      criteria: w.data.criteria,
      skills: w.data.skills,
      state: w.data.state,
      cash: cash ? formatMoney(cash) : null,
      equity: eq ? formatMoney(eq) : null,
      outcome: outcome?.text ?? null,
      measure: outcome?.measure
        ? `${outcome.measure}: ${outcome.current ?? "—"} → ${outcome.target ?? "—"}`
        : null,
      context: scopedKnowledge(w.id).map(
        (k) => (k.data as { title: string }).title,
      ),
    };
  };

  const open = openWork().map(toRow);
  const mine = workFor(ME).map(toRow);

  const holdings = (me?.holdings ?? []).map((h) => ({
    company: h.company,
    equity: formatMoney(h.equity),
  }));

  const totalEquity = formatMoney(
    money(
      (me?.holdings ?? []).reduce((n, h) => n + h.equity.amount, 0),
      "EQUITY",
    ),
  );

  return (
    <FreelancerView
      name={me?.name ?? "You"}
      appetite={me?.appetite ?? "either"}
      open={open}
      mine={mine}
      holdings={holdings}
      totalEquity={totalEquity}
    />
  );
}
