"use client";

import { Bot } from "lucide-react";
import { useAI } from "./ai-provider";

export default function AIButton() {
 const { setOpen } = useAI();

 return (
  <button
   onClick={() => setOpen(true)}
   className="
   fixed
   bottom-8
   right-8
   z-50

   flex
   items-center
   gap-3

   px-5
   py-4

   rounded-2xl

   bg-[#D4AF37]
   text-black
   font-semibold

   shadow-2xl
   hover:scale-105
   transition-all
   "
  >
   <Bot size={22} />

   <span>
    Asistente IA
   </span>

   <div
    className="
    w-6
    h-6

    rounded-full

    bg-red-500
    text-white

    text-xs

    flex
    items-center
    justify-center
    "
   >
    3
   </div>
  </button>
 );
}