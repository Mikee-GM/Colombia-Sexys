import type { Metadata } from "next";
import { getDriverPortalData } from "@/lib/actions/driver-portal";
import DriverPortalView from "@/components/chofer/DriverPortalView";
import { getCurrentUser } from "@/lib/auth";
import { getMyWorkShift } from "@/lib/actions/work-shift";

export const metadata: Metadata = {
  title: "Mi Portal -- Colombia Sexys",
  description: "Portal exclusivo para choferes de Colombia Sexys.",
  robots: "noindex, nofollow",
  /*
   * El portal se instala en la pantalla de inicio, y de ahi sale la sesion
   * que traen los avisos push: dentro del webview de Telegram no existe el
   * service worker que hacen falta, solo en la aplicacion instalada. En
   * iPhone, ademas, `appleWebApp` no es un adorno: sin el, lo que se anade
   * a la pantalla de inicio abre como una pestaña normal y no llega nada.
   */
  manifest: "/manifest-chofer.webmanifest",
  appleWebApp: { capable: true, title: "Portal CS", statusBarStyle: "black-translucent" },
};

interface PageProps {
  searchParams: Promise<{ token?: string }>;
}

export default async function DriverPortalPage({ searchParams }: PageProps) {
  const { token } = await searchParams;
  const result = await getDriverPortalData(token);

  /* Solo con sesion: un enlace antiguo con token no lleva cookie. */
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
            "El enlace de acceso ha expirado o no es válido. Por favor, solicita un nuevo acceso desde el botón '🚚 Mi Portal' en tu bot de Telegram."}
        </p>
        <div className="text-xs text-gray-600 bg-white/5 px-4 py-2 rounded-lg border border-white/5">
          Abre tu chat de Telegram y presiona el botón 🚚 Mi Portal
        </div>
      </div>
    );
  }

  return <DriverPortalView initialData={result.data} workShift={workShift} />;
}
