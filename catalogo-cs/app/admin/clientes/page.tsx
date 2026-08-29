import { redirect } from "next/navigation";

import ClientesListado from "@/components/admin/clientes/clientes-listado";
import { getClientes } from "@/lib/actions/clientes";
import { getCurrentUser } from "@/lib/auth";
import { optionalSource } from "@/lib/optional-source";

export const dynamic = "force-dynamic";

export default async function ClientesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/admin");
  if (!["admin", "jefe"].includes(user.rol)) redirect("/admin");

  const pagina = await optionalSource(
    getClientes(),
    { items: [], total: 0, limit: 50, offset: 0 },
    "clientes",
  );

  return <ClientesListado inicial={pagina.items} total={pagina.total} />;
}
