import { redirect } from 'next/navigation';

/** /admin/ais-monitor → dashboard shell (admin guard + sidebar). APIs enforce admin server-side. */
export default function AdminAisMonitorRedirect() {
  redirect('/dashboard/ais-monitor');
}
