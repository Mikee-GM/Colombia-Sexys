import type { Metadata } from "next";

export const metadata: Metadata = {
  robots: "noindex, nofollow",
  manifest: "/manifest-empleada.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Mi Portal",
    statusBarStyle: "black-translucent",
  },
};

export default function EmployeeLayout({ children }: { children: React.ReactNode }) {
  return children;
}
