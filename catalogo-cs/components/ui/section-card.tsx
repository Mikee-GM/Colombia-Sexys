import { ReactNode } from "react";

type Props = {
  title: string;
  children: ReactNode;
};

export default function SectionCard({
  title,
  children,
}: Props) {
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
      <h3
        className="
        text-xl
        font-semibold
        text-white
        mb-5
        "
      >
        {title}
      </h3>

      {children}
    </div>
  );
}