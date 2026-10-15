"use client";

import { useState } from "react";
import Image from "next/image";
import { ExternalLink, MapPin, RefreshCw } from "lucide-react";
import type { ConversationAttachment as Attachment } from "@/lib/types";

const LINK_STYLE =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-current/25 px-3 py-2 text-xs font-semibold hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C5A55A]";

function PhotoAttachment({ src }: { src: string }) {
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  return (
    <div className="mb-2 flex w-64 max-w-full flex-col gap-2">
      {failed ? (
        <div className="rounded-xl border border-current/20 p-3">
          <p role="status" className="text-sm">
            No se pudo cargar la foto.
          </p>
          <button
            type="button"
            className={`${LINK_STYLE} mt-2`}
            onClick={() => {
              setAttempt((current) => current + 1);
              setFailed(false);
            }}
          >
            <RefreshCw size={14} aria-hidden="true" />
            Reintentar foto
          </button>
        </div>
      ) : (
        <div className="relative aspect-4/3 w-full overflow-hidden rounded-xl border border-current/20 bg-black">
          <Image
            key={attempt}
            src={src}
            alt="Foto adjunta al mensaje"
            fill
            sizes="(max-width: 640px) 70vw, 256px"
            className="object-contain"
            loading="lazy"
            // La ruta requiere las cookies del navegador; no usar el optimizador.
            unoptimized
            onError={() => setFailed(true)}
          />
        </div>
      )}
      <a
        href={src}
        target="_blank"
        rel="noopener noreferrer"
        className={LINK_STYLE}
        aria-label="Abrir foto en otra pestaña"
      >
        <ExternalLink size={14} aria-hidden="true" />
        Abrir foto
      </a>
    </div>
  );
}

export default function ConversationAttachment({
  messageId,
  attachment,
}: {
  messageId: string;
  attachment?: Attachment | null;
}) {
  if (!attachment) return null;

  if (attachment.type === "photo") {
    // Nunca aceptar URLs de Telegram con el token ni destinos proporcionados
    // por el cliente. El backend vuelve a autorizar este mensaje en cada GET.
    const photoPath = `/api/telegram-conversations/messages/${encodeURIComponent(messageId)}/photo`;
    if (attachment.url !== photoPath) {
      return <p className="mb-2 text-sm">Foto no disponible.</p>;
    }
    return <PhotoAttachment key={photoPath} src={photoPath} />;
  }

  if (attachment.type !== "location") return null;

  const { latitude, longitude, title, address } = attachment;
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return <p className="mb-2 text-sm">Ubicación no disponible.</p>;
  }

  const query = encodeURIComponent(`${latitude},${longitude}`);

  return (
    <div className="mb-2 rounded-xl border border-current/20 p-3">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <MapPin size={16} aria-hidden="true" />
        Ubicación compartida
      </div>
      {title && <p className="mt-1 break-words text-sm">{title}</p>}
      {address && <p className="mt-1 break-words text-sm">{address}</p>}
      <p className="mt-1 break-words text-xs tabular-nums opacity-75">
        {latitude.toFixed(6)}, {longitude.toFixed(6)}
      </p>
      <a
        href={`https://www.google.com/maps/search/?api=1&query=${query}`}
        target="_blank"
        rel="noopener noreferrer"
        className={`${LINK_STYLE} mt-2`}
        aria-label="Abrir ubicación en Google Maps en otra pestaña"
      >
        <ExternalLink size={14} aria-hidden="true" />
        Abrir mapa
      </a>
    </div>
  );
}
