import {
 AlertTriangle,
 Bell,
 ShieldAlert,
} from "lucide-react";

type Props = {
 title: string;
 description: string;
 priority: "critical" | "high" | "medium";
};

export default function AlertCard({
 title,
 description,
 priority,
}: Props) {

 const config = {
  critical: {
   color:
    "border-red-500/30 bg-red-500/10",
   icon: ShieldAlert,
   text: "text-red-400",
  },

  high: {
   color:
    "border-yellow-500/30 bg-yellow-500/10",
   icon: AlertTriangle,
   text: "text-yellow-400",
  },

  medium: {
   color:
    "border-blue-500/30 bg-blue-500/10",
   icon: Bell,
   text: "text-blue-400",
  },
 };

 const Icon = config[priority].icon;

 return (
  <div
   className={`
   rounded-2xl
   border
   p-5
   ${config[priority].color}
   `}
  >
   <div className="flex items-start gap-4">

    <Icon
     className={config[priority].text}
    />

    <div>

     <h3 className="font-semibold">
      {title}
     </h3>

     <p
      className="
      text-sm
      text-zinc-400
      mt-1
      "
     >
      {description}
     </p>

    </div>

   </div>
  </div>
 );
}