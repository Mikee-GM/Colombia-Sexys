import { WifiOff } from "lucide-react";

export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-black px-6 pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] text-center text-white">
      <div className="max-w-sm">
        <WifiOff className="mx-auto text-[#C5A55A]" size={40} />
        <h1 className="mt-5 font-heading text-2xl">Sin conexión</h1>
        <p className="mt-3 text-sm leading-relaxed text-zinc-400">
          Por seguridad, los servicios y conversaciones no están disponibles sin conexión. Vuelve a intentarlo cuando recuperes la red.
        </p>
      </div>
    </main>
  );
}
