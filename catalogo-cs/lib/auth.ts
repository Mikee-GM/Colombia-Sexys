import { cookies } from "next/headers";
import { NextRequest } from "next/server";
import type { AuthUser } from "@/lib/types";
import { ACCESS_COOKIE, CSRF_COOKIE } from "@/lib/auth-constants";

function getBackendUrl() {
  return (
    process.env.BACKEND_API_URL ??
    process.env.API_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://127.0.0.1:4000"
  ).replace(/\/$/, "");
}

export async function getBackendCookieHeader(): Promise<string> {
  const cookieStore = await cookies();
  return cookieStore
    .getAll()
    .map(({ name, value }) => `${name}=${value}`)
    .join("; ");
}

export async function getCsrfToken(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get(CSRF_COOKIE)?.value;
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const cookie = await getBackendCookieHeader();
  if (!cookie.includes(`${ACCESS_COOKIE}=`)) return null;

  try {
    const response = await fetch(`${getBackendUrl()}/auth/me`, {
      cache: "no-store",
      headers: { Cookie: cookie },
    });
    if (!response.ok) return null;
    return (await response.json()) as AuthUser;
  } catch {
    return null;
  }
}

export function isAuthenticated(req: NextRequest): boolean {
  return req.cookies.has(ACCESS_COOKIE);
}

export function isRedirectError(error: unknown): boolean {
  if (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof (error as { digest: unknown }).digest === "string" &&
    ((error as { digest: string }).digest.startsWith("NEXT_REDIRECT") ||
      (error as { digest: string }).digest.startsWith("NEXT_NOT_FOUND"))
  ) {
    return true;
  }
  return false;
}
