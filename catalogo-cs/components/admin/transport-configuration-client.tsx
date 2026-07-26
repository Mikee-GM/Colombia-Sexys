"use client";

import dynamic from "next/dynamic";
import { useState, useTransition } from "react";
import { MapPin, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deletePresetLocation, savePresetLocation, updateTransportFee, type PresetLocation, type TransportConfiguration } from "@/app/admin/transport/actions";

const LocationMap = dynamic(() => import("./transport-location-map"), { ssr: false });
const emptyLocation = { name: "", address: "", latitude: 20.5235, longitude: -100.8157, active: true, sortOrder: 0 };

export default function TransportConfigurationClient({ initial }: { initial: TransportConfiguration }) {
  const [configuration, setConfiguration] = useState(initial);
  const [editing, setEditing] = useState<PresetLocation | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyLocation);
  const [pending, startTransition] = useTransition();

  function reload() { window.location.reload(); }
  function submitFee(formData: FormData) {
    const fee = Number(formData.get("fee"));
    if (!Number.isFinite(fee) || fee < 0) { toast.error("Ingresa una tarifa válida"); return; }
    startTransition(async () => { await updateTransportFee(fee); setConfiguration((current) => ({ ...current, externalLocationFee: fee })); toast.success("Tarifa actualizada"); });
  }
  function open(location?: PresetLocation) { setEditing(location ?? null); setForm(location ? { name: location.name, address: location.address, latitude: Number(location.latitude), longitude: Number(location.longitude), active: location.active, sortOrder: location.sortOrder } : emptyLocation); setModalOpen(true); }
  function submitLocation() {
    if (!form.name.trim() || !form.address.trim()) return toast.error("Completa nombre y dirección");
    startTransition(async () => { await savePresetLocation(editing?.id ?? null, form); toast.success(editing ? "Ubicación actualizada" : "Ubicación creada"); reload(); });
  }

  return <div className="space-y-8">
    <form action={submitFee} className="rounded-2xl border border-zinc-800 bg-[#0A0A0A] p-5 sm:p-6"><label htmlFor="fee" className="text-xs font-semibold uppercase tracking-[0.18em] text-[#C5A55A]">Tarifa para otras ubicaciones</label><p className="mt-2 text-sm text-zinc-500">Se copia al servicio al momento de reservar.</p><div className="mt-4 flex max-w-md gap-3"><input id="fee" name="fee" type="number" min="0" step="0.01" defaultValue={configuration.externalLocationFee} className="min-w-0 flex-1 rounded-xl border border-zinc-800 bg-black px-4 py-3 text-white outline-none focus:border-[#C5A55A]"/><button disabled={pending} className="rounded-xl border border-[#C5A55A] px-5 text-sm font-semibold text-[#C5A55A] hover:bg-[#C5A55A] hover:text-black disabled:opacity-50">Guardar</button></div></form>
    <section><div className="mb-4 flex items-end justify-between gap-4"><div><h2 className="font-heading text-3xl">Ubicaciones preestablecidas</h2><p className="mt-1 text-sm text-zinc-500">Estos destinos no generan cargo de transporte al cliente.</p></div><button onClick={() => open()} className="inline-flex items-center gap-2 rounded-xl border border-[#C5A55A] px-4 py-3 text-xs font-semibold uppercase tracking-wider text-[#C5A55A]"><Plus size={16}/>Nueva ubicación</button></div><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{configuration.locations.map((location) => <article key={location.id} className="rounded-2xl border border-zinc-800 bg-[#0A0A0A] p-5"><div className="flex items-start justify-between gap-3"><div><h3 className="font-heading text-2xl text-white">{location.name}</h3><p className="mt-2 flex gap-2 text-sm text-zinc-500"><MapPin size={15} className="mt-0.5 shrink-0 text-[#C5A55A]"/>{location.address}</p></div><span className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-wider ${location.active ? "border-[#C5A55A]/50 text-[#E8D5A3]" : "border-zinc-800 text-zinc-600"}`}>{location.active ? "Activa" : "Inactiva"}</span></div><div className="mt-5 flex gap-2"><button onClick={() => open(location)} className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-zinc-700 py-3 text-xs text-zinc-300"><Pencil size={14}/>Editar</button><button onClick={() => startTransition(async () => { await deletePresetLocation(location.id); toast.success("Ubicación eliminada"); reload(); })} className="rounded-xl border border-zinc-800 px-4 text-zinc-500 hover:border-red-900 hover:text-red-400" aria-label={`Eliminar ${location.name}`}><Trash2 size={15}/></button></div></article>)}</div></section>
    {modalOpen && <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 p-4"><div className="mx-auto my-8 max-w-2xl rounded-2xl border border-[#C5A55A]/40 bg-[#050505] p-5 sm:p-7"><h2 className="font-heading text-3xl">{editing ? "Editar ubicación" : "Nueva ubicación"}</h2><div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="text-xs text-zinc-400">Nombre<input value={form.name} onChange={(e) => setForm({...form,name:e.target.value})} className="mt-2 w-full rounded-xl border border-zinc-800 bg-black px-4 py-3 text-sm text-white outline-none focus:border-[#C5A55A]"/></label><label className="text-xs text-zinc-400">Orden<input type="number" min="0" value={form.sortOrder} onChange={(e) => setForm({...form,sortOrder:Number(e.target.value)})} className="mt-2 w-full rounded-xl border border-zinc-800 bg-black px-4 py-3 text-sm text-white outline-none focus:border-[#C5A55A]"/></label><label className="text-xs text-zinc-400 sm:col-span-2">Dirección<input value={form.address} onChange={(e) => setForm({...form,address:e.target.value})} className="mt-2 w-full rounded-xl border border-zinc-800 bg-black px-4 py-3 text-sm text-white outline-none focus:border-[#C5A55A]"/></label></div><div className="mt-4 overflow-hidden rounded-xl border border-zinc-800"><LocationMap latitude={form.latitude} longitude={form.longitude} onChange={(latitude,longitude)=>setForm({...form,latitude,longitude})}/></div><p className="mt-2 text-xs text-zinc-600">Selecciona el punto exacto en el mapa. {form.latitude.toFixed(6)}, {form.longitude.toFixed(6)}</p><label className="mt-4 flex items-center gap-3 text-sm text-zinc-300"><input type="checkbox" checked={form.active} onChange={(e)=>setForm({...form,active:e.target.checked})} className="accent-[#C5A55A]"/>Disponible para nuevas reservas</label><div className="mt-6 flex justify-end gap-3"><button onClick={()=>{setModalOpen(false);setEditing(null);setForm(emptyLocation)}} className="rounded-xl border border-zinc-800 px-5 py-3 text-sm text-zinc-400">Cancelar</button><button disabled={pending} onClick={submitLocation} className="rounded-xl bg-[#C5A55A] px-5 py-3 text-sm font-semibold text-black disabled:opacity-50">Guardar ubicación</button></div></div></div>}
  </div>;
}
