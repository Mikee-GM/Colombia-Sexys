"use server";

import { apiFetch } from "@/lib/api-server";
import { isRedirectError } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const EmployeeSchema = z.object({
  email: z.string().email("Correo electrónico no válido"),
  password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres"),
  telegramChatId: z.string().optional().nullable(),
  nombreReal: z.string().min(2, "El nombre real es obligatorio"),
  nombreArtistico: z.string().min(2, "El nombre artístico es obligatorio"),
  slugCatalogo: z.string().min(2, "El slug es obligatorio"),
  fotoPerfilUrl: z.string().url("URL de foto de perfil no válida").optional().or(z.literal("")),
  descripcion: z.string().optional(),
  precioBaseHora: z.coerce.number().min(0, "El precio base debe ser mayor o igual a 0"),
  disponible: z.boolean().optional(),
  catalogoActivo: z.boolean().optional(),
  ubicacionLat: z.coerce.number().optional().nullable(),
  ubicacionLng: z.coerce.number().optional().nullable(),
});

const DriverSchema = z.object({
  email: z.string().email("Correo electrónico no válido"),
  password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres"),
  telegramChatId: z.string().optional().nullable(),
  nombre: z.string().min(2, "El nombre es obligatorio"),
  telefono: z.string().min(6, "El teléfono es obligatorio"),
  disponible: z.boolean().optional(),
  ubicacionLat: z.coerce.number().optional().nullable(),
  ubicacionLng: z.coerce.number().optional().nullable(),
});

export async function createEmployeeAction(data: unknown): Promise<{ success: boolean; data?: { id: string }; error?: string | null }> {
  try {
    const parsed = EmployeeSchema.safeParse(data);
    if (!parsed.success) {
      const errorMsg = parsed.error.issues.map((e) => e.message).join(", ");
      return { success: false, error: `Datos no válidos: ${errorMsg}` };
    }

    const validData = parsed.data;
    const formattedData = {
      email: validData.email,
      password: validData.password,
      telegramChatId: validData.telegramChatId || undefined,
      nombreReal: validData.nombreReal,
      nombreArtistico: validData.nombreArtistico,
      slugCatalogo: validData.slugCatalogo,
      fotoPerfilUrl: validData.fotoPerfilUrl || undefined,
      descripcion: validData.descripcion || undefined,
      precioBaseHora: validData.precioBaseHora,
      disponible: validData.disponible === true,
      catalogoActivo: validData.catalogoActivo === true,
      ubicacionLat: validData.ubicacionLat || undefined,
      ubicacionLng: validData.ubicacionLng || undefined,
    };

    const res = await apiFetch<{ id: string }>("/employees", {
      method: "POST",
      body: JSON.stringify(formattedData),
    });

    revalidatePath("/employees");
    return { success: true, data: res, error: null };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    const message = error instanceof Error ? error.message : "Error al crear la empleada";
    return { success: false, error: message };
  }
}

export async function createDriverAction(data: unknown): Promise<{ success: boolean; data?: { id: string }; error?: string | null }> {
  try {
    const parsed = DriverSchema.safeParse(data);
    if (!parsed.success) {
      const errorMsg = parsed.error.issues.map((e) => e.message).join(", ");
      return { success: false, error: `Datos no válidos: ${errorMsg}` };
    }

    const validData = parsed.data;
    const formattedData = {
      email: validData.email,
      password: validData.password,
      telegramChatId: validData.telegramChatId || undefined,
      nombre: validData.nombre,
      telefono: validData.telefono,
      disponible: validData.disponible === true,
      ubicacionLat: validData.ubicacionLat || undefined,
      ubicacionLng: validData.ubicacionLng || undefined,
    };

    const res = await apiFetch<{ id: string }>("/drivers", {
      method: "POST",
      body: JSON.stringify(formattedData),
    });

    revalidatePath("/drivers");
    return { success: true, data: res, error: null };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    const message = error instanceof Error ? error.message : "Error al crear el chofer";
    return { success: false, error: message };
  }
}

