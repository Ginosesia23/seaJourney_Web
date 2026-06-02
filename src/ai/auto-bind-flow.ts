/**
 * Second-pass binding classifier.
 *
 * The primary `scanDocument` flow (in `document-scan-flow.ts`) does the
 * heavy lifting — it looks at the document, finds the fillable blanks,
 * measures their bounding boxes, and *attempts* to bind each one to a
 * profile key from the canonical list. The model is good at the visual
 * part (locating the blanks) but is surprisingly noisy at the binding
 * step:
 *
 *   - Niche labels slip through ("Days alongside in port", "Sum of
 *     standby + at-sea", "Master's surname")
 *   - Multi-line labels get truncated and lose context
 *   - "Other" category gets used as a default when the model can't decide
 *
 * The local alias regex catches the most common variations, but maritime
 * forms are diverse enough that we still leave ~30% of fields unbound
 * after the first pass. That's exactly the work the vessel manager has
 * to do by hand — and the part the user asked us to automate.
 *
 * This module addresses that. It exposes a lightweight, text-only AI
 * call that takes a batch of `(fieldName, fieldDescription)` pairs and
 * the canonical profile-key catalog, and returns a best-effort binding
 * for each one plus a confidence score. The API route uses the score to
 * decide whether to apply the binding automatically (≥0.65) or surface
 * it as a suggestion (the editor can render a "did you mean…" hint).
 *
 * Key properties:
 *   - Text-only model call → much cheaper than the vision pass.
 *   - Receives the FULL profile-key catalog so it can pick niche keys
 *     like `atAnchorDays` or `vesselMMSI` that the alias regex misses.
 *   - Returns a confidence score so callers can apply / surface as
 *     suggestion based on their own threshold.
 *   - Includes a separate `isCalculable` hint for fields whose label
 *     reads like a derived value (e.g. "Total days = A + B"). Callers
 *     can use this to pre-select the calculated widget on save.
 */

import { ai } from './genkit';
import { z } from 'zod';

/**
 * Input shape — a single field to classify. We only need the label +
 * (optional) description for binding; the bounding-box stuff is
 * irrelevant to a text-only classifier. The `id` is opaque to the
 * model; we use it on the way back so callers don't have to re-match
 * by label.
 */
export interface AutoBindInputField {
  id: string;
  fieldName: string;
  fieldDescription?: string | null;
}

/**
 * Output schema — one suggestion per input field. `profileKey` is the
 * key from the catalog (or `null` when nothing fits). `confidence`
 * lives on [0, 1]; we ask the model to be conservative (no over-eager
 * 0.95s) so the threshold below cleanly separates "apply" from
 * "suggest".
 */
const AutoBindFieldSuggestionSchema = z.object({
  id: z.string().describe('Echo back the id we sent — used to re-match on the caller side.'),
  profileKey: z
    .string()
    .nullable()
    .describe(
      'The canonical profile key that should fill this field, or null if no key fits. MUST be a key from the catalog (or null). Never invent new keys.',
    ),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe(
      'How sure you are this binding is correct, on [0,1]. Use 0.9+ only for obvious matches like "Date of Birth" → dateOfBirth. Use 0.6-0.8 for educated guesses. Use ≤0.5 when there are multiple plausible keys.',
    ),
  isCalculable: z
    .boolean()
    .optional()
    .describe(
      'True when the label clearly implies a derived value (e.g. "Total days = at sea + standby", "Sum of …", "X + Y"). This is a hint for the editor to pre-wire a calculated field — orthogonal to profileKey.',
    ),
  reason: z
    .string()
    .optional()
    .describe(
      'One short sentence explaining the match. Helps the user understand low-confidence picks.',
    ),
});

const AutoBindOutputSchema = z.object({
  suggestions: z.array(AutoBindFieldSuggestionSchema),
});

export type AutoBindSuggestion = z.infer<typeof AutoBindFieldSuggestionSchema>;
export type AutoBindOutput = z.infer<typeof AutoBindOutputSchema>;

/**
 * The catalog handed to the model. Keep this in sync with
 * PROFILE_KEY_OPTIONS in `lib/vessel-document-templates.ts`. We embed it
 * directly into the prompt rather than parameterising at runtime so the
 * model can rely on a fixed reference — passing an arbitrary list per
 * call invites the model to invent keys when the list looks unusual.
 */
const PROFILE_KEY_CATALOG = `Personal:
  - fullName: full name (first + last) of the seafarer/crew member
  - firstName: given name only
  - lastName: surname/family name only
  - title: title (Mr / Mrs / Dr / etc.)
  - email: email address
  - dateOfBirth: date of birth / DOB / "born on"
  - placeOfBirth: town/city of birth
  - countryOfBirth: country of birth
  - nationality: nationality / citizenship
  - telephone: landline / home phone
  - mobile: mobile / cell phone
  - position: current rank / role / capacity / grade / rating
  - dischargeBookNumber: discharge book / seaman's book / CDC / SID

Address (use these for individual line components, fullAddress for a single big "home address" blank):
  - fullAddress: comma-joined full home/postal address
  - addressLine1: street / first line
  - addressLine2: second line / apt / building
  - addressDistrict: district / neighbourhood
  - addressTownCity: town / city / locality / suburb
  - addressCountyState: county / state / province / region
  - addressPostCode: post code / postcode / ZIP
  - addressCountry: country (address)

Vessel (these refer to the vessel the form is being filled for):
  - vesselName: vessel/ship name
  - vesselType: type/class of vessel
  - vesselIMO: IMO number
  - vesselOfficialNumber: official number / O.N.
  - vesselFlag: flag state / port of registry country
  - vesselGrossTonnage: gross tonnage / GT
  - vesselLength: length overall / LOA
  - vesselBeam: beam / width
  - vesselDraft: draft / draught
  - vesselNumberOfCrew: number of crew / crew complement
  - vesselBuildYear: build year / year built
  - vesselCallSign: call sign
  - vesselMMSI: MMSI
  - vesselManagementCompany: management company / owner / managing owner
  - vesselCompanyAddress: company address
  - vesselCompanyContact: company phone / email / contact

Sea time & service (auto-calculated for the chosen date range when the form is filled):
  - servicePeriodStart: start of service period / "From" / date of engagement / signed on
  - servicePeriodEnd: end of service period / "To" / date of discharge / signed off
  - totalDays: total days (all categories) in the period
  - atSeaDays: days at sea / sea days
  - standbyDays: standby days / harbour days / days on standby
  - yardDays: yard / refit days
  - leaveDays: leave days
  - underwayDays: days actively underway (subset of at-sea)
  - atAnchorDays: at-anchor days (subset of at-sea)
  - inPortDays: in-port / alongside days (subset of standby)

Captain / approver:
  - captainName: master / captain / commanding officer name
  - captainPosition: master's position / rank
  - captainSignature: master's signature (image, captured at sign-off)

System (computed at fill time):
  - todayDate: today's date — for "date signed" / "date completed" fields`;

const AUTO_BIND_PROMPT = `You are a maritime form-binding classifier. You receive a batch of form field labels (with optional descriptions) extracted from maritime/sea-service paperwork, and the canonical catalog of profile keys our app can auto-fill from. Your job is to map each field to the BEST matching key from the catalog, or return null when nothing fits.

CATALOG:
${PROFILE_KEY_CATALOG}

RULES:
1. Pick the BEST single key from the catalog above. Do not invent keys.
2. If the field is a row inside a multi-vessel sea-service table (e.g. "Sea service — Row 2 — Vessel name"), bind to the BASE key (vesselName) — the caller handles row distribution separately. The "— Row N —" markers in the label are an instruction to the caller, not part of the binding.
3. Use the description (if present) only as additional context for ambiguous labels. Most decisions should be possible from the label alone.
4. Confidence calibration — be honest:
   - 0.95–1.0: unambiguous synonym (e.g. "Date of Birth" → dateOfBirth, "IMO No." → vesselIMO)
   - 0.75–0.95: clear maritime variant (e.g. "Discharge book no." → dischargeBookNumber, "Days at sea" → atSeaDays)
   - 0.55–0.75: educated guess based on context (e.g. "Days" alone in a sea-time table → atSeaDays if columns are sea-related)
   - <0.55: real ambiguity — pick the most plausible key but flag the uncertainty
   - null: no plausible match (free-text remarks/comments, signatures, decorative fields)
5. Set isCalculable=true ONLY when the label explicitly implies a derivation from other fields on the same form (e.g. "Total (= A + B)", "Sum of all monthly totals", "Standby × Day rate", "Net days = gross – leave"). Do NOT set it for sea-time keys that are auto-filled by the site (atSeaDays, totalDays etc. on their own are NOT calculations — they are site values).
6. Multi-line labels and table column headers count too. Read the WHOLE label text.

EXAMPLES (illustrative — keys come from the catalog above):
  "Family name" → lastName (confidence 0.95)
  "D.O.B." → dateOfBirth (confidence 0.95)
  "Type of ship" → vesselType (confidence 0.9)
  "Days alongside in port" → inPortDays (confidence 0.85)
  "Days on standby" → standbyDays (confidence 0.9)
  "Date of engagement" → servicePeriodStart (confidence 0.9)
  "Total (sea + standby + yard + leave)" → totalDays, isCalculable=true (confidence 0.8)
  "Comments by master" → null (confidence 0.5)
  "Insert tick here" → null (confidence 0.5)

Return strict JSON matching the output schema, with one suggestion per input field (in the same order, with id echoed back).`;

/**
 * Cheap text-only model. We deliberately pick `gemini-2.5-flash-lite`
 * because the catalog is small, the input is short, and we don't need
 * vision. Keep the override knob so prod can swap to a stronger model
 * on a paid plan without redeploying.
 */
const AUTO_BIND_MODEL =
  process.env.DOCUMENT_AUTO_BIND_MODEL || 'googleai/gemini-2.5-flash-lite';

/** Confidence below which we don't even *suggest* a binding. */
export const AUTO_BIND_MIN_CONFIDENCE = 0.4;

/** Default threshold for *applying* a binding automatically (used by /api/document-scan). */
export const AUTO_BIND_APPLY_THRESHOLD = 0.65;

/**
 * Run the second-pass classifier on a batch of unbound fields. Returns
 * one entry per input field (same ids) — caller should fold these back
 * into its own field list.
 *
 * Resilient to model errors: on failure, returns an empty array rather
 * than throwing, so the calling API route can degrade gracefully and
 * still return the first-pass results.
 */
export async function autoBindFields(
  fields: AutoBindInputField[],
): Promise<AutoBindSuggestion[]> {
  if (fields.length === 0) return [];

  // Compact JSON keeps the prompt short — the model needs to see this
  // as data, not as another instruction wall.
  const payload = JSON.stringify(
    fields.map((f) => ({
      id: f.id,
      fieldName: f.fieldName,
      fieldDescription: f.fieldDescription ?? undefined,
    })),
  );

  try {
    const response = await ai.generate({
      model: AUTO_BIND_MODEL,
      prompt: [
        { text: AUTO_BIND_PROMPT },
        {
          text: `Classify these fields and return one suggestion per id. Input: ${payload}`,
        },
      ],
      output: { schema: AutoBindOutputSchema },
    });
    const output = response.output;
    if (!output) return [];

    // Belt-and-braces: filter to ids we actually sent, drop anything below
    // the floor confidence. Keeps the response shape predictable.
    const allowedIds = new Set(fields.map((f) => f.id));
    return output.suggestions
      .filter((s) => allowedIds.has(s.id))
      .filter((s) => s.confidence >= AUTO_BIND_MIN_CONFIDENCE);
  } catch (err) {
    console.error('[auto-bind-flow] classifier call failed:', err);
    return [];
  }
}
