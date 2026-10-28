import * as z from 'zod/v4';

/**
 * Een premium skill zoals skill_zoeken hem mag tonen: alleen een slug, een
 * naam en een zin. Deze publieke repo kent zelf geen enkele premium skill;
 * het platform geeft de lijst per verzoek mee, en alleen voor een ingelogde
 * abonnee (BOUWPLAN 2.7 golf 0; ontwerp-verkoop 307). Anoniem blijft de lijst
 * leeg en toont skill_zoeken alleen de gratis catalogus.
 */
export interface PremiumSkillNaam {
  slug: string;
  naam: string;
  zin: string;
}

const GEEN_LINK = /https?:\/\/|www\./i;
const MAX_PREMIUM = 500;

const premiumSkillSchema = z.strictObject({
  slug: z.string().max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug alleen kleine letters, cijfers en koppeltekens'),
  naam: z.string().trim().min(2).max(120).refine((t) => !GEEN_LINK.test(t), 'geen link in de naam'),
  zin: z.string().trim().min(10).max(300).refine((t) => !GEEN_LINK.test(t), 'geen link in de zin'),
});

const premiumLijstSchema = z.array(premiumSkillSchema).max(MAX_PREMIUM);

/** Per invoerlijst een keer valideren: het platform geeft meestal dezelfde lijst mee. */
const alGevalideerd = new WeakMap<object, readonly PremiumSkillNaam[]>();

/**
 * Controleert de premiumlijst van het platform en geeft een bevroren kopie
 * terug. Een fout is een programmeerfout aan de kant van het platform, dus
 * dit gooit een TypeError met de reden in plaats van stil iets weg te laten.
 * Het platform kan deze functie ook zelf een keer aanroepen in een test.
 */
export function valideerPremiumSkills(lijst: unknown): readonly PremiumSkillNaam[] {
  if (lijst === undefined) return [];
  if (typeof lijst === 'object' && lijst !== null) {
    const bekend = alGevalideerd.get(lijst);
    if (bekend) return bekend;
  }

  const uitkomst = premiumLijstSchema.safeParse(lijst);
  if (!uitkomst.success) {
    const reden = uitkomst.error.issues
      .map((issue) => `${issue.path.join('.') || 'lijst'}: ${issue.message}`)
      .join('; ');
    throw new TypeError(`premiumSkills is ongeldig: ${reden}`);
  }

  const bevroren = Object.freeze(uitkomst.data.map((item) => Object.freeze({ ...item })));
  if (typeof lijst === 'object' && lijst !== null) alGevalideerd.set(lijst, bevroren);
  return bevroren;
}
