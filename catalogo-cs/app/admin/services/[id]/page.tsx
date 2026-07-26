import PageHeader from "@/components/ui/page-header";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function ServiceDetailPage({ params }: Props) {
  const { id } = await params;

  return (
    <PageHeader
      title={`Service ${id}`}
      description="Service detail is pending backend service logic."
    />
  );
}
