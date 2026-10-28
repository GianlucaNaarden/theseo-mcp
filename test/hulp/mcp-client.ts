/**
 * Gedeelde testhulp: verbindt een echte MCP-client in-process met een
 * serverfactory, zonder netwerk. Zelfde patroon als test/smoke.test.ts.
 */
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createMcpHandler, type McpServer } from '@modelcontextprotocol/server';

const open: Array<{ close(): Promise<void> }> = [];

export async function verbindMet(factory: () => McpServer): Promise<Client> {
  const handler = createMcpHandler(factory);
  const client = new Client(
    { name: 'theseo-mcp-contracttest', version: '0.0.1' },
    { versionNegotiation: { mode: 'auto' } },
  );
  open.push(client, handler);
  await client.connect(new StreamableHTTPClientTransport(new URL('http://test.local/mcp'), {
    fetch: (url: string | URL, init?: RequestInit) => handler.fetch(new Request(url, init)),
  }));
  return client;
}

export async function sluitAlles(): Promise<void> {
  const nu = open.splice(0, open.length);
  await Promise.all(nu.map((item) => item.close()));
}

export function tekstUit(resultaat: unknown): string {
  const inhoud = (resultaat as { content?: Array<{ type: string; text?: string }> }).content ?? [];
  return inhoud.map((blok) => blok.text ?? '').join('\n');
}

export interface SiteAanroep {
  site: string;
  pad: string;
  kanaal: string | null;
  body: unknown;
}

/** Nep-site-binding die elke aanroep vastlegt en een vast antwoord geeft. */
export function nepSite(naam: string, log: SiteAanroep[]) {
  return {
    async fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
      const verzoek = new Request(input, init);
      const pad = new URL(verzoek.url).pathname;
      log.push({
        site: naam,
        pad,
        kanaal: verzoek.headers.get('X-TheSEO-Kanaal'),
        body: await verzoek.json(),
      });
      if (pad === '/api/scan') {
        return Response.json({
          url: 'https://voorbeeld.nl',
          timestamp: '2026-10-03T12:00:00.000Z',
          scores: { overall: 70, technical: 70, onpage: 70, content: 70, ai: 70 },
          checks: {},
        });
      }
      if (pad === '/api/vcheck') return Response.json({ gevonden: false, tips: [] });
      return Response.json({ error: 'onbekende test-route' }, { status: 404 });
    },
  };
}
