"use server";

import { apiFetch } from "@/lib/api-server";
import { isRedirectError } from "@/lib/auth";
import type {
  ApiUser,
  Client,
  Directorio,
  Driver,
  Employee,
} from "@/lib/types";

/**
 * Nombres de las personas del sistema, indexados por tipo e id.
 *
 * Reportes, sanciones y apelaciones guardan a quien reportan como un par de
 * tipo e id, sin nombre. Sin esta traduccion el panel disciplinario solo puede
 * mostrar UUIDs, que no le dicen nada a quien tiene que decidir una sancion.
 */
export async function getDirectorio(): Promise<Directorio> {
  const vacio: Directorio = {
    client: {},
    employee: {},
    driver: {},
    boss: {},
  };

  /* Cada lista se degrada por separado: sin choferes, el resto sigue con nombre. */
  const seguro = async <T>(promise: Promise<T>, fallback: T): Promise<T> => {
    try {
      return await promise;
    } catch (error) {
      if (isRedirectError(error)) throw error;
      console.error("Fuente no disponible en el directorio:", error);
      return fallback;
    }
  };

  const [employees, drivers, users, clients] = await Promise.all([
    seguro(apiFetch<Employee[]>("/employees"), []),
    seguro(apiFetch<Driver[]>("/drivers"), []),
    seguro(apiFetch<ApiUser[]>("/users"), []),
    seguro(apiFetch<Client[]>("/clients"), []),
  ]);

  for (const employee of employees ?? []) {
    vacio.employee[employee.id] = employee.nombreArtistico;
  }

  for (const driver of drivers ?? []) {
    vacio.driver[driver.id] = driver.nombre;
  }

  /*
   * Un reporte sobre un "boss" apunta al usuario, no a un perfil aparte, asi
   * que los jefes se resuelven contra la tabla de usuarios.
   */
  for (const user of users ?? []) {
    const nombre = [user.nombre, user.apellido].filter(Boolean).join(" ");
    vacio.boss[user.id] = nombre || user.email;
  }

  for (const client of clients ?? []) {
    if (client.nombreTelegram) vacio.client[client.id] = client.nombreTelegram;
  }

  return vacio;
}
