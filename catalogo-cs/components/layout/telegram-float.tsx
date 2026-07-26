"use client";

import { FaTelegramPlane } from "react-icons/fa";
import { getGroupServiceTelegramUrl } from "@/lib/telegram-links";

export default function TelegramFloat() {
  return (
    <a
      href={getGroupServiceTelegramUrl()}
      target="_blank"
      rel="noopener noreferrer"
      className="
      fixed
      bottom-8
      right-8
      z-50

      w-16
      h-16

      rounded-full

      bg-[#229ED9]

      flex
      items-center
      justify-center

      shadow-lg
      shadow-[#229ED9]/30

      hover:scale-110
      transition-all
      duration-300

      animate-pulse
      "
    >
      <FaTelegramPlane
        size={30}
        className="text-white"
      />
    </a>
  );
}
