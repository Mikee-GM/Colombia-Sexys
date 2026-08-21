"use client";

/**
 * Fallbacks compartidos por los `loading.tsx` y `error.tsx` de las rutas.
 * Se mantienen sin dependencias para que el bundle de los limites de ruta sea
 * minimo y puedan pintarse de inmediato.
 */

/** Esqueleto neutro mientras el servidor resuelve los datos de una ruta. */
export function RouteLoading({ label = "Cargando" }: { label?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-[50vh] w-full flex-col items-center justify-center gap-4"
    >
      <div className="flex gap-2">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-2 w-2 animate-pulse rounded-full bg-[#C5A55A]/40"
            style={{ animationDelay: `${i * 200}ms` }}
          />
        ))}
      </div>
      <span className="text-[10px] font-semibold uppercase tracking-[0.35em] text-zinc-600">
        {label}
      </span>
    </div>
  );
}

interface RouteErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
  title?: string;
}

/** Pantalla de error recuperable: siempre ofrece reintentar. */
export function RouteError({
  error,
  reset,
  title = "No pudimos cargar esta seccion",
}: RouteErrorProps) {
  return (
    <div className="flex min-h-[50vh] w-full flex-col items-center justify-center gap-5 px-6 text-center">
      <h2 className="font-heading text-2xl font-semibold tracking-wide text-white">
        {title}
      </h2>
      <p className="max-w-md text-sm font-light leading-relaxed text-zinc-500">
        {error.message || "Ocurrio un problema inesperado."}
      </p>
      {error.digest ? (
        <p className="font-mono text-[10px] text-zinc-700">
          Referencia: {error.digest}
        </p>
      ) : null}
      <button
        type="button"
        onClick={reset}
        className="border border-[#C5A55A] px-6 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#C5A55A] transition-colors hover:bg-[#C5A55A] hover:text-black"
      >
        Reintentar
      </button>
    </div>
  );
}
