/**
 * Que rol puede entrar en cada area del panel, y donde aterriza cada uno.
 *
 * Vive en un solo sitio porque lo consultan dos capas distintas —el middleware
 * que corta el paso y el canje del pase de Telegram que decide el destino— y si
 * divergieran, una mandaria al usuario justo a donde la otra no le deja entrar.
 */

export type Rol = "admin" | "jefe" | "empleada" | "chofer";

/** Roles admitidos en cada area protegida. El admin entra en todas. */
export const ROLES_POR_AREA: Record<"admin" | "jefe", readonly string[]> = {
  admin: ["admin"],
  jefe: ["jefe", "admin"],
};

/** Pagina de inicio de cada rol. */
const INICIO_POR_ROL: Record<string, string> = {
  admin: "/admin/dashboard",
  jefe: "/jefe",
  empleada: "/empleada/portal",
  chofer: "/chofer/portal",
};

/**
 * A donde mandar a alguien con este rol.
 *
 * Un rol desconocido va al login, NO al panel de administracion: ese era el
 * valor por defecto y convertia cualquier hueco —un rol nuevo, una respuesta
 * sin `rol`— en una invitacion a la parte mas sensible del sistema.
 */
export function inicioParaRol(rol: string | null | undefined): string {
  if (!rol) return "/admin";
  return INICIO_POR_ROL[rol] ?? "/admin";
}

/** ¿Este rol puede entrar en esta area? */
export function puedeEntrarEn(
  area: "admin" | "jefe",
  rol: string | null | undefined,
): boolean {
  return Boolean(rol && ROLES_POR_AREA[area].includes(rol));
}
