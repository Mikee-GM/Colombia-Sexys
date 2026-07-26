"use client";

import dynamic from "next/dynamic";

const LiveMapDynamic = dynamic(() => import("./LiveMap"), { ssr: false });

export default LiveMapDynamic;
