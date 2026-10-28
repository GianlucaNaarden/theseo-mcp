import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import type { Gebruiksteller } from '../gebruiksteller';
import { brancheNamen, getal, index, metBron, zoekBranche } from './ai-index-gedeeld';

const STANDAARD_MAX = 10;
const HARDE_MAX = 40;

export function registreerAiIndexVragen(server: McpServer, telGebruik: Gebruiksteller): void {
  server.registerTool(
    'ai_index_vragen',
    {
      title: 'AI-Index: de vragenlijst van een branche',
      description:
        'Geeft de letterlijke klantvragen die in de Nationale AI-Index van theseo.nl aan het model '
        + 'zijn gesteld voor een branche, plus de meetmethode in het kort: de exacte prompt die boven '
        + 'elke vraag staat, het model, de instelling en de meetcyclus. Bedoeld om onze meting na te '
        + 'kunnen spelen: wie dezelfde vraag met dezelfde prompt aan hetzelfde model stelt, hoort een '
        + 'vergelijkbare lijst terug te krijgen. '
        + 'Gemeten met temperature 1, dus dezelfde vraag geeft niet steeds exact dezelfde tien namen. '
        + 'De meting gaat via de API naar gpt-5-mini zonder webtoegang en zonder geheugen, niet via '
        + 'ChatGPT als product. De vragen zijn hele klantzinnen, geen zoekwoorden, en zeggen niets '
        + 'over zoekvolume, bezoekers of omzet.',
      inputSchema: z.object({
        branche: z
          .string()
          .min(2)
          .max(60)
          .describe(
            'De branche, bijvoorbeeld "horeca", "saas" of "Marketing & Digitale Groei". '
            + 'Kleine letters en een deel van de naam zijn genoeg.',
          ),
        max: z
          .number()
          .int()
          .min(1)
          .max(HARDE_MAX)
          .optional()
          .describe(`Aantal vragen dat je terugkrijgt (standaard ${STANDAARD_MAX}, alle ${HARDE_MAX} mag ook)`),
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ branche, max }) => {
      telGebruik('ai_index_vragen');
      const uitkomst = zoekBranche(branche);

      if (uitkomst.soort === 'geen') {
        return {
          content: [{
            type: 'text',
            text: metBron([
              `Geen branche gevonden voor "${branche}". De AI-Index meet negen branches:`,
              ...brancheNamen().map((n) => `  - ${n}`),
            ]),
          }],
        };
      }

      if (uitkomst.soort === 'meerdere') {
        return {
          content: [{
            type: 'text',
            text: metBron([
              `"${branche}" past op meer dan een branche. Kies er een:`,
              ...uitkomst.kandidaten.map((k) => `  - ${k.branche.naam}`),
            ]),
          }],
        };
      }

      const b = uitkomst.treffer.branche;
      const aantal = max ?? STANDAARD_MAX;
      const getoond = b.vragen.slice(0, aantal);
      const rest = b.vragen.length - getoond.length;
      const m = index.meta;

      return {
        content: [{
          type: 'text',
          text: metBron([
            `AI-Index, vragenlijst van de branche ${b.naam}`,
            '',
            'De meetmethode in het kort. Boven elke vraag staat deze vaste instructie, en verder',
            'krijgt het model niets mee: geen context over ons, geen voorbeelden, geen webtoegang.',
            '',
            `  Prompt: "${m.prompt}"`,
            `  Model: ${m.model}, temperature ${m.temperature}, via de API.`,
            `  Cyclus: ${m.meetcyclus}.`,
            `  Per vraag worden ${m.meetmomentenPerVraag} antwoorden bewaard: het actuele met datum `
            + 'en zes eerdere zonder eigen datum.',
            '',
            `${getoond.length} van de ${b.vragen.length} vragen van deze branche `
            + `(${getal(m.aantalVragen)} in totaal over alle branches):`,
            ...getoond.map(([nr, tekst]) => `  ${String(nr).padStart(2, ' ')}. ${tekst}`),
            ...(rest > 0
              ? ['', `Nog ${rest} vragen niet getoond (max kan tot ${b.vragen.length}).`]
              : []),
            '',
            'Let op: speel je dit na, dan krijg je niet dezelfde tien namen terug. Met temperature 1 '
            + 'zit er toeval in elk antwoord, dus verschillen tussen twee pogingen of twee momenten '
            + 'zijn deels samplingruis en geen trend. Dit meet gpt-5-mini via de API en niet ChatGPT '
            + 'met webzoeken.',
          ]),
        }],
      };
    },
  );
}
