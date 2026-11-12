import type { Metadata } from "next";

import "../app/marrow.css";
import { sans, serif } from "../fonts";

export const metadata: Metadata = {
  title: "Welcome · Engine",
  description: "Set up your company or your expert profile.",
};

export default function WelcomeLayout({ children }: { children: React.ReactNode }) {
  return <div className={`mw ${serif.variable} ${sans.variable}`}>{children}</div>;
}
