import { Badge } from "@/components/ui/badge";
import LiveMapDynamic from "@/components/dashboard/LiveMapDynamic";
import PageHeader from "@/components/ui/page-header";
import { getDriver } from "@/lib/data/drivers";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function DriverDetailPage({ params }: Props) {
  const { id } = await params;
  const driver = await getDriver(id);

  return (
    <>
      <PageHeader title={driver.nombre} description="Perfil de chofer" />

      <section className="grid gap-6 xl:grid-cols-12">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6 xl:col-span-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-zinc-500">Teléfono</p>
              <h2 className="mt-1 text-2xl font-semibold">{driver.telefono}</h2>
            </div>
            <Badge>{driver.disponible ? "Disponible" : "No disponible"}</Badge>
          </div>

          <dl className="mt-8 space-y-5">
            <div>
              <dt className="text-sm text-zinc-500">Ubicación</dt>
              <dd>
                {driver.ubicacionLat && driver.ubicacionLng
                  ? `${driver.ubicacionLat}, ${driver.ubicacionLng}`
                  : "Sin ubicación"}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-zinc-500">Usuario asociado</dt>
              <dd>{driver.usuario?.email ?? "Sin usuario"}</dd>
            </div>
            <div>
              <dt className="text-sm text-zinc-500">Rol</dt>
              <dd>{driver.usuario?.rol ?? "chofer"}</dd>
            </div>
          </dl>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6 xl:col-span-7">
          <h2 className="text-lg font-semibold mb-4">Mapa</h2>
          {driver.ubicacionLat && driver.ubicacionLng ? (
            <LiveMapDynamic drivers={[driver]} employees={[]} />
          ) : (
            <div className="grid h-80 place-items-center rounded-xl bg-zinc-900 text-center text-zinc-400">
              Este chofer todavía no tiene coordenadas registradas.
            </div>
          )}
        </div>
      </section>
    </>
  );
}
