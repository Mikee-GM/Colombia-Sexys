"use client";

/**
 * Ultimo recinto de seguridad: solo se activa si falla el layout raiz, por eso
 * tiene que renderizar sus propias etiquetas <html> y <body>.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="es">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1.25rem",
          backgroundColor: "#000000",
          color: "#ffffff",
          fontFamily: "system-ui, sans-serif",
          textAlign: "center",
          padding: "1.5rem",
        }}
      >
        <h1 style={{ fontSize: "1.5rem", fontWeight: 600, margin: 0 }}>
          Algo salio mal
        </h1>
        <p style={{ color: "#a1a1aa", fontSize: "0.875rem", margin: 0 }}>
          {error.digest ? `Referencia: ${error.digest}` : "Intenta de nuevo."}
        </p>
        <button
          type="button"
          onClick={reset}
          style={{
            border: "1px solid #C5A55A",
            background: "transparent",
            color: "#C5A55A",
            padding: "0.5rem 1.5rem",
            fontSize: "0.75rem",
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            cursor: "pointer",
          }}
        >
          Reintentar
        </button>
      </body>
    </html>
  );
}
