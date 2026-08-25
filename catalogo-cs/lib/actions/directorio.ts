"use server";

import { apiFetch } from "@/lib/api-server";
import { optionalSource } from "@/lib/optional-source";
import { asList } from "@/lib/paginated";
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

  /*
   * Cada lista se degrada por separado: sin choferes, el resto sigue con nombre.
   *
   * `/clients` responde paginado y el resto pelado. Todas pasan por `asList`
   * para que un cambio de forma en cualquiera no vuelva a tumbar la pantalla
   * al iterar: asignar el objeto no falla, revienta despues en el `for...of`.
   */
  const [employees, drivers, users, clients] = await Promise.all([
    optionalSource(apiFetch<unknown>("/employees"), [], "el directorio"),
    optionalSource(apiFetch<unknown>("/drivers"), [], "el directorio"),
    optionalSource(apiFetch<unknown>("/users"), [], "el directorio"),
    optionalSource(apiFetch<unknown>("/clients?limit=200"), [], "el directorio"),
  ]);

  for (const employee of asList<Employee>(employees)) {
    vacio.employee[employee.id] = employee.nombreArtistico;
  }

  for (const driver of asList<Driver>(drivers)) {
    vacio.driver[driver.id] = driver.nombre;
  }

  /*
   * Un reporte sobre un "boss" apunta al usuario, no a un perfil aparte, asi
   * que los jefes se resuelven contra la tabla de usuarios.
   */
  for (const user of asList<ApiUser>(users)) {
    const nombre = [user.nombre, user.apellido].filter(Boolean).join(" ");
    vacio.boss[user.id] = nombre || user.email;
  }

  for (const client of asList<Client>(clients)) {
    if (client.nombreTelegram) vacio.client[client.id] = client.nombreTelegram;
  }

  return vacio;
}
