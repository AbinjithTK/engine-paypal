"use client";

import { Bell, Plus } from "lucide-react";

import { AgentPanel, AgentLauncher } from "@/components/agent/agent-panel";
import { AgentProvider, useAgent } from "@/components/agent/agent-provider";
import { AppNav } from "@/components/app-nav";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return (
    <AgentProvider>
      <Shell>{children}</Shell>
    </AgentProvider>
  );
}

/**
 * The agent lives in the layout, not on a page, which is what makes it general.
 * The only thing the layout does about it is get out of its way when it opens.
 */
function Shell({ children }: { children: React.ReactNode }) {
  const { open } = useAgent();

  return (
    <div className="flex min-h-full bg-page">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col justify-between border-r lg:flex">
        <div>
          <div className="flex items-center gap-2.5 px-6 py-6">
            <span className="size-7 rounded-lg bg-foreground" aria-hidden="true" />
            <span className="text-sm font-semibold tracking-tight">Engine</span>
          </div>
          <AppNav />
        </div>

        <div className="flex items-center gap-2.5 border-t p-4">
          <Avatar className="size-8">
            <AvatarFallback className="text-xs">AJ</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">Abin J</p>
            <p className="truncate text-xs text-muted-foreground">Pluuto</p>
          </div>
        </div>
      </aside>

      <div
        className="flex min-w-0 flex-1 flex-col transition-[padding] duration-[var(--dur-panel)] ease-[var(--ease-out)]"
        style={{ paddingRight: open ? 360 : 0 }}
      >
        <header className="flex items-center justify-end gap-2 px-6 py-4 lg:px-10">
          <AgentLauncher />
          <Button variant="ghost" size="icon" aria-label="Notifications">
            <Bell className="size-[18px]" aria-hidden="true" />
          </Button>
          <Button>
            <Plus className="size-4" aria-hidden="true" />
            New work
          </Button>
        </header>

        <main className="flex-1 px-6 pb-20 lg:px-10">{children}</main>
      </div>

      <AgentPanel />
    </div>
  );
}
