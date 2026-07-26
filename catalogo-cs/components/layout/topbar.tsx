"use client";

import SearchBar from "@/components/ui/search-bar";
import { Bell } from "lucide-react";

export default function Topbar() {
 return (
  <header
   className="
   h-20
   px-8
   flex
   items-center
   justify-between
   border-b
   border-zinc-800
   "
  >
   <SearchBar />

   <div className="flex items-center gap-5">

    <Bell
     className="
     text-zinc-400
     cursor-pointer
     "
    />

    <div
     className="
     size-10
     rounded-full
     bg-[#D4AF37]
     "
    />

   </div>

  </header>
 );
}