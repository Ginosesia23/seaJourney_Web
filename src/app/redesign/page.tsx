import { redirect } from 'next/navigation';

/**
 * The redesign preview is now the live landing page. Anyone hitting the old
 * `/redesign` URL is forwarded to `/`.
 */
export default function RedesignRedirect(): never {
  redirect('/');
}
