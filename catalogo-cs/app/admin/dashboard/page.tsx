import { redirect } from "next/navigation";

import { ErpPageHeader } from "@/components/erp/primitives";
import { bloquesDeCentroDeMando } from "@/components/erp/centro-de-mando";
import { asuntosPendientes } from "@/components/erp/asuntos-pendientes";
import BandejaPendiente from "@/components/erp/bandeja-pendiente";
import { bloquesDeSemanaEnCurso } from "@/components/erp/semana-en-curso";
import TableroPersonalizable, {
  type BloqueTablero,
} from "@/components/erp/tablero-personalizable";
import LiveMapDynamic from "@/components/dashboard/LiveMapDynamic";
import { getEmployees } from "@/lib/data/employees";
import { getDrivers } from "@/lib/data/drivers";
import { getDashboardLayout } from "@/lib/actions/dashboard-layout";
import GodEyeDashboard, {
  SeccionGodEye,
} from "@/components/admin/god-eye/GodEyeDashboard";
import { SECCIONES_DEL_GOD_EYE } from "@/components/admin/god-eye/secciones";
import AvisosDeChoferes from "@/components/admin/AvisosDeChoferes";
import {
  getGodEyeOverviewAction,
  getGodEyeActorsAction,
} from "@/lib/actions/god-eye";
import { getPendingAppeals } from "@/lib/actions/discipline";
import { getWeeklySummary } from "@/app/admin/liquidations/actions";
import { getServices } from "@/lib/data/services";
import { getCurrentUser } from "@/lib/auth";
import { optionalSource } from "@/lib/optional-source";
import { getOperationalWeek } from "@/lib/week-range";
import { getOffDutyStaff } from "@/lib/actions/work-shift";

export const dynamic = "force-dynamic";

/** Tablero en blanco cuando el resumen no responde. */
const OVERVIEW_VACIO = {
  metrics: {
    activeServices: 0,
    employeesTotal: 0,
    employeesAvailable: 0,
    employeesBusy: 0,
    driversTotal: 0,
    driversActive: 0,
    pendingReceipts: 0,
    recentNegativeRatings: 0,
    cashInStreet: 0,
    activeSanctions: 0,
    pendingAppeals: 0,
    pendingReports: 0,
    clientsTotal: 0,
    pendingOffers: 0,
    revenueToday: 0,
    revenueWeek: 0,
  },
  activeServices: [],
  pendingReports: [],
};

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/admin");

  const contexto = "el centro de mando";
  const { startDate, endDate } = getOperationalWeek();

  const [
    overview,
    actors,
    appeals,
    services,
    summary,
    offDuty,
    layout,
    mapEmployees,
    mapDrivers,
  ] = await Promise.all([
    optionalSource(getGodEyeOverviewAction(), OVERVIEW_VACIO, contexto),
    optionalSource(
      getGodEyeActorsAction(),
      { employees: [], drivers: [], bosses: [] },
      contexto,
    ),
    optionalSource(getPendingAppeals(), [], contexto),
    optionalSource(getServices(), [], contexto),
    optionalSource(getWeeklySummary(startDate, endDate), [], contexto),
    optionalSource(getOffDutyStaff(), [], contexto),
    // Sin disposicion guardada se usa el orden por defecto, no un tablero vacio.
    optionalSource(getDashboardLayout(), null, contexto),
    // Mismos datos que ya usa /admin/map: el mapa del centro de mando es el
    // mismo componente, solo que integrado como bloque reordenable. La bandeja
    // los reaprovecha para saber quien no tiene Telegram vinculado.
    optionalSource(getEmployees(), [], contexto),
    optionalSource(getDrivers(), [], contexto),
  ]);

  const { contadores, ahora, dinero } = bloquesDeCentroDeMando({
    overview,
    offDuty: offDuty ?? [],
  });

  const semana = bloquesDeSemanaEnCurso({
    services: services ?? [],
    summary: summary ?? [],
    startDate,
    endDate,
  });

  const asuntos = asuntosPendientes({
    overview,
    appeals: appeals ?? [],
    empleadas: mapEmployees ?? [],
    choferes: mapDrivers ?? [],
  });

  /*
   * El tablero se lee de arriba abajo como cuatro preguntas, y no como una
   * rejilla de veinte widgets con el mismo peso: que tengo que hacer, que esta
   * pasando ahora, cuanto dinero hay, y --detras de una puerta-- el analisis a
   * fondo.
   *
   * Una zona puede ocupar dos grupos cuando mezcla rejillas distintas: los
   * indicadores y los paneles anchos no comparten fila porque una tarjeta de
   * KPI intercalada entre dos paneles queda ridicula. En ese caso el segundo
   * grupo va sin titulo y continua la zona anterior.
   */
  const grupos = [
    {
      id: "pendiente",
      gridClassName: "grid grid-cols-1 gap-4",
      bloques: [
        {
          id: "bandeja-pendiente",
          titulo: "Pendiente de ti",
          anchoCompleto: true,
          contenido: <BandejaPendiente asuntos={asuntos} />,
        } satisfies BloqueTablero,
      ],
    },
    {
      id: "ahora-contadores",
      titulo: "Ahora mismo",
      descripcion: "Quien esta trabajando y donde esta",
      gridClassName: "grid grid-cols-1 gap-4",
      bloques: contadores,
    },
    {
      id: "ahora-paneles",
      gridClassName: "grid grid-cols-1 gap-6 xl:grid-cols-2",
      bloques: [
        ...ahora,
        {
          id: "mapa-en-vivo",
          titulo: "Mapa en tiempo real",
          anchoCompleto: true,
          contenido: (
            <LiveMapDynamic employees={mapEmployees} drivers={mapDrivers} />
          ),
        } satisfies BloqueTablero,
      ],
    },
    {
      id: "dinero-indicadores",
      titulo: "Dinero",
      descripcion: `Semana del ${startDate} al ${endDate}`,
      gridClassName: "grid grid-cols-1 gap-4 sm:grid-cols-3",
      bloques: dinero,
    },
    {
      id: "dinero-paneles",
      gridClassName: "grid grid-cols-1 gap-6 xl:grid-cols-2",
      bloques: semana,
    },
    {
      /*
       * El God Eye, repartido en cuatro bloques y detras de una puerta.
       *
       * Antes entraba entero como un solo bloque llamado "Tablero detallado":
       * desde ahi hacia abajo eran tres mil lineas que solo se podian mover u
       * ocultar a la vez. Cada seccion es ahora un widget propio, aunque las
       * cuatro siguen saliendo del mismo componente y comparten su estado
       * --seleccionar un actor a la izquierda sigue abriendo su expediente a la
       * derecha--. La zona empieza cerrada porque repetia los indicadores de
       * arriba y era lo primero que se veia al bajar.
       */
      id: "analisis",
      titulo: "Analisis a fondo",
      descripcion:
        "Expediente de una persona, interceptor de chat, historico y apelaciones",
      plegable: true,
      gridClassName: "grid grid-cols-1 gap-6",
      bloques: SECCIONES_DEL_GOD_EYE.map(
        (seccion) =>
          ({
            id: `god-eye-${seccion.nombre}`,
            titulo: seccion.titulo,
            anchoCompleto: true,
            contenido: <SeccionGodEye nombre={seccion.nombre} />,
          }) satisfies BloqueTablero,
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <ErpPageHeader
        title="Centro de Mando"
        description="Estado de la operacion, alertas y accesos a cada modulo"
      />

      {/*
        El God Eye envuelve al tablero porque es quien tiene el estado de sus
        cuatro secciones: cada bloque solo coloca la que le toca, y para eso
        tiene que quedar por debajo en el arbol.
      */}
      <GodEyeDashboard
        initialOverview={overview}
        initialActors={actors}
        initialAppeals={appeals}
      >
        <TableroPersonalizable grupos={grupos} layoutInicial={layout} />
      </GodEyeDashboard>

      {/* No pinta nada: escucha los rechazos de ofertas y levanta el aviso. */}
      <AvisosDeChoferes />
    </div>
  );
}
