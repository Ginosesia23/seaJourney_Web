import { z } from 'zod';
import { vesselTypeValues } from '@/lib/vessel-types';
import type { Vessel } from '@/lib/types';

export const vesselDetailsSchema = z.object({
  name: z.string().min(1, 'Vessel name is required'),
  type: z.enum(vesselTypeValues, { required_error: 'Vessel type is required' }),
  imo: z.string().optional().or(z.literal('')),
  length_m: z.string().optional().or(z.literal('')),
  beam: z.string().optional().or(z.literal('')),
  draft: z.string().optional().or(z.literal('')),
  gross_tonnage: z.string().optional().or(z.literal('')),
  number_of_crew: z.string().optional().or(z.literal('')),
  build_year: z.string().optional().or(z.literal('')),
  flag_state: z.string().optional().or(z.literal('')),
  call_sign: z.string().optional().or(z.literal('')),
  mmsi: z.string().optional().or(z.literal('')),
  description: z.string().optional().or(z.literal('')),
  management_company: z.string().optional().or(z.literal('')),
  company_address: z.string().optional().or(z.literal('')),
  company_email: z.string().optional().or(z.literal('')),
  company_phone: z.string().optional().or(z.literal('')),
});

export type VesselDetailsFormValues = z.infer<typeof vesselDetailsSchema>;

export function parseCompanyContact(contact: string | null | undefined): { email: string; phone: string } {
  if (!contact) return { email: '', phone: '' };

  const emailRegex = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi;
  const phoneRegex = /(\+?[\d\s\-()]{10,})/g;

  const emailMatch = contact.match(emailRegex);
  const phoneMatch = contact.match(phoneRegex);

  const telMatch = contact.match(/Tel[:\s]+([^\s,]+)/i) || contact.match(/Phone[:\s]+([^\s,]+)/i);
  const emailMatchStructured = contact.match(/Email[:\s]+([^\s,]+)/i);

  return {
    email: emailMatchStructured ? emailMatchStructured[1] : emailMatch ? emailMatch[0] : '',
    phone: telMatch ? telMatch[1] : phoneMatch ? phoneMatch[0] : '',
  };
}

export function combineCompanyContact(email: string, phone: string): string | null {
  const parts: string[] = [];
  if (phone.trim()) parts.push(`Tel: ${phone.trim()}`);
  if (email.trim()) parts.push(`Email: ${email.trim()}`);
  return parts.length > 0 ? parts.join(', ') : null;
}

/** Map DB / `Vessel` record into react-hook-form default values. */
export function vesselToFormDefaults(vessel: Partial<Vessel> & Record<string, unknown>): VesselDetailsFormValues {
  const raw = vessel as Record<string, unknown>;
  const companyContact =
    (typeof raw.company_contact === 'string' ? raw.company_contact : null) ||
    (typeof raw.companyContact === 'string' ? raw.companyContact : null);
  const parsed = parseCompanyContact(companyContact);
  const imo = raw.imo ?? raw.officialNumber;
  const rawType = (vessel.type as string) || '';
  const type = (vesselTypeValues as readonly string[]).includes(rawType)
    ? (rawType as VesselDetailsFormValues['type'])
    : vesselTypeValues[0];

  return {
    name: (vessel.name as string) || '',
    type,
    imo: imo != null ? String(imo) : '',
    length_m: vessel.length_m != null ? String(vessel.length_m) : '',
    beam: vessel.beam != null ? String(vessel.beam) : '',
    draft: vessel.draft != null ? String(vessel.draft) : '',
    gross_tonnage: vessel.gross_tonnage != null ? String(vessel.gross_tonnage) : '',
    number_of_crew: vessel.number_of_crew != null ? String(vessel.number_of_crew) : '',
    build_year: vessel.build_year != null ? String(vessel.build_year) : '',
    flag_state: (vessel.flag as string) || (vessel.flag_state as string) || '',
    call_sign: (vessel.call_sign as string) || '',
    mmsi: (vessel.mmsi as string) || '',
    description: (vessel.description as string) || '',
    management_company: (vessel.management_company as string) || '',
    company_address: (vessel.company_address as string) || '',
    company_email: parsed.email,
    company_phone: parsed.phone,
  };
}

/** Body for `PUT /api/vessels/update` from validated form values. */
export function buildVesselUpdatePayloadFromForm(data: VesselDetailsFormValues) {
  const company_contact = combineCompanyContact(data.company_email || '', data.company_phone || '');

  return {
    name: data.name,
    type: data.type,
    length_m: data.length_m === '' ? null : data.length_m,
    beam: data.beam === '' ? null : data.beam,
    draft: data.draft === '' ? null : data.draft,
    gross_tonnage: data.gross_tonnage === '' ? null : data.gross_tonnage,
    number_of_crew: data.number_of_crew === '' ? null : data.number_of_crew,
    build_year: data.build_year === '' ? null : data.build_year,
    imo: data.imo === '' ? null : data.imo,
    flag: data.flag_state === '' ? null : data.flag_state,
    call_sign: data.call_sign === '' ? null : data.call_sign,
    mmsi: data.mmsi === '' ? null : data.mmsi,
    description: data.description === '' ? null : data.description,
    management_company: data.management_company === '' ? null : data.management_company,
    company_address: data.company_address === '' ? null : data.company_address,
    company_contact,
  };
}
