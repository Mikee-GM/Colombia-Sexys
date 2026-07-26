type Props = {
 text: string;
};

export default function AIMessage({
 text,
}: Props) {
 return (
  <div
   className="
   p-4
   rounded-xl

   bg-zinc-900
   border
   border-zinc-800
   "
  >
   <p>{text}</p>
  </div>
 );
}