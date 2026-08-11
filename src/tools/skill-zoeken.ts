import { publiekAdres } from '../config';
import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import catalogus from '../catalogus.json';

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

const STANDAARD_MAX = 5;

function termen(onderwerp: string): string[] {
  return onderwerp
    .toLowerCase()
    .split(/[^a-zà-ÿ0-9]+/)
    .filter((t) => t.length >= 2);
}

/**
 * Doorzoekt de skill-catalogus op onderwerp. Puur en zonder netwerk, zodat
 * hij los testbaar is. Een treffer in de naam weegt zwaarder dan een treffer
 * in de beschrijving, omdat de beschrijvingen lang zijn en veel losse
 * trefwoorden bevatten.
 */
export function zoekSkills(
  items: readonly SkillItem[],
  onderwerp: string,
  max: number = STANDAARD_MAX,
): SkillTreffer[] {
  const zoektermen = termen(onderwerp);
  if (zoektermen.length === 0) return [];

  const scored = items.map((item) => {
    const naam = item.naam.toLowerCase();
    const slug = item.slug.toLowerCase();
    const cluster = item.cluster.toLowerCase();
    const beschrijving = item.beschrijving.toLowerCase();

    let score = 0;
    for (const term of zoektermen) {
      if (naam.includes(term)) score += 10;
      else if (slug.includes(term)) score += 6;
      if (cluster.includes(term)) score += 3;
      if (beschrijving.includes(term)) score += 2;
    }
    return { ...item, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.naam.localeCompare(b.naam))
    .slice(0, max);
}

function kort(tekst: string, maxLengte = 240): string {
  if (tekst.length <= maxLengte) return tekst;
  return `${tekst.slice(0, maxLengte).replace(/\s+\S*$/, '')}…`;
}

export function registreerSkillZoeken(server: McpServer): void {
  server.registerTool(
    'skill_zoeken',
    {
      title: 'Gratis Claude-skill zoeken',
      description:
        `Doorzoekt de catalogus van ${catalogus.aantal} gratis Nederlandstalige Claude-skills van `
        + 'theseo.nl op onderwerp (bijvoorbeeld "swot", "copywriting", "beslissen", "linkedin"). '
        + 'Geeft per treffer de naam, beschrijving, de pagina met uitleg en de directe download-URL '
        + 'van de zip terug. Alle skills zijn gratis en werken in Claude, Claude Code en andere '
        + 'omgevingen die Agent Skills ondersteunen.',
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
      annotations: { readOnlyHint: true },
    },
    async ({ onderwerp, max }) => {
      const treffers = zoekSkills(catalogus.skills, onderwerp, max ?? STANDAARD_MAX);

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

      const regels = treffers.map((t, i) => [
        `${i + 1}. ${t.naam} (cluster: ${t.cluster})`,
        `   ${kort(t.beschrijving)}`,
        `   Pagina: ${publiekAdres(t.pagina)}`,
        `   Download: ${publiekAdres(t.download)}`,
      ].join('\n'));

      const tekst = [
        `${treffers.length} skill(s) gevonden voor "${onderwerp}":`,
        '',
        ...regels,
        '',
        `Volledige catalogus (${catalogus.aantal} skills): ${catalogus.bron}`,
      ].join('\n');

      return { content: [{ type: 'text', text: tekst }] };
    },
  );
}
