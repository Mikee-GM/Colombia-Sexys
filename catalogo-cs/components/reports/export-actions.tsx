export default function ExportActions() {
 return (
  <div
   className="
   flex
   gap-4
   mt-8
   "
  >
   <button
    className="
    px-5
    py-3
    rounded-xl
    bg-yellow-500
    text-black
    font-semibold
    "
   >
    Export PDF
   </button>

   <button
    className="
    px-5
    py-3
    rounded-xl
    border
    border-zinc-700
    "
   >
    Export Excel
   </button>
  </div>
 );
}