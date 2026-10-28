import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, test } from 'node:test';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createMcpHandler } from '@modelcontextprotocol/server';
import worker from '../src/index';
import { createServer } from '../src/server';
import { maakGebruiksteller } from '../src/gebruiksteller';

const openHandlers: Array<{ close(): Promise<void> }> = [];
const openClients: Client[] = [];

after(async () => {
  await Promise.all(openClients.map((client) => client.close()));
  await Promise.all(openHandlers.map((handler) => handler.close()));
});

test('een tool-aanroep schrijft alleen toolnaam, UTC-dag en één telpunt', async () => {
  const punten: unknown[] = [];
  const dataset = {
    writeDataPoint(punt: unknown) {
      punten.push(structuredClone(punt));
    },
  };
  const teller = maakGebruiksteller(
    dataset,
    () => new Date('2026-09-08T23:59:59.000Z'),
  );
  const handler = createMcpHandler(() => createServer(teller));
  openHandlers.push(handler);

  const client = new Client(
    { name: 'privacytest', version: '0.0.1' },
    { versionNegotiation: { mode: 'auto' } },
  );
  openClients.push(client);

  const transport = new StreamableHTTPClientTransport(new URL('http://test.local/mcp'), {
    fetch: (url: string | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      headers.set('CF-Connecting-IP', '203.0.113.42');
      headers.set('X-Conversation-Id', 'GESPREK_HEADER_MAG_NIET_MEE');
      return handler.fetch(new Request(url, { ...init, headers }));
    },
  });
  await client.connect(transport);

  const resultaat = await client.callTool({
    name: 'skill_zoeken',
    arguments: { onderwerp: 'swot INVOER_MAG_NIET_MEE', max: 1 },
  });
  assert.notEqual(resultaat.isError, true);

  assert.deepEqual(punten, [{
    indexes: ['skill_zoeken'],
    blobs: ['2026-09-08'],
    doubles: [1],
  }]);

  const opgeslagen = JSON.stringify(punten);
  for (const verboden of [
    '203.0.113.42',
    'GESPREK_HEADER_MAG_NIET_MEE',
    'INVOER_MAG_NIET_MEE',
    'onderwerp',
    'headers',
  ]) {
    assert.doesNotMatch(opgeslagen, new RegExp(verboden));
  }
});

test('elk van de zeven tools telt precies onder zijn publieke toolnaam', async () => {
  const geteld: string[] = [];
  // Sinds MC1 gaat de site-binding als parameter mee in plaats van via een
  // globale zetSiteBinding; de controle hieronder is ongewijzigd.
  const site = {
      async fetch(input: RequestInfo | URL) {
        const pad = new URL(String(input)).pathname;
        if (pad === '/api/scan') {
          return Response.json({
            url: 'https://voorbeeld.nl',
            timestamp: '2026-09-08T12:00:00.000Z',
            scores: { overall: 80, technical: 80, onpage: 80, content: 80, ai: 80 },
            checks: {},
          });
        }
        if (pad === '/api/vcheck') return Response.json({ gevonden: false, tips: [] });
        return Response.json({ error: 'onbekende test-route' }, { status: 404 });
      },
  };

  const handler = createMcpHandler(() => createServer({ site, teller: (tool) => geteld.push(tool) }));
  openHandlers.push(handler);
  const client = new Client(
    { name: 'zeven-tools-teltest', version: '0.0.1' },
    { versionNegotiation: { mode: 'auto' } },
  );
  openClients.push(client);
  await client.connect(new StreamableHTTPClientTransport(new URL('http://test.local/mcp'), {
    fetch: (url: string | URL, init?: RequestInit) => handler.fetch(new Request(url, init)),
  }));

  for (const [name, args] of [
    ['seo_scan', { url: 'https://voorbeeld.nl' }],
    ['lokale_vindbaarheid_check', { bedrijfsnaam: 'Bakkerij Test', stad: 'Utrecht' }],
    ['skill_zoeken', { onderwerp: 'swot', max: 1 }],
    ['bedrijfsbrein_template', {}],
    ['ai_index_branche', { branche: 'zorg' }],
    ['ai_index_vragen', { branche: 'zorg', max: 1 }],
    ['ai_index_bedrijf', { bedrijfsnaam: 'Bol.com' }],
  ] as const) {
    const resultaat = await client.callTool({ name, arguments: args });
    assert.notEqual(resultaat.isError, true, `${name} gaf onverwacht een fout`);
  }

  assert.deepEqual(geteld, [
    'seo_scan',
    'lokale_vindbaarheid_check',
    'skill_zoeken',
    'bedrijfsbrein_template',
    'ai_index_branche',
    'ai_index_vragen',
    'ai_index_bedrijf',
  ]);
});

test('een ontbrekende of falende teller verandert het toolresultaat niet', async () => {
  const meldingen: string[] = [];
  const oudeError = console.error;
  console.error = (...waarden: unknown[]) => meldingen.push(waarden.map(String).join(' '));

  try {
    const teller = maakGebruiksteller({
      writeDataPoint() {
        throw new Error('interne datasetfout');
      },
    }, () => new Date('2026-09-08T10:00:00.000Z'));

    assert.doesNotThrow(() => teller('ai_index_branche'));
    assert.deepEqual(meldingen, [
      '{"event":"mcp_usage_write_failed","tool":"ai_index_branche","utc_day":"2026-09-08"}',
    ]);
    assert.doesNotMatch(meldingen[0], /interne datasetfout/);

    const zonderBinding = maakGebruiksteller(undefined);
    assert.doesNotThrow(() => zonderBinding('skill_zoeken'));
  } finally {
    console.error = oudeError;
  }
});

test('de statusroute maakt een ontbrekende productie-binding zichtbaar', async () => {
  const context = {
    waitUntil() {},
    passThroughOnException() {},
    props: {},
  } as unknown as ExecutionContext;

  const response = await worker.fetch(
    new Request('https://mcp.theseo.nl/'),
    {} as never,
    context,
  );
  const body = await response.json() as {
    gebruiksteller?: { status?: string; releaseklaar?: boolean };
  };

  assert.deepEqual(body.gebruiksteller, {
    status: 'niet_geconfigureerd',
    releaseklaar: false,
  });
});

test('Wrangler configureert Analytics Engine zonder request- of invocationlogs', async () => {
  const config = await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8');

  assert.match(
    config,
    /"analytics_engine_datasets"\s*:\s*\[[\s\S]*?"binding"\s*:\s*"MCP_USAGE"[\s\S]*?"dataset"\s*:\s*"theseo_mcp_tool_usage"/,
  );
  assert.match(config, /"invocation_logs"\s*:\s*false/);
  assert.match(config, /"traces"\s*:\s*\{[\s\S]*?"enabled"\s*:\s*false/);
});
