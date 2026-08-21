import { apiFetch } from "@/lib/api-server";
import { mapToModelo, shuffleModelos } from "@/lib/data/modelos-mapper";
import type { Modelo } from "@/types";

/**
 * Segundos que el catalogo publico vive en el Data Cache antes de revalidar.
 * OJO: `app/page.tsx` repite este valor como literal porque Next exige que
 * `export const revalidate` sea estatico. Si cambias uno, cambia el otro.
 */
export const CATALOG_REVALIDATE_SECONDS = 30;

/** Tag para invalidar el catalogo bajo demanda desde una Server Action. */
export const CATALOG_CACHE_TAG = "catalogo-modelos";

/**
 * Lectura del catalogo publico para Server Components.
 *
 * Es una funcion de servidor normal, no una Server Action: las acciones son
 * POST secuenciales y no cacheables, pensadas para mutaciones. Esto permite
 * renderizar el catalogo en el HTML inicial (SEO y LCP) y cachearlo con ISR.
 */
export async function getCatalogModelos(
  onlyAvailable = false,
): Promise<Modelo[]> {
  try {
    const data = await apiFetch<any[]>("/catalog/employees", {
      authenticated: false,
      next: {
        revalidate: CATALOG_REVALIDATE_SECONDS,
        tags: [CATALOG_CACHE_TAG],
      },
    });

    let list = data
      .map(mapToModelo)
      .filter(
        (m: Modelo) =>
          m.availabilityStatus !== "inactiva" && m.catalogoActivo !== false,
      );

    if (onlyAvailable) {
      list = list.filter((m: Modelo) => m.disponible);
    }

    // El orden se baraja en cada revalidacion para que ninguna modelo quede
    // fija arriba. Se hace en servidor para que el HTML y la hidratacion
    // coincidan exactamente.
    return shuffleModelos(list);
  } catch (error) {
    console.error("getCatalogModelos error:", error);
    return [];
  }
}
