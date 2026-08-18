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
    return pathname === path || pathname.startsWith(path + "/");
  };

  const isLoginPage = pathname === "/admin";

  if (isLoginPage) {
    return <LoginForm onSuccess={(redirectTo) => router.push(redirectTo)} />;
  }


  return (
    <div className="flex min-h-screen bg-black text-white font-body overflow-hidden">
      <SessionKeeper />
      {/* Sidebar Desktop */}
      <aside className="w-72 border-r border-zinc-800 bg-[#050505] flex flex-col hidden md:flex shrink-0">
        <div className="p-8 border-b border-zinc-800 flex flex-col items-center">
          <div className="w-16 h-16 relative mb-4">
            <Image src="/logo-icono.webp" alt="Logo" fill className="object-contain" />
          </div>
          <p className="text-[10px] font-bold tracking-[0.25em] text-[#C5A55A] uppercase">
            Panel Admin
          </p>
        </div>
        <nav className="flex-1 py-8 flex flex-col gap-2 px-4 overflow-y-auto">
          <Link
            href="/admin/dashboard"
            className={`flex items-center gap-4 px-6 py-4 text-xs font-bold tracking-[0.15em] uppercase transition-colors duration-300 ${
              isActive("/admin/dashboard")
                ? "text-black bg-[#C5A55A]"
                : "text-zinc-400 hover:text-white hover:bg-zinc-900/50"
            }`}
          >
            Dashboard
          </Link>
          <Link
            href="/admin/modelos"
            className={`flex items-center gap-4 px-6 py-4 text-xs font-bold tracking-[0.15em] uppercase transition-colors duration-300 ${
              isActive("/admin/modelos")
                ? "text-black bg-[#C5A55A]"
                : "text-zinc-400 hover:text-white hover:bg-zinc-900/50"
            }`}
          >
            Modelos
          </Link>
          <Link
            href="/admin/jefes"
            className={`flex items-center gap-4 px-6 py-4 text-xs font-bold tracking-[0.15em] uppercase transition-colors duration-300 ${
              isActive("/admin/jefes")
                ? "text-black bg-[#C5A55A]"
                : "text-zinc-400 hover:text-white hover:bg-zinc-900/50"
            }`}
          >
            Jefes
          </Link>
          <Link
            href="/admin/choferes"
            className={`flex items-center gap-4 px-6 py-4 text-xs font-bold tracking-[0.15em] uppercase transition-colors duration-300 ${
              isActive("/admin/choferes")
                ? "text-black bg-[#C5A55A]"
                : "text-zinc-400 hover:text-white hover:bg-zinc-900/50"
            }`}
          >
            Choferes
          </Link>
          <Link
            href="/admin/services"
            className={`flex items-center gap-4 px-6 py-4 text-xs font-bold tracking-[0.15em] uppercase transition-colors duration-300 ${
              isActive("/admin/services")
                ? "text-black bg-[#C5A55A]"
                : "text-zinc-400 hover:text-white hover:bg-zinc-900/50"
            }`}
          >
            Servicios
          </Link>
          <Link
            href="/admin/evidence"
            className={`flex items-center gap-4 px-6 py-4 text-xs font-bold tracking-[0.15em] uppercase transition-colors duration-300 ${
              isActive("/admin/evidence")
                ? "text-black bg-[#C5A55A]"
                : "text-zinc-400 hover:text-white hover:bg-zinc-900/50"
            }`}
          >
            Evidencias
          </Link>
          <Link
            href="/admin/map"
            className={`flex items-center gap-4 px-6 py-4 text-xs font-bold tracking-[0.15em] uppercase transition-colors duration-300 ${
              isActive("/admin/map")
                ? "text-black bg-[#C5A55A]"
                : "text-zinc-400 hover:text-white hover:bg-zinc-900/50"
            }`}
          >
            Mapa en Vivo
          </Link>
          <Link
            href="/admin/liquidations"
            className={`flex items-center gap-4 px-6 py-4 text-xs font-bold tracking-[0.15em] uppercase transition-colors duration-300 ${
              isActive("/admin/liquidations")
                ? "text-black bg-[#C5A55A]"
                : "text-zinc-400 hover:text-white hover:bg-zinc-900/50"
            }`}
          >
            Liquidaciones
          </Link>
          <Link
            href="/admin/transport"
            className={`flex items-center gap-4 px-6 py-4 text-xs font-bold tracking-[0.15em] uppercase transition-colors duration-300 ${
              isActive("/admin/transport")
                ? "text-black bg-[#C5A55A]"
                : "text-zinc-400 hover:text-white hover:bg-zinc-900/50"
            }`}
          >
            Transporte
          </Link>
          <Link
            href="/admin/bank-accounts"
            className={`flex items-center gap-4 px-6 py-4 text-xs font-bold tracking-[0.15em] uppercase transition-colors duration-300 ${
              isActive("/admin/bank-accounts")
                ? "text-black bg-[#C5A55A]"
                : "text-zinc-400 hover:text-white hover:bg-zinc-900/50"
            }`}
          >
            Cuentas bancarias
          </Link>
          <Link
            href="/admin/reports"
            className={`flex items-center gap-4 px-6 py-4 text-xs font-bold tracking-[0.15em] uppercase transition-colors duration-300 ${
              isActive("/admin/reports")
                ? "text-black bg-[#C5A55A]"
                : "text-zinc-400 hover:text-white hover:bg-zinc-900/50"
            }`}
          >
            Reportes
          </Link>
          <Link
            href="/admin/kpis"
            className={`flex items-center gap-4 px-6 py-4 text-xs font-bold tracking-[0.15em] uppercase transition-colors duration-300 ${
              isActive("/admin/kpis")
                ? "text-black bg-[#C5A55A]"
                : "text-zinc-400 hover:text-white hover:bg-zinc-900/50"
            }`}
          >
            Indicadores
          </Link>
          <Link
            href="/admin/regulations"
            className={`flex items-center gap-4 px-6 py-4 text-xs font-bold tracking-[0.15em] uppercase transition-colors duration-300 ${
              isActive("/admin/regulations")
                ? "text-black bg-[#C5A55A]"
                : "text-zinc-400 hover:text-white hover:bg-zinc-900/50"
            }`}
          >
            Reglamentos
          </Link>
          {/* <Link
            href="/admin/alerts"
            className={`flex items-center gap-4 px-6 py-4 text-xs font-bold tracking-[0.15em] uppercase transition-colors duration-300 ${
              isActive("/admin/alerts")
                ? "text-black bg-[#C5A55A]"
                : "text-zinc-400 hover:text-white hover:bg-zinc-900/50"
            }`}
          >
            Alertas
          </Link>
          <Link
            href="/admin/catalog"
            className={`flex items-center gap-4 px-6 py-4 text-xs font-bold tracking-[0.15em] uppercase transition-colors duration-300 ${
              isActive("/admin/catalog")
                ? "text-black bg-[#C5A55A]"
                : "text-zinc-400 hover:text-white hover:bg-zinc-900/50"
            }`}
          >
            Catálogo Web
          </Link>
          <Link
            href="/admin/chat-monitor"
            className={`flex items-center gap-4 px-6 py-4 text-xs font-bold tracking-[0.15em] uppercase transition-colors duration-300 ${
              isActive("/admin/chat-monitor")
                ? "text-black bg-[#C5A55A]"
                : "text-zinc-400 hover:text-white hover:bg-zinc-900/50"
            }`}
          >
            Chat Monitor
          </Link>
          <Link
            href="/admin/sentiment-alerts"
            className={`flex items-center gap-4 px-6 py-4 text-xs font-bold tracking-[0.15em] uppercase transition-colors duration-300 ${
              isActive("/admin/sentiment-alerts")
                ? "text-black bg-[#C5A55A]"
                : "text-zinc-400 hover:text-white hover:bg-zinc-900/50"
            }`}
          >
            Alertas Sentimiento
          </Link> */}

        </nav>
        <div className="p-4 border-t border-zinc-800">
          <p className="text-[10px] text-zinc-500 mb-3 px-2 truncate text-center">
            admin@colombiasexys.com
          </p>
          <button
            onClick={handleSignOut}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-none bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 transition-all duration-300"
          >
            <span className="text-[10px] font-bold tracking-[0.15em] uppercase text-zinc-400">
              Salir
            </span>
          </button>
        </div>
      </aside>

      {/* Mobile Navbar */}
      <div className="md:hidden fixed top-0 inset-x-0 h-16 border-b border-zinc-800 bg-[#050505]/95 backdrop-blur-md z-40 flex items-center justify-between px-4">
        <div className="w-8 h-8 relative">
          <Image src="/logo-icono.webp" alt="Logo" fill className="object-contain" />
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
            className="md:hidden fixed top-16 inset-x-0 bg-[#050505] border-b border-zinc-800 z-30 py-4 px-4 flex flex-col gap-2 shadow-2xl max-h-[calc(100vh-4rem)] overflow-y-auto"
          >
            <Link
              href="/admin/dashboard"
              onClick={() => setMenuOpen(false)}
              className={`px-4 py-3 text-left text-xs font-bold tracking-widest uppercase transition-colors duration-300 ${
                isActive("/admin/dashboard")
                  ? "text-[#C5A55A] bg-zinc-900/50"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              Dashboard
            </Link>
            <Link
              href="/admin/modelos"
              onClick={() => setMenuOpen(false)}
              className={`px-4 py-3 text-left text-xs font-bold tracking-widest uppercase transition-colors duration-300 ${
                isActive("/admin/modelos")
                  ? "text-[#C5A55A] bg-zinc-900/50"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              Modelos
            </Link>
            <Link
              href="/admin/jefes"
              onClick={() => setMenuOpen(false)}
              className={`px-4 py-3 text-left text-xs font-bold tracking-widest uppercase transition-colors duration-300 ${
                isActive("/admin/jefes")
                  ? "text-[#C5A55A] bg-zinc-900/50"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              Jefes
            </Link>
            <Link
              href="/admin/choferes"
              onClick={() => setMenuOpen(false)}
              className={`px-4 py-3 text-left text-xs font-bold tracking-widest uppercase transition-colors duration-300 ${
                isActive("/admin/choferes")
                  ? "text-[#C5A55A] bg-zinc-900/50"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              Choferes
            </Link>
            <Link
              href="/admin/services"
              onClick={() => setMenuOpen(false)}
              className={`px-4 py-3 text-left text-xs font-bold tracking-widest uppercase transition-colors duration-300 ${
                isActive("/admin/services")
                  ? "text-[#C5A55A] bg-zinc-900/50"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              Servicios
            </Link>
            <Link
              href="/admin/evidence"
              onClick={() => setMenuOpen(false)}
              className={`px-4 py-3 text-left text-xs font-bold tracking-widest uppercase transition-colors duration-300 ${
                isActive("/admin/evidence")
                  ? "text-[#C5A55A] bg-zinc-900/50"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              Evidencias
            </Link>
            <Link
              href="/admin/map"
              onClick={() => setMenuOpen(false)}
              className={`px-4 py-3 text-left text-xs font-bold tracking-widest uppercase transition-colors duration-300 ${
                isActive("/admin/map")
                  ? "text-[#C5A55A] bg-zinc-900/50"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              Mapa en Vivo
            </Link>
            <Link
              href="/admin/liquidations"
              onClick={() => setMenuOpen(false)}
              className={`px-4 py-3 text-left text-xs font-bold tracking-widest uppercase transition-colors duration-300 ${
                isActive("/admin/liquidations")
                  ? "text-[#C5A55A] bg-zinc-900/50"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              Liquidaciones
            </Link>
            <Link
              href="/admin/transport"
              onClick={() => setMenuOpen(false)}
              className={`px-4 py-3 text-left text-xs font-bold tracking-widest uppercase transition-colors duration-300 ${
                isActive("/admin/transport")
                  ? "text-[#C5A55A] bg-zinc-900/50"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              Transporte
            </Link>
            <Link
              href="/admin/bank-accounts"
              onClick={() => setMenuOpen(false)}
              className={`px-4 py-3 text-left text-xs font-bold tracking-widest uppercase transition-colors duration-300 ${
                isActive("/admin/bank-accounts")
                  ? "text-[#C5A55A] bg-zinc-900/50"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              Cuentas bancarias
            </Link>
            <Link
              href="/admin/reports"
              onClick={() => setMenuOpen(false)}
              className={`px-4 py-3 text-left text-xs font-bold tracking-widest uppercase transition-colors duration-300 ${
                isActive("/admin/reports")
                  ? "text-[#C5A55A] bg-zinc-900/50"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              Reportes
            </Link>
            <Link
              href="/admin/kpis"
              onClick={() => setMenuOpen(false)}
              className={`px-4 py-3 text-left text-xs font-bold tracking-widest uppercase transition-colors duration-300 ${
                isActive("/admin/kpis")
                  ? "text-[#C5A55A] bg-zinc-900/50"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              Indicadores
            </Link>
            <Link
              href="/admin/regulations"
              onClick={() => setMenuOpen(false)}
              className={`px-4 py-3 text-left text-xs font-bold tracking-widest uppercase transition-colors duration-300 ${
                isActive("/admin/regulations")
                  ? "text-[#C5A55A] bg-zinc-900/50"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              Reglamentos
            </Link>
            <Link
              href="/admin/alerts"
              onClick={() => setMenuOpen(false)}
              className={`px-4 py-3 text-left text-xs font-bold tracking-widest uppercase transition-colors duration-300 ${
                isActive("/admin/alerts")
                  ? "text-[#C5A55A] bg-zinc-900/50"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              Alertas
            </Link>
            <Link
              href="/admin/catalog"
              onClick={() => setMenuOpen(false)}
              className={`px-4 py-3 text-left text-xs font-bold tracking-widest uppercase transition-colors duration-300 ${
                isActive("/admin/catalog")
                  ? "text-[#C5A55A] bg-zinc-900/50"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              Catálogo Web
            </Link>
            <Link
              href="/admin/chat-monitor"
              onClick={() => setMenuOpen(false)}
              className={`px-4 py-3 text-left text-xs font-bold tracking-widest uppercase transition-colors duration-300 ${
                isActive("/admin/chat-monitor")
                  ? "text-[#C5A55A] bg-zinc-900/50"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              Chat Monitor
            </Link>
            <Link
              href="/admin/sentiment-alerts"
              onClick={() => setMenuOpen(false)}
              className={`px-4 py-3 text-left text-xs font-bold tracking-widest uppercase transition-colors duration-300 ${
                isActive("/admin/sentiment-alerts")
                  ? "text-[#C5A55A] bg-zinc-900/50"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              Alertas Sentimiento
            </Link>

            <div className="mt-2 pt-2 border-t border-zinc-800">
              <button
                onClick={() => {
                  setMenuOpen(false);
                  handleSignOut();
                }}
                className="w-full px-4 py-3 text-left text-xs font-bold tracking-widest uppercase text-zinc-400 hover:text-white"
              >
                Cerrar Sesion
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
