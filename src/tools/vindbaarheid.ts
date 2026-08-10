import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { roepUpstreamAan, SITE } from '../config';

interface VcheckPunt {
  id: string;
  label: string;
  gehaald: boolean;
  waarde: string | null;
  gewicht: number;
}

interface VcheckNietGemeten {
  id: string;
  label: string;
  reden: string;
}

export function registreerVindbaarheid(server: McpServer): void {
  server.registerTool(
    'lokale_vindbaarheid_check',
    {
      title: 'Lokale vindbaarheidscheck (Google Maps)',
      description:
        'Controleert hoe vindbaar een bedrijf is in Google Maps: bestaat er een Google '
        + 'Bedrijfsprofiel en zijn openingstijden, foto\'s, beoordeling, aantal reviews, website en '
        + 'telefoonnummer op orde. De score telt alleen mee wat werkelijk gemeten is; criteria die '
        + 'niet meetbaar zijn worden expliciet als niet-gemeten teruggegeven, nooit als onvoldoende '
        + 'geteld. Dit is de gratis check van theseo.nl.',
      inputSchema: z.object({
        bedrijfsnaam: z
          .string()
          .min(1)
          .max(120)
          .describe('De naam van het bedrijf zoals klanten het zoeken'),
        stad: z.string().min(1).max(80).describe('De plaats waar het bedrijf gevestigd is'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ bedrijfsnaam, stad }) => {
      const { data, fout } = await roepUpstreamAan('/api/vcheck', { bedrijfsnaam, stad });
      if (fout || !data) {
        // Ook het geval "De lokale check is nog niet geconfigureerd op de
        // server." komt hier eerlijk doorheen; dat bericht komt letterlijk
        // van de API en verzwijgen zou een meting suggereren die er niet was.
        return { content: [{ type: 'text', text: `De check lukte niet: ${fout}` }], isError: true };
      }

      if (data.gevonden === false) {
        const tips = Array.isArray(data.tips) ? (data.tips as string[]) : [];
        const tekst = [
          `We vinden "${bedrijfsnaam}" in ${stad} niet op Google.`,
          ...tips.map((t) => `- ${t}`),
        ].join('\n');
        return { content: [{ type: 'text', text: tekst }] };
      }

      const punten = Array.isArray(data.punten) ? (data.punten as VcheckPunt[]) : [];
      const nietGemeten = Array.isArray(data.nietGemeten)
        ? (data.nietGemeten as VcheckNietGemeten[])
        : [];
      const tips = Array.isArray(data.tips) ? (data.tips as string[]) : [];

      const tekst = [
        `Lokale vindbaarheid van ${String(data.naam)} (${String(data.adres)})`,
        '',
        `Score: ${data.score}/100 (${data.behaald} van ${data.mogelijk} gemeten punten behaald)`,
        '',
        'Gemeten criteria:',
        ...punten.map(
          (p) => `  [${p.gehaald ? 'OK' : 'NIET'}] ${p.label} (${p.gewicht} punten)${p.waarde ? `: ${p.waarde}` : ''}`,
        ),
        ...(nietGemeten.length > 0
          ? ['', 'Niet gemeten (telt niet mee in de score):', ...nietGemeten.map((n) => `  - ${n.label}: ${n.reden}`)]
          : []),
        ...(tips.length > 0 ? ['', 'Tips:', ...tips.map((t) => `  - ${t}`)] : []),
        '',
        `De check meet wat via de Google Places API meetbaar is. Meer context: ${SITE}/lokale-vindbaarheid-checker/`,
      ].join('\n');

      return { content: [{ type: 'text', text: tekst }] };
    },
  );
}
