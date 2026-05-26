import { SessionClient } from "@/components/SessionClient";

export default async function SessionPage({
  params,
}: {
  params: Promise<{ shareId: string }>;
}) {
  const { shareId } = await params;
  return <SessionClient shareId={shareId} />;
}
