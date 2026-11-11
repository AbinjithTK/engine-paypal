import { Instrument_Sans, Instrument_Serif } from "next/font/google";

export const serif = Instrument_Serif({ subsets: ["latin"], weight: "400", style: ["normal", "italic"], variable: "--font-serif" });
export const sans = Instrument_Sans({ subsets: ["latin"], variable: "--font-sans" });
