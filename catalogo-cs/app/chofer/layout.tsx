import type { Metadata } from "next";

export const metadata: Metadata = {
  robots: "noindex, nofollow",
  manifest: "/manifest-chofer.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Portal CS",
    statusBarStyle: "black-translucent",
  },
};

export default function DriverLayout({ children }: { children: React.ReactNode }) {
  return children;
}
