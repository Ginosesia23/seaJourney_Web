/**
 * MCA MSF 4274 OOW / CoC oral examination application helpers.
 *
 * Official requirements (MSF 4274 / MSN 1856):
 * - Form MSF 4274 for Notice of Eligibility (NOE)
 * - Supporting docs: attested passport, ENG1, photos, discharge book/COD,
 *   sea-service testimonials with watchkeeping evidence, fee
 * - OOW sea service (merchant routes):
 *   Examination: 36 months + 6 months bridge watchkeeping
 *   Foundation Degree: 12 months + 6 months bridge watchkeeping
 *   HNC/HND (+ MNTB TRB): 12 months + 6 months bridge watchkeeping
 *   AMET: 15 months + 6 months bridge watchkeeping
 *
 * SeaJourney stores the generated application metadata and helps assemble
 * testimonials / watch evidence; it does not submit to the MCA.
 */

import { z } from 'zod';
import type { OOWCertificateType } from '@/lib/pdf-generator';

export type OowTrainingRoute =
  | 'examination'
  | 'foundation_degree'
  | 'hnc_hnd'
  | 'amet'
  | 'other';

/** Approximate calendar-day targets derived from MCA month requirements. */
export const OOW_ROUTE_REQUIREMENTS: Record<
  OowTrainingRoute,
  {
    label: string;
    description: string;
    seaMonths: number;
    seaDays: number;
    watchkeepingMonths: number;
    watchkeepingDays: number;
  }
> = {
  examination: {
    label: 'Examination route',
    description: '36 months sea service with 6 months bridge watchkeeping',
    seaMonths: 36,
    seaDays: 1095,
    watchkeepingMonths: 6,
    watchkeepingDays: 180,
  },
  foundation_degree: {
    label: 'Foundation Degree',
    description: '12 months sea service with 6 months bridge watchkeeping',
    seaMonths: 12,
    seaDays: 365,
    watchkeepingMonths: 6,
    watchkeepingDays: 180,
  },
  hnc_hnd: {
    label: 'HNC / HND (with MNTB Training Record Book)',
    description: '12 months sea service with 6 months bridge watchkeeping',
    seaMonths: 12,
    seaDays: 365,
    watchkeepingMonths: 6,
    watchkeepingDays: 180,
  },
  amet: {
    label: 'AMET',
    description: '15 months sea service with 6 months bridge watchkeeping',
    seaMonths: 15,
    seaDays: 450,
    watchkeepingMonths: 6,
    watchkeepingDays: 180,
  },
  other: {
    label: 'Other / unsure',
    description: 'Uses the examination-route targets as a conservative guide',
    seaMonths: 36,
    seaDays: 1095,
    watchkeepingMonths: 6,
    watchkeepingDays: 180,
  },
};

export const oowCertificateTypeEnum = z.enum([
  'ii3_oow_lt500gt_d',
  'ii3_oow_lt500gt_nc',
  'ii1_oow_unlimited',
  'ii2_cm_lt3000gt_nc',
  'ii2_cm_lt3000gt_unlimited',
  'ii2_cm_unlimited_nc',
  'ii2_cm_unlimited_unlimited',
  'ii3_master_lt500gt_d',
  'ii3_master_lt500gt_nc',
  'ii2_master_lt3000gt_specified',
  'ii2_master_lt3000gt_unlimited',
  'ii2_master_unlimited_nc',
  'ii2_master_unlimited_unlimited',
]);

export const oowApplicationSchema = z.object({
  certificate_type: oowCertificateTypeEnum,
  training_route: z.enum([
    'examination',
    'foundation_degree',
    'hnc_hnd',
    'amet',
    'other',
  ]),
  supportingEvidence: z.object({
    attestedPassport: z.boolean().default(false),
    payment: z.boolean().default(false),
    dischargeBookOrCd: z.boolean().default(false),
    seaServiceTestimonials: z.boolean().default(false),
    passportPhoto: z.boolean().default(false),
    stcwBasicTraining: z.boolean().default(false),
    securityAwareness: z.boolean().default(false),
    medical: z.boolean().default(false),
    advancedFireFighting: z.boolean().default(false),
    medicalFirstAid: z.boolean().default(false),
    efficientDeckHand: z.boolean().default(false),
    gmdssGoc: z.boolean().default(false),
  }),
  signatureDataUrl: z.string().optional(),
});

export type OOWApplicationFormValues = z.infer<typeof oowApplicationSchema>;

export const oowApplicationDefaultValues: OOWApplicationFormValues = {
  certificate_type: 'ii1_oow_unlimited',
  training_route: 'examination',
  supportingEvidence: {
    attestedPassport: false,
    payment: false,
    dischargeBookOrCd: false,
    seaServiceTestimonials: false,
    passportPhoto: false,
    stcwBasicTraining: false,
    securityAwareness: false,
    medical: false,
    advancedFireFighting: false,
    medicalFirstAid: false,
    efficientDeckHand: false,
    gmdssGoc: false,
  },
  signatureDataUrl: undefined,
};

export const OOW_CERTIFICATE_LABELS: Record<OOWCertificateType, string> = {
  ii3_oow_lt500gt_d: 'II/3 OOW, Less than 500GT, Category "D" Waters',
  ii3_oow_lt500gt_nc: 'II/3 OOW, Less than 500GT, Near Coastal Waters',
  ii1_oow_unlimited: 'II/1 OOW Unlimited',
  ii2_cm_lt3000gt_nc: 'II/2 Chief Mate, Less than 3000GT, Near Coastal Waters',
  ii2_cm_lt3000gt_unlimited: 'II/2 Chief Mate, Less than 3000GT, Unlimited Area',
  ii2_cm_unlimited_nc: 'II/2 Chief Mate, Unlimited Tonnage, Near Coastal Waters',
  ii2_cm_unlimited_unlimited: 'II/2 Chief Mate, Unlimited Tonnage, Unlimited Area',
  ii3_master_lt500gt_d: 'II/3 Master, Less than 500GT, Category "D" Waters',
  ii3_master_lt500gt_nc: 'II/3 Master, Less than 500GT, Near Coastal Waters',
  ii2_master_lt3000gt_specified: 'II/2 Master, Less than 3000GT, Specified Area, Domestic',
  ii2_master_lt3000gt_unlimited: 'II/2 Master, Less than 3000GT, Unlimited Area',
  ii2_master_unlimited_nc: 'II/2 Master, Unlimited Tonnage, Near Coastal Waters',
  ii2_master_unlimited_unlimited: 'II/2 Master, Unlimited Tonnage, Unlimited Area',
};

export function getOowRouteRequirements(route: OowTrainingRoute) {
  return OOW_ROUTE_REQUIREMENTS[route] || OOW_ROUTE_REQUIREMENTS.examination;
}
