"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Brain,
  Briefcase,
  LayoutGrid,
  ListChecks,
  Network,
  Users,
  Wallet,
  Waypoints,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

const NAV: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/demo", label: "Overview", icon: LayoutGrid },
  { href: "/demo/map", label: "Map", icon: Waypoints },
  { href: "/demo/board", label: "Board", icon: Network },
  { href: "/demo/work", label: "Work", icon: Briefcase },
  { href: "/demo/task", label: "Tasks", icon: ListChecks },
  { href: "/demo/brain", label: "Brain", icon: Brain },
  { href: "/demo/people", label: "People", icon: Users },
  { href: "/demo/money", label: "Money", icon: Wallet },
];

export function AppNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Main" className="flex flex-col gap-1 p-3">
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium",
              "transition-colors duration-[var(--dur-press)] ease-[var(--ease-out)]",
              active
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-[18px] shrink-0" aria-hidden="true" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
