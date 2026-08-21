"use client";

import { RouteError } from "@/components/ui/route-fallbacks";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <RouteError
      error={error}
      reset={reset}
      title="No pudimos cargar el catalogo"
    />
  );
}
