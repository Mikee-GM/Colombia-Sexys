import PageHeader from "@/components/ui/page-header";

type Props = {
  params: Promise<{ slug: string }>;
};

export default async function CatalogDetailPage({ params }: Props) {
  const { slug } = await params;

  return (
    <PageHeader
      title={slug}
      description="Catalog profile pending backend integration."
    />
  );
}
