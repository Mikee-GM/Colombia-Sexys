type Props = {
 title: string;
 value: string;
};

export default function ReportKPI({
 title,
 value,
}: Props) {
 return (
  <div
   className="
   rounded-3xl
   border
   border-zinc-800
   bg-zinc-950
   p-6
   "
  >
   <p className="text-zinc-400">
    {title}
   </p>

   <h2
    className="
    text-4xl
    font-bold
    mt-2
    "
   >
    {value}
   </h2>
  </div>
 );
}