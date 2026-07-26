"use client";

import React from "react";

interface CreateButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
}

export default function CreateButton({ label, ...props }: CreateButtonProps) {
  return (
    <button
      className="bg-[#C5A55A] text-black font-bold text-[10px] tracking-[0.2em] uppercase px-6 py-3 transition-colors hover:bg-[#D4AF37] focus:outline-none"
      {...props}
    >
      + {label}
    </button>
  );
}
