import { NextRequest, NextResponse } from "next/server";
import { getApiBaseUrl } from "@/lib/api-server";

export async function POST(request: NextRequest) {
  const response = await fetch(`${getApiBaseUrl()}/auth/refresh`, {
    method: "POST",
    cache: "no-store",
    headers: {
      Cookie: request.headers.get("cookie") ?? "",
      "x-csrf-token": request.headers.get("x-csrf-token") ?? "",
    },
  });

  const body = await response.text();
  const nextResponse = new NextResponse(body || null, {
    status: response.status,
    headers: {
      "Content-Type":
        response.headers.get("content-type") ?? "application/json",
    },
  });
  const headers = response.headers as Headers & {
    getSetCookie?: () => string[];
  };
  for (const cookie of headers.getSetCookie?.() ?? []) {
    nextResponse.headers.append("Set-Cookie", cookie);
  }
  return nextResponse;
}
