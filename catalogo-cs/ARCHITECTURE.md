# Arquitectura del Proyecto — Colombia Sexys

Este documento describe la arquitectura, stack tecnológico y flujo de datos del proyecto "Colombia Sexys". Su propósito es proveer contexto completo a futuros desarrolladores que deseen escalar, modificar o migrar el código.

---

## 1. Resumen General

**Colombia Sexys** es una aplicación web tipo catálogo de modelos orientada al mercado premium. Fue diseñada desde cero con un enfoque *mobile-first* y una identidad visual editorial (luxury/Vogue). Consta de dos partes principales:
1. **Frontend Público:** Una *landing page* de alto impacto (Hero con video) y un catálogo navegable de modelos (grids y modales pre-cargados para máxima velocidad).
2. **Backend & Panel Admin:** Un área de gestión privada protegida por JWT donde los administradores pueden hacer un CRUD completo de modelos, incluyendo compresión agresiva y subida de imágenes a un servicio Cloud Edge.

---

## 2. Tecnologías Principales (Tech Stack)

### Frontend (Client-side)
- **Framework:** [Next.js 15+](https://nextjs.org/) utilizando el App Router (`app/`).
- **Librería UI:** [React 19](https://react.dev/).
- **Estilos:** [Tailwind CSS 4](https://tailwindcss.com/) configurado sin clases arbitrarias, utilizando un `globals.css` estricto para definir colores corporativos (dorados y negros).
- **Animaciones:** [Framer Motion](https://www.framer.com/motion/) para transiciones de estado, sliders y micro-animaciones en botones y galerías.
- **Optimización de Imágenes:** Compresión pesada en cliente mediante `browser-image-compression` antes del *upload* a la red.
- **Tipografía:** Importadas directamente desde `next/font/google`. Títulos en **Cinzel** y cuerpo de texto en **Montserrat**.

### Backend (Server-side)
- **Base de Datos:** [MongoDB](https://www.mongodb.com/) (Atlas) mediante la librería `mongoose`. Toda la persistencia textual reside en la colección `modelos`.
- **Almacenamiento de Medios:** [Cloudflare R2](https://www.cloudflare.com/es-es/developer-platform/r2/) (API compatible con Amazon S3). Integrado nativamente usando `@aws-sdk/client-s3`.
- **Autenticación (Admin):** Solución `serverless` custom utilizando **JWT** (`jose`) y manejo seguro de **Cookies HTTP-Only** para evitar dependencias externas como Firebase Auth o Auth.js (NextAuth). Todo el acceso administrativo está encriptado bajo secreto nativo.
- **API Routes:** Todo el tráfico (CRUD de BD, firmas S3/R2 y Auth) se procesa a través del framework Route Handlers (`app/api/...`) integrados en el Next.js Server.

---

## 3. Estructura de Directorios

- **`app/`**: Sistema de enrutamiento principal (App Router).
  - `page.tsx`: Landing pública y conexión a la base de datos para recuperar modelos (Server Rendered al momento del despliegue o por petición).
  - `admin/`: Rutas privadas del panel administrativo. Incluye layout con protecciones y visualización de la data cruda.
  - `api/`: 
    - `auth/`: Generación, validación y eliminación de Cookies JWT.
    - `modelos/`: Endpoints `GET`, `POST`, `PUT`, `DELETE` para interactuar con MongoDB.
    - `upload/` & `delete-image/`: Streams de subida binaria directos hacia Cloudflare R2 sin saturar memoria.
- **`components/`**: Componentes reutilizables.
  - `Hero.tsx`: Cabecera editorial con video `background` y carrusel pre-load integrado.
  - `ModelGrid.tsx`: Grilla responsiva.
  - `ModelProfile.tsx`: Lightbox/Modal de cada modelo con barra de scroll independiente para textos extensos.
  - `admin/`: Archivos altamente interactivos, como `ModelModal.tsx` (formulario complejo con previsualización de imágenes).
- **`lib/`**: Archivos de infraestructura *core*.
  - `api.ts`: Helper functions del cliente (Frontend) para comunicarse con la carpeta `app/api`.
  - `mongodb.ts`: Patrón Singleton para mantener la conexión a Mongoose viva durante hot-reloads o llamadas *serverless*.
  - `auth.ts`: Utilidades JWT (`jose`).
  - `r2.ts`: Cliente de AWS SDK inicializado hacia Cloudflare.
- **`models/`**:
  - `Modelo.ts`: Esquema de datos estructurado en Mongoose. Define tipos estrictos (nombre, fotos, linkX, etc).

---

## 4. Notas Clave para Desarrolladores (Handoff)

### 4.1. Filosofía de Renderizado y Carga
El proyecto está optimizado para evitar "pantallazos" en carga.
- En el modal de perfiles (`ModelProfile.tsx`), las imágenes se inyectan en el DOM con `opacity-0` de manera invisible en el primer render, asegurando que el navegador las pre-descargue (pre-load) instantáneamente, logrando una navegación entre fotos con "cero delay".
- El orden del catálogo es 100% aleatorio. Se procesa en el backend (`/api/modelos`) mediante un script nativo `Math.random()` sobre el arreglo resuelto por MongoDB.

### 4.2. Variables de Entorno (`.env.local`)
Las dependencias externas son fundamentales para ejecutar el proyecto en otro entorno.
```env
# MONGODB
MONGODB_URI=mongodb+srv://...

# AUTH ADMIN
ADMIN_EMAIL=admin@colombiasexys.com
ADMIN_PASSWORD=...
JWT_SECRET=...

# CLOUDFLARE R2
R2_ENDPOINT=https://<ID>.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET_NAME=catalogo-cs
R2_PUBLIC_URL=https://pub-xxxxxx.r2.dev
```

### 4.3. Reglas Críticas de Diseño
1. **Ausencia de Emojis:** El proyecto tiene una estricta filosofía de no contener emojis en textos ni botones. Es un branding serio y adulto.
2. **Botones e Interfaces:** Evitar formas geométricas tradicionales sin sentido (plantillas redondeadas genéricas). Todo botón debe asemejarse a una revista de alta moda (borders finos, letras espaciadas con uppercase tracking alto, y micro-transiciones lujosas en hover).
3. **Escalabilidad del texto (`whitespace-pre-wrap`):** Todos los componentes que renderizan biografía (`descripcion`) están preparados para soportar formatos de texto enormes (menús, tarifas y extras separados por salto de línea manual). Nunca remover esa propiedad en CSS.

---
*Desarrollado y estructurado por Antigravity (Google DeepMind) en 2026.*
