import {
 AlertTriangle,
 Bell,
} from "lucide-react";

export default function AlertsCenter() {
 return (
  <div
   className="
   bg-[#0f0f0f]
   border
   border-zinc-800
   rounded-3xl
   p-6
   "
  >
   <h3 className="text-xl font-semibold mb-6">
    Critical Alerts
   </h3>

   <div className="space-y-4">

    <div className="flex gap-3">
      <AlertTriangle className="text-red-500" />
      <span>Driver offline</span>
    </div>

    <div className="flex gap-3">
      <Bell className="text-yellow-500" />
      <span>Service delayed</span>
    </div>

   </div>
  </div>
 );
}