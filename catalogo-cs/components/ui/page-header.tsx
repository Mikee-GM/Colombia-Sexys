type PageHeaderProps = {
  title: string;
  description: string;
};

export default function PageHeader({
  title,
  description,
}: PageHeaderProps) {
  return (
    <div className="mb-8">
      <h1 className="font-heading text-3xl sm:text-4xl font-bold text-white tracking-wide">
        {title}
      </h1>

      <p className="mt-2 text-base text-[#C5A55A]/90 font-sans font-normal">
        {description}
      </p>
    </div>
  );
}