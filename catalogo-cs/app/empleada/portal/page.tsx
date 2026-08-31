import type { Metadata } from "next";
import {
  getEmployeePortalData,
  getMyWeeklyPhotos,
} from "@/lib/actions/employee-portal";
import EmployeePortalView from "@/components/empleada/EmployeePortalView";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getMyWorkShift } from "@/lib/actions/work-shift";

export const metadata: Metadata = {
  title: "Mi Portal -- Colombia Sexys",
  description: "Portal exclusivo para empleadas de Colombia Sexys.",
  robots: "noindex, nofollow",
  /*
   * El portal se instala en la pantalla de inicio, y de ahi sale la sesion
   * que traen los avisos push: dentro del webview de Telegram no existe el
   * service worker que hacen falta, solo en la aplicacion instalada. En
   * iPhone, ademas, `appleWebApp` no es un adorno: sin el, lo que se anade
   * a la pantalla de inicio abre como una pestaña normal y no llega nada.
   */
  manifest: "/manifest-empleada.webmanifest",
  appleWebApp: { capable: true, title: "Mi Portal", statusBarStyle: "black-translucent" },
};

interface PageProps {
  searchParams: Promise<{ token?: string; seccion?: string }>;
}

/** Pestañas a las que puede apuntar un enlace. Nada mas abre el portal por defecto. */
const SECCIONES = ["resumen", "ranking", "servicios", "reputacion", "fotos"] as const;
type Seccion = (typeof SECCIONES)[number];

export default async function EmployeePortalPage({ searchParams }: PageProps) {
  const { token, seccion } = await searchParams;
  const result = await getEmployeePortalData(token);

  /*
   * El estado de jornada solo se pide si hay sesion. Un enlace antiguo con
   * `?token=` entra sin cookie, y pedirlo mandaria al login a alguien que si
   * tiene permiso para ver su portal.
   */
  const sesion = await getCurrentUser();

  /*
   * Sin sesion y sin token no hay nada que mostrar, y la pantalla de "acceso no
   * disponible" era un callejon sin salida: obligaba a volver a Telegram a
   * pedir un enlace nuevo. Ahora se manda al login, donde puede entrar con su
   * correo y su contraseña. Es lo que hace que la aplicacion instalada se
   * arregle sola cuando caduca la sesion.
   */
  if (!sesion && !token) {
    redirect("/admin");
  }
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

  /*
   * Las fotos de la semana se resuelven aqui y no en el cliente para que la
   * pestaña no aparezca vacia un instante cuando se entra directamente a ella
   * desde el boton de Telegram. Si la fuente falla se entra igual: el
   * componente sabe recargarlas por su cuenta.
   */
  const fotosSemanales = await getMyWeeklyPhotos(token);

  const seccionInicial: Seccion = SECCIONES.includes(seccion as Seccion)
    ? (seccion as Seccion)
    : "resumen";

  return (
    <EmployeePortalView
      initialData={result.data}
      token={token}
      workShift={workShift}
      weeklyPhotos={fotosSemanales.envios ?? []}
      seccionInicial={seccionInicial}
    />
  );
}
