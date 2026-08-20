"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import LoginForm from "@/components/admin/LoginForm";
import { logoutAction } from "@/lib/actions/auth";
import SessionKeeper from "@/components/auth/session-keeper";
import { broadcastLogout } from "@/lib/client-session";


import {
  Activity,
  Award,
  BookOpen,
  Car,
  Clock,
  CreditCard,
  Eye,
  FileCheck,
  Landmark,
  MapPin,
  Scale,
  Shield,
  TrendingUp,
  Trophy,
  UserPlus,
  Users,
} from "lucide-react";

interface NavItem {
  label: string;
  href: string;
  icon: any;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    title: "Operaciones en Vivo",
    items: [
      { label: "Ojo de Dios", href: "/admin/dashboard", icon: Eye },
      { label: "Mapa", href: "/admin/map", icon: MapPin },
      { label: "Servicios", href: "/admin/services", icon: Activity },
      { label: "Evidencias", href: "/admin/evidence", icon: FileCheck },
    ],
  },
  {
    title: "Personal & Equipos",
    items: [
      { label: "Modelos", href: "/admin/modelos", icon: Users },
      { label: "Choferes", href: "/admin/choferes", icon: Car },
      { label: "Jefes", href: "/admin/jefes", icon: Shield },
      { label: "Candidatas", href: "/admin/candidatas", icon: UserPlus },
    ],
  },
  {
    title: "Finanzas & Cortes",
    items: [
      { label: "Liquidaciones", href: "/admin/liquidations", icon: CreditCard },
      { label: "Cuentas Bancarias", href: "/admin/bank-accounts", icon: Landmark },
    ],
  },
  {
    title: "Control & Normativas",
    items: [
      { label: "Reportes & Disciplina", href: "/admin/reports", icon: Scale },
      { label: "Indicadores (KPIs)", href: "/admin/kpis", icon: TrendingUp },
      { label: "Retos", href: "/admin/retos", icon: Trophy },
      { label: "Turnos", href: "/admin/turnos", icon: Clock },
      { label: "Transporte", href: "/admin/transport", icon: Award },
      { label: "Reglamentos", href: "/admin/regulations", icon: BookOpen },
    ],
  },
];

interface AdminLayoutClientProps {
  children: React.ReactNode;
}

export default function AdminLayoutClient({ children }: AdminLayoutClientProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  const handleSignOut = async () => {
    try {
      await logoutAction();
      broadcastLogout();
      router.push("/admin");
    } catch (e) {
      console.error(e);
    }
  };

  const isActive = (path: string) => {
    return pathname === path || (path !== "/admin/dashboard" && pathname.startsWith(path + "/"));
  };

  const isLoginPage = pathname === "/admin";

  if (isLoginPage) {
    return <LoginForm onSuccess={(redirectTo) => router.push(redirectTo)} />;
  }

  return (
    <div className="flex min-h-screen bg-black text-white font-body overflow-hidden">
      <SessionKeeper />
      {/* Sidebar Desktop */}
      <aside className="w-64 border-r border-zinc-800/80 bg-[#050505] flex flex-col hidden md:flex shrink-0">
        <div className="p-6 border-b border-zinc-800/80 flex flex-col items-center">
          <div className="w-12 h-12 relative mb-3">
            <Image src="/logo-icono.webp" alt="Logo" fill className="object-contain" />
          </div>
          <p className="text-[10px] font-bold tracking-[0.25em] text-[#C5A55A] uppercase">
            Panel Admin
          </p>
        </div>

        <nav className="flex-1 py-6 flex flex-col gap-6 px-3 overflow-y-auto custom-scrollbar">
          {navGroups.map((group) => (
            <div key={group.title} className="flex flex-col gap-1">
              <span className="px-3 text-[10px] font-bold tracking-[0.2em] uppercase text-zinc-500">
                {group.title}
              </span>
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold tracking-wider transition-all duration-200 ${
                      active
                        ? "text-black bg-[#C5A55A] shadow-md shadow-[#C5A55A]/20"
                        : "text-zinc-400 hover:text-white hover:bg-zinc-900/60"
                    }`}
                  >
                    <Icon className={`w-4 h-4 shrink-0 ${active ? "text-black" : "text-[#C5A55A]"}`} />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="p-4 border-t border-zinc-800/80 bg-zinc-950/40">
          <p className="text-[10px] text-zinc-500 mb-2.5 px-2 truncate text-center font-mono">
            admin@colombiasexys.com
          </p>
          <button
            onClick={handleSignOut}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-zinc-900/80 border border-zinc-800 hover:border-red-500/50 hover:bg-red-950/20 text-zinc-400 hover:text-red-300 transition-all duration-200"
          >
            <span className="text-[10px] font-bold tracking-[0.15em] uppercase">
              Cerrar Sesión
            </span>
          </button>
        </div>
      </aside>

      {/* Mobile Navbar */}
      <div className="md:hidden fixed top-0 inset-x-0 h-16 border-b border-zinc-800 bg-[#050505]/95 backdrop-blur-md z-40 flex items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 relative">
            <Image src="/logo-icono.webp" alt="Logo" fill className="object-contain" />
          </div>
          <span className="text-xs font-bold tracking-widest text-[#C5A55A] uppercase">
            Panel Admin
          </span>
        </div>
        <button onClick={() => setMenuOpen(!menuOpen)} className="text-[#C5A55A] p-2">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
      </div>

      {/* Mobile Menu Dropdown */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="md:hidden fixed top-16 inset-x-0 bg-[#080808] border-b border-zinc-800 z-30 py-5 px-4 flex flex-col gap-5 shadow-2xl max-h-[calc(100vh-4rem)] overflow-y-auto"
          >
            {navGroups.map((group) => (
              <div key={group.title} className="flex flex-col gap-1.5">
                <span className="text-[10px] font-bold tracking-widest uppercase text-zinc-500 px-2">
                  {group.title}
                </span>
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMenuOpen(false)}
                      className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold tracking-wider transition-colors ${
                        active
                          ? "text-black bg-[#C5A55A]"
                          : "text-zinc-400 hover:text-white bg-zinc-950/60 border border-zinc-900"
                      }`}
                    >
                      <Icon className={`w-4 h-4 ${active ? "text-black" : "text-[#C5A55A]"}`} />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            ))}

            <div className="pt-3 border-t border-zinc-800">
              <button
                onClick={() => {
                  setMenuOpen(false);
                  handleSignOut();
                }}
                className="w-full py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-xs font-bold tracking-widest uppercase text-red-400 hover:bg-red-950/30 text-center"
              >
                Cerrar Sesión
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto bg-black pt-16 md:pt-0">
        <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
          {children}
        </div>
      </main>
    </div>
  );
}
