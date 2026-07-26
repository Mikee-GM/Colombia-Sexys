"use client";

import {
 ResponsiveContainer,
 BarChart,
 Bar,
 XAxis,
 Tooltip,
} from "recharts";

const data = [
 { month: "Jan", services: 45 },
 { month: "Feb", services: 62 },
 { month: "Mar", services: 78 },
 { month: "Apr", services: 91 },
 { month: "May", services: 124 },
 { month: "Jun", services: 148 },
];

export default function ServicesChart() {
 return (
  <div
   className="
   h-[350px]
   rounded-3xl
   border
   border-zinc-800
   bg-zinc-950
   p-6
   "
  >
   <h3 className="mb-5 text-xl font-semibold">
    Services Trend
   </h3>

   <ResponsiveContainer>
    <BarChart data={data}>
     <XAxis dataKey="month" />
     <Tooltip />
     <Bar
      dataKey="services"
      fill="#D4AF37"
     />
    </BarChart>
   </ResponsiveContainer>
  </div>
 );
}