"use server";

import { apiFetch } from "@/lib/api-server";
import { isRedirectError } from "@/lib/auth";

export async function uploadImageAction(formData: FormData) {
  try {
    const data = await apiFetch<any>("/upload", {
      method: "POST",
      body: formData,
      authenticated: true,
    });
    return data.url as string;
  } catch (error: any) {
    if (isRedirectError(error)) throw error;
    console.error("uploadImageAction error:", error);
    throw new Error(error.message || "Error de conexión al subir la imagen");
  }
}

export async function deleteImageAction(url: string) {
  try {
    return await apiFetch<any>("/upload/delete", {
      method: "POST",
      body: JSON.stringify({ url }),
      authenticated: true,
    });
  } catch (error: any) {
    if (isRedirectError(error)) throw error;
    console.error("deleteImageAction error:", error);
    throw new Error(error.message || "Error de conexión al eliminar la imagen");
  }
}

export async function uploadImagesAction(formData: FormData) {
  try {
    const files = formData.getAll("files") as File[];

    // Subir todas las fotos en paralelo para reducir el tiempo total
    const uploadPromises = files.map((file) => {
      const singleFormData = new FormData();
      singleFormData.append("file", file);

      return apiFetch<any>("/upload", {
        method: "POST",
        body: singleFormData,
        authenticated: true,
      }).then((data) => data.url as string);
    });

    return await Promise.all(uploadPromises);
  } catch (error: any) {
    if (isRedirectError(error)) throw error;
    console.error("uploadImagesAction error:", error);
    throw new Error(error.message || "Error al subir las imágenes");
  }
}

