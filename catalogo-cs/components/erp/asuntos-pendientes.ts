import type { GodEyeOverview } from "@/lib/actions/god-eye";
import type { RatingAppeal } from "@/lib/actions/discipline";
import type { Driver, Employee } from "@/lib/types";
import { codigoServicio } from "@/components/erp/primitives";

/**
 * La bandeja unica del Centro de Mando: todo lo que espera una decision.
 *
 * Antes esto estaba repartido en cinco listas distintas --comprobantes,
 * servicios sin transporte, reportes, apelaciones y calificaciones negativas--
 * colocadas una al lado de otra con el mismo peso visual. Son el mismo trabajo
 * (alguien espera que el administrador decida algo) y competian entre si en vez
 * de ordenarse: un servicio parado veinte minutos se veia igual de urgente que
 * una apelacion de hace tres dias.
 *
 * Aqui se convierten en filas del mismo tipo, con una severidad y el momento en
 * que empezaron a esperar, para poder ordenarlas por lo que se rompe antes.
 *
 * Este modulo no lleva `"use client"` a proposito: la pagina es un componente
 * de servidor y necesita construir la lista antes de pasarsela al componente
 * que la pinta.
 */

export type SeveridadAsunto = "critica" | "alta" | "media";

/** El area a la que pertenece el asunto; decide el icono y la etiqueta. */
export type AreaAsunto =
  "transporte" | "dinero" | "disciplina" | "personal" | "operacion";

export type AsuntoPendiente = {
  id: string;
  severidad: SeveridadAsunto;
  area: AreaAsunto;
  /** Primera linea: que pasa, en concreto. */
  titulo: string;
  /** Segunda linea: el contexto que evita tener que abrir la pantalla. */
  detalle: string;
  href: string;
  /** Verbo del boton: lo que se va a hacer al entrar. */
  accion: string;
  /** Desde cuando espera. Ordena dentro de una misma severidad. */
  desde: string | null;
};

const PESO: Record<SeveridadAsunto, number> = {
  critica: 0,
  alta: 1,
  media: 2,
};

/**
 * Cuanto lleva esperando algo, en palabras.
 *
 * Se calcula en el servidor y viaja ya escrito: recalcularlo en el navegador
 * daria un texto distinto al del HTML servido y React se quejaria de la
 * discrepancia al hidratar.
 */
export function tiempoEsperando(iso: string | null | undefined): string | null {
  if (!iso) return null;

  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return null;

  const minutos = Math.floor((Date.now() - fecha.getTime()) / 60000);
  if (minutos < 1) return "hace un momento";
  if (minutos < 60) return `hace ${minutos} min`;

  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `hace ${horas} h`;

  const dias = Math.floor(horas / 24);
  return dias === 1 ? "hace 1 dia" : `hace ${dias} dias`;
}

/** Une los trozos de contexto que existen, sin dejar separadores sueltos. */
function detalle(...partes: Array<string | null | undefined>) {
  return partes.filter(Boolean).join(" - ");
}

/**
 * Lo unico que hace falta de un viaje para saber si tiene chofer.
 *
 * El resumen del God Eye devuelve los viajes recortados y sin tipar (`any[]`),
 * asi que se estrecha aqui en vez de arrastrar el `any` por toda la bandeja.
 * `choferNombre` viene nulo mientras nadie ha aceptado la oferta.
 */
type ViajeDelResumen = {
  estado?: string | null;
  choferNombre?: string | null;
};

function viajesDe(servicio: { viajes?: unknown }): ViajeDelResumen[] {
  return Array.isArray(servicio.viajes)
    ? (servicio.viajes as ViajeDelResumen[])
    : [];
}

/**
 * Construye la bandeja a partir de lo que la pagina ya trae.
 *
 * No pide nada al backend: todas las fuentes son datos que el Centro de Mando
 * cargaba de todas formas para pintar los paneles sueltos que esta bandeja
 * sustituye.
 */
export function asuntosPendientes({
  overview,
  appeals,
  empleadas,
  choferes,
}: {
  overview: GodEyeOverview;
  appeals: RatingAppeal[];
  /** Solo se usan para detectar quien no tiene Telegram vinculado. */
  empleadas: Employee[];
  choferes: Driver[];
}): AsuntoPendiente[] {
  const { metrics, activeServices, pendingReports } = overview;
  const asuntos: AsuntoPendiente[] = [];

  /*
   * Un servicio sin chofer es lo unico que se lista uno por uno sin agrupar:
   * cada uno es un cliente concreto esperando en un sitio concreto, y el tiempo
   * que lleva parado es justo el dato que decide si hay que salir corriendo.
   *
   * El panel anterior buscaba esto comparando `estado === "transporte_pendiente"`.
   * Ese valor no existe en el estado de un servicio --es un estado de
   * liquidacion, y el estado del servicio solo puede ser pendiente, agendado,
   * en_curso, finalizado o cancelado-- asi que la alerta marcaba cero siempre,
   * hubiera o no un cliente esperando. Aqui se mira el viaje, que es donde vive
   * el dato: una oferta que nadie ha aceptado todavia, o un viaje que todos los
   * choferes rechazaron.
   */
  for (const servicio of activeServices) {
    const viajes = viajesDe(servicio);
    if (viajes.length === 0) continue;

    const sinAceptar = viajes.some(
      (viaje) => viaje.estado === "notificado" && !viaje.choferNombre,
    );
    const todosRechazados = viajes.every(
      (viaje) => viaje.estado === "rechazado" || viaje.estado === "cancelado",
    );
    if (!sinAceptar && !todosRechazados) continue;

    const espera = tiempoEsperando(servicio.createdAt);
    asuntos.push({
      id: `transporte-${servicio.id}`,
      severidad: "critica",
      area: "transporte",
      titulo: todosRechazados
        ? `${codigoServicio(servicio.id)} se quedo sin chofer: rechazaron el viaje`
        : `${codigoServicio(servicio.id)} espera a que un chofer acepte`,
      detalle: detalle(
        servicio.empleadaNombre,
        servicio.clienteNombre,
        espera ? `el servicio se creo ${espera}` : null,
      ),
      href: "/admin/transport",
      accion: "Asignar",
      desde: servicio.createdAt,
    });
  }

  /*
   * Los comprobantes van agregados: el resumen solo devuelve cuantos hay, y la
   * pantalla de evidencias es donde se ven de uno en uno.
   */
  if (metrics.pendingReceipts > 0) {
    asuntos.push({
      id: "comprobantes",
      severidad: "alta",
      area: "dinero",
      titulo:
        metrics.pendingReceipts === 1
          ? "Un comprobante espera validacion"
          : `${metrics.pendingReceipts} comprobantes esperan validacion`,
      detalle: "El pago no cuenta como recibido hasta que se verifica",
      href: "/admin/evidence",
      accion: "Revisar",
      desde: null,
    });
  }

  /* Los reportes se listan por separado porque cada uno trae su prioridad. */
  for (const reporte of pendingReports.slice(0, 4)) {
    asuntos.push({
      id: `reporte-${reporte.id}`,
      severidad:
        reporte.priority === "urgente"
          ? "critica"
          : reporte.priority === "alta"
            ? "alta"
            : "media",
      area: "disciplina",
      titulo: `Reporte de conducta sobre ${
        reporte.subjectName ?? "una persona sin asignar"
      }`,
      detalle: detalle(
        reporte.category,
        reporte.description,
        tiempoEsperando(reporte.createdAt),
      ),
      href: "/admin/reports",
      accion: "Resolver",
      desde: reporte.createdAt,
    });
  }

  /*
   * Los reportes que no caben en la bandeja no se pierden: se cuentan en una
   * sola fila que lleva a la pantalla donde estan todos.
   */
  const reportesDeMas = Math.max(0, pendingReports.length - 4);
  if (reportesDeMas > 0) {
    asuntos.push({
      id: "reportes-restantes",
      severidad: "media",
      area: "disciplina",
      titulo: `${reportesDeMas} reportes de conducta mas sin resolver`,
      detalle: "Los de menor prioridad, en la pantalla de reportes",
      href: "/admin/reports",
      accion: "Ver todos",
      desde: null,
    });
  }

  for (const apelacion of appeals
    .filter((candidata) => candidata.appealStatus === "pending")
    .slice(0, 3)) {
    asuntos.push({
      id: `apelacion-${apelacion.id}`,
      severidad: "media",
      area: "disciplina",
      titulo: `Apelacion sobre una calificacion de ${apelacion.stars} ${
        apelacion.stars === 1 ? "estrella" : "estrellas"
      }`,
      detalle: detalle(
        apelacion.appealReason,
        tiempoEsperando(apelacion.createdAt),
      ),
      href: "/admin/reports",
      accion: "Resolver",
      desde: apelacion.createdAt,
    });
  }

  if (metrics.recentNegativeRatings > 0) {
    asuntos.push({
      id: "negativas",
      severidad: "media",
      area: "disciplina",
      titulo:
        metrics.recentNegativeRatings === 1
          ? "Una calificacion negativa reciente sin revisar"
          : `${metrics.recentNegativeRatings} calificaciones negativas recientes`,
      detalle: "Conviene mirar la interaccion antes de que escale",
      href: "/admin/reports",
      accion: "Revisar",
      desde: null,
    });
  }

  /*
   * Las sanciones vigentes no piden una decision hoy, pero si el administrador
   * no las tiene delante se entera de que existen cuando alguien reclama.
   * Entran al final de la bandeja, nunca por delante de algo que espera.
   */
  if (metrics.activeSanctions > 0) {
    asuntos.push({
      id: "sanciones",
      severidad: "media",
      area: "disciplina",
      titulo:
        metrics.activeSanctions === 1
          ? "Una sancion vigente en curso"
          : `${metrics.activeSanctions} sanciones vigentes en curso`,
      detalle:
        metrics.pendingAppeals > 0
          ? `${metrics.pendingAppeals} de ellas en apelacion`
          : "Sin apelaciones abiertas",
      href: "/admin/reports",
      accion: "Ver",
      desde: null,
    });
  }

  /*
   * Sin Telegram vinculado no llega nada: ni la oferta de un viaje ni la
   * autorizacion de un servicio. Una modelo dada de alta y sin vincular parece
   * disponible en el catalogo y no lo esta, asi que es un pendiente real y no
   * un detalle administrativo.
   */
  const sinTelegram = [
    ...empleadas
      .filter(
        (empleada) => empleada.usuario && !empleada.usuario.telegramChatId,
      )
      .map((empleada) => ({
        nombre: empleada.nombreArtistico,
        href: "/admin/modelos",
      })),
    ...choferes
      .filter((chofer) => chofer.usuario && !chofer.usuario.telegramChatId)
      .map((chofer) => ({ nombre: chofer.nombre, href: "/admin/choferes" })),
  ];

  if (sinTelegram.length === 1) {
    asuntos.push({
      id: "telegram",
      severidad: "alta",
      area: "personal",
      titulo: `${sinTelegram[0].nombre} sigue sin vincular su Telegram`,
      detalle: "Sin el vinculo no recibe ofertas ni autorizaciones",
      href: sinTelegram[0].href,
      accion: "Vincular",
      desde: null,
    });
  } else if (sinTelegram.length > 1) {
    asuntos.push({
      id: "telegram",
      severidad: "alta",
      area: "personal",
      titulo: `${sinTelegram.length} personas sin Telegram vinculado`,
      detalle: detalle(
        sinTelegram
          .slice(0, 4)
          .map((persona) => persona.nombre)
          .join(", "),
        sinTelegram.length > 4 ? `y ${sinTelegram.length - 4} mas` : null,
      ),
      href: sinTelegram[0].href,
      accion: "Vincular",
      desde: null,
    });
  }

  /*
   * Orden final: primero lo que se rompe antes y, dentro de una misma
   * severidad, lo que lleva mas tiempo esperando. Lo que no tiene fecha va
   * detras de lo que si la tiene: un agregado sin antiguedad no puede
   * adelantar a un servicio parado.
   */
  return asuntos.sort((a, b) => {
    if (PESO[a.severidad] !== PESO[b.severidad]) {
      return PESO[a.severidad] - PESO[b.severidad];
    }
    if (a.desde && b.desde) return a.desde.localeCompare(b.desde);
    if (a.desde) return -1;
    if (b.desde) return 1;
    return 0;
  });
}
