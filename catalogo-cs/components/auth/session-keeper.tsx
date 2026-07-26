"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { refreshSession, subscribeToLogout } from "@/lib/client-session";

const REFRESH_INTERVAL_MS = 10 * 60 * 1000;

export default function SessionKeeper() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (pathname === "/admin") return;

    const unsubscribe = subscribeToLogout(() => {
      router.replace("/admin");
      router.refresh();
    });
    const interval = window.setInterval(async () => {
      const result = await refreshSession();
      if (result === "unauthorized") {
        router.replace("/admin");
        router.refresh();
      }
    }, REFRESH_INTERVAL_MS);

    return () => {
      unsubscribe();
      window.clearInterval(interval);
    };
  }, [pathname, router]);

  return null;
}
