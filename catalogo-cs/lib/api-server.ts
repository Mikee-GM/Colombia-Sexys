import {
  getBackendCookieHeader,
  getCsrfToken,
  isRedirectError,
} from "@/lib/auth";
import { ACCESS_COOKIE } from "@/lib/auth-constants";
import { redirect } from "next/navigation";

export function getApiBaseUrl() {
  return (
    process.env.BACKEND_API_URL ??
    process.env.API_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://127.0.0.1:4000"
  ).replace(/\/$/, "");
}

type ApiFetchOptions = RequestInit & {
  authenticated?: boolean;
};

export async function apiFetch<T>(
  path: string,
  { authenticated = true, headers, ...options }: ApiFetchOptions = {},
): Promise<T> {
  const cookie = authenticated ? await getBackendCookieHeader() : "";
  const csrfToken = authenticated ? await getCsrfToken() : undefined;

  if (authenticated && !cookie.includes(`${ACCESS_COOKIE}=`)) {
    redirect("/admin");
  }

  let response: Response;
  try {
    const isFormData = options.body instanceof FormData;
    response = await fetch(`${getApiBaseUrl()}${path}`, {
      ...options,
      cache: "no-store",
      headers: {
        ...(!isFormData ? { "Content-Type": "application/json" } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
        ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
        ...headers,
      },
    });
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }
    console.error(`Error de conexión con backend (${path}):`, error);
    throw new Error("No se pudo conectar con el servidor backend");
  }

  if (!response.ok) {
    if (response.status === 401) {
      if (authenticated) {
        redirect("/admin");
      }
    }

    let message = `Backend request failed with ${response.status}`;
    try {
      const body = await response.json();
      message = body.message ?? body.error ?? message;
      if (Array.isArray(message)) {
        message = message.join(", ");
      }
    } catch {
      // Keep the generic message when the backend returns no JSON body.
    }

    throw new Error(message);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const responseText = await response.text();
  if (!responseText.trim()) {
    return undefined as T;
  }

  try {
    return JSON.parse(responseText) as T;
  } catch {
    throw new Error("El backend devolvió una respuesta con formato inválido");
  }
}
