import HomeCatalog from "@/components/HomeCatalog";
import { getCatalogModelos } from "@/lib/data/catalog";

// El catalogo se prerenderiza y se revalida en background: el visitante (y el
// crawler) reciben HTML con las modelos ya dentro.
// Tiene que ser un literal: Next lo lee estaticamente y no acepta constantes
// importadas. Debe coincidir con CATALOG_REVALIDATE_SECONDS.
export const revalidate = 30;

export default async function Home() {
  const modelos = await getCatalogModelos(false);

  return <HomeCatalog modelos={modelos} />;
}
