import type { Metadata } from "next";
import { getEmployeePortalData } from "@/lib/actions/employee-portal";
import EmployeePortalView from "@/components/empleada/EmployeePortalView";
import { getCurrentUser } from "@/lib/auth";
import { getMyWorkShift } from "@/lib/actions/work-shift";

export const metadata: Metadata = {
  title: "Mi Portal -- Colombia Sexys",
  description: "Portal exclusivo para empleadas de Colombia Sexys.",
  robots: "noindex, nofollow",
};

interface PageProps {
  searchParams: Promise<{ token?: string }>;
}

export default async function EmployeePortalPage({ searchParams }: PageProps) {
  const { token } = await searchParams;
  const result = await getEmployeePortalData(token);

  /*
   * El estado de jornada solo se pide si hay sesion. Un enlace antiguo con
   * `?token=` entra sin cookie, y pedirlo mandaria al login a alguien que si
   * tiene permiso para ver su portal.
   */
  const sesion = await getCurrentUser();
  const workShift = sesion ? await getMyWorkShift() : null;

  if (!result.success || !result.data) {
    return (
      <div className="min-h-screen bg-[#0d0f12] text-white flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center text-3xl mb-4">
          ⚠️
        </div>
        <h1 className="text-xl font-bold text-red-400 mb-2">Acceso No Disponible</h1>
        <p className="text-sm text-gray-400 max-w-md mb-6">
          {result.error ||
            "El enlace de acceso ha expirado o no es válido. Por favor, solicita un nuevo acceso desde el botón '👑 Mi Portal' en tu bot de Telegram."}
        </p>
        <div className="text-xs text-gray-600 bg-white/5 px-4 py-2 rounded-lg border border-white/5">
          Abre tu chat de Telegram y presiona el botón 👑 Mi Portal
        </div>
      </div>
    );
  }

  return (
    <EmployeePortalView
      initialData={result.data}
      token={token}
      workShift={workShift}
    />
  );
}
