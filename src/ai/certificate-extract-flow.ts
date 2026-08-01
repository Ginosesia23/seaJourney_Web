import { ai } from './genkit';
import { z } from 'zod';

const CERTIFICATE_EXTRACT_MODEL =
  process.env.CERTIFICATE_EXTRACT_MODEL ||
  process.env.DOCUMENT_SCAN_MODEL ||
  'googleai/gemini-2.5-flash-lite';

export const CertificateExtractOutputSchema = z.object({
  issueDate: z
    .string()
    .nullable()
    .describe('Issue / date of issue as YYYY-MM-DD, or null if not found'),
  expiryDate: z
    .string()
    .nullable()
    .describe(
      'Expiry / valid until as YYYY-MM-DD, or null if not found or no expiry',
    ),
  certificateNumber: z
    .string()
    .nullable()
    .describe('Certificate / document number if visible, else null'),
  issuingAuthority: z
    .string()
    .nullable()
    .describe('Issuing body (e.g. MCA, USCG) if visible, else null'),
  certificateName: z
    .string()
    .nullable()
    .describe('Short name/title of the certificate if clear, else null'),
  confidence: z
    .enum(['high', 'medium', 'low'])
    .describe('How confident the extraction is overall'),
});

export type CertificateExtractOutput = z.infer<
  typeof CertificateExtractOutputSchema
>;

const PROMPT = `You are reading a maritime seafarer certificate or medical fitness document (STCW, EDH, ENG1, CoC, GMDSS, etc.).

Extract only these fields when clearly present on the document:
- issueDate (date of issue / issued on)
- expiryDate (expiry / valid until / valid to). If the document has no expiry, return null.
- certificateNumber
- issuingAuthority
- certificateName (short title)

Rules:
- Dates MUST be YYYY-MM-DD. If only month/year is visible, use the first day of that month.
- Do not invent dates. Prefer null over guessing.
- Ignore personal address/DOB unless needed to disambiguate date labels.
- Return confidence high/medium/low based on how clear the text is.`;

/**
 * Extract issue/expiry (and related) fields from a certificate image or PDF page.
 */
export async function extractCertificateDates(opts: {
  base64: string;
  mimeType: string;
}): Promise<CertificateExtractOutput> {
  const { base64, mimeType } = opts;
  const contentType = (
    mimeType === 'image/jpg' ? 'image/jpeg' : mimeType
  ) as 'image/png' | 'image/jpeg' | 'image/webp' | 'application/pdf';

  const response = await ai.generate({
    model: CERTIFICATE_EXTRACT_MODEL,
    prompt: [
      { text: PROMPT },
      {
        media: {
          contentType,
          url: `data:${contentType};base64,${base64}`,
        },
      },
      {
        text: 'Return the extracted certificate fields as structured JSON.',
      },
    ],
    output: { schema: CertificateExtractOutputSchema },
  });

  const output = response.output as CertificateExtractOutput | null;
  if (!output) {
    return {
      issueDate: null,
      expiryDate: null,
      certificateNumber: null,
      issuingAuthority: null,
      certificateName: null,
      confidence: 'low',
    };
  }
  return output;
}
