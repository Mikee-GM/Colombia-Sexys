"use server";

import { isRedirectError } from "@/lib/auth";
import type { Modelo, ModeloPayload } from "@/types";
import { revalidatePath, revalidateTag } from "next/cache";
import { apiFetch } from "@/lib/api-server";
import { mapToModelo } from "@/lib/data/modelos-mapper";
import { CATALOG_CACHE_TAG } from "@/lib/data/catalog";

// El catalogo publico se lee con `getCatalogModelos()` desde Server
// Components (ver lib/data/catalog.ts). No se expone como Server Action:
// serian POST secuenciales, no cacheables, y cada export "use server" publica
// un endpoint aunque nadie lo llame.

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
    estiloHabla: (payload.estiloHabla || "").trim() || undefined,
    politicaBesos: payload.politicaBesos || null,
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
      speechPersonalizado: (ext.speechPersonalizado || "").trim() || undefined,
    })),
  };

  const data = await apiFetch<any>("/employees", {
    method: "POST",
    body: JSON.stringify(createDto),
    authenticated: true,
  });

  revalidateTag(CATALOG_CACHE_TAG);
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
    estiloHabla: (payload.estiloHabla || "").trim() || undefined,
    politicaBesos: payload.politicaBesos || null,
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
      speechPersonalizado: (ext.speechPersonalizado || "").trim() || undefined,
    })),
  };

  const data = await apiFetch<any>(`/employees/${id}`, {
    method: "PATCH",
    body: JSON.stringify(updateDto),
    authenticated: true,
  });

  revalidateTag(CATALOG_CACHE_TAG);
  revalidatePath("/");
  revalidatePath("/admin/modelos");
  return mapToModelo(data);
}

export async function deleteModeloAction(id: string): Promise<void> {
  await apiFetch<void>(`/employees/${id}`, {
    method: "DELETE",
    authenticated: true,
  });

  revalidateTag(CATALOG_CACHE_TAG);
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
  revalidateTag(CATALOG_CACHE_TAG);
  revalidatePath("/");
  revalidatePath("/admin/modelos");
  return data;
}
