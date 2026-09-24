import { redirect } from 'next/navigation';

type PageProps = { params: Promise<{ vesselId: string }> };

export default async function AdminAisMonitorVesselRedirect({ params }: PageProps) {
  const { vesselId } = await params;
  redirect(`/dashboard/ais-monitor/vessels/${encodeURIComponent(vesselId)}`);
}
