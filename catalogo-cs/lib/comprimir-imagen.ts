import imageCompression from "browser-image-compression";

/**
 * Deja una imagen del telefono en un tamaño que se pueda subir.
 *
 * Una captura de pantalla de un movil moderno pesa entre 5 y 15 MB, y el
 * formulario mandaba el archivo tal cual: el servidor la rechazaba con un
 * "Validation failed (current file size is 14429472...)" en ingles, y la
 * persona que subia la captura de su viaje no tenia forma de saber que hacer
 * con eso. Comprimir aqui es lo unico que arregla el problema de raiz: subir 14
 * MB por una captura de una tarifa es tirar los datos moviles de quien la manda
 * y el ancho de banda del servidor.
 *
 * Los valores estan pensados para una CAPTURA, no para una foto de catalogo:
 * lo que hay dentro son cifras y letras pequeñas --la tarifa, la placa, el
 * nombre del conductor-- y machacarlas hasta 1080 px las deja ilegibles justo
 * cuando alguien tiene que leerlas para cuadrar una cuenta.
 */
const CAPTURA = {
  maxSizeMB: 1.5,
  maxWidthOrHeight: 1600,
  useWebWorker: true,
};

/** Una foto normal, donde no hay texto pequeño que preservar. */
const FOTO = {
  maxSizeMB: 1,
  maxWidthOrHeight: 1920,
  useWebWorker: true,
};

/**
 * Comprime y, si algo falla, devuelve el archivo original.
 *
 * Un fallo de la compresion no puede impedir la subida: el servidor sigue
 * teniendo su propio limite, asi que en el peor caso pasa lo que pasaba antes
 * --el archivo grande llega y se rechaza-- y nunca menos que eso.
 */
async function comprimir(
  archivo: File,
  opciones: typeof CAPTURA,
): Promise<File> {
  if (!archivo.type.startsWith("image/")) return archivo;
  try {
    const comprimido = await imageCompression(archivo, opciones);
    // Hay imagenes que ya estan por debajo del objetivo y salen mas grandes al
    // recodificarlas; en ese caso no se gana nada.
    return comprimido.size < archivo.size ? comprimido : archivo;
  } catch (error) {
    console.error("No se pudo comprimir la imagen, se sube tal cual:", error);
    return archivo;
  }
}

/** Para capturas de pantalla, donde el texto pequeño tiene que seguir legible. */
export function comprimirCaptura(archivo: File): Promise<File> {
  return comprimir(archivo, CAPTURA);
}

/** Para fotos, donde solo importa que se vean bien. */
export function comprimirFoto(archivo: File): Promise<File> {
  return comprimir(archivo, FOTO);
}
