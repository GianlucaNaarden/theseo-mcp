import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { SITE, type Upstream } from '../config';
import type { Gebruiksteller } from '../gebruiksteller';

interface ScanCheck {
  id: string;
  pass: boolean;
  severity: string;
  label: string;
  message: string;
}

const SYMBOOL: Record<string, string> = {
  pass: 'OK',
  info: 'INFO',
  warning: 'LET OP',
  critical: 'KRITIEK',
};

function checksNaarTekst(titel: string, checks: unknown): string {
  if (!Array.isArray(checks) || checks.length === 0) return '';
  const regels = (checks as ScanCheck[]).map((c) => {
    const status = c.pass ? SYMBOOL.pass : (SYMBOOL[c.severity] ?? 'LET OP');
    return `  [${status}] ${c.label}: ${c.message}`;
  });
  return `\n${titel}\n${regels.join('\n')}`;
}

export function registreerSeoScan(
  server: McpServer,
  telGebruik: Gebruiksteller,
  upstream: Upstream,
): void {
  server.registerTool(
    'seo_scan',
    {
      title: 'Gratis SEO-scan (24 punten)',
      description:
        'Scant een URL op 24 SEO-punten in vier categorieën: techniek (HTTPS, snelheid, robots.txt, '
        + 'sitemap, beveiligingsheaders, e-mailauthenticatie), on-page (title, meta description, H1, '
        + 'koppenstructuur, alt-teksten, canonical, interne links), content (woordaantal, structuur, '
        + 'indexeerbaarheid) en AI-gereedheid (Schema.org, FAQ-schema, Open Graph, Twitter Card, '
        + 'entiteitshelderheid). Dit is de gratis scanner van theseo.nl en geen volledige audit: hij '
        + 'bekijkt één pagina en meet alleen wat automatisch meetbaar is. '
        + 'De siteflow bewaart het gescande webadres en de uitslag als lead in het CRM.',
      inputSchema: z.object({
        url: z
          .string()
          .min(1)
          .max(400)
          .describe('De URL van de pagina die gescand moet worden, bijvoorbeeld https://voorbeeld.nl'),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    async ({ url }) => {
      telGebruik('seo_scan');
      const { data, fout } = await upstream('/api/scan', { url });
      if (fout || !data) {
        return { content: [{ type: 'text', text: `De scan lukte niet: ${fout}` }], isError: true };
      }

      const scores = (data.scores ?? {}) as Record<string, number>;
      const checks = (data.checks ?? {}) as Record<string, unknown>;

      const tekst = [
        `SEO-scan van ${String(data.url)} (${String(data.timestamp)})`,
        '',
        `Totaalscore: ${scores.overall}/100`,
        `  Techniek: ${scores.technical}/100 · On-page: ${scores.onpage}/100 · Content: ${scores.content}/100 · AI: ${scores.ai}/100`,
        checksNaarTekst('Techniek:', checks.technical),
        checksNaarTekst('On-page:', checks.onpage),
        checksNaarTekst('Content:', checks.content),
        checksNaarTekst('AI-gereedheid:', checks.ai),
        '',
        `Deze scan bekijkt één pagina op 24 automatisch meetbare punten. Een volledige audit (meerdere pagina's, concurrentie, zoekwoorden) is handwerk: ${SITE}/gratis-seo-scan/`,
      ].join('\n');

      return { content: [{ type: 'text', text: tekst }] };
    },
  );
}
