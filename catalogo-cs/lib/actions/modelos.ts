"use server";

import { isRedirectError } from "@/lib/auth";
import type { Modelo, ModeloPayload } from "@/types";
import { revalidatePath } from "next/cache";
import { apiFetch } from "@/lib/api-server";
import { getEmployeeHireTelegramUrl } from "@/lib/telegram-links";

// Mapeador de Empleadas (backend) a Modelo (frontend)
function mapToModelo(emp: any): Modelo {
  return {
    _id: emp.id,
    nombre: emp.nombreArtistico, // Mapeado por compatibilidad
    nombreReal: emp.nombreReal || "",
    nombreArtistico: emp.nombreArtistico || "",
    descripcion: emp.descripcion || "",
    fotoPrincipal: emp.fotoPerfilUrl || "",
    fotos: emp.empleadaFotos ? emp.empleadaFotos.map((f: any) => f.url) : [],
    fotosExclusivas: emp.fotosExclusivas ? emp.fotosExclusivas.map((f: any) => f.url) : [],
    pendingWeeklyPhotosCount: emp.pendingWeeklyPhotosCount || 0,
    weeklyContentStatus: emp.weeklyContentStatus || "al_dia",
    linkX: emp.linkX || "",
    contactLink: getEmployeeHireTelegramUrl(emp.id),
    contactLabel: emp.contactLabel || "Contacto",
    disponible: emp.disponible,
    catalogoActivo: emp.catalogoActivo !== false,
    sancionada: Boolean(emp.sancionada),
    availabilityStatus: emp.availabilityStatus,
    estimatedAvailableAt: emp.estimatedAvailableAt ?? null,
    canScheduleNext: emp.canScheduleNext,
    precioBaseHora: emp.precioBaseHora ? parseFloat(emp.precioBaseHora) : 2500,
    // TODO: el campo `tipo` fue eliminado del backend — verificar si sigue siendo necesario
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
            modelosVinculadasIds: Array.isArray(ext.modelosVinculadasIds) ? ext.modelosVinculadasIds : [],
          }))
      : [],
  };
}

export async function getCatalogModelosAction(
  onlyAvailable = false,
): Promise<Modelo[]> {
  try {
    const data = await apiFetch<any[]>("/catalog/employees", {
      authenticated: false,
    });
    let list = data
      .map(mapToModelo)
      .filter((m: Modelo) => m.availabilityStatus !== "inactiva" && m.catalogoActivo !== false);
    if (onlyAvailable) {
      list = list.filter((m: Modelo) => m.disponible);
    }
    return list.sort(() => 0.5 - Math.random());
  } catch (error) {
    console.error("getCatalogModelosAction error:", error);
    return [];
  }
}

export async function getModelosAction(
  onlyAvailable = false,
): Promise<Modelo[]> {
  try {
    const data = await apiFetch<any[]>("/employees", {
      authenticated: true,
    });
    let list = data.map(mapToModelo);
    if (onlyAvailable) {
      list = list.filter((m: Modelo) => m.disponible);
    }
    return list;
  } catch (error) {
    console.error("getModelosAction error:", error);
    return [];
  }
}

export async function getModeloAction(id: string): Promise<Modelo> {
  const data = await apiFetch<any>(`/employees/${id}`, {
    authenticated: false,
  });
  return mapToModelo(data);
}

export async function createModeloAction(
  payload: ModeloPayload,
): Promise<Modelo> {
  const cleanName = payload.nombreArtistico
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  const slug = `${payload.nombreArtistico.toLowerCase().replace(/[^a-z0-9]/g, "-")}-${Date.now().toString().slice(-4)}`;

  const createDto = {
    email: `${cleanName}-${Date.now().toString().slice(-6)}@chambapasteles.com`,
    password: "Password12345!",
    nombreReal: payload.nombreReal,
    nombreArtistico: payload.nombreArtistico,
    slugCatalogo: slug,
    fotoPerfilUrl: payload.fotoPrincipal,
    descripcion: payload.descripcion,
    precioBaseHora: payload.precioBaseHora,
    disponible: payload.disponible ?? true,
    catalogoActivo: payload.catalogoActivo ?? true,
    jefeId: payload.jefeId || null,
    jefeSecundarioId: payload.jefeSecundarioId || null,
    apartmentId: payload.apartmentId || null,
    linkX: payload.linkX || null,
    contactLabel: payload.contactLabel || null,
    fotosExtra: payload.fotos,
    extras: (payload.extras || []).map((ext) => ({
      nombre: ext.nombre,
      precio: ext.precio,
      modelosVinculadasIds: ext.modelosVinculadasIds || [],
    })),
  };

  const data = await apiFetch<any>("/employees", {
    method: "POST",
    body: JSON.stringify(createDto),
    authenticated: true,
  });

  revalidatePath("/");
  revalidatePath("/admin/modelos");
  return mapToModelo(data);
}

export async function updateModeloAction(
  id: string,
  payload: ModeloPayload,
): Promise<Modelo> {
  const updateDto = {
    nombreReal: payload.nombreReal,
    nombreArtistico: payload.nombreArtistico,
    fotoPerfilUrl: payload.fotoPrincipal,
    descripcion: payload.descripcion,
    precioBaseHora: payload.precioBaseHora,
    disponible: payload.disponible,
    catalogoActivo: payload.catalogoActivo,
    jefeId: payload.jefeId || null,
    jefeSecundarioId: payload.jefeSecundarioId || null,
    apartmentId: payload.apartmentId || null,
    linkX: payload.linkX || null,
    contactLabel: payload.contactLabel || null,
    fotosExtra: payload.fotos,
    extras: (payload.extras || []).map((ext) => ({
      nombre: ext.nombre,
      precio: ext.precio,
      modelosVinculadasIds: ext.modelosVinculadasIds || [],
    })),
  };

  const data = await apiFetch<any>(`/employees/${id}`, {
    method: "PATCH",
    body: JSON.stringify(updateDto),
    authenticated: true,
  });

  revalidatePath("/");
  revalidatePath("/admin/modelos");
  return mapToModelo(data);
}

export async function deleteModeloAction(id: string): Promise<void> {
  await apiFetch<void>(`/employees/${id}`, {
    method: "DELETE",
    authenticated: true,
  });

  revalidatePath("/");
  revalidatePath("/admin/modelos");
}

// TODO: verificar si GET /users?rol=jefe existe en el backend o si hay un endpoint especifico para listar jefes
export async function getJefesAction(): Promise<
  { id: string; email: string }[]
> {
  try {
    const users = await apiFetch<any[]>("/users?rol=jefe", {
      authenticated: true,
    });
    return users.map((u: any) => ({ id: u.id, email: u.email }));
  } catch (error) {
    if (isRedirectError(error)) throw error;
    console.error("getJefesAction error:", error);
    return [];
  }
}

// TODO: verificar si el modulo /apartments existe en el backend antes de usar esta accion
export async function getApartmentsAction(): Promise<
  { id: string; name: string }[]
> {
  try {
    const apartments = await apiFetch<any[]>("/apartments", {
      authenticated: true,
    });
    return apartments.map((a: any) => ({
      id: a.id,
      name: a.nombre || `Apto ${a.nombre || a.id}`,
    }));
  } catch (error) {
    if (isRedirectError(error)) throw error;
    console.error("getApartmentsAction error:", error);
    return [];
  }
}

// --- FOTOS EXCLUSIVAS (CLIENTES TELEGRAM) ---

export async function getPrivatePhotosAction(
  empleadaId: string,
): Promise<{ id: string; url: string; orden: number }[]> {
  try {
    return await apiFetch<any[]>(`/employee-photos/private/${empleadaId}`, {
      authenticated: true,
    });
  } catch (error) {
    if (isRedirectError(error)) throw error;
    console.error("getPrivatePhotosAction error:", error);
    return [];
  }
}

export async function addPrivatePhotoAction(
  empleadaId: string,
  url: string,
  orden = 0,
): Promise<any> {
  const data = await apiFetch<any>("/employee-photos/private", {
    method: "POST",
    body: JSON.stringify({ empleadaId, url, orden }),
    authenticated: true,
  });
  revalidatePath("/admin/modelos");
  return data;
}

export async function deletePrivatePhotoAction(id: string): Promise<void> {
  await apiFetch<void>(`/employee-photos/private/${id}`, {
    method: "DELETE",
    authenticated: true,
  });
  revalidatePath("/admin/modelos");
}

// --- CONTENIDO SEMANAL (VALIDAR CONTENIDO SEMANAL) ---

export async function getWeeklySubmissionsAction(
  empleadaId: string,
  onlyPending = false,
): Promise<any[]> {
  try {
    return await apiFetch<any[]>(
      `/weekly-content/employee/${empleadaId}?onlyPending=${onlyPending}`,
      { authenticated: true },
    );
  } catch (error) {
    if (isRedirectError(error)) throw error;
    console.error("getWeeklySubmissionsAction error:", error);
    return [];
  }
}

export async function reviewWeeklySubmissionAction(
  submissionId: string,
  action: "aprobar_publica" | "aprobar_privada" | "rechazar",
): Promise<any> {
  const data = await apiFetch<any>(
    `/weekly-content/submissions/${submissionId}/review`,
    {
      method: "POST",
      body: JSON.stringify({ action }),
      authenticated: true,
    },
  );
  revalidatePath("/");
  revalidatePath("/admin/modelos");
  return data;
}
