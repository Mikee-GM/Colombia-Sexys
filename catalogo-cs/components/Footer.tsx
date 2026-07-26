"use client";

import Image from "next/image";

export default function Footer() {
  return (
    <footer className="w-full border-t border-zinc-800/50 bg-black/40 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
        <div className="flex flex-col items-center gap-6">
          {/* Logo */}
          <div className="w-10 h-10 relative opacity-40">
            <Image
              src="/logo-icono.webp"
              alt="Colombia Sexys"
              fill
              sizes="40px"
              className="object-contain"
            />
          </div>

          {/* Linea decorativa dorada */}
          <div className="w-16 h-px line-gold opacity-40" />

          {/* Texto */}
          <div className="text-center space-y-2">
            <p className="text-[10px] font-bold tracking-[0.3em] text-[#C5A55A]/50 uppercase">
              Colombia Sexys
            </p>
            <p className="text-[10px] text-zinc-600 font-light tracking-widest uppercase">
              Catalogo Premium de Modelos
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
