"use client";

import {
 ResponsiveContainer,
 AreaChart,
 Area,
 XAxis,
 Tooltip,
} from "recharts";

const data = [
 { month: "Jan", revenue: 12000 },
 { month: "Feb", revenue: 19000 },
 { month: "Mar", revenue: 17000 },
 { month: "Apr", revenue: 26000 },
 { month: "May", revenue: 31000 },
 { month: "Jun", revenue: 42000 },
];

export default function RevenueChart() {
 return (
  <div
   className="
   bg-[#0f0f0f]
   border
   border-zinc-800
   rounded-3xl
   p-6
   h-[350px]
   "
  >
   <h3 className="text-xl font-semibold mb-6">
    Revenue Trend
   </h3>

   <ResponsiveContainer width="100%" height="100%">
    <AreaChart data={data}>
     <XAxis dataKey="month" />
     <Tooltip />
     <Area
      dataKey="revenue"
      stroke="#D4AF37"
      fill="#D4AF37"
      fillOpacity={0.2}
     />
    </AreaChart>
   </ResponsiveContainer>
  </div>
 );
}