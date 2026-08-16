import { z } from 'zod';

import { ai } from './genkit';
import {
  composeCustomDocumentFallback,
  getCustomDocumentPreset,
  type CustomDocumentComposeResult,
  type CustomDocumentFacts,
  type CustomDocumentRequest,
} from '@/lib/custom-document';

const SectionSchema = z.object({
  heading: z.string(),
  body: z.string(),
  table: z
    .object({
      headers: z.array(z.string()),
      rows: z.array(z.array(z.string())),
    })
    .nullable()
    .optional(),
});

const ComposeSchema = z.object({
  title: z.string(),
  subtitle: z.string().nullable(),
  recipientLine: z.string().nullable(),
  intro: z.string(),
  sections: z.array(SectionSchema),
  closing: z.string().nullable(),
});

const MODEL =
  process.env.CUSTOM_DOCUMENT_MODEL ||
  process.env.DOCUMENT_SCAN_MODEL ||
  'googleai/gemini-2.5-flash';

export async function composeCustomDocument(opts: {
  request: CustomDocumentRequest;
  facts: CustomDocumentFacts;
}): Promise<CustomDocumentComposeResult> {
  const { request, facts } = opts;
  const fallback = composeCustomDocumentFallback(request, facts);
  const preset = getCustomDocumentPreset(request.purpose);

  try {
    const response = await ai.generate({
      model: MODEL,
      prompt: [
        {
          text: `You write official maritime documents for a yacht/vessel manager using SeaJourney.

Document type: ${preset.label}
How to write it: ${preset.brief}

Rules:
- Use ONLY the facts JSON. Never invent names, dates, IMO numbers, day counts, ranks, or certificates.
- The manager does not need to describe the letter. Follow the document type above.
- Extra notes in the request are optional additions only.
- If a fact is missing, omit it. Do not guess.
- Professional British English, third person, suitable to print on company letterhead.
- Keep the intro to 1–3 short paragraphs.
- Include a section only when include flags and matching facts exist.
- Include sea-time tables ONLY when facts.seaTime is present and include.seaTime is true.
- Do not claim MCA/AMSA/government certification.
- Use the preset title unless the request already has a title.

Preset title: ${preset.title}
Recipient line: ${preset.recipientLine ?? 'To whom it may concern'}

Manager request:
${JSON.stringify(request, null, 2)}

Facts:
${JSON.stringify(facts, null, 2)}`,
        },
      ],
      output: { schema: ComposeSchema },
    });

    const output = response.output as z.infer<typeof ComposeSchema> | null;
    if (!output?.title || !output.intro || !Array.isArray(output.sections)) {
      return fallback;
    }

    return {
      title: output.title.trim() || fallback.title,
      subtitle: output.subtitle?.trim() || fallback.subtitle,
      recipientLine: output.recipientLine?.trim() || null,
      intro: output.intro.trim() || fallback.intro,
      sections: output.sections
        .map((s) => ({
          heading: s.heading.trim(),
          body: (s.body || '').trim(),
          table: s.table
            ? {
                headers: s.table.headers,
                rows: s.table.rows,
              }
            : undefined,
        }))
        .filter((s) => s.heading && (s.body || s.table)),
      closing: output.closing?.trim() || fallback.closing,
    };
  } catch {
    return fallback;
  }
}
