import type { McpServer } from '@modelcontextprotocol/server';
import bedrijfsbrein from '../bedrijfsbrein.json';
import { publiekAdres } from '../config';
import type { Gebruiksteller } from '../gebruiksteller';

export function registreerBedrijfsbrein(server: McpServer, telGebruik: Gebruiksteller): void {
  server.registerTool(
    'bedrijfsbrein_template',
    {
      title: 'Bedrijfsbrein-sjabloon ophalen',
      description:
        'Geeft de volledige inhoud van het gratis bedrijfsbrein-sjabloon van theseo.nl terug: een '
        + 'invulbaar bedrijfsbrein.md contextbestand dat een AI leert wie een bedrijf is (aanbod, '
        + 'doelgroep, tone of voice, werkwijze). Gebruik dit om het sjabloon direct voor een bedrijf '
        + 'in te vullen. Werkt in Claude, ChatGPT, Codex en Cursor.',
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => {
      telGebruik('bedrijfsbrein_template');
      const tekst = [
        `Bedrijfsbrein-sjabloon van TheSEO`,
        `Uitlegpagina: ${publiekAdres(bedrijfsbrein.pagina)}`,
        `Download als zip: ${publiekAdres(bedrijfsbrein.download)}`,
        '',
        '===== LEESMIJ.md =====',
        '',
        bedrijfsbrein.leesmij.trim(),
        '',
        '===== bedrijfsbrein.md (het sjabloon) =====',
        '',
        bedrijfsbrein.sjabloon.trim(),
      ].join('\n');

      return { content: [{ type: 'text', text: tekst }] };
    },
  );
}
