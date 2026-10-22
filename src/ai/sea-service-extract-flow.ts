import { ai } from './genkit';
import { z } from 'zod';

const SEA_SERVICE_EXTRACT_MODEL =
  process.env.CERTIFICATE_EXTRACT_MODEL ||
  process.env.DOCUMENT_SCAN_MODEL ||
  'googleai/gemini-2.5-flash-lite';

export const SeaServiceExtractOutputSchema = z.object({
  title: z
    .string()
    .nullable()
    .describe('Short document title if clear, else null'),
  startDate: z
    .string()
    .nullable()
    .describe('Service start / from date as YYYY-MM-DD, or null if not found'),
  endDate: z
    .string()
    .nullable()
    .describe('Service end / to / discharge date as YYYY-MM-DD, or null if not found'),
  issuedOn: z
    .string()
    .nullable()
    .describe('Date the testimonial was signed or issued as YYYY-MM-DD, or null'),
  totalDays: z
    .number()
    .int()
    .nullable()
    .describe('Total days of service if printed, else null'),
  atSeaDays: z
    .number()
    .int()
    .nullable()
    .describe('Days at sea / sea service days if printed, else null'),
  standbyDays: z
    .number()
    .int()
    .nullable()
    .describe('Standby / alongside days if printed, else null'),
  yardDays: z
    .number()
    .int()
    .nullable()
    .describe('Yard / dry-dock days if printed, else null'),
  leaveDays: z
    .number()
    .int()
    .nullable()
    .describe('Leave days if printed, else null'),
  confidence: z
    .enum(['high', 'medium', 'low'])
    .describe('How confident the extraction is overall'),
});

export type SeaServiceExtractOutput = z.infer<typeof SeaServiceExtractOutputSchema>;

const PROMPT = `You are reading a maritime sea-service testimonial, discharge book extract, or MCA-style proof of sea service.

Extract only these fields when clearly present:
- title (short name of the document or vessel + rank, e.g. "Sea service testimonial — Chief Officer")
- startDate (service from / date joined)
- endDate (service to / date left / discharged)
- issuedOn (date signed / date of testimonial)
- totalDays (total days of service)
- atSeaDays (days at sea / sea time / time on articles at sea)
- standbyDays (standby / alongside / harbour days)
- yardDays (yard / dry-dock days)
- leaveDays (leave days)

Rules:
- Dates MUST be YYYY-MM-DD. If only month/year is visible, use the first day of that month for startDate and the last day of that month for endDate.
- Day counts MUST be whole numbers. Do not invent totals from the dates unless the document itself prints the number of days.
- Prefer labelled figures such as "Days at sea", "Total days", "Sea service", "Time on articles".
- Do not invent numbers. Prefer null over guessing.
- Return confidence high/medium/low based on how clear the text is.`;

const EMPTY: SeaServiceExtractOutput = {
  title: null,
  startDate: null,
  endDate: null,
  issuedOn: null,
  totalDays: null,
  atSeaDays: null,
  standbyDays: null,
  yardDays: null,
  leaveDays: null,
  confidence: 'low',
};

function normaliseYmd(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null;
}

function normaliseDays(value: number | null | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
  return Math.round(value);
}

/**
 * Extract sea-service dates and day counts from a testimonial image or PDF.
 */
export async function extractSeaServiceTotals(opts: {
  base64: string;
  mimeType: string;
}): Promise<SeaServiceExtractOutput> {
  const { base64, mimeType } = opts;
  const contentType = (
    mimeType === 'image/jpg' ? 'image/jpeg' : mimeType
  ) as 'image/png' | 'image/jpeg' | 'image/webp' | 'application/pdf';

  const response = await ai.generate({
    model: SEA_SERVICE_EXTRACT_MODEL,
    prompt: [
      { text: PROMPT },
      {
        media: {
          contentType,
          url: `data:${contentType};base64,${base64}`,
        },
      },
      {
        text: 'Return the extracted sea-service fields as structured JSON.',
      },
    ],
    output: { schema: SeaServiceExtractOutputSchema },
  });

  const output = (response.output as SeaServiceExtractOutput | null) ?? EMPTY;
  return {
    title: output.title?.trim() || null,
    startDate: normaliseYmd(output.startDate),
    endDate: normaliseYmd(output.endDate),
    issuedOn: normaliseYmd(output.issuedOn),
    totalDays: normaliseDays(output.totalDays),
    atSeaDays: normaliseDays(output.atSeaDays),
    standbyDays: normaliseDays(output.standbyDays),
    yardDays: normaliseDays(output.yardDays),
    leaveDays: normaliseDays(output.leaveDays),
    confidence: output.confidence ?? 'low',
  };
}
