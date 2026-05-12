import { notFound } from 'next/navigation';

import { PdfCoordinatePicker } from '@/components/admin/pdf-coordinate-picker';

export default function AmsaPdfAlignPage() {
  const enabled =
    process.env.NODE_ENV === 'development' || process.env.NEXT_PUBLIC_ENABLE_AMSA_ALIGN_TOOL === 'true';
  if (!enabled) {
    notFound();
  }

  return (
    <PdfCoordinatePicker
      defaultDocumentUrl="/forms/AMSA_Form_771.pdf"
      title="AMSA 771 — coordinate picker (dev)"
      description="Same tool as Dashboard → PDF coordinate picker. Upload a PDF or use the default template. Click to copy { x, top } (PDF points, top from top of page). Uses PDF.js — not the browser PDF plugin."
    />
  );
}
