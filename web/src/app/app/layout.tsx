import type { Metadata } from "next";

import { sans, serif } from "../fonts";
import { Assistant } from "./_ui/assistant";
import { TopBar } from "./_ui/top-bar";
import { EngineProvider } from "./_ui/use-engine";
import "./marrow.css";

export const metadata: Metadata = {
  title: "Engine",
  description: "Your company, run by AI builders. Work gets checked, then paid through PayPal.",
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`mw ${serif.variable} ${sans.variable}`}>
      <EngineProvider>
        <TopBar />
        <main className="mw-main">
          <Assistant />
          {children}
        </main>
      </EngineProvider>
    </div>
  );
}
