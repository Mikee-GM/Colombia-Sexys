"use server";

import { apiFetch } from "@/lib/api-server";

/**
 * Disposicion del centro de mando de un administrador.
 *
 * Vive en el backend y no en `localStorage` porque se pidio que sobreviviera al
 * cierre de sesion: quien ordena su tablero en la oficina se lo encuentra igual
 * desde su casa.
 *
 * `orden` guarda los ids en el orden elegido y `ocultos` los que decidio no
 * ver. Los ids que no aparezcan en ninguna de las dos listas --un bloque nuevo
 * que se añada mas adelante-- se muestran al final, para que una pantalla nueva
 * no quede invisible por haberse guardado la disposicion antes de que existiera.
 */
export type DashboardLayout = {
  orden: string[];
  ocultos: string[];
};

const CLAVE = "dashboard_layout";

export async function getDashboardLayout(): Promise<DashboardLayout | null> {
  const guardado = await apiFetch<DashboardLayout | null>(
    `/user-preferences/${CLAVE}`,
  );
  if (!guardado || !Array.isArray(guardado.orden)) return null;

  return {
    orden: guardado.orden.filter((id) => typeof id === "string"),
    ocultos: Array.isArray(guardado.ocultos)
      ? guardado.ocultos.filter((id) => typeof id === "string")
      : [],
  };
}

export async function saveDashboardLayout(layout: DashboardLayout) {
  return await apiFetch<DashboardLayout>(`/user-preferences/${CLAVE}`, {
    method: "PUT",
    body: JSON.stringify({ value: layout }),
  });
}

/** Vuelve al tablero por defecto borrando el ajuste, no guardando uno vacio. */
export async function resetDashboardLayout() {
  await apiFetch<void>(`/user-preferences/${CLAVE}`, { method: "DELETE" });
}
