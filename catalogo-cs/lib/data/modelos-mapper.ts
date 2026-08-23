import type { Modelo } from "@/types";
import { getEmployeeHireTelegramUrl } from "@/lib/telegram-links";

/**
 * Mapea una Empleada del backend al Modelo que consume el frontend.
 *
 * Vive fuera de `lib/actions/` a proposito: los modulos marcados con
 * "use server" solo pueden exportar funciones async, asi que un mapeador
 * sincrono compartido entre Server Actions y lecturas de servidor tiene que
 * estar en un modulo normal.
 */
export function mapToModelo(emp: any): Modelo {
  return {
    _id: emp.id,
    nombre: emp.nombreArtistico, // Mapeado por compatibilidad
    nombreReal: emp.nombreReal || "",
    nombreArtistico: emp.nombreArtistico || "",
    descripcion: emp.descripcion || "",
    estiloHabla: emp.estiloHabla || "",
    politicaBesos: emp.politicaBesos ?? null,
    fotoPrincipal: emp.fotoPerfilUrl || "",
    fotos: emp.empleadaFotos ? emp.empleadaFotos.map((f: any) => f.url) : [],
    fotosExclusivas: emp.fotosExclusivas
      ? emp.fotosExclusivas.map((f: any) => f.url)
      : [],
    pendingWeeklyPhotosCount: emp.pendingWeeklyPhotosCount || 0,
    weeklyContentStatus: emp.weeklyContentStatus || "al_dia",
    linkX: emp.linkX || "",
    contactLink: getEmployeeHireTelegramUrl(emp.id, emp.telegramBotUsername),
    contactLabel: emp.contactLabel || "Contacto",
    disponible: emp.disponible,
    catalogoActivo: emp.catalogoActivo !== false,
    sancionada: Boolean(emp.sancionada),
    availabilityStatus: emp.availabilityStatus,
    estimatedAvailableAt: emp.estimatedAvailableAt ?? null,
    canScheduleNext: emp.canScheduleNext,
    precioBaseHora: emp.precioBaseHora ? parseFloat(emp.precioBaseHora) : 2500,
    jefeId: emp.jefeId || null,
    jefeSecundarioId: emp.jefeSecundarioId || null,
    apartmentId: emp.apartmentId || null,
    usuarioId: emp.usuarioId || null,
    trustScore: typeof emp.trustScore === "number" ? emp.trustScore : null,
    clientRatingAverage:
      emp.clientRatingAverage == null ? null : Number(emp.clientRatingAverage),
    clientRatingCount: Number(emp.clientRatingCount ?? 0),
    createdAt: emp.createdAt,
    extras: emp.extrasCatalogos
      ? emp.extrasCatalogos
          .filter((ext: any) => ext.activo !== false)
          .map((ext: any) => ({
            id: ext.id,
            nombre: ext.nombre,
            precio: ext.precio ? parseFloat(ext.precio) : 0,
            modelosVinculadasIds: Array.isArray(ext.modelosVinculadasIds)
              ? ext.modelosVinculadasIds
              : [],
            speechPersonalizado: ext.speechPersonalizado || "",
          }))
      : [],
  };
}

/** Baraja una copia de la lista (Fisher-Yates) sin mutar la original. */
export function shuffleModelos(modelos: Modelo[]): Modelo[] {
  const copy = [...modelos];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
