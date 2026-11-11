"use client";

/**
 * Node faces need to call back into the board (assign someone, add a note).
 * A context keeps node `data` serializable, which matters because positions and
 * data are what get persisted to `board_nodes` — callbacks must not be in there.
 */

import { createContext, useContext } from "react";

import type { Person } from "@/lib/people";

export type BoardActions = {
  assign: (taskId: string, person: Person, viaAgent: boolean) => void;
  unassign: (taskId: string, personId: string) => void;
  focus: (nodeId: string) => void;
};

const noop: BoardActions = {
  assign: () => {},
  unassign: () => {},
  focus: () => {},
};

export const BoardActionsContext = createContext<BoardActions>(noop);

export function useBoardActions(): BoardActions {
  return useContext(BoardActionsContext);
}
