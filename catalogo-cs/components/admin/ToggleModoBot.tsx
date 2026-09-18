'use client';

import { useState, useTransition } from 'react';
import { toggleModoBot } from '@/lib/actions/modo-bot';

interface Props {
  id: string;
  tipo: 'empleada' | 'chofer';
  initialValue: boolean;
}

/**
 * Toggle que activa/desactiva el modoBot de una empleada o chofer.
 *
 * modoBot = true  -> usa el app Telegram normalmente
 * modoBot = false -> el sistema avanza automáticamente (simulación)
 */
export default function ToggleModoBot({ id, tipo, initialValue }: Props) {
  const [activo, setActivo] = useState(initialValue);
  const [isPending, startTransition] = useTransition();

  const handleToggle = () => {
    const nuevoValor = !activo;
    setActivo(nuevoValor);
    startTransition(async () => {
      await toggleModoBot(id, tipo, nuevoValor);
    });
  };

  return (
    <div className="flex items-center gap-3">
      <button
        id={`modo-bot-toggle-${id}`}
        onClick={handleToggle}
        disabled={isPending}
        className={`relative h-6 w-11 rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-zinc-950 ${
          activo
            ? 'bg-emerald-500 focus:ring-emerald-500'
            : 'bg-zinc-700 focus:ring-zinc-500'
        } ${isPending ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
        role="switch"
        aria-checked={activo}
        aria-label="Modo Bot"
      >
        <span
          className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${
            activo ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
      <span className="text-sm">
        {activo ? (
          <span className="text-emerald-400 font-medium">🤖 Usa el app</span>
        ) : (
          <span className="text-amber-400 font-medium">⚡ Modo automático</span>
        )}
      </span>
    </div>
  );
}
