"use client";

import { useState, useTransition } from "react";
import { ExternalLink, FileCheck2, ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { getEvidence } from "@/lib/actions/evidence";
import type { EvidenceItem, EvidencePage } from "@/lib/types";

const inputClass =
  "rounded-xl border border-zinc-800 bg-black px-4 py-3 text-sm text-white outline-none focus:border-[#C5A55A]";

export default function EvidenceClient({ initialPage }: { initialPage: EvidencePage }) {
  const [page, setPage] = useState(initialPage);
  const [kind, setKind] = useState<"" | "uber" | "transferencia">("");
  const [status, setStatus] = useState("");
  const [pending, startTransition] = useTransition();

  function load(filters: { kind?: "uber" | "transferencia"; status?: string }, append = false) {
    startTransition(async () => {
      try {
        const next = await getEvidence({
          ...filters,
          cursor: append ? page.nextCursor ?? undefined : undefined,
        });
        setPage((current) => ({
          items: append ? [...current.items, ...next.items] : next.items,
          nextCursor: next.nextCursor,
        }));
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "No se pudieron cargar las evidencias");
      }
    });
  }

  function applyKind(value: "" | "uber" | "transferencia") {
    setKind(value);
    load({ kind: value || undefined, status: status || undefined });
  }

  function applyStatus(value: string) {
    setStatus(value);
    load({ kind: kind || undefined, status: value || undefined });
  }

  return (
    <section className="space-y-5">
      <div className="grid gap-3 rounded-2xl border border-zinc-800 bg-zinc-950 p-4 sm:grid-cols-2">
        <label>
          <span className="mb-2 block text-[10px] font-semibold uppercase tracking-wider text-[#C5A55A]">Tipo</span>
          <select className={`${inputClass} w-full`} value={kind} onChange={(event) => applyKind(event.target.value as typeof kind)} disabled={pending}>
            <option value="">Todas</option>
            <option value="uber">Capturas de Uber</option>
            <option value="transferencia">Comprobantes</option>
          </select>
        </label>
        <label>
          <span className="mb-2 block text-[10px] font-semibold uppercase tracking-wider text-[#C5A55A]">Estado</span>
          <select className={`${inputClass} w-full`} value={status} onChange={(event) => applyStatus(event.target.value)} disabled={pending}>
            <option value="">Todos</option>
            <option value="ALMACENADA">Almacenada</option>
            <option value="PROCESANDO">Procesando</option>
            <option value="APROBADO">Aprobado</option>
            <option value="RECHAZADO">Rechazado</option>
            <option value="ERROR_VALIDACION">Error de validación</option>
          </select>
        </label>
      </div>

      {page.items.length ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {page.items.map((item) => <EvidenceCard key={`${item.kind}-${item.id}`} item={item} />)}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-zinc-800 py-20 text-center text-sm text-zinc-500">No hay evidencias con estos filtros.</div>
      )}

      {page.nextCursor && (
        <button type="button" disabled={pending} onClick={() => load({ kind: kind || undefined, status: status || undefined }, true)} className="w-full rounded-xl border border-[#C5A55A] px-4 py-3 text-xs font-bold uppercase tracking-wider text-[#C5A55A] disabled:opacity-50">
          {pending ? "Cargando" : "Cargar más"}
        </button>
      )}
    </section>
  );
}

function EvidenceCard({ item }: { item: EvidenceItem }) {
  const Icon = item.kind === "uber" ? ImageIcon : FileCheck2;
  return (
    <article className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="rounded-xl bg-[#C5A55A]/10 p-3 text-[#C5A55A]"><Icon size={20} /></span>
          <div>
            <p className="text-sm font-semibold">{item.kind === "uber" ? `Uber de ${item.tripType ?? "viaje"}` : "Comprobante de transferencia"}</p>
            <p className="mt-1 text-xs text-zinc-500">{new Date(item.createdAt).toLocaleString("es-MX")}</p>
          </div>
        </div>
        <span className="rounded-full border border-zinc-700 px-2.5 py-1 text-[10px] uppercase tracking-wider text-zinc-400">{item.status.replaceAll("_", " ")}</span>
      </div>
      <div className="mt-4 space-y-1 text-xs text-zinc-500">
        <p>Servicio: {item.serviceId ? item.serviceId.slice(-6).toUpperCase() : "Sin servicio asociado"}</p>
        {item.clientName && <p>Cliente: {item.clientName}</p>}
        {item.amount != null && <p>Monto: {new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(item.amount)}</p>}
        {item.observations && <p className="line-clamp-2 text-zinc-400">{item.observations}</p>}
      </div>
      <a href={item.url} target="_blank" rel="noopener noreferrer" className="mt-5 inline-flex items-center gap-2 rounded-xl border border-[#C5A55A] px-4 py-3 text-xs font-bold uppercase tracking-wider text-[#C5A55A]">
        Abrir imagen <ExternalLink size={14} />
      </a>
    </article>
  );
}
