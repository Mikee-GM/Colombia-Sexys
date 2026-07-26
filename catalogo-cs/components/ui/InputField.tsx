"use client";

import React from "react";

interface InputFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
}

export default function InputField({ label, ...props }: InputFieldProps) {
  return (
    <div>
      <label className="block text-[10px] font-bold tracking-widest text-[#C5A55A] uppercase mb-2">
        {label}
      </label>
      <input
        className="w-full bg-black border border-zinc-800 text-white text-sm font-medium px-4 py-3 transition-all duration-200 focus:border-[#C5A55A] placeholder:text-zinc-600 focus:outline-none"
        {...props}
      />
    </div>
  );
}
