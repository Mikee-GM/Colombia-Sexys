"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { FileWarning, LogOut, MapPinned, ShieldCheck, UsersRound } from "lucide-react";
import { logoutAction } from "@/lib/actions/auth";
import SessionKeeper from "@/components/auth/session-keeper";
import { broadcastLogout } from "@/lib/client-session";

const links = [
  { href: "/jefe", label: "Mi equipo", icon: UsersRound },
  { href: "/jefe/mapa", label: "Mapa", icon: MapPinned },
  { href: "/jefe/reportes", label: "Reportes", icon: FileWarning },
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
      <div className="min-w-0 flex-1 pb-24 md:pb-0">
        <main className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-10">{children}</main>
      </div>
      <nav className="fixed inset-x-0 bottom-0 z-50 grid grid-cols-4 border-t border-zinc-800 bg-[#050505]/95 p-2 backdrop-blur md:hidden">
        {links.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} className={`flex flex-col items-center gap-1 py-2 text-[10px] font-semibold uppercase tracking-wider ${pathname === href ? "text-[#C5A55A]" : "text-zinc-500"}`}>
            <Icon size={20} /> {label}
          </Link>
        ))}
        <button onClick={signOut} className="flex flex-col items-center gap-1 py-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
          <LogOut size={20} /> Salir
        </button>
      </nav>
    </div>
  );
}
