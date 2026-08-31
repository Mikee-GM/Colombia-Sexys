"use server";

import { redirect } from "next/navigation";

import { applyBackendSetCookies } from "@/lib/auth-cookies";
import {
  getBackendCookieHeader,
  getCsrfToken,
  getCurrentUser,
  isRedirectError,
} from "@/lib/auth";
import { getApiBaseUrl } from "@/lib/api-server";
import { inicioParaRol } from "@/lib/roles";

/** Los roles que tienen a donde ir. Cualquier otro no entra. */
const INICIO_CONOCIDO = ["admin", "jefe", "empleada", "chofer"];

/**
 * Inicio de sesion.
 *
 * La navegacion al panel la hace el servidor, no el cliente. Antes esto
 * devolvia la ruta de destino y el formulario la empujaba con `router.push`:
 * eso pide la sesion recien creada en una navegacion aparte, y basta con que
 * las cookies de la respuesta de esta accion no esten aplicadas todavia cuando
 * sale esa peticion para que el middleware no vea la sesion y devuelva al
 * login. Desde fuera se ve como unas credenciales aceptadas que no llevan a
 * ningun sitio.
 *
 * Con `redirect()` la navegacion forma parte de la misma respuesta que trae las
 * cookies, asi que no hay ventana entre una cosa y la otra. Ojo al orden: el
 * redirect va DESPUES de escribirlas, y su excepcion de control no puede caer
 * en el `catch` de abajo --por eso se relanza-- o se tragaria la navegacion y
 * pareceria un error de login.
 */
export async function loginAction(email: string, password: string) {
  let destino: string | null = null;

  try {
    const response = await fetch(`${getApiBaseUrl()}/auth/login`, {
      method: "POST",
      body: JSON.stringify({ email, password }),
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.message || "Credenciales incorrectas");
    }

    /*
     * Entran los cuatro roles, no solo admin y jefe.
     *
     * Las modelos y los choferes ya tenian correo y contraseña --se les asignan
     * al darlos de alta-- pero no podian usarlos: su unica via era el enlace
     * con token del bot, que hay que rehacer cada vez que se cierra la sesion.
     * Con esto la aplicacion instalada en su telefono se arregla sola, porque
     * si caduca la sesion basta con volver a entrar.
     *
     * El destino sale de `inicioParaRol`, que es la fuente unica: un rol
     * desconocido acaba en el login, no en el panel.
     */
    if (!data.user?.rol || !INICIO_CONOCIDO.includes(data.user.rol)) {
      return { success: false, error: "Tu cuenta no tiene acceso a la aplicación" };
    }
    await applyBackendSetCookies(response);
    destino = inicioParaRol(data.user.rol);
  } catch (error: unknown) {
    console.error("loginAction error:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Error de conexión con el servidor de autenticación",
    };
  }

  redirect(destino);
}

export async function logoutAction() {
  const [cookie, csrfToken] = await Promise.all([
    getBackendCookieHeader(),
    getCsrfToken(),
  ]);
  const response = await fetch(`${getApiBaseUrl()}/auth/logout`, {
    method: "POST",
    cache: "no-store",
    headers: {
      Cookie: cookie,
      ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
    },
  });
  await applyBackendSetCookies(response);
  return { success: true };
}

export async function checkSessionAction() {
  return getCurrentUser();
}

export async function getMyProfileAction() {
  return getCurrentUser();
}

export async function updateMyProfileAction(input: {
  nombre?: string;
  apellido?: string;
  email?: string;
  password?: string;
}) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: "Sesión no válida o expirada" };
    }

    const body: Record<string, any> = {};
    if (input.nombre !== undefined) body.nombre = input.nombre.trim();
    if (input.apellido !== undefined) body.apellido = input.apellido.trim();
    if (input.email !== undefined && input.email.trim()) body.email = input.email.trim();
    if (input.password && input.password.trim().length > 0) {
      if (input.password.trim().length < 6) {
        return { success: false, error: "La contraseña debe tener al menos 6 caracteres" };
      }
      body.password = input.password.trim();
    }

    const { apiFetch } = await import("@/lib/api-server");
    await apiFetch(`/users/${user.id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
      authenticated: true,
    });

    return { success: true };
  } catch (error: any) {
    if (isRedirectError(error)) throw error;
    console.error("updateMyProfileAction error:", error);
    return {
      success: false,
      error: error.message || "Error al actualizar los datos de perfil",
    };
  }
}
