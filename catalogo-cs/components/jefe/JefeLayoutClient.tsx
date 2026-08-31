"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ClipboardList, FileWarning, LogOut, MapPinned, ShieldCheck, Trophy, UsersRound } from "lucide-react";
import { logoutAction } from "@/lib/actions/auth";
import SessionKeeper from "@/components/auth/session-keeper";
import ComprobarVersion from "@/components/ui/ComprobarVersion";
import { broadcastLogout } from "@/lib/client-session";

// `corto` es la etiqueta de la barra inferior del movil. Con el texto largo,
// "Registros a mano" no cabe en una columna de 78px y parte en dos lineas, que
// era lo que descuadraba la altura de toda la barra.
const links = [
  { href: "/jefe", label: "Mi equipo", corto: "Equipo", icon: UsersRound },
  { href: "/jefe/mapa", label: "Mapa", corto: "Mapa", icon: MapPinned },
  { href: "/jefe/reportes", label: "Reportes", corto: "Reportes", icon: FileWarning },
  { href: "/jefe/servicios-manuales", label: "Registros a mano", corto: "Registros", icon: ClipboardList },
  { href: "/jefe/retos", label: "Retos", corto: "Retos", icon: Trophy },
];

export default function JefeLayoutClient({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  async function signOut() {
    await logoutAction();
    broadcastLogout();
    router.replace("/admin");
  }

  return (
    <div className="min-h-screen bg-black font-body text-white md:flex">
      <SessionKeeper />
      {/* El panel tambien se instala en el telefono, y alli una version vieja
          puede quedarse cargada dias. */}
      <ComprobarVersion />
      <aside className="hidden w-64 shrink-0 border-r border-zinc-800 bg-[#050505] md:flex md:flex-col">
        <div className="border-b border-zinc-800 p-7">
          <Image src="/logo-horizontal.webp" alt="Colombia Sexys" width={190} height={70} className="h-auto w-full" />
          <div className="mt-5 flex items-center justify-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#C5A55A]">
            <ShieldCheck size={14} /> Panel de jefe
          </div>
        </div>
        <nav className="flex-1 space-y-2 p-4">
          {links.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link key={href} href={href} className={`flex items-center gap-3 px-4 py-4 text-xs font-semibold uppercase tracking-[0.12em] transition-colors ${active ? "bg-[#C5A55A] text-black" : "text-zinc-400 hover:bg-zinc-900 hover:text-white"}`}>
                <Icon size={17} /> {label}
              </Link>
            );
          })}
        </nav>
        <button onClick={signOut} className="m-4 flex items-center justify-center gap-2 border border-[#C5A55A]/50 px-4 py-3 text-xs font-semibold uppercase tracking-widest text-[#C5A55A] transition-colors hover:bg-[#C5A55A] hover:text-black">
          <LogOut size={15} /> Cerrar sesión
        </button>
      </aside>
      <div className="min-w-0 flex-1 pb-28 md:pb-0">
        {/* En movil no habia ni marca ni salida fuera de la barra inferior.
            Esta cabecera da sitio a las dos y libera la sexta celda. */}
        <header className="flex items-center justify-between border-b border-zinc-800 bg-[#050505] px-4 py-2.5 md:hidden">
          <Image src="/logo-horizontal.webp" alt="Colombia Sexys" width={140} height={52} className="h-7 w-auto" />
          <button onClick={signOut} aria-label="Cerrar sesión" className="flex h-11 w-11 items-center justify-center rounded-xl border border-zinc-800 text-zinc-400 transition-colors hover:border-[#C5A55A] hover:text-[#C5A55A]">
            <LogOut size={18} />
          </button>
        </header>
        <main className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-10">{children}</main>
      </div>
      {/*
       * Cinco destinos en cinco columnas, una sola fila.
       *
       * Antes habia seis hijos --los cinco enlaces mas Salir-- en una rejilla
       * de cinco columnas, asi que Salir caia a una segunda fila que el
       * contenido no tenia reservada y la barra tapaba el final de la pagina.
       * Salir no es un destino al que se navega: se ha ido a la cabecera.
       *
       * El relleno inferior respeta el indicador del iPhone, que en la app
       * instalada se pinta encima de la barra.
       */}
      <nav className="fixed inset-x-0 bottom-0 z-50 grid grid-cols-5 gap-0.5 border-t border-zinc-800 bg-[#050505]/95 px-1 pt-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))] backdrop-blur md:hidden">
        {links.map(({ href, corto, icon: Icon }) => (
          <Link key={href} href={href} className={`flex h-[52px] flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-semibold ${pathname === href ? "bg-[#C5A55A]/10 text-[#C5A55A]" : "text-zinc-500"}`}>
            <Icon size={20} /> {corto}
          </Link>
        ))}
      </nav>
    </div>
  );
}
