import type { Metadata } from "next";

import "../app/marrow.css";
import { sans, serif } from "../fonts";
import { WorkBar } from "./_ui";

export const metadata: Metadata = {
  title: "Engine for experts",
  description: "Jobs matched to your profile, held in PayPal, paid when the work passes.",
};

export default function WorkLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`mw ${serif.variable} ${sans.variable}`}>
      <WorkBar />
      <main className="mw-main">{children}</main>
    </div>
  );
}
