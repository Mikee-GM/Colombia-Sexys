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
      <h1 className="font-heading text-3xl font-semibold text-white tracking-wide">
        {title}
      </h1>

      <p className="mt-2 text-sm text-[#C5A55A]/80 font-sans font-light">
        {description}
      </p>
    </div>
  );
}