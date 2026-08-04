"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { subscribeToLogout } from "@/lib/client-session";

export default function SessionKeeper() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (pathname === "/admin") return;

    const unsubscribe = subscribeToLogout(() => {
      router.replace("/admin");
      router.refresh();
    });

    return () => {
      unsubscribe();
    };
  }, [pathname, router]);

  return null;
}

