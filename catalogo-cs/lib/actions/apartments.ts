"use server";

import { revalidatePath } from "next/cache";
import { apiFetch } from "@/lib/api-server";

export interface ApartmentEmployee {
  id: string;
  nombreArtistico: string;
  nombreReal?: string;
  fotoPerfilUrl?: string | null;
  disponible?: boolean;
}

export interface Apartment {
  id: string;
  nombre: string;
  direccion: string | null;
  descripcion: string | null;
  ubicacionLat: number | null;
  ubicacionLng: number | null;
  createdAt: string;
  empleadas?: ApartmentEmployee[];
}

export interface ApartmentInput {
  nombre: string;
  direccion?: string | null;
  descripcion?: string | null;
  ubicacionLat?: number | null;
  ubicacionLng?: number | null;
}

export async function getApartmentsAction(): Promise<Apartment[]> {
  try {
    const data = await apiFetch<Apartment[]>("/apartments", {
      authenticated: true,
    });
    return (data || []).map((item) => ({
      ...item,
      ubicacionLat:
        item.ubicacionLat !== null && item.ubicacionLat !== undefined
          ? Number(item.ubicacionLat)
          : null,
      ubicacionLng:
        item.ubicacionLng !== null && item.ubicacionLng !== undefined
          ? Number(item.ubicacionLng)
          : null,
    }));
  } catch (error) {
    console.error("getApartmentsAction error:", error);
    return [];
  }
}

export async function getApartmentAction(id: string): Promise<Apartment | null> {
  try {
    const item = await apiFetch<Apartment>(`/apartments/${id}`, {
      authenticated: true,
    });
    return {
      ...item,
      ubicacionLat:
        item.ubicacionLat !== null && item.ubicacionLat !== undefined
          ? Number(item.ubicacionLat)
          : null,
      ubicacionLng:
        item.ubicacionLng !== null && item.ubicacionLng !== undefined
          ? Number(item.ubicacionLng)
          : null,
    };
  } catch (error) {
    console.error("getApartmentAction error:", error);
    return null;
  }
}

export async function createApartmentAction(input: ApartmentInput): Promise<Apartment> {
  const payload = {
    nombre: input.nombre.trim(),
    direccion: input.direccion?.trim() || null,
    descripcion: input.descripcion?.trim() || null,
    ubicacionLat:
      input.ubicacionLat !== undefined && input.ubicacionLat !== null
        ? Number(input.ubicacionLat)
        : null,
    ubicacionLng:
      input.ubicacionLng !== undefined && input.ubicacionLng !== null
        ? Number(input.ubicacionLng)
        : null,
  };

  const result = await apiFetch<Apartment>("/apartments", {
    method: "POST",
    body: JSON.stringify(payload),
    authenticated: true,
  });

  revalidatePath("/admin/departamentos");
  revalidatePath("/admin/apartments");
  revalidatePath("/admin/modelos");
  return result;
}

export async function updateApartmentAction(
  id: string,
  input: Partial<ApartmentInput>,
): Promise<Apartment> {
  const payload: Record<string, any> = {};

  if (input.nombre !== undefined) payload.nombre = input.nombre.trim();
  if (input.direccion !== undefined) payload.direccion = input.direccion?.trim() || null;
  if (input.descripcion !== undefined) payload.descripcion = input.descripcion?.trim() || null;
  if (input.ubicacionLat !== undefined) {
    payload.ubicacionLat = input.ubicacionLat !== null ? Number(input.ubicacionLat) : null;
  }
  if (input.ubicacionLng !== undefined) {
    payload.ubicacionLng = input.ubicacionLng !== null ? Number(input.ubicacionLng) : null;
  }

  const result = await apiFetch<Apartment>(`/apartments/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
    authenticated: true,
  });

  revalidatePath("/admin/departamentos");
  revalidatePath("/admin/apartments");
  revalidatePath("/admin/modelos");
  return result;
}

export async function deleteApartmentAction(id: string): Promise<void> {
  await apiFetch<void>(`/apartments/${id}`, {
    method: "DELETE",
    authenticated: true,
  });

  revalidatePath("/admin/departamentos");
  revalidatePath("/admin/apartments");
  revalidatePath("/admin/modelos");
}
