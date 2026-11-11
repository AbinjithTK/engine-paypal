"use client";

/**
 * The agent runtime. Global, not tied to any screen. See BLOCKS.md §6.
 *
 * How it stays general:
 *  - Surfaces REGISTER capabilities on mount. The agent imports nothing from
 *    any page, so it has no idea what a "board" is.
 *  - If nothing mounted can serve an intent, it navigates to the surface that
 *    owns it, waits for that surface to register, then replays the intent.
 *  - It calls the same functions the UI calls, and is refused by the same
 *    guards. It has no privileged path to anything, least of all to money.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePathname, useRouter } from "next/navigation";

import { parseIntent } from "@/lib/agent/parse";
import {
  INTENT_SURFACE,
  type Capability,
  type Intent,
  type Reply,
  type Turn,
} from "@/lib/agent/types";

type AgentApi = {
  turns: Turn[];
  open: boolean;
  setOpen: (v: boolean) => void;
  send: (text: string) => void;
  /** Returns an unregister function. Call it on unmount. */
  register: (cap: Capability) => () => void;
  capabilities: Capability[];
  busy: boolean;
};

const AgentContext = createContext<AgentApi | null>(null);

export function useAgent(): AgentApi {
  const ctx = useContext(AgentContext);
  if (!ctx) throw new Error("useAgent must be used inside <AgentProvider>.");
  return ctx;
}

/**
 * Register a capability for as long as a surface is mounted.
 *
 * Build the capability with `useMemo` at the call site, so the dependency list
 * lives next to the state that `run` closes over:
 *
 *   const cap = useMemo<Capability>(() => ({ ... }), [nodes]);
 *   useRegisterCapability(cap);
 */
export function useRegisterCapability(cap: Capability) {
  const { register } = useAgent();
  useEffect(() => register(cap), [register, cap]);
}

const ROUTE_WORDS: Record<string, string> = {
  board: "/demo/board",
  outline: "/demo/board",
  people: "/demo/people",
  money: "/demo/money",
  brain: "/demo/brain",
  task: "/demo/task",
  tasks: "/demo/task",
  overview: "/demo",
};

export function AgentProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  const [turns, setTurns] = useState<Turn[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [caps, setCaps] = useState<Capability[]>([]);

  const seq = useRef(0);
  const registry = useRef(new Map<string, Capability>());
  const pending = useRef<Intent | null>(null);

  const push = useCallback((t: Omit<Turn, "id">) => {
    setTurns((ts) => [...ts, { ...t, id: seq.current++ }]);
  }, []);

  const register = useCallback((cap: Capability) => {
    registry.current.set(cap.id, cap);
    setCaps(Array.from(registry.current.values()));
    return () => {
      registry.current.delete(cap.id);
      setCaps(Array.from(registry.current.values()));
    };
  }, []);

  /** Fallbacks that exist everywhere, so the agent is never mute. */
  const fallback = useCallback(
    (intent: Intent): Reply => {
      switch (intent.verb) {
        case "goto": {
          const route = ROUTE_WORDS[intent.where];
          if (!route) {
            return {
              text: `I don't know a screen called "${intent.where}".`,
              tone: "warning",
            };
          }
          router.push(route);
          return { text: `Opened ${intent.where}.`, tone: "success", via: "navigation" };
        }

        case "help": {
          const list = Array.from(registry.current.values())
            .map((c) => `• ${c.describe}`)
            .join("\n");
          return {
            text:
              `I work on the seven building blocks: party, outcome, work, doer, knowledge, money, evidence.\n\n` +
              `Right here I can:\n${list || "• navigate, and answer once a surface is open"}\n\n` +
              `I will not move money without you confirming it.`,
          };
        }

        default:
          return {
            text:
              intent.verb === "unknown"
                ? `I didn't follow "${intent.said}". Try "what's blocked", "assign Marco to the copy work", or "find me a designer".`
                : `Nothing open can do that yet, and I couldn't find the right screen for it.`,
            tone: "warning",
          };
      }
    },
    [router],
  );

  const dispatch = useCallback(
    (intent: Intent): boolean => {
      const cap = Array.from(registry.current.values()).find((c) => c.can(intent));
      if (!cap) return false;
      const reply = cap.run(intent);
      push({ from: "agent", ...reply, via: reply.via ?? cap.id });
      return true;
    },
    [push],
  );

  const send = useCallback(
    (text: string) => {
      const said = text.trim();
      if (!said) return;
      push({ from: "you", text: said });

      const intent = parseIntent(said);

      // Something mounted can serve it.
      if (dispatch(intent)) return;

      // Nothing can. Is there a surface that owns this kind of intent?
      const surface = INTENT_SURFACE[intent.verb];
      if (surface && surface !== pathname) {
        pending.current = intent;
        setBusy(true);
        push({
          from: "agent",
          text: `Opening ${surface.split("/").pop()} to do that.`,
          via: "navigation",
        });
        router.push(surface);
        return;
      }

      push({ from: "agent", ...fallback(intent) });
    },
    [push, dispatch, pathname, router, fallback],
  );

  // Replay a queued intent once the surface that owns it has registered.
  useEffect(() => {
    if (!pending.current) return;
    const intent = pending.current;
    const cap = caps.find((c) => c.can(intent));
    if (!cap) return;

    pending.current = null;
    setBusy(false);
    const reply = cap.run(intent);
    push({ from: "agent", ...reply, via: reply.via ?? cap.id });
  }, [caps, push]);

  const api = useMemo(
    () => ({ turns, open, setOpen, send, register, capabilities: caps, busy }),
    [turns, open, send, register, caps, busy],
  );

  return <AgentContext.Provider value={api}>{children}</AgentContext.Provider>;
}
