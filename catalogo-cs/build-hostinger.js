/**
 * build-hostinger.js
 *
 * Script de post-compilacion para preparar el directorio standalone de Next.js
 * para despliegue en Hostinger (Node.js).
 *
 * Responsabilidades:
 *   1. Verificar que .next/standalone existe (resultado de "next build").
 *   2. Copiar public/ -> .next/standalone/public/
 *   3. Verificar o crear .next/standalone/.next/
 *   4. Copiar .next/static/ -> .next/standalone/.next/static/
 *
 * Uso: next build && node build-hostinger.js
 */

const fs = require("fs");
const path = require("path");

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

const SEPARATOR = "------------------------------------------------------------";

function log(message) {
  console.log("[Hostinger Build]  " + message);
}

function logSection(title) {
  console.log("");
  console.log(SEPARATOR);
  log(title);
  console.log(SEPARATOR);
}

/**
 * Copia de forma recursiva todos los archivos y subdirectorios desde src a dest.
 * Compatible con Windows y macOS/Linux gracias a path.join.
 * Devuelve el numero total de archivos copiados.
 */
function copyRecursive(src, dest) {
  let fileCount = 0;

  if (!fs.existsSync(src)) {
    log("ADVERTENCIA: El directorio origen no existe: " + src);
    return fileCount;
  }

  fs.mkdirSync(dest, { recursive: true });

  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      fileCount += copyRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
      fileCount++;
    }
  }

  return fileCount;
}

// ---------------------------------------------------------------------------
// Rutas del proyecto
// ---------------------------------------------------------------------------

const ROOT_DIR = __dirname;
const STANDALONE_DIR = path.join(ROOT_DIR, ".next", "standalone");
const STANDALONE_NEXT_DIR = path.join(STANDALONE_DIR, ".next");
const PUBLIC_SRC = path.join(ROOT_DIR, "public");
const PUBLIC_DEST = path.join(STANDALONE_DIR, "public");
const STATIC_SRC = path.join(ROOT_DIR, ".next", "static");
const STATIC_DEST = path.join(STANDALONE_NEXT_DIR, "static");

// ---------------------------------------------------------------------------
// Ejecucion principal
// ---------------------------------------------------------------------------

function main() {
  logSection("INICIO - Preparacion del build standalone para Hostinger");

  // -- Paso 1: Verificar que .next/standalone existe -----------------------
  log("Paso 1/4 - Verificando directorio .next/standalone ...");

  if (!fs.existsSync(STANDALONE_DIR)) {
    console.error("");
    console.error(SEPARATOR);
    console.error(
      "[Hostinger Build]  ERROR: No se encontro el directorio .next/standalone."
    );
    console.error(
      "[Hostinger Build]  Asegurate de ejecutar 'next build' primero y de que"
    );
    console.error(
      "[Hostinger Build]  next.config tiene output: 'standalone'."
    );
    console.error(SEPARATOR);
    process.exit(1);
  }

  log("Directorio .next/standalone encontrado correctamente.");

  // -- Paso 2: Copiar public/ -> .next/standalone/public/ ------------------
  log("Paso 2/4 - Copiando public/ -> .next/standalone/public/ ...");

  const publicCount = copyRecursive(PUBLIC_SRC, PUBLIC_DEST);
  log("Archivos copiados desde public/: " + publicCount);

  // -- Paso 3: Verificar o crear .next/standalone/.next/ -------------------
  log("Paso 3/4 - Verificando directorio .next/standalone/.next/ ...");

  if (!fs.existsSync(STANDALONE_NEXT_DIR)) {
    fs.mkdirSync(STANDALONE_NEXT_DIR, { recursive: true });
    log("Directorio .next/standalone/.next/ creado.");
  } else {
    log("Directorio .next/standalone/.next/ ya existe.");
  }

  // -- Paso 4: Copiar .next/static/ -> .next/standalone/.next/static/ ------
  log("Paso 4/4 - Copiando .next/static/ -> .next/standalone/.next/static/ ...");

  const staticCount = copyRecursive(STATIC_SRC, STATIC_DEST);
  log("Archivos copiados desde .next/static/: " + staticCount);

  // -- Resumen final -------------------------------------------------------
  logSection("COMPLETADO");
  log("Total de archivos procesados: " + (publicCount + staticCount));
  log("El directorio .next/standalone esta listo para despliegue.");
  log("Sube el contenido de .next/standalone/ a tu servidor en Hostinger.");
  console.log(SEPARATOR);
  console.log("");
}

main();
