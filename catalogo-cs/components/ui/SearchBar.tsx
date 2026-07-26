"use client";

import React from "react";

interface SearchBarProps {
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
}

export default function SearchBar({ placeholder = "Buscar...", value, onChange }: SearchBarProps) {
  return (
    <div className="relative mb-8 max-w-md">
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-transparent border-b border-zinc-700 text-white text-base py-3 pl-10 focus:border-[#C5A55A] focus:outline-none transition-colors placeholder:text-zinc-600"
      />
      <svg
        className="absolute left-1 top-1/2 -translate-y-1/2 text-zinc-500"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
    </div>
  );
}
