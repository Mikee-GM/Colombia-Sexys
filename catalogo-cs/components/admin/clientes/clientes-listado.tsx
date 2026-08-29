"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";

import { getClientes } from "@/lib/actions/clientes";
import type { ClienteResumen } from "@/lib/types";

/**
 * Listado de clientes con buscador.
 *
 * La busqueda va contra el servidor y no filtrando en memoria: la tabla de
 * clientes crece sin techo y traerla entera al navegador para filtrarla seria
 * lento justo cuando mas gente hay. Acepta el nombre de Telegram y tambien el
 * ID numerico, que es como se identifica al cliente en los avisos al jefe.
 */
export default function ClientesListado({
  inicial,
  total,
}: {
  inicial: ClienteResumen[];
  total: number;
}) {
  const [busqueda, setBusqueda] = useState("");
  const [clientes, setClientes] = useState(inicial);
  const [totalActual, setTotalActual] = useState(total);
  const [cargando, startTransition] = useTransition();

  useEffect(() => {
    const termino = busqueda.trim();
    // Se espera a que deje de teclear: una consulta por letra no aporta nada.
    const temporizador = setTimeout(() => {
      startTransition(async () => {
        const pagina = await getClientes(termino || undefined);
        setClientes(pagina.items);
        setTotalActual(pagina.total);
      });
    }, 300);
    return () => clearTimeout(temporizador);
  }, [busqueda]);

  const fecha = (valor: string) =>
    new Date(valor).toLocaleDateString("es-MX", {
      timeZone: "America/Mexico_City",
      day: "2-digit",
      month: "short",
      year: "numeric",
    });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-[family-name:var(--font-cormorant)] text-3xl text-white">
            Clientes
          </h1>
          <p className="mt-1 text-xs uppercase tracking-[0.14em] text-zinc-500">
            {totalActual} registrados
          </p>
        </div>
        <input
          type="search"
          value={busqueda}
          onChange={(evento) => setBusqueda(evento.target.value)}
          placeholder="Buscar por nombre o ID de Telegram"
          className="w-full max-w-sm rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:border-[#C5A55A] focus:outline-none"
        />
      </div>

      <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-[10px] uppercase tracking-[0.14em] text-zinc-500">
              <th className="px-5 py-3 font-semibold">Cliente</th>
              <th className="px-5 py-3 font-semibold">ID de Telegram</th>
              <th className="px-5 py-3 font-semibold">Primer contacto</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody>
            {cargando && clientes.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-5 py-10 text-center text-zinc-500">
                  Buscando...
                </td>
              </tr>
            ) : clientes.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-5 py-10 text-center text-zinc-500">
                  {busqueda.trim()
                    ? `Ningún cliente coincide con "${busqueda.trim()}".`
                    : "Todavía no hay clientes registrados."}
                </td>
              </tr>
            ) : (
              clientes.map((cliente) => (
                <tr
                  key={cliente.id}
                  className="border-b border-zinc-800/50 transition-colors last:border-b-0 hover:bg-zinc-900/50"
                >
                  <td className="px-5 py-3.5 text-white">
                    {cliente.nombreTelegram || (
                      <span className="text-zinc-600">Sin nombre</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 tabular-nums text-zinc-400">
                    {cliente.telegramChatId}
                  </td>
                  <td className="px-5 py-3.5 text-zinc-500">
                    {fecha(cliente.primerContactoAt)}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <Link
                      href={`/admin/clientes/${cliente.id}`}
                      className="text-xs font-bold uppercase tracking-[0.14em] text-[#C5A55A] transition-colors hover:text-[#E8D5A3]"
                    >
                      Ver ficha
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
