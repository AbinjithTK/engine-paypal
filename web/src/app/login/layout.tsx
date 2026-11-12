import type { Metadata } from "next";

import "../app/marrow.css";
import { sans, serif } from "../fonts";

export const metadata: Metadata = {
  title: "Sign in · Engine",
  description: "Sign in as the business owner or as an expert.",
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <div className={`mw ${serif.variable} ${sans.variable}`}>{children}</div>;
}
