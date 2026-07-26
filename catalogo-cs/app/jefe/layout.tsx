import type { Metadata } from "next";
import { Toaster } from "sonner";
import JefeLayoutClient from "@/components/jefe/JefeLayoutClient";

export const metadata: Metadata = { title: "Panel de jefe -- Colombia Sexys", robots: "noindex, nofollow" };

export default function JefeLayout({ children }: { children: React.ReactNode }) {
  return <JefeLayoutClient>{children}<Toaster theme="dark" position="bottom-right" richColors /></JefeLayoutClient>;
}
