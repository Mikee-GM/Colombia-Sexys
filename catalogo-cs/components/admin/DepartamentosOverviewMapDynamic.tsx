"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";

export const DepartamentosOverviewMapDynamic = dynamic(
  () => import("./DepartamentosOverviewMap"),
  {
    ssr: false,
    loading: () => (
      <div className="h-[550px] w-full rounded-2xl border border-zinc-800 bg-zinc-950/80 flex flex-col items-center justify-center gap-2 text-zinc-500 text-xs">
        <Loader2 className="h-6 w-6 animate-spin text-[#C5A55A]" />
        <span>Cargando mapa de departamentos...</span>
      </div>
    ),
  },
);

export default DepartamentosOverviewMapDynamic;
