export default function AlertsStats() {
 return (
  <div
   className="
   grid
   md:grid-cols-3
   gap-6
   mb-8
   "
  >
   <div
    className="
    rounded-3xl
    border
    border-red-500/20
    bg-red-500/10
    p-6
    "
   >
    <p className="text-red-400">
      Critical
    </p>

    <h2
     className="
     text-4xl
     font-bold
     mt-2
     "
    >
      3
    </h2>
   </div>

   <div
    className="
    rounded-3xl
    border
    border-yellow-500/20
    bg-yellow-500/10
    p-6
    "
   >
    <p className="text-yellow-400">
      High
    </p>

    <h2
     className="
     text-4xl
     font-bold
     mt-2
     "
    >
      7
    </h2>
   </div>

   <div
    className="
    rounded-3xl
    border
    border-blue-500/20
    bg-blue-500/10
    p-6
    "
   >
    <p className="text-blue-400">
      Medium
    </p>

    <h2
     className="
     text-4xl
     font-bold
     mt-2
     "
    >
      12
    </h2>
   </div>
  </div>
 );
}