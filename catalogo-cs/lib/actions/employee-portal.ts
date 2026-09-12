"use server";

import { revalidatePath } from "next/cache";
import { getApiBaseUrl } from "@/lib/api-server";
import { getBackendCookieHeader, getCsrfToken } from "@/lib/auth";
import type {
  EmployeePortalData,
  EmployeeWeeklyContent,
  MensajeDelCanal,
  ReporteSobreMi,
  WeeklyPhotoSubmissionItem,
} from "@/lib/types";

/**
 * Cabeceras del portal.
 *
 * El portal se abre de dos maneras: con la sesion normal, y con un token que
 * llega en el enlace del bot. Las dos tienen que viajar en cada peticion
 * porque no sabemos cual de las dos trae quien esta mirando.
 *
 * El `x-csrf-token` acompana a la cookie porque el backend ya no se fia solo de
 * `SameSite` para las mutaciones del portal. Cuando se entra por el enlace del
 * bot no hay cookie y tampoco hace falta la cabecera.
 */
async function portalHeaders(token?: string) {
  const cookie = await getBackendCookieHeader();
  const csrf = await getCsrfToken();
  const headers: Record<string, string> = {};
  if (cookie) headers["Cookie"] = cookie;
  if (csrf) headers["x-csrf-token"] = csrf;
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

function portalUrl(path: string, token?: string) {
  const url = new URL(`${getApiBaseUrl()}${path}`);
  if (token) url.searchParams.set("token", token);
  return url.toString();
}

export async function getEmployeePortalData(
  token?: string,
): Promise<{ success: boolean; data?: EmployeePortalData; error?: string }> {
  try {
    const cookie = await getBackendCookieHeader();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (cookie) {
      headers["Cookie"] = cookie;
    }
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const url = new URL(`${getApiBaseUrl()}/employee-portal/me`);
    if (token) {
      url.searchParams.set("token", token);
    }

    const response = await fetch(url.toString(), {
      method: "GET",
      cache: "no-store",
      headers,
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return {
        success: false,
        error: err.message || "Error al cargar la información del portal",
      };
    }

    const data = (await response.json()) as EmployeePortalData;
    return { success: true, data };
  } catch (error: any) {
    console.error("Error al obtener datos del portal de empleada:", error);
    return {
      success: false,
      error: error.message || "Error de conexión con el servidor",
    };
  }
}

/**
 * Fotos de la semana en curso con su estado de revision.
 *
 * Va aparte de `getEmployeePortalData` porque cambia cada vez que sube algo, y
 * refrescar el portal entero para ver una miniatura nueva seria recalcular
 * ranking, ganancias y reputacion sin motivo.
 */
export async function getMyWeeklyPhotos(token?: string): Promise<{
  success: boolean;
  estado?: EmployeeWeeklyContent;
  envios?: WeeklyPhotoSubmissionItem[];
  error?: string;
}> {
  try {
    const response = await fetch(
      portalUrl("/employee-portal/weekly-photos", token),
      { method: "GET", cache: "no-store", headers: await portalHeaders(token) },
    );

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return {
        success: false,
        error: err.message || "No se pudieron cargar tus fotos de la semana",
      };
    }

    return { success: true, ...(await response.json()) };
  } catch (error) {
    console.error("Error al obtener las fotos semanales:", error);
    return { success: false, error: "Error de conexion con el servidor" };
  }
}

/**
 * Sube las fotos semanales desde el portal.
 *
 * Recibe el FormData tal cual lo arma el navegador y lo reenvia sin tocarlo:
 * fijar `Content-Type` a mano rompe el `boundary` que fetch genera solo, y el
 * backend rechazaria el multipart entero.
 */
export async function uploadMyWeeklyPhotos(
  formData: FormData,
  token?: string,
): Promise<{
  success: boolean;
  subidas?: number;
  estado?: EmployeeWeeklyContent;
  error?: string;
}> {
  const fotos = formData.getAll("fotos");
  if (fotos.length === 0) {
    return { success: false, error: "Selecciona al menos una foto." };
  }

  try {
    const response = await fetch(
      portalUrl("/employee-portal/weekly-photos", token),
      {
        method: "POST",
        cache: "no-store",
        headers: await portalHeaders(token),
        body: formData,
      },
    );

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      const mensaje = Array.isArray(err.message)
        ? err.message.join(". ")
        : err.message;
      return { success: false, error: mensaje || "No se pudieron subir las fotos" };
    }

    revalidatePath("/empleada/portal");
    return { success: true, ...(await response.json()) };
  } catch (error) {
    console.error("Error al subir fotos semanales:", error);
    return { success: false, error: "Error de conexion con el servidor" };
  }
}

/**
 * Marca el avance del viaje de la empleada.
 *
 * Son las dos acciones del ciclo del servicio que hasta ahora solo existian en
 * Telegram y que mas prisa tienen: el cliente esta esperando y encontrar el
 * mensaje correcto en el chat cuesta.
 */
export async function updateMyTripStatus(
  tripId: string,
  estado: "en_camino" | "llegue",
  token?: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(
      portalUrl(`/employee-portal/trips/${tripId}/status`, token),
      {
        method: "POST",
        cache: "no-store",
        headers: {
          ...(await portalHeaders(token)),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ estado }),
      },
    );

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return {
        success: false,
        error: err.message || "No se pudo registrar el avance del viaje",
      };
    }

    revalidatePath("/empleada/portal");
    return { success: true };
  } catch (error) {
    console.error("Error al actualizar el viaje:", error);
    return { success: false, error: "Error de conexion con el servidor" };
  }
}

/**
 * Cierra el servicio en curso desde el portal.
 *
 * Detras corre el mismo `finishByEmployee` que el boton del chat, asi que las
 * dos vias dejan el servicio, la liquidacion y la disponibilidad exactamente
 * igual.
 */
export async function finishMyService(
  servicioId: string,
  token?: string,
): Promise<{
  success: boolean;
  resumen?: {
    duracion: string;
    horasFacturadas: number | null;
    totalACobrar: number;
    metodoPago: string;
    clienteNombre: string | null;
    tieneServicioSiguiente: boolean;
  };
  error?: string;
}> {
  try {
    const response = await fetch(
      portalUrl(`/employee-portal/services/${servicioId}/finish`, token),
      {
        method: "POST",
        cache: "no-store",
        headers: await portalHeaders(token),
      },
    );

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return {
        success: false,
        error: err.message || "No se pudo finalizar el servicio",
      };
    }

    revalidatePath("/empleada/portal");
    return { success: true, resumen: await response.json() };
  } catch (error) {
    console.error("Error al finalizar el servicio:", error);
    return { success: false, error: "Error de conexion con el servidor" };
  }
}

export type ExtraDisponible = { id: string; nombre: string; precio: number };

/** Extras que la modelo puede cobrarle al cliente en el servicio en curso. */
export async function getAvailableExtras(
  servicioId: string,
  token?: string,
): Promise<{ success: boolean; extras?: ExtraDisponible[]; error?: string }> {
  try {
    const response = await fetch(
      portalUrl(
        `/employee-portal/services/${servicioId}/available-extras`,
        token,
      ),
      { method: "GET", cache: "no-store", headers: await portalHeaders(token) },
    );

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return {
        success: false,
        error: err.message || "No se pudieron cargar tus extras",
      };
    }

    return { success: true, extras: await response.json() };
  } catch (error) {
    console.error("Error al cargar los extras:", error);
    return { success: false, error: "Error de conexion con el servidor" };
  }
}

/**
 * Agrega un extra al servicio en curso.
 *
 * En el chat esto son tres mensajes encadenados porque no cabe un formulario;
 * aqui la modelo elige extra y metodo de pago a la vez y va en una peticion.
 *
 * O bien un extra de su catalogo, o bien un precio escrito a mano para lo que
 * no esta en el. El backend cuelga ese cobro libre del comodin de la modelo.
 */
export async function addServiceExtra(
  servicioId: string,
  cobro: {
    /** Extra del catalogo. Se omite cuando el precio se escribe a mano. */
    extraCatalogoId?: string;
    /** Precio acordado que no sale del catalogo. */
    precioCobrado?: number;
    metodoPago: "tarjeta" | "transferencia" | "efectivo";
  },
  token?: string,
): Promise<{
  success: boolean;
  totalExtras?: number;
  totalServicio?: number;
  error?: string;
}> {
  try {
    const response = await fetch(
      portalUrl(`/employee-portal/services/${servicioId}/extras`, token),
      {
        method: "POST",
        cache: "no-store",
        headers: {
          ...(await portalHeaders(token)),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(cobro),
      },
    );

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      const mensaje = Array.isArray(err.message)
        ? err.message.join(". ")
        : err.message;
      return { success: false, error: mensaje || "No se pudo agregar el extra" };
    }

    revalidatePath("/empleada/portal");
    const datos = await response.json();
    return {
      success: true,
      totalExtras: datos.totalExtras,
      totalServicio: datos.totalServicio,
    };
  } catch (error) {
    console.error("Error al agregar el extra:", error);
    return { success: false, error: "Error de conexion con el servidor" };
  }
}

/** Una calificacion baja que todavia se puede apelar. */
export type CalificacionApelable = {
  id: string;
  direction: string;
  stars: number;
  comment: string | null;
  createdAt: string;
};

/**
 * Las calificaciones bajas que esta persona todavia puede apelar.
 *
 * El backend resuelve de quien son a partir de la sesion, nunca de un
 * parametro: no hay forma de pedir las de otra.
 */
export async function getCalificacionesApelables(
  token?: string,
): Promise<CalificacionApelable[]> {
  try {
    const response = await fetch(
      portalUrl("/employee-portal/ratings/appealable", token),
      { method: "GET", cache: "no-store", headers: await portalHeaders(token) },
    );
    if (!response.ok) return [];
    return (await response.json()) as CalificacionApelable[];
  } catch (error) {
    console.error("Error al leer las calificaciones apelables:", error);
    return [];
  }
}

/**
 * Los reportes que hay sobre ella, con su version si ya la escribio.
 *
 * Antes no tenia forma de saber que existian: se enteraba, si acaso, cuando ya
 * habia una sancion encima y la decision se habia tomado con un solo relato
 * delante.
 */
export async function getReportesSobreMi(
  token?: string,
): Promise<ReporteSobreMi[]> {
  try {
    const response = await fetch(
      portalUrl("/employee-portal/reports/mine", token),
      { method: "GET", cache: "no-store", headers: await portalHeaders(token) },
    );
    if (!response.ok) return [];
    return (await response.json()) as ReporteSobreMi[];
  } catch (error) {
    console.error("Error al leer los reportes propios:", error);
    return [];
  }
}

/** Manda su version de un reporte abierto. Se puede corregir mientras siga abierto. */
export async function responderReporte(
  reportId: string,
  statement: string,
  token?: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(
      portalUrl(`/employee-portal/reports/${reportId}/statement`, token),
      {
        method: "POST",
        cache: "no-store",
        headers: {
          ...(await portalHeaders(token)),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ statement }),
      },
    );
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      const mensaje = Array.isArray(err.message)
        ? err.message.join(". ")
        : err.message;
      return { success: false, error: mensaje || "No se pudo enviar tu versión" };
    }
    return { success: true };
  } catch (error: any) {
    console.error("Error al responder el reporte:", error);
    return {
      success: false,
      error: error.message || "Error de conexion con el servidor",
    };
  }
}

/**
 * Apela una calificacion baja.
 *
 * Es la unica defensa ante algo que alimenta el score de confianza y puede
 * acabar en sancion. Solo existia detras de un boton del chat.
 */
export async function apelarCalificacion(
  ratingId: string,
  reason: string,
  token?: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(
      portalUrl(`/employee-portal/ratings/${ratingId}/appeal`, token),
      {
        method: "POST",
        cache: "no-store",
        headers: {
          ...(await portalHeaders(token)),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ reason }),
      },
    );
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return { success: false, error: err.message || "No se pudo apelar" };
    }
    return { success: true };
  } catch (error: any) {
    console.error("Error al apelar la calificacion:", error);
    return {
      success: false,
      error: error.message || "Error de conexion con el servidor",
    };
  }
}

/**
 * Levanta un reporte de conducta sobre el cliente o el chofer de un servicio.
 *
 * Es el mecanismo con el que se acaba bloqueando a un cliente problematico. Si
 * la unica via es el chat, un incidente se pierde justo cuando mas importa
 * registrarlo.
 */
export async function reportarConducta(
  input: {
    direction: string;
    interactionId: string;
    category: string;
    description: string;
  },
  token?: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(portalUrl("/employee-portal/reports", token), {
      method: "POST",
      cache: "no-store",
      headers: {
        ...(await portalHeaders(token)),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return {
        success: false,
        error: err.message || "No se pudo enviar el reporte",
      };
    }
    return { success: true };
  } catch (error: any) {
    console.error("Error al reportar:", error);
    return {
      success: false,
      error: error.message || "Error de conexion con el servidor",
    };
  }
}

/**
 * Anota donde esta la modelo mientras tiene el portal abierto.
 *
 * Hasta ahora la unica via era compartir ubicacion en vivo desde Telegram, y
 * dependia de acordarse. La espera entre escrituras la aplica el backend, asi
 * que llamar de mas no castiga a la base.
 */
export async function registrarMiUbicacion(
  lat: number,
  lng: number,
  token?: string,
): Promise<{ success: boolean }> {
  try {
    const response = await fetch(
      portalUrl("/employee-portal/location", token),
      {
        method: "POST",
        cache: "no-store",
        headers: {
          ...(await portalHeaders(token)),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ lat, lng }),
      },
    );
    return { success: response.ok };
  } catch (error) {
    // Un envio perdido no se avisa: el siguiente lo corrige.
    console.error("Error al registrar la ubicacion:", error);
    return { success: false };
  }
}

/**
 * Avisa que ya esta lista para salir.
 *
 * Es lo que destraba el Uber: hasta que ella lo marca, el jefe no tiene enlace
 * con el que pedirlo. Se metio este paso porque el coche llegaba en el mismo
 * momento de la autorizacion, mientras ella se estaba arreglando, y esperaba
 * con el taximetro corriendo.
 *
 * Que el servicio sea suyo lo comprueba el backend.
 */
export async function marcarListaParaSalir(
  servicioId: string,
  token?: string,
): Promise<{ success: boolean; error?: string; yaEstaba?: boolean }> {
  try {
    const response = await fetch(
      portalUrl(`/employee-portal/services/${servicioId}/lista`, token),
      {
        method: "POST",
        cache: "no-store",
        headers: await portalHeaders(token),
      },
    );
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return {
        success: false,
        error: err.message || "No se pudo avisar que ya estas lista",
      };
    }
    const datos = await response.json();
    return { success: true, yaEstaba: Boolean(datos.yaEstaba) };
  } catch (error: any) {
    console.error("Error al marcar que ya esta lista:", error);
    return {
      success: false,
      error: error.message || "Error de conexion con el servidor",
    };
  }
}

/**
 * Lee el canal con coordinacion.
 *
 * Es anonimo de su lado a proposito: ella no ve nunca quien le escribe, solo
 * que viene de coordinacion. Lo garantiza el backend, que no manda el autor.
 */
export async function leerCanal(
  token?: string,
): Promise<{ success: boolean; mensajes: MensajeDelCanal[]; error?: string }> {
  try {
    const response = await fetch(portalUrl("/employee-portal/channel", token), {
      cache: "no-store",
      headers: await portalHeaders(token),
    });
    if (!response.ok) {
      return { success: false, mensajes: [], error: "No se pudo abrir el canal" };
    }
    return { success: true, mensajes: await response.json() };
  } catch (error: any) {
    console.error("Error al leer el canal:", error);
    return {
      success: false,
      mensajes: [],
      error: error.message || "Error de conexion con el servidor",
    };
  }
}

/** Escribe en el canal. Le llega a sus jefes por chat, panel y aviso. */
export async function escribirEnCanal(
  cuerpo: string,
  token?: string,
): Promise<{ success: boolean; error?: string; mensaje?: MensajeDelCanal }> {
  const texto = cuerpo.trim();
  if (!texto) return { success: false, error: "Escribe algo primero" };

  try {
    const response = await fetch(portalUrl("/employee-portal/channel", token), {
      method: "POST",
      cache: "no-store",
      headers: {
        ...(await portalHeaders(token)),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ cuerpo: texto }),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return {
        success: false,
        error: err.message || "No se pudo enviar tu mensaje",
      };
    }
    return { success: true, mensaje: await response.json() };
  } catch (error: any) {
    console.error("Error al escribir en el canal:", error);
    return {
      success: false,
      error: error.message || "Error de conexion con el servidor",
    };
  }
}

/**
 * Pide diez minutos mas de margen mientras el cliente espera.
 *
 * No es lo mismo que extender el servicio: no alarga lo pactado ni cambia lo
 * que se cobra, solo evita que el reloj de espera tumbe el servicio cuando va
 * con retraso. En el chat era un boton que solo existia dentro del mensaje
 * correcto, asi que si ese mensaje se perdia entre otros, no habia forma de
 * pedirla.
 *
 * El tope de tres y la comprobacion de que el servicio sea suyo los hace el
 * backend, que ya los hacia.
 */
export async function pedirProrroga(
  servicioId: string,
  token?: string,
): Promise<{
  success: boolean;
  error?: string;
  prorrogasUsadas?: number;
  restantes?: number;
}> {
  try {
    const response = await fetch(
      portalUrl(`/employee-portal/services/${servicioId}/prorroga`, token),
      {
        method: "POST",
        cache: "no-store",
        headers: await portalHeaders(token),
      },
    );
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return {
        success: false,
        error: err.message || "No se pudo pedir la prorroga",
      };
    }
    const datos = await response.json();
    return {
      success: true,
      prorrogasUsadas: datos.prorrogasUsadas,
      restantes: datos.restantes,
    };
  } catch (error: any) {
    console.error("Error al pedir la prorroga:", error);
    return {
      success: false,
      error: error.message || "Error de conexion con el servidor",
    };
  }
}

/**
 * Extiende el servicio en curso.
 *
 * En el chat son varios pasos porque no cabe un formulario; aqui elige las
 * horas y se manda de una vez. Quien comprueba que el servicio sea suyo es el
 * backend, que ya lo hacia.
 */
export async function extenderMiServicio(
  servicioId: string,
  horas: number,
  token?: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(
      portalUrl(`/employee-portal/services/${servicioId}/extend`, token),
      {
        method: "POST",
        cache: "no-store",
        headers: {
          ...(await portalHeaders(token)),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ horas }),
      },
    );
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return {
        success: false,
        error: err.message || "No se pudo extender el servicio",
      };
    }
    return { success: true };
  } catch (error: any) {
    console.error("Error al extender el servicio:", error);
    return {
      success: false,
      error: error.message || "Error de conexión con el servidor",
    };
  }
}

/** Un servicio ya terminado cuyo cliente sigue sin calificar. */
export type ClientePorCalificar = {
  servicioId: string;
  fecha: string | null;
  clienteNombre: string | null;
};

/**
 * Los clientes de sus servicios recientes que aun no ha calificado.
 *
 * La calificacion del cliente existia como endpoint y como boton del chat, pero
 * el portal no tenia de donde sacar que servicio calificar, asi que la opcion
 * no aparecia por ningun lado y en la practica no se usaba.
 */
export async function getClientesPorCalificar(
  token?: string,
): Promise<ClientePorCalificar[]> {
  try {
    const response = await fetch(
      portalUrl("/employee-portal/ratings/pending-clients", token),
      { method: "GET", cache: "no-store", headers: await portalHeaders(token) },
    );
    if (!response.ok) return [];
    return (await response.json()) as ClientePorCalificar[];
  } catch (error) {
    console.error("Error al leer los clientes por calificar:", error);
    return [];
  }
}

/** Deja la valoracion de la modelo sobre el cliente de uno de sus servicios. */
export async function calificarCliente(
  input: { servicioId: string; stars: number; comment?: string },
  token?: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(portalUrl("/employee-portal/ratings", token), {
      method: "POST",
      cache: "no-store",
      headers: {
        ...(await portalHeaders(token)),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        direction: "employee_to_client",
        interactionId: input.servicioId,
        stars: input.stars,
        ...(input.comment?.trim() ? { comment: input.comment.trim() } : {}),
      }),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return {
        success: false,
        error: err.message || "No se pudo enviar la calificacion",
      };
    }
    revalidatePath("/empleada/portal");
    return { success: true };
  } catch (error: any) {
    console.error("Error al calificar al cliente:", error);
    return {
      success: false,
      error: error.message || "Error de conexion con el servidor",
    };
  }
}
