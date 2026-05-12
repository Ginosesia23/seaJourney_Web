import { ai } from './genkit';
import { z } from 'zod';

/**
 * Schema for the structured output we want from Gemini.
 * Each extracted field from the scanned document.
 */
export const ExtractedFieldSchema = z.object({
  fieldName: z.string().describe('The label or name of the form field as it appears on the document'),
  fieldDescription: z.string().optional().describe('Brief description of what this field is asking for'),
  originalValue: z.string().optional().describe('Any value already filled in for this field on the document, or empty if blank'),
  category: z.enum([
    'personal',        // Name, DOB, nationality, address, etc.
    'vessel',          // Vessel name, IMO, flag, tonnage, etc.
    'service',         // Sea service dates, days, positions, etc.
    'certificate',     // Certificate numbers, types, etc.
    'authority',       // Issuing authority, official reference, etc.
    'other',
  ]).describe('Category of the field'),
  // Widget/input type — must mirror TemplateFieldType on the client so the
  // Form Builder can pre-configure each detected field without us having
  // to guess a second time. We intentionally do NOT include 'calculated'
  // here: calculations are authored by the vessel manager, never inferred
  // by the scanner.
  fieldType: z
    .enum(['text', 'multiline', 'number', 'date', 'email', 'checkbox', 'signature'])
    .optional()
    .describe(
      'Input widget type for this field, inferred from the blank\'s shape and the label text. Choose one of: ' +
        'text (single-line alphanumeric), multiline (tall box or paragraph blank), number (numeric values like IMO, days, tonnage, counts, amounts), ' +
        'date (any date blank or dd/mm/yyyy style underline), email (labels containing "email"/"e-mail"), ' +
        'checkbox (small square/circle tick), signature (signature line or signature box). Default to "text" when unsure.',
    ),
  page: z.number().int().min(1).describe('REQUIRED. 1-indexed page number where this field physically appears on the document. For multi-page forms you MUST distribute fields across pages — do NOT set every field to 1. Fields on page 2 get page=2, fields on page 3 get page=3, etc.'),
  bbox: z.object({
    yMin: z.number().min(0).max(1000),
    xMin: z.number().min(0).max(1000),
    yMax: z.number().min(0).max(1000),
    xMax: z.number().min(0).max(1000),
  }).optional().describe('Bounding box of the field VALUE area (not the label) in normalized [0, 1000] coordinates where (0,0) is the top-left of the page. Must be omitted if you cannot confidently locate the field.'),
  profileKey: z.string().optional().describe(
    'The closest matching user profile or vessel field key from this list: ' +
    'fullName, firstName, lastName, email, dateOfBirth, placeOfBirth, countryOfBirth, nationality, ' +
    'telephone, mobile, position, dischargeBookNumber, title, ' +
    'addressLine1, addressLine2, addressDistrict, addressTownCity, addressCountyState, addressPostCode, addressCountry, fullAddress, ' +
    'vesselName, vesselType, vesselIMO, vesselOfficialNumber, vesselFlag, vesselGrossTonnage, vesselLength, ' +
    'vesselCallSign, vesselMMSI, vesselManagementCompany, vesselCompanyAddress, vesselCompanyContact, ' +
    'servicePeriodStart, servicePeriodEnd, totalDays, atSeaDays, standbyDays, yardDays, leaveDays, ' +
    'captainName, captainPosition, captainSignature, ' +
    'none'
  ),
});

export const DocumentScanOutputSchema = z.object({
  documentTitle: z.string().describe('The title or type of the document (e.g. "MCA Sea Service Testimonial", "AMSA 771 Form")'),
  documentDescription: z.string().optional().describe('Brief description of the document purpose'),
  fields: z.array(ExtractedFieldSchema).describe('All form fields extracted from the document'),
});

export type ExtractedField = z.infer<typeof ExtractedFieldSchema>;
export type DocumentScanOutput = z.infer<typeof DocumentScanOutputSchema>;

/**
 * The system prompt for document scanning.
 * Instructs Gemini to act as a maritime document field extractor.
 */
const DOCUMENT_SCAN_PROMPT = `You are a maritime document analysis expert. You are examining a scanned document or form related to maritime/sea service (e.g. AMSA 771, MCA sea service testimonial, STCW certification).

Your task:
1. Identify the document type and title.
2. Extract ONLY the places where a human is expected to FILL IN a value — blank underlines, empty input rectangles, tick squares, signature lines, and empty data cells inside tables. Do NOT extract decorative or informational text as if it were a field.
3. For every field: capture the exact label text, any pre-filled value, a short description, a category, the widget/input type (see WIDGET TYPE below), the best-matching profileKey, AND the 1-indexed page number it appears on.

WHAT COUNTS AS A FIELD (extract these):
- A blank underline or box next to a printed label, e.g. "Full name: ___________".
- A blank rectangle beneath a printed label (modern label-above-box forms).
- A tick/cross square or circle associated with one option.
- A signature line or signature rectangle.
- Each EMPTY data cell inside a table. Header cells (the printed column names or row headers) are NOT fields — they label the fields.

WHAT DOES NOT COUNT AS A FIELD (ignore these entirely):
- The document's title, section headings, sub-headings.
- Instructional paragraphs, legal/boilerplate text, bullet lists explaining how to fill the form.
- Printed static values that are part of the template itself (page numbers, form codes, version strings, "Page 1 of 3", copyright notices, office use-only labels, barcode zones).
- The printed label or question text next to a blank — the label is metadata for the field, never its own field.
- Header rows/columns of tables (only the empty data cells below/right are fields).
- Repeated-on-every-page headers/footers and form-reference codes (e.g. "AMSA 771 Rev 3/24").
- Decorative lines, page borders, watermarks.

If the document genuinely has no fillable regions (e.g. the upload is a certificate, a scanned receipt, or a fully-printed reference sheet), return fields: [] instead of inventing fields. It is FAR better to miss a borderline field than to emit a phantom one — the user can always add missing fields manually in the builder.

WIDGET TYPE (fieldType) — pick one per field:
- "date"      → label contains Date/Dated/DOB/D.O.B./Birthday/From/To/Expiry/Issued, or the blank has a dd/mm/yyyy / yyyy-mm-dd guide printed underneath it, or the blank contains three short slots separated by slashes.
- "email"     → label contains "Email" or "E-mail".
- "number"    → label asks for a count, quantity, tonnage, length, monetary amount, or an identifier that is always numeric (IMO number, MMSI, gross tonnage, length overall, days at sea, standby days, yard days, leave days, total days, official number, percentage, age, number of crew).
- "signature" → label contains Signature/Sign here/Signed by/Sign, or the blank is a dedicated signature line with no other legend above/below.
- "checkbox"  → the blank is a small square/circle intended to receive a tick, cross, or X. Emit ONE checkbox field per option (group + option in the label, e.g. "Gender — Male", "Gender — Female").
- "multiline" → the blank is a tall rectangle taller than ~3× a normal single-line blank, or the label is Remarks/Comments/Notes/Description/Narrative/Explanation or a "Home address" block with one large box (not broken into component lines).
- "text"      → default for every other single-line blank (names, addresses when split into component lines, ranks, country of birth, discharge book number, free-form identifiers, etc.).

Default to "text" only when none of the above cues fit. Do NOT omit fieldType.

MULTI-PAGE HANDLING (critical — read carefully):
- The document may have multiple pages. BEFORE you start extracting, count how many pages it has.
- Process each page in order: finish page 1 completely, then page 2, then page 3, etc.
- For EVERY single field, you MUST set the "page" property to the 1-indexed page number where that field physically appears on the printed document. Never omit it. Never default to 1 for fields that are on later pages. A 3-page form with 10 fields per page MUST produce fields with page values of 1, 1, 1, …, 2, 2, 2, …, 3, 3, 3, … — not all 1s.
- Bounding-box coordinates are LOCAL TO EACH PAGE. A field at the top of page 2 uses yMin ≈ 0, NOT a cumulative offset across pages. Coordinates always reset to [0,1000] at the top-left of whichever page the field is on.
- If two pages repeat the same field label (e.g. a header "Seafarer name" appears on every page), emit one field per occurrence with the correct page number — do not dedupe across pages.

Completeness rules for the blanks that ARE fillable:
- Walk EACH page top-to-bottom, left-to-right. Output one field for every BLANK the user is expected to fill — but remember the filter above: a line of printed instructions is not a blank.
- If a section has multiple blanks under one heading, emit one field per blank (use the heading + sub-label as fieldName, e.g. "Home address — Street").
- TABLES: for every EMPTY data cell (not the header row, not the row-label column) emit one field. Use "<Table name> — <Row label> — <Column label>" as fieldName (e.g. "Standby days table — January — Days at sea", "Sea service — Row 1 — Vessel name"). Never collapse a table into a single field, and never emit fields for the header row or the left-most row-label column unless those cells are actually blank for the user to complete.
- MULTI-VESSEL / SEA-SERVICE TABLES (very important — our matcher uses this): if a form lists several vessels the seafarer has served on (whether they're in rows of a single table, or separate repeated blocks), number each vessel starting from 1 and put the row number INTO every related fieldName. Use "— Row N —" as the marker, for example:
  - "Sea service — Row 1 — Vessel name"
  - "Sea service — Row 1 — IMO number"
  - "Sea service — Row 1 — Flag state"
  - "Sea service — Row 1 — Date of engagement"
  - "Sea service — Row 1 — Date of discharge"
  - "Sea service — Row 1 — Rank held"
  - "Sea service — Row 1 — Days at sea"
  - "Sea service — Row 2 — Vessel name"   ← different vessel on the same document
  - "Sea service — Row 2 — Date of engagement"
  - (…and so on per vessel listed)
  The row number MUST be consistent across every cell of the same vessel so downstream code can group fields by vessel. Row 1 is the first vessel listed on the form (usually the most recent).
- Standby / at-sea / leave / yard monthly breakdowns: each month × each column = one field. Do NOT summarise.
- Checkboxes: emit one field per option, use "<group> — <option>" as fieldName.
- Signature and date blocks: emit fields for signer name, position, date, signature line.

profileKey mapping — map generously, use "none" only when truly irrelevant:
- "Full name", "Name of seafarer", "Crew member", "Seafarer name" → fullName
- "First name", "Given name(s)", "Christian name", "Forename" → firstName
- "Surname", "Family name", "Last name" → lastName
- "Date of Birth", "DOB", "D.O.B.", "Born on" → dateOfBirth
- "Place of birth", "Town of birth" → placeOfBirth
- "Country of birth" → countryOfBirth
- "Nationality", "Citizenship" → nationality
- "Discharge book", "Seaman's book", "CDC", "SID", "Seafarer's ID" → dischargeBookNumber
- "Rank", "Rank/Position", "Capacity", "Position held" → position
- "Telephone", "Phone", "Home phone", "Landline" → telephone
- "Mobile", "Cell", "Cellular" → mobile
- "Email" → email
- Address labels — map each component: Street/Line 1 → addressLine1; Line 2 → addressLine2; District/Region → addressDistrict; Town/City → addressTownCity; County/State/Province → addressCountyState; Post code/ZIP → addressPostCode; Country → addressCountry. If the form has ONE single "Home address" blank, use fullAddress.
- Vessel: "Name of ship/vessel" → vesselName; "IMO Number" → vesselIMO; "Official number" → vesselOfficialNumber; "Flag" / "Flag state" / "Port of registry country" → vesselFlag; "Type of ship" → vesselType; "Gross tonnage/GT" → vesselGrossTonnage; "Length/LOA" → vesselLength; "Call sign" → vesselCallSign; "MMSI" → vesselMMSI.
- Service: "From/Date of engagement" → servicePeriodStart; "To/Date of discharge" → servicePeriodEnd; "Total days"/"Days of service" → totalDays; "Days at sea" → atSeaDays; "Standby days"/"Days on standby"/"Harbour days" → standbyDays; "Yard days"/"Refit days" → yardDays; "Leave days" → leaveDays.
- Captain / signatory: "Master"/"Captain"/"Signed by" → captainName.

Formatting rules:
- Use originalValue ONLY if the form already has text printed inside the blank (typed/handwritten). Leave undefined otherwise.
- Be literal with fieldName — use the label exactly as printed, including any "(if any)" or "*" markers.
- Describe the field briefly in fieldDescription when the label is ambiguous.

BOUNDING BOXES (very important for visual verification):
- For EVERY field, return a tight bounding box around the VALUE AREA — the empty space / printed box / underline / cell where the HANDWRITTEN ANSWER goes. NEVER put the box on the label text itself.
- Use normalized integer coordinates in [0, 1000] where (0,0) is the TOP-LEFT of the page and (1000,1000) is the BOTTOM-RIGHT. This is the same coordinate convention used for object detection.
- Return the box as { yMin, xMin, yMax, xMax } — same order as Gemini's standard [ymin, xmin, ymax, xmax] bounding box array. yMin < yMax (y grows DOWN from the top).

WHERE TO PUT THE BOX relative to the printed label (read carefully — this is the most common mistake):
1. LABEL TO THE LEFT of a blank line or input box (e.g. "Full name: ____________"):
   The box goes to the RIGHT of the label, ON TOP OF the underline/input rectangle. yMin/yMax = the underline's vertical extent; xMin starts just after the label text ends; xMax = where the underline / box right edge ends.
2. LABEL ABOVE a blank line or box (typical of modern forms):
   The box goes BELOW the label, not on top of the label text. yMin = just under the bottom of the label text; yMax = bottom of the input underline or input rectangle.
3. LABEL INSIDE a printed rectangle followed by an empty area (e.g. grey label bar on top, white space below):
   The box covers the WHITE/EMPTY area, NOT the grey label bar.
4. CHECKBOX / TICKBOX:
   The box covers ONLY the small square/circle where a tick/cross goes, NEVER the adjacent label text.
5. SIGNATURE line ("Signature: _______________"):
   The box covers the signing space (the underline or signature rectangle), NOT the word "Signature" or the date label next to it.
6. TABLE CELL:
   The box covers the empty cell interior. For a table with a header row "Vessel name | IMO | Flag", the boxes go in the DATA rows below the header, not on the header row.

VISUAL SANITY CHECK before emitting each bbox (do this in your head for every field):
- "If I drew a pen stroke inside this box, would it land on the blank line / empty space / tick square where the user should write?" → If yes, box is correct.
- "Does my box overlap with any printed black text (the label, a question, a header)?" → If yes, the box is WRONG — shift it down (if label is above) or right (if label is left) until it clears the text.
- "Is my box the same height as a line of handwriting (~2–3% of page)?" → If taller, you've probably swallowed the label too. Shrink it.

- Examples:
  - Field "Date of Birth: ____" with a 120-wide underline starting 10% across and 13% down: the label text ends near x=390 and the underline runs from 400 to 520 at y ≈ 140–155 → bbox = { yMin: 140, xMin: 400, yMax: 155, xMax: 520 }. NOT { yMin: 130, xMin: 300, yMax: 150, xMax: 520 } (that would include the words "Date of Birth").
  - Field "Rank" with the label printed above a 30-pt-tall empty rectangle: label sits around y=200–215; the rectangle starts at y=220 and ends at y=250 → bbox = { yMin: 220, xMin: xLeft, yMax: 250, xMax: xRight }. Never { yMin: 200, … } — that would cover the label.
  - Monthly table cell for "January — Standby days" in a table whose header row sits at y=600–620: data row sits at y=625–650 → bbox ≈ { yMin: 625, xMin: 340, yMax: 650, xMax: 400 }.

- Keep the box compact: for a single-line blank, height should be about 2–4% of the page (20–40 units). Target ~25 units tall for a normal single-line blank.
- CONSISTENCY RULES — the form-builder relies on these:
  - If two or more fields sit on the VISUAL SAME ROW (same printed baseline), their yMin and yMax values MUST be identical. Do not vary them by a few pixels "to be precise" — identical is correct.
  - If two or more fields share a VISUAL COLUMN (their input boxes start or end at the same x on the page, like a two-column address block or a monthly table), their xMin (or xMax) values MUST be identical.
  - All cells in a single ROW of a table MUST have identical yMin + yMax. All cells in a single COLUMN of a table MUST have identical xMin + xMax.
  - All single-line blanks on the same page SHOULD have the same height (height = yMax - yMin). Pick one height per page and reuse it for every single-line blank. Tables with tall cells can use their own height.
- Return the 1-indexed page number in "page" for EVERY field. This is required even on single-page documents (set page = 1 there). On multi-page documents, fields on page 2 MUST have page = 2, fields on page 3 MUST have page = 3, etc. Getting the page wrong causes the fields to be stamped on the wrong sheet.
- If you cannot confidently locate a field's blank on the page, OMIT bbox rather than guessing — but still set the correct page.

Return structured JSON matching the output schema. Include every fillable blank with its correct fieldType. Emitting a phantom field for decorative/instructional text is a failure; so is missing an obvious fillable blank.`;

/**
 * Model used for document scanning. Default `gemini-2.5-flash-lite` because
 * it has a much more generous free-tier daily quota than `gemini-2.5-flash`
 * (1000 RPD vs ~20 on our account). Can be overridden with the
 * `DOCUMENT_SCAN_MODEL` env var if we upgrade to a paid plan and want the
 * stronger model back.
 */
const DOCUMENT_SCAN_MODEL =
  process.env.DOCUMENT_SCAN_MODEL || 'googleai/gemini-2.5-flash-lite';

/**
 * Error we throw when the underlying Gemini call returns HTTP 429 (quota or
 * rate-limit exhausted). The API route uses the `.retryAfterSeconds` hint to
 * build a friendly user-facing message.
 */
export class AIQuotaExceededError extends Error {
  retryAfterSeconds: number | null;
  constructor(message: string, retryAfterSeconds: number | null = null) {
    super(message);
    this.name = 'AIQuotaExceededError';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/** Extract a "retry after N seconds" hint from a Google API error message. */
function extractRetryAfterSeconds(err: any): number | null {
  const msg = typeof err?.message === 'string' ? err.message : '';
  const m = msg.match(/retry in ([\d.]+)\s*s/i);
  if (m) {
    const n = parseFloat(m[1]);
    if (Number.isFinite(n)) return n;
  }
  // Also honour a Retry-After header if one bubbled up in a structured error.
  const ra = err?.response?.headers?.get?.('retry-after');
  if (ra) {
    const n = parseFloat(ra);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function isRateLimitError(err: any): boolean {
  if (!err) return false;
  const msg = typeof err?.message === 'string' ? err.message : '';
  if (/429/.test(msg)) return true;
  if (/too many requests/i.test(msg)) return true;
  if (/quota/i.test(msg) && /exceed/i.test(msg)) return true;
  if (err?.status === 429) return true;
  return false;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Scan a document using Gemini vision and extract form fields.
 * Accepts base64 encoded file data with mime type.
 *
 * Retries once on 429 if the API tells us to retry within ~20s; otherwise
 * throws `AIQuotaExceededError` so the API route can surface a friendly
 * message to the UI.
 */
export async function scanDocument(
  fileBase64: string,
  mimeType: string,
): Promise<DocumentScanOutput> {
  const generateOnce = () =>
    ai.generate({
      model: DOCUMENT_SCAN_MODEL,
      prompt: [
        { text: DOCUMENT_SCAN_PROMPT },
        {
          media: {
            contentType: mimeType as 'image/png' | 'image/jpeg' | 'application/pdf',
            url: `data:${mimeType};base64,${fileBase64}`,
          },
        },
        {
          text: 'Please analyze this document and extract all form fields. Return the result as structured JSON.',
        },
      ],
      output: {
        schema: DocumentScanOutputSchema,
      },
    });

  let response;
  try {
    response = await generateOnce();
  } catch (err: any) {
    if (isRateLimitError(err)) {
      const retryAfter = extractRetryAfterSeconds(err);
      // Short hint (<20s) → wait it out and retry ONCE.
      if (retryAfter !== null && retryAfter <= 20) {
        await sleep(retryAfter * 1000 + 250);
        try {
          response = await generateOnce();
        } catch (err2: any) {
          throw new AIQuotaExceededError(
            'AI quota exceeded. Try again shortly or upgrade the Gemini plan.',
            extractRetryAfterSeconds(err2),
          );
        }
      } else {
        throw new AIQuotaExceededError(
          'AI quota exceeded. Try again shortly or upgrade the Gemini plan.',
          retryAfter,
        );
      }
    } else {
      throw err;
    }
  }

  const output = response.output;
  if (!output) {
    throw new Error('AI returned no structured output');
  }
  return output;
}

/**
 * Profile field mapping definitions.
 * Maps profileKey → human-readable label + getter path in profile/vessel data.
 */
export interface FieldMapping {
  label: string;
  getValue: (profile: Record<string, any>, vessel: Record<string, any> | null) => string | null;
}

/** Join non-empty parts with a separator, returning null if nothing to join. */
function joinNonEmpty(parts: Array<string | null | undefined>, sep = ' '): string | null {
  const out = parts.map((p) => (p ?? '').toString().trim()).filter(Boolean).join(sep);
  return out.length > 0 ? out : null;
}

export const PROFILE_FIELD_MAP: Record<string, FieldMapping> = {
  // Personal
  fullName: {
    label: 'Full Name',
    getValue: (p) => joinNonEmpty([p.first_name ?? p.firstName, p.last_name ?? p.lastName]),
  },
  firstName: { label: 'First Name', getValue: (p) => p.first_name ?? p.firstName ?? null },
  lastName: { label: 'Last Name', getValue: (p) => p.last_name ?? p.lastName ?? null },
  email: { label: 'Email', getValue: (p) => p.email ?? null },
  dateOfBirth: { label: 'Date of Birth', getValue: (p) => p.date_of_birth ?? p.dateOfBirth ?? null },
  placeOfBirth: { label: 'Place of Birth', getValue: (p) => p.place_of_birth ?? p.placeOfBirth ?? null },
  countryOfBirth: { label: 'Country of Birth', getValue: (p) => p.country_of_birth ?? p.countryOfBirth ?? null },
  nationality: { label: 'Nationality', getValue: (p) => p.nationality ?? null },
  telephone: { label: 'Telephone', getValue: (p) => p.telephone ?? null },
  mobile: { label: 'Mobile', getValue: (p) => p.mobile ?? null },
  position: { label: 'Position / Rank', getValue: (p) => p.position ?? null },
  dischargeBookNumber: { label: 'Discharge Book No.', getValue: (p) => p.discharge_book_number ?? p.dischargeBookNumber ?? null },
  title: { label: 'Title', getValue: (p) => p.title ?? null },
  addressLine1: { label: 'Address Line 1', getValue: (p) => p.address_line1 ?? p.addressLine1 ?? null },
  addressLine2: { label: 'Address Line 2', getValue: (p) => p.address_line2 ?? p.addressLine2 ?? null },
  addressDistrict: { label: 'District', getValue: (p) => p.address_district ?? p.addressDistrict ?? null },
  addressTownCity: { label: 'Town / City', getValue: (p) => p.address_town_city ?? p.addressTownCity ?? null },
  addressCountyState: { label: 'County / State', getValue: (p) => p.address_county_state ?? p.addressCountyState ?? null },
  addressPostCode: { label: 'Post Code', getValue: (p) => p.address_post_code ?? p.addressPostCode ?? null },
  addressCountry: { label: 'Country', getValue: (p) => p.address_country ?? p.addressCountry ?? null },
  fullAddress: {
    label: 'Home Address',
    getValue: (p) => joinNonEmpty([
      p.address_line1 ?? p.addressLine1,
      p.address_line2 ?? p.addressLine2,
      p.address_district ?? p.addressDistrict,
      p.address_town_city ?? p.addressTownCity,
      p.address_county_state ?? p.addressCountyState,
      p.address_post_code ?? p.addressPostCode,
      p.address_country ?? p.addressCountry,
    ], ', '),
  },
  // Vessel
  vesselName: { label: 'Vessel Name', getValue: (_, v) => v?.name ?? null },
  vesselType: { label: 'Vessel Type', getValue: (_, v) => v?.type ?? null },
  vesselIMO: { label: 'IMO Number', getValue: (_, v) => v?.imo ?? v?.official_number ?? v?.officialNumber ?? null },
  vesselOfficialNumber: { label: 'Official Number', getValue: (_, v) => v?.official_number ?? v?.officialNumber ?? v?.imo ?? null },
  vesselFlag: { label: 'Flag State', getValue: (_, v) => v?.flag ?? v?.flag_state ?? null },
  vesselGrossTonnage: { label: 'Gross Tonnage', getValue: (_, v) => v?.gross_tonnage != null ? String(v.gross_tonnage) : null },
  vesselLength: { label: 'Length (m)', getValue: (_, v) => v?.length_m != null ? String(v.length_m) : null },
  vesselCallSign: { label: 'Call Sign', getValue: (_, v) => v?.call_sign ?? null },
  vesselMMSI: { label: 'MMSI', getValue: (_, v) => v?.mmsi ?? null },
  vesselBeam: { label: 'Beam (m)', getValue: (_, v) => v?.beam != null ? String(v.beam) : null },
  vesselDraft: { label: 'Draft (m)', getValue: (_, v) => v?.draft != null ? String(v.draft) : null },
  vesselNumberOfCrew: { label: 'Number of crew', getValue: (_, v) => v?.number_of_crew != null ? String(v.number_of_crew) : null },
  vesselBuildYear: { label: 'Year built', getValue: (_, v) => v?.build_year != null ? String(v.build_year) : null },
  vesselManagementCompany: { label: 'Management Company', getValue: (_, v) => v?.management_company ?? null },
  vesselCompanyAddress: { label: 'Company Address', getValue: (_, v) => v?.company_address ?? null },
  vesselCompanyContact: { label: 'Company Contact', getValue: (_, v) => v?.company_contact ?? null },
  // Captain
  captainName: { label: 'Captain Name', getValue: () => null }, // Filled at API level
  captainPosition: { label: 'Captain Position', getValue: () => null },
  captainSignature: { label: 'Captain Signature', getValue: () => null },
  // System — always-on computed values that don't depend on profile or vessel.
  // getValue returns a fresh stamp each fill; category = "system" in the picker.
  todayDate: {
    label: "Today's Date",
    getValue: () => new Date().toISOString().slice(0, 10),
  },
};

/**
 * Calculated sea time data passed from the frontend after the user runs Calculate.
 */
export interface SeaTimeData {
  startDate?: string;
  endDate?: string;
  totalDays?: number;
  atSeaDays?: number;
  standbyDays?: number;
  yardDays?: number;
  leaveDays?: number;
  underwayDays?: number;
  atAnchorDays?: number;
  inPortDays?: number;
}

/**
 * Alias rules: if Gemini returned profileKey="none" (or unknown), we try to
 * resolve a key by matching the document's fieldName/fieldDescription against
 * these regex patterns. This catches maritime-form label variations that the
 * model sometimes fails to classify (e.g. "Given names", "Seaman's book no.",
 * "D.O.B.", monthly standby-day table cells).
 *
 * Each entry is tried in order; the first match wins. Keep the MOST SPECIFIC
 * patterns first (so "first name" wins over "name").
 */
const FIELD_ALIASES: Array<{ key: string; pattern: RegExp }> = [
  // Date of birth (very specific — must come before generic "date")
  { key: 'dateOfBirth', pattern: /\b(date\s*of\s*birth|d[\.\s]*o[\.\s]*b|dob|born\s*on|birth\s*date)\b/i },
  { key: 'placeOfBirth', pattern: /\b(place|town|city)\s*of\s*birth\b/i },
  { key: 'countryOfBirth', pattern: /\bcountry\s*of\s*birth\b/i },

  // Name variants
  { key: 'firstName', pattern: /\b(first\s*name|given\s*name|christian\s*name|forename)s?\b/i },
  { key: 'lastName', pattern: /\b(last\s*name|sur\s*name|family\s*name)\b/i },
  { key: 'fullName', pattern: /\b(full\s*name|name\s*of\s*(seafarer|crew|applicant|holder)|seafarer'?s?\s*name|crew\s*member'?s?\s*name|name\s*in\s*full)\b/i },

  // Identity / books
  { key: 'dischargeBookNumber', pattern: /\b(discharge\s*book|seaman'?s?\s*book|seafarer'?s?\s*(identity|identification)|cdc\b|sid\b|s\.i\.d)\b/i },
  { key: 'nationality', pattern: /\b(nationality|citizenship)\b/i },

  // Contact
  { key: 'email', pattern: /\b(e[-\s]*mail|email\s*address)\b/i },
  { key: 'mobile', pattern: /\b(mobile|cell(ular)?|mob\b|cellphone)\b/i },
  { key: 'telephone', pattern: /\b(tele?phone|phone|land\s*line|home\s*phone)\b/i },

  // Position / rank
  { key: 'position', pattern: /\b(rank|position|capacity|role\s*on\s*board|position\s*held|rating|grade)\b/i },

  // Address parts
  { key: 'addressPostCode', pattern: /\b(post\s*code|postcode|zip(\s*code)?)\b/i },
  { key: 'addressCountry', pattern: /\bcountry\b/i },
  { key: 'addressCountyState', pattern: /\b(county|state|province|region)\b/i },
  { key: 'addressTownCity', pattern: /\b(town|city|locality|suburb)\b/i },
  { key: 'addressDistrict', pattern: /\b(district|neighbou?rhood)\b/i },
  { key: 'addressLine2', pattern: /\baddress\s*(line\s*)?2\b/i },
  { key: 'addressLine1', pattern: /\b(address\s*(line\s*)?1|street(\s*address)?|residential\s*address)\b/i },
  { key: 'fullAddress', pattern: /\b(home\s*address|postal\s*address|address\b)\b/i },

  // Vessel
  { key: 'vesselIMO', pattern: /\bimo(\s*(no\.?|number))?\b/i },
  { key: 'vesselMMSI', pattern: /\bmmsi\b/i },
  { key: 'vesselOfficialNumber', pattern: /\b(official\s*number|o\.?n\.?|on\s*number)\b/i },
  { key: 'vesselFlag', pattern: /\b(flag\s*state|flag|country\s*of\s*registry|port\s*of\s*registry)\b/i },
  { key: 'vesselType', pattern: /\b(type\s*of\s*(ship|vessel)|vessel\s*type|ship\s*type)\b/i },
  { key: 'vesselCallSign', pattern: /\b(call\s*sign)\b/i },
  { key: 'vesselGrossTonnage', pattern: /\b(gross\s*tonnage|g\.?t\.?|gt\b)\b/i },
  { key: 'vesselLength', pattern: /\b(length|loa\b|length\s*overall)\b/i },
  { key: 'vesselName', pattern: /\b(name\s*of\s*(ship|vessel)|vessel\s*name|ship\s*name)\b/i },
  { key: 'vesselManagementCompany', pattern: /\b(management\s*company|managing\s*owner|company\s*name)\b/i },
  { key: 'vesselCompanyAddress', pattern: /\bcompany\s*address\b/i },
  { key: 'vesselCompanyContact', pattern: /\bcompany\s*(contact|telephone|phone|email)\b/i },

  // Service — standby specifically caught here (table cells like "Days on standby")
  { key: 'atSeaDays', pattern: /\b(days?\s*at\s*sea|sea\s*days|at[-\s]*sea\s*days)\b/i },
  { key: 'standbyDays', pattern: /\b(standby\s*days?|days?\s*on\s*standby|harbou?r\s*days?|stand[-\s]*by)\b/i },
  { key: 'yardDays', pattern: /\b(yard\s*days?|refit\s*days?|days?\s*in\s*yard)\b/i },
  { key: 'leaveDays', pattern: /\b(leave\s*days?|days?\s*on\s*leave)\b/i },
  { key: 'totalDays', pattern: /\b(total\s*days?|days?\s*of\s*service|total\s*sea\s*service)\b/i },
  { key: 'servicePeriodStart', pattern: /\b(from|date\s*of\s*engagement|date\s*signed\s*on|date\s*joined|start\s*date|commencement)\b/i },
  { key: 'servicePeriodEnd', pattern: /\b(to\b|date\s*of\s*discharge|date\s*signed\s*off|date\s*left|end\s*date|completion)\b/i },

  // Captain
  { key: 'captainName', pattern: /\b(master|captain|commanding\s*officer|signed\s*by\s*master)\b/i },
];

/** Try to resolve a profileKey from the field's label/description text. */
function resolveAliasKey(fieldName: string, fieldDescription?: string): string | null {
  const haystack = `${fieldName} ${fieldDescription ?? ''}`.toLowerCase();
  for (const { key, pattern } of FIELD_ALIASES) {
    if (pattern.test(haystack)) return key;
  }
  return null;
}

/**
 * Context for a single row in a multi-vessel service table. When a scanned
 * document lists several vessels (e.g. "Row 1 — Vessel A", "Row 2 — Vessel
 * B"), each row's fields should be matched against THAT row's vessel and
 * service period — not the currently-selected vessel over and over.
 */
export interface RowContext {
  vessel?: Record<string, any> | null;
  /** Raw assignment date range for this row, used for servicePeriodStart/End. */
  assignmentStartDate?: string | null;
  assignmentEndDate?: string | null;
  /** Rank/position the crew held on this vessel for this assignment. */
  assignmentPosition?: string | null;
  /** Sea-time computed for this assignment's date window. */
  seaTime?: SeaTimeData | null;
  /** Optional captain name for this row. */
  captainName?: string | null;
}

/**
 * Pull a 1-based row index out of a field name. We look for patterns the AI
 * produces when a document has multiple vessel/service rows, e.g.:
 *   - "Sea service — Row 1 — Vessel name"        → 1
 *   - "Sea service table — Row 3 — Date of discharge" → 3
 *   - "Vessel 1 — IMO number"                    → 1
 *   - "Ship 2 - Flag state"                      → 2
 *   - "Service #4: Rank"                         → 4
 *
 * Returns null when no row numbering is present — callers should treat that
 * as "use the default / active-vessel context".
 */
export function extractRowIndex(fieldName: string): number | null {
  if (!fieldName) return null;
  const patterns: RegExp[] = [
    /\brow\s*#?\s*(\d+)\b/i,
    /\b(?:vessel|ship|entry|line|service)\s*#?\s*(\d+)\b/i,
    /#\s*(\d+)\b/,
  ];
  for (const re of patterns) {
    const m = fieldName.match(re);
    if (m) {
      const n = parseInt(m[1], 10);
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  return null;
}

/** Map from profileKey → sea time data getter */
const SEA_TIME_FIELD_MAP: Record<string, (d: SeaTimeData) => string | null> = {
  servicePeriodStart: (d) => d.startDate ?? null,
  servicePeriodEnd: (d) => d.endDate ?? null,
  totalDays: (d) => d.totalDays != null ? String(d.totalDays) : null,
  atSeaDays: (d) => d.atSeaDays != null ? String(d.atSeaDays) : null,
  standbyDays: (d) => d.standbyDays != null ? String(d.standbyDays) : null,
  yardDays: (d) => d.yardDays != null ? String(d.yardDays) : null,
  leaveDays: (d) => d.leaveDays != null ? String(d.leaveDays) : null,
  underwayDays: (d) => d.underwayDays != null ? String(d.underwayDays) : null,
  atAnchorDays: (d) => d.atAnchorDays != null ? String(d.atAnchorDays) : null,
  inPortDays: (d) => d.inPortDays != null ? String(d.inPortDays) : null,
};

/**
 * Match extracted fields against profile, vessel, and sea time data.
 * Returns an enriched list with suggestedValue and source info.
 *
 * `rowContexts` (optional) supports documents with multi-vessel service
 * tables. Pass an array where index N corresponds to "Row N" fields in the
 * document (1-based; index 0 is unused). Fields that mention a row number
 * will be matched against THAT row's vessel / assignment / sea-time rather
 * than against the active-vessel defaults — so a doc asking for all the
 * vessels the crew has served on gets each row filled with the right
 * vessel instead of the same vessel repeated.
 */
export function matchFieldsToProfile(
  // Accept an optional `rowIndex` on each item so callers that already
  // know the row number (e.g. the template resolver, which stores it
  // structurally on TemplateField) can bypass the label-parsing
  // fallback. The scanner path still passes plain ExtractedField items
  // and the label parser kicks in.
  extractedFields: (ExtractedField & { rowIndex?: number | null })[],
  profile: Record<string, any>,
  vessel: Record<string, any> | null,
  captainName?: string | null,
  seaTimeData?: SeaTimeData | null,
  rowContexts?: RowContext[] | null,
): Array<ExtractedField & { suggestedValue: string | null; source: string }> {
  return extractedFields.map((field) => {
    // Resolve the best key: prefer a valid model-provided profileKey, else fall back to alias regexes on the label text.
    const modelKey = field.profileKey && field.profileKey !== 'none' ? field.profileKey : null;
    const isKnownKey = (k: string | null): k is string =>
      !!k && (k in PROFILE_FIELD_MAP || k in SEA_TIME_FIELD_MAP || k === 'captainName' || k === 'captainPosition' || k === 'captainSignature');
    const aliasKey = !isKnownKey(modelKey) ? resolveAliasKey(field.fieldName, field.fieldDescription) : null;
    const key = isKnownKey(modelKey) ? modelKey : aliasKey;

    if (!key) {
      return { ...field, suggestedValue: null, source: 'manual' };
    }

    // Work out which row (if any) this field belongs to, and pick the
    // corresponding context. If the doc isn't a multi-vessel table, row
    // is null and we fall back to the active-vessel defaults. The
    // structured `field.rowIndex` (set by the template resolver when
    // the user explicitly picked a row in the builder) wins over the
    // label parser so renaming labels doesn't break multi-row fills.
    const rowIdx =
      field.rowIndex != null && field.rowIndex > 0
        ? field.rowIndex
        : extractRowIndex(field.fieldName);
    const rowCtx = rowIdx != null ? rowContexts?.[rowIdx] ?? null : null;
    const effVessel = rowCtx?.vessel ?? vessel;
    const effSeaTime = rowCtx?.seaTime ?? seaTimeData ?? null;
    const effCaptain = rowCtx?.captainName ?? captainName ?? null;

    // Special handling for captain fields
    if (key === 'captainName' && effCaptain) {
      return { ...field, profileKey: key, suggestedValue: effCaptain, source: 'captain' };
    }

    // Per-row rank/position overrides the profile's current rank when the
    // row's assignment has one (e.g. "Vessel 2 — Rank held").
    if (key === 'position' && rowCtx?.assignmentPosition) {
      return { ...field, profileKey: key, suggestedValue: rowCtx.assignmentPosition, source: 'vessel' };
    }

    // Per-row assignment dates cover service period start/end even when
    // the caller didn't supply sea-time data.
    if (key === 'servicePeriodStart' && rowCtx?.assignmentStartDate) {
      return { ...field, profileKey: key, suggestedValue: rowCtx.assignmentStartDate, source: 'vessel' };
    }
    if (key === 'servicePeriodEnd' && rowCtx?.assignmentEndDate) {
      return { ...field, profileKey: key, suggestedValue: rowCtx.assignmentEndDate, source: 'vessel' };
    }

    // Check sea time data first for service fields
    if (effSeaTime && SEA_TIME_FIELD_MAP[key]) {
      const value = SEA_TIME_FIELD_MAP[key](effSeaTime);
      if (value) {
        return { ...field, profileKey: key, suggestedValue: value, source: 'calculated' };
      }
    }

    const mapping = PROFILE_FIELD_MAP[key];
    if (!mapping) {
      return { ...field, profileKey: key, suggestedValue: null, source: 'manual' };
    }

    const value = mapping.getValue(profile, effVessel);
    const source = key.startsWith('vessel') ? 'vessel' : 'profile';
    return {
      ...field,
      profileKey: key,
      suggestedValue: value ?? null,
      source: value ? source : 'manual',
    };
  });
}
