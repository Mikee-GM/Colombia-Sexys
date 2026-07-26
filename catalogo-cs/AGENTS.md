<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Reglas del Proyecto — Colombia Sexys

## Reglas Fundamentales

1. **CERO EMOJIS.** No usar emojis en ningun texto, componente, notificacion, comentario o mensaje de la aplicacion. Esto es absolutamente innegociable.
2. **Profesionalismo total.** El tono de toda la aplicacion debe ser sofisticado, elegante y premium.
3. **Idioma: Espanol.** Toda la interfaz de usuario esta en espanol.
4. **Reutilización de componentes.** Utilizar componentes genéricos siempre que exista la oportunidad (ej. `InputField`, `SearchBar`, `CreateButton`) para evitar la redundancia de código y estilos.

## Tipografia

- **Titulos y encabezados:** Cormorant Garamond (serif, elegante). Pesos: 300, 400, 500, 600, 700.
- **Cuerpo de texto, etiquetas, botones:** Inter (sans-serif, limpia). Pesos: 300, 400, 500, 600, 700.
- **Consistencia absoluta:** Nunca usar fuentes del sistema por defecto. Siempre usar las fuentes definidas.

## Paleta de Colores

- **Negro principal:** #000000
- **Negro suave:** #050505, #0A0A0A
- **Dorado principal:** #C5A55A
- **Dorado claro:** #D4AF37
- **Dorado luminoso:** #E8D5A3
- **Dorado oscuro:** #8B7635
- **Zinc (acentos neutros):** zinc-800, zinc-700, zinc-600, zinc-500
- **Blanco (texto sobre negro):** #FFFFFF, #F5F5F5

## Diseno

- **Mobile-first siempre.** La experiencia en celulares es la prioridad.
- **Scroll natural.** No usar snap-scroll. Scroll normal de toda la vida.
- **Sin fondo blanco.** El fondo siempre es negro o casi negro.
- **Bordes y acentos en dorado.** Los bordes decorativos, hover states, y acentos usan dorado.
- **Botones:** Bordes dorados sobre fondo negro, hover con fondo dorado y texto negro.

## Arquitectura

- **Framework:** Next.js (App Router) + React + TypeScript
- **Estilos:** Tailwind CSS 4
- **Animaciones:** Framer Motion
- **Base de datos:** Firebase Firestore (datos de modelos)
- **Almacenamiento de imagenes:** Cloudflare R2 (via API Routes de Next.js)
- **Autenticacion admin:** Firebase Auth
- **Notificaciones:** Sonner
