import { notFound, redirect } from "next/navigation";
import Link from "next/link";

import FichaCliente from "@/components/admin/clientes/ficha-cliente";
import { getClienteFicha } from "@/lib/actions/clientes";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function ClienteFichaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/admin");
  if (!["admin", "jefe"].includes(user.rol)) redirect("/admin");

  const { id } = await params;
  /*
   * Aqui no se degrada el fallo a un valor por defecto: una ficha vacia se
   * leeria como "este cliente no tiene nada", que es justo lo contrario de lo
   * que significa un error de red, y alguien podria bloquear a alguien por eso.
   */
  let ficha;
  try {
    ficha = await getClienteFicha(id);
  } catch {
    notFound();
  }

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/admin/clientes"
        className="text-xs font-bold uppercase tracking-[0.14em] text-zinc-500 transition-colors hover:text-[#C5A55A]"
      >
        Volver a clientes
      </Link>
      <FichaCliente ficha={ficha} />
    </div>
  );
}
