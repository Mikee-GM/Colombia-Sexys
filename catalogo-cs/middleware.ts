import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ACCESS_COOKIE } from "@/lib/auth-constants";

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // 1. Proxy /api/* requests to NestJS backend (excluding Next.js internal API routes)
  if (
    pathname.startsWith("/api/") &&
    !pathname.startsWith("/api/assistant") &&
    !pathname.startsWith("/api/auth") &&
    !pathname.startsWith("/api/realtime")
  ) {
    const backendUrl = process.env.BACKEND_API_URL || "http://localhost:4000";
    const apiPath = pathname.replace(/^\/api/, "");
    const targetUrl = new URL(`${apiPath}${search}`, backendUrl);
    return NextResponse.rewrite(targetUrl);
  }

  // 2. Auth checks for /admin and /jefe routes
  const isAdminRoute = pathname.startsWith("/admin");
  const isJefeRoute = pathname.startsWith("/jefe");

  if (isAdminRoute || isJefeRoute) {
    const hasAccessCookie = request.cookies.has(ACCESS_COOKIE);

    // A) If trying to access login page (/admin)
    if (pathname === "/admin") {
      return NextResponse.next();
    }

    // B) Protected /admin/* routes (excluding exact /admin)
    if (isAdminRoute) {
      if (!hasAccessCookie) {
        return NextResponse.redirect(new URL("/admin", request.url));
      }
      return NextResponse.next();
    }

    // C) Protected /jefe/* routes
    if (isJefeRoute) {
      if (!hasAccessCookie) {
        return NextResponse.redirect(new URL("/admin", request.url));
      }

      return NextResponse.next();
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*", "/admin/:path*", "/jefe/:path*"],
};
