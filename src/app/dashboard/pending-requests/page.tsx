import { redirect } from 'next/navigation';

/** Merged into Inbox → Sent tab for vessel accounts. */
export default function PendingRequestsRedirectPage() {
  redirect('/dashboard/inbox?view=sent');
}
