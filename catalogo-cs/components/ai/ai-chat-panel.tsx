"use client";

import { X } from "lucide-react";
import { useAI } from "./ai-provider";
import AIMessage from "./ai-message";

export default function AIChatPanel() {
 const { open, setOpen } = useAI();

 if (!open) return null;

 return (
  <div
   className="
   fixed
   top-0
   right-0

   h-screen
   w-[420px]

   bg-[#111111]

   border-l
   border-zinc-800

   z-50

   flex
   flex-col
   "
  >
   <div
    className="
    p-6
    border-b
    border-zinc-800

    flex
    items-center
    justify-between
    "
   >
    <div>
     <h2
      className="
      text-xl
      font-bold
      "
     >
      🤖 Asistente IA
     </h2>

     <p
      className="
      text-sm
      text-green-400
      "
     >
      Online
     </p>
    </div>

    <button
     onClick={() => setOpen(false)}
    >
     <X />
    </button>
   </div>

   <div
    className="
    flex-1
    p-6
    space-y-4
    overflow-y-auto
    "
   >
    <AIMessage
     text="Andrea tiene una liquidación pendiente."
    />

    <AIMessage
     text="Se detectaron 3 alertas críticas."
    />

    <AIMessage
     text="Fernanda completó 18 servicios."
    />
   </div>

   <div
    className="
    p-4
    border-t
    border-zinc-800
    "
   >
    <input
     placeholder="Escribe un mensaje..."
     className="
     w-full
     px-4
     py-3

     rounded-xl

     bg-zinc-900
     border
     border-zinc-800
     "
    />
   </div>
  </div>
 );
}