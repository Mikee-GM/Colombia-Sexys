---
trigger: always_on
---

# RULES.md — Next.js Best Practices

## 1. Estructura del Proyecto

- **`src/` como raíz de código**: separar `app/`, `components/`, `lib/`, `hooks/`, `types/`, `config/` dentro de `src/`, dejando la raíz del repo solo para archivos de configuración (`next.config.js`, `package.json`, `.env*`) .
- **Route Groups para organizar sin afectar URLs**: usar `(marketing)`, `(dashboard)`, `(auth)` para agrupar rutas relacionadas bajo un mismo layout sin que el paréntesis aparezca en la URL final .
- **Colocation por ruta**: cada `page.tsx` puede tener su propia carpeta `_components/`, `_lib/`, `_hooks/` con el prefijo `_` para que Next.js las excluya del routing; esto mantiene junto lo que cambia junto.
- **Componentes verdaderamente compartidos** (usados en 3+ rutas o layouts) suben a `components/ui/` (primitivos) y `components/shared/` (compuestos), nunca se duplican entre rutas .
- **`lib/` dividido por responsabilidad**: `lib/data/` (fetching y queries), `lib/actions/` (Server Actions), `lib/validations/` (schemas de zod), `lib/utils/` (helpers puros). Un `page.tsx` nunca contiene lógica de negocio inline.
- **`types/` centralizado** para tipos compartidos entre rutas; tipos específicos de un componente viven junto a ese componente.

## 2. Server Components vs Client Components

- **Todo es Server Component por defecto**; solo se agrega `"use client"` cuando el componente necesita estado, efectos, event handlers o APIs del navegador .
- **El límite cliente/servidor debe estar lo más abajo posible en el árbol**: extraer el botón interactivo a su propio archivo cliente pequeño, en lugar de marcar toda una página como `"use client"` por un solo elemento interactivo.
- **Nada server-only cruza al cliente**: variables de entorno privadas, SDKs con API keys, clientes de base de datos, todo vive exclusivamente en Server Components, Server Actions o Route Handlers.
- **Composición explícita**: cuando un Client Component necesita contenido de servidor, ese contenido se pasa como `children`/`props`, nunca se convierte el subárbol completo en cliente para resolver una sola dependencia interactiva.
- Verificar regularmente con `@next/bundle-analyzer` que no se filtraron dependencias pesadas o server-only al bundle del cliente por un import mal ubicado.

## 3. Data Fetching

- **Fetch nativo en Server Components** (`fetch()` con las opciones de cache de Next.js) o llamadas directas a `lib/data/*.ts`; nunca usar `useEffect` + `useState` para cargar datos iniciales de una página, ese patrón pertenece al viejo Pages Router .
- **Paralelizar fetches independientes** con `Promise.all` cuando una página necesita múltiples fuentes de datos sin dependencia entre sí, evitando cascadas de espera innecesarias .
- **Streaming con Suspense**: usar `loading.tsx` y `<Suspense>` por segmento para mostrar contenido progresivamente en lugar de bloquear la página completa hasta que todos los datos resuelvan.
- **Server Actions (`"use server"`) para mutaciones simples**: formularios y escrituras van directo a Server Actions; reservar Route Handlers (`route.ts`) para APIs que consume algo externo a tu propia UI (webhooks, integraciones de terceros).

## 4. Caching y Revalidación

- **Conocer los niveles de cache de Next.js** (Request Memoization, Data Cache, Full Route Cache, Router Cache) antes de desactivar cache globalmente; aplicar `cache: 'no-store'` o `revalidate` de forma quirúrgica por fetch, no como configuración general del proyecto .
- **Invalidar con `revalidatePath()`/`revalidateTag()`** justo después de cada Server Action que muta datos, en lugar de forzar `no-store` en todos los fetches relacionados "por si acaso".
- **ISR (`revalidate: N`)** para contenido semi-estático (catálogos, artículos, landing pages) en lugar de SSR completo en cada request.
- **Nunca cache compartido para datos de usuario/sesión**: cualquier fetch con datos privados usa `cache: 'no-store'` explícitamente, sin excepciones.

## 5. Layouts, Rutas y Metadata

- **Layouts anidados para UI persistente** (navbar, sidebar, footer) que no debe re-renderizarse en cada navegación dentro del mismo segmento.
- **`generateMetadata()` dinámico** en páginas cuyo SEO depende de datos (producto, artículo, perfil); metadata estática solo para páginas verdaderamente fijas.
- **`error.tsx` y `not-found.tsx` por segmento**, con mensajes contextuales, en lugar de un único error boundary genérico para toda la app.
- **Middleware (`middleware.ts`) para auth/redirects a nivel edge**, evitando repetir la misma verificación de sesión en cada página protegida individualmente.

## 6. Formularios y Mutaciones

- **Validación server-side obligatoria en cada Server Action** con `zod` (o similar), sin confiar únicamente en la validación del cliente; el Server Action es técnicamente un endpoint expuesto.
- **`useFormStatus`/`useActionState`** para estados de carga/error de formularios en lugar de manejar `isLoading` manual con `useState` cuando ya se usa un Server Action.
- **Progressive enhancement**: los formularios críticos deben funcionar mediante `<form action={...}>` nativo incluso si el JavaScript del cliente falla en cargar.

## 7. Manejo de Estado

- **Estado de servidor vive en el servidor**: no dupliques en el cliente datos que ya vienen de un Server Component; si necesitas revalidar tras una acción, usa `revalidatePath`/`router.refresh()` en lugar de sincronizar estado manualmente.
- **Estado de UI local con `useState`/`useReducer`**; estado compartido entre componentes cliente distantes con Context o una librería ligera (Zustand/Jotai), evitando Redux salvo que la complejidad real lo justifique.
- **URL como fuente de verdad para estado de filtros/paginación** (`searchParams`), no `useState` local, para que la UI sea compartible por link y sobreviva a un refresh.

## 8. Performance

- **`next/image`** siempre, nunca `<img>` plano, para optimización automática y prevención de layout shift.
- **`next/font`** para fuentes, evitando `<link>` externo que bloquea el render.
- **`next/dynamic`** para componentes pesados no críticos en el primer render (modales, editores ricos, gráficas, librerías de terceros grandes).
- **Analizar el bundle regularmente** con `@next/bundle-analyzer` para detectar dependencias que inflan el JS del cliente innecesariamente.

## 9. Seguridad

- **Nunca prefijo `NEXT_PUBLIC_` en secrets**: solo variables intencionalmente públicas llevan ese prefijo; todo secret vive sin prefijo y se usa exclusivamente server-side.
- **Sanitizar todo input en Server Actions y Route Handlers** con el mismo rigor que un endpoint de backend tradicional, ya que ambos son superficies de ataque reales.
- **`dangerouslySetInnerHTML` siempre sanitizado** (DOMPurify o similar) cuando el HTML viene de una fuente externa (CMS, IA, usuario).
- **Headers de seguridad** (CSP, `X-Frame-Options`, etc.) configurados en `next.config.js` o middleware desde el inicio del proyecto, no como parche posterior.

## 10. Testing

- **Unit tests (Vitest/Jest)** para funciones puras y lógica en `lib/`.
- **Component tests (React Testing Library)** enfocados en comportamiento visible, no en detalles de implementación interna.
- **E2E (Playwright)** para flujos críticos completos (login, checkout, formulario principal), corriendo contra un build real del proyecto.

## 11. Estilo de Código

- **ESLint + Prettier configurados desde el inicio**, con las reglas oficiales de Next.js (`eslint-config-next`) como base.
- **Nombrado consistente**: `page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx` siguiendo las convenciones nativas del framework; componentes propios en PascalCase, hooks con prefijo `use`.
- **Un componente, una responsabilidad**: si un archivo mezcla fetching, lógica de negocio y presentación, dividirlo en Server Component (fetch) + componente de presentación puro.
