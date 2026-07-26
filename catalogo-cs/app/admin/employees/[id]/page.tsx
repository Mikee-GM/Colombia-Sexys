import { Badge } from "@/components/ui/badge";
import PageHeader from "@/components/ui/page-header";
import { getEmployee } from "@/lib/data/employees";
import Image from "next/image";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function EmployeeDetailPage({ params }: Props) {
  const { id } = await params;
  const employee = await getEmployee(id);
  const photos = employee.empleadaFotos?.sort((a, b) => a.orden - b.orden) ?? [];

  return (
    <>
      <PageHeader
        title={employee.nombreArtistico}
        description={employee.nombreReal}
      />

      <section className="grid gap-6 xl:grid-cols-12">
        <div className="xl:col-span-4">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6">
            {employee.fotoPerfilUrl ? (
              <Image
                src={employee.fotoPerfilUrl}
                alt={employee.nombreArtistico}
                width={400}
                height={400}
                className="aspect-square w-full rounded-xl object-cover"
              />
            ) : (
              <div className="grid aspect-square w-full place-items-center rounded-xl bg-zinc-900 text-zinc-500">
                Sin foto
              </div>
            )}

            <div className="mt-5 flex flex-wrap gap-2">
              <Badge>
                {employee.disponible ? "Disponible" : "No disponible"}
              </Badge>
              <Badge>
                {employee.catalogoActivo
                  ? "Catálogo activo"
                  : "Catálogo inactivo"}
              </Badge>
            </div>
          </div>
        </div>

        <div className="space-y-6 xl:col-span-8">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6">
            <h2 className="text-lg font-semibold">Perfil</h2>
            <p className="mt-3 text-zinc-300">
              {employee.descripcion ?? "Sin descripción registrada."}
            </p>

            <dl className="mt-6 grid gap-4 md:grid-cols-2">
              <div>
                <dt className="text-sm text-zinc-500">Precio base</dt>
                <dd className="text-xl font-semibold">
                  ${Number(employee.precioBaseHora).toLocaleString("es-MX")}/h
                </dd>
              </div>
              <div>
                <dt className="text-sm text-zinc-500">Slug catálogo</dt>
                <dd>{employee.slugCatalogo}</dd>
              </div>
              <div>
                <dt className="text-sm text-zinc-500">Ubicación</dt>
                <dd>
                  {employee.ubicacionLat && employee.ubicacionLng
                    ? `${employee.ubicacionLat}, ${employee.ubicacionLng}`
                    : "Sin ubicación"}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-zinc-500">Usuario asociado</dt>
                <dd>{employee.usuario?.email ?? "Sin usuario"}</dd>
              </div>
            </dl>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6">
            <h2 className="text-lg font-semibold">Fotos</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              {photos.length > 0 ? (
                photos.map((photo) => (
                  <Image
                    key={photo.id}
                    src={photo.url}
                    alt={`${employee.nombreArtistico} ${photo.orden + 1}`}
                    width={250}
                    height={250}
                    className="aspect-square rounded-xl object-cover"
                  />
                ))
              ) : (
                <p className="text-zinc-400">No hay fotos extra registradas.</p>
              )}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
