import { publiekAdres } from '../config';
import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import catalogus from '../catalogus.json';
import type { Gebruiksteller } from '../gebruiksteller';
import type { PremiumSkillNaam } from '../premium-namen';

export type { PremiumSkillNaam } from '../premium-namen';

export interface SkillItem {
  slug: string;
  naam: string;
  cluster: string;
  beschrijving: string;
  pagina: string;
  download: string;
}

export interface SkillTreffer extends SkillItem {
  score: number;
}

export interface PremiumTreffer extends PremiumSkillNaam {
  score: number;
}

export type GemengdeTreffer =
  | { soort: 'gratis'; skill: SkillTreffer }
  | { soort: 'premium'; skill: PremiumTreffer };

const STANDAARD_MAX = 5;

function termen(onderwerp: string): string[] {
  return onderwerp
    .toLowerCase()
    .split(/[^a-zà-ÿ0-9]+/)
    .filter((t) => t.length >= 2);
}

/**
 * Een treffer in de naam weegt zwaarder dan een treffer in de beschrijving,
 * omdat de beschrijvingen lang zijn en veel losse trefwoorden bevatten.
 */
function scoreVoor(
  zoektermen: readonly string[],
  velden: { naam: string; slug: string; cluster: string; tekst: string },
): number {
  const naam = velden.naam.toLowerCase();
  const slug = velden.slug.toLowerCase();
  const cluster = velden.cluster.toLowerCase();
  const tekst = velden.tekst.toLowerCase();

  let score = 0;
  for (const term of zoektermen) {
    if (naam.includes(term)) score += 10;
    else if (slug.includes(term)) score += 6;
    if (cluster.includes(term)) score += 3;
    if (tekst.includes(term)) score += 2;
  }
  return score;
}

/** Doorzoekt de gratis catalogus op onderwerp. Puur en zonder netwerk. */
export function zoekSkills(
  items: readonly SkillItem[],
  onderwerp: string,
  max: number = STANDAARD_MAX,
): SkillTreffer[] {
  return zoekMetPremium(items, [], onderwerp, max)
    .flatMap((t) => (t.soort === 'gratis' ? [t.skill] : []));
}

/**
 * Doorzoekt de gratis catalogus en, als het platform die meegeeft, de
 * premiumnamen. Beide komen in een ranglijst; max geldt voor het geheel.
 */
export function zoekMetPremium(
  gratis: readonly SkillItem[],
  premium: readonly PremiumSkillNaam[],
  onderwerp: string,
  max: number = STANDAARD_MAX,
): GemengdeTreffer[] {
  const zoektermen = termen(onderwerp);
  if (zoektermen.length === 0) return [];

  const alle: GemengdeTreffer[] = [
    ...gratis.map((item): GemengdeTreffer => ({
      soort: 'gratis',
      skill: {
        ...item,
        score: scoreVoor(zoektermen, { ...item, tekst: item.beschrijving }),
      },
    })),
    ...premium.map((item): GemengdeTreffer => ({
      soort: 'premium',
      skill: { ...item, score: scoreVoor(zoektermen, { ...item, cluster: '', tekst: item.zin }) },
    })),
  ];

  return alle
    .filter((t) => t.skill.score > 0)
    .sort((a, b) => b.skill.score - a.skill.score || a.skill.naam.localeCompare(b.skill.naam))
    .slice(0, max);
}

function kort(tekst: string, maxLengte = 240): string {
  if (tekst.length <= maxLengte) return tekst;
  return `${tekst.slice(0, maxLengte).replace(/\s+\S*$/, '')}…`;
}

function trefferNaarTekst(treffer: GemengdeTreffer, nummer: number): string {
  if (treffer.soort === 'premium') {
    const t = treffer.skill;
    return [
      `${nummer}. ${t.naam} (premium)`,
      `   ${kort(t.zin)}`,
      '   Geen zip-download: premium skills komen via je verbonden TheSEO-account.',
    ].join('\n');
  }
  const t = treffer.skill;
  return [
    `${nummer}. ${t.naam} (cluster: ${t.cluster})`,
    `   ${kort(t.beschrijving)}`,
    `   Pagina: ${publiekAdres(t.pagina)}`,
    `   Download: ${publiekAdres(t.download)}`,
  ].join('\n');
}

function beschrijving(metPremium: boolean): string {
  const basis = `Doorzoekt de catalogus van ${catalogus.aantal} gratis Nederlandstalige Claude-skills van `
    + 'theseo.nl op onderwerp (bijvoorbeeld "swot", "copywriting", "beslissen", "linkedin"). '
    + 'Geeft per treffer de naam, beschrijving, de pagina met uitleg en de directe download-URL '
    + 'van de zip terug. Alle skills zijn gratis en werken in Claude, Claude Code en andere '
    + 'omgevingen die Agent Skills ondersteunen.';
  if (!metPremium) return basis;
  return `${basis} Voor deze verbinding staan ook de premium skills van TheSEO in de treffers, `
    + 'met naam en een korte zin; die hebben geen zip-download.';
}

/**
 * Registreert skill_zoeken. `premium` is leeg tenzij het platform een
 * gevalideerde lijst meegeeft voor een ingelogde abonnee.
 */
export function registreerSkillZoeken(
  server: McpServer,
  telGebruik: Gebruiksteller,
  premium: readonly PremiumSkillNaam[] = [],
): void {
  server.registerTool(
    'skill_zoeken',
    {
      title: 'Gratis Claude-skill zoeken',
      description: beschrijving(premium.length > 0),
      inputSchema: z.object({
        onderwerp: z
          .string()
          .min(2)
          .max(200)
          .describe('Waar de skill over moet gaan, in een paar woorden'),
        max: z
          .number()
          .int()
          .min(1)
          .max(20)
          .optional()
          .describe(`Maximum aantal resultaten (standaard ${STANDAARD_MAX})`),
      }),
      // title ook in annotations: de Claude-directory leest hem daar (portaal 28-10-2026).
      annotations: { title: 'Gratis Claude-skill zoeken', readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ onderwerp, max }) => {
      telGebruik('skill_zoeken');
      const treffers = zoekMetPremium(catalogus.skills, premium, onderwerp, max ?? STANDAARD_MAX);

      if (treffers.length === 0) {
        return {
          content: [{
            type: 'text',
            text:
              `Geen skill gevonden voor "${onderwerp}". Probeer een breder trefwoord `
              + `(bijvoorbeeld "strategie", "schrijven", "coaching") of bekijk de volledige `
              + `catalogus van ${catalogus.aantal} skills op ${catalogus.bron}`,
          }],
        };
      }

      const tekst = [
        `${treffers.length} skill(s) gevonden voor "${onderwerp}":`,
        '',
        ...treffers.map((t, i) => trefferNaarTekst(t, i + 1)),
        '',
        `Volledige catalogus (${catalogus.aantal} skills): ${catalogus.bron}`,
      ].join('\n');

      return { content: [{ type: 'text', text: tekst }] };
    },
  );
}
