"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { ArrowLeft, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  hardDeleteServiceAction,
  restoreServiceAction,
} from "@/lib/actions/service-history";
import { APP_LOCALE, APP_TIME_ZONE } from "@/lib/locale";
import type { ServiceTrashItem } from "@/lib/service-history";

export default function ServiceTrash({ items }: { items: ServiceTrashItem[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const run = (action: () => Promise<{ success: boolean; error?: string }>) =>
    startTransition(async () => {
      const result = await action();
      if (!result.success) {
        toast.error(result.error ?? "No se pudo completar la acción");
        return;
      }
      toast.success("Papelera actualizada");
      router.refresh();
    });

  const restore = (item: ServiceTrashItem) => {
    const reason = window.prompt(
      "Motivo para restaurar en revisión administrativa",
    );
    if (!reason || reason.trim().length < 10) return;
    run(() => restoreServiceAction(item.id, reason.trim()));
  };

  const hardDelete = (item: ServiceTrashItem) => {
    const reason = window.prompt("Motivo de la eliminación definitiva");
    if (!reason || reason.trim().length < 10) return;
    const confirmation = window.prompt("Escribe ELIMINAR para continuar");
    if (confirmation !== "ELIMINAR")
      return toast.error("La confirmación no coincide");
    if (
      !window.confirm(
        "Segunda confirmación: esta acción no se puede deshacer. ¿Eliminar definitivamente?",
      )
    )
      return;
    run(() => hardDeleteServiceAction(item.id, reason.trim(), confirmation));
  };

  return (
    <section className="space-y-5">
      <header className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
        <Link
          href="/admin/servicios"
          className="inline-flex min-h-11 items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-400 hover:text-[#E8D5A3]"
        >
          <ArrowLeft size={15} /> Volver a servicios
        </Link>
        <h1 className="mt-3 font-heading text-2xl font-semibold text-white">
          Papelera de servicios
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-zinc-500">
          Restaurar deja el servicio cancelado y en revisión. No reactiva
          viajes, timers, empleadas ni choferes.
        </p>
      </header>
      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-800 p-10 text-center text-sm text-zinc-500">
          La papelera está vacía.
        </div>
      ) : (
        <div className="grid gap-3">
          {items.map((item) => (
            <article
              key={item.id}
              className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 sm:p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-zinc-500">
                    Folio {item.folio}
                  </p>
                  <h2 className="mt-1 font-semibold text-white">
                    {item.employeeName} · {item.clientName}
                  </h2>
                  <p className="mt-1 text-xs text-zinc-500">
                    Servicio: {format(item.serviceDate)} · Eliminado:{" "}
                    {item.deletedAt ? format(item.deletedAt) : "—"}
                  </p>
                  <p className="mt-2 text-xs text-zinc-400">
                    Estado previo: {item.previousStatus ?? "—"} /{" "}
                    {item.previousOperationalState ?? "—"}
                  </p>
                  <p className="mt-2 text-sm text-zinc-300">
                    {item.deleteReason ?? "Sin motivo"}
                  </p>
                  <p className="mt-1 text-[10px] uppercase tracking-wider text-zinc-600">
                    Actor {item.actorRole ?? "admin"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    disabled={pending}
                    onClick={() => restore(item)}
                    className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-emerald-500/40 px-3 text-xs font-semibold uppercase text-emerald-300 disabled:opacity-40"
                  >
                    <RotateCcw size={14} /> Restaurar
                  </button>
                  <button
                    disabled={pending}
                    onClick={() => hardDelete(item)}
                    className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-red-500/50 px-3 text-xs font-semibold uppercase text-red-300 disabled:opacity-40"
                  >
                    <Trash2 size={14} /> Eliminar definitivamente
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function format(value: string) {
  return new Intl.DateTimeFormat(APP_LOCALE, {
    timeZone: APP_TIME_ZONE,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
