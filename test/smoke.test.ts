/**
 * Rooktest: start de server in-process via dezelfde createMcpHandler die in
 * productie draait, verbind er een echte MCP-client mee en vraag de tools op.
 * Dit is het officiële testpatroon van de MCP TypeScript SDK v2: de client-
 * transport krijgt handler.fetch als fetch-implementatie, dus er is geen
 * poort of netwerk nodig.
 *
 * De twee netwerk-tools (seo_scan en lokale_vindbaarheid_check) worden hier
 * bewust niet aangeroepen: die hangen van de live TheSEO API af en horen
 * niet in een deterministische testrun.
 */
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { createServer, SERVER_NAAM } from '../src/server';

const handler = createMcpHandler(createServer);
const client = new Client(
  { name: 'theseo-mcp-testclient', version: '0.0.1' },
  { versionNegotiation: { mode: 'auto' } },
);

before(async () => {
  const transport = new StreamableHTTPClientTransport(new URL('http://test.local/mcp'), {
    fetch: (url: string | URL, init?: RequestInit) => handler.fetch(new Request(url, init)),
  });
  await client.connect(transport);
});

after(async () => {
  await client.close();
  await handler.close();
});

test('de server meldt zich met de juiste naam', () => {
  assert.equal(client.getServerVersion()?.name, SERVER_NAAM);
});

test('tools/list geeft precies de zeven tools terug', async () => {
  const { tools } = await client.listTools();
  const namen = tools.map((t) => t.name).sort();
  assert.deepEqual(namen, [
    'ai_index_bedrijf',
    'ai_index_branche',
    'ai_index_vragen',
    'bedrijfsbrein_template',
    'lokale_vindbaarheid_check',
    'seo_scan',
    'skill_zoeken',
  ]);
  for (const tool of tools) {
    assert.ok(tool.description && tool.description.length > 40, `${tool.name} mist een beschrijving`);
  }
});

test('skill_zoeken vindt een skill via de echte tool-aanroep', async () => {
  const resultaat = await client.callTool({
    name: 'skill_zoeken',
    arguments: { onderwerp: 'swot analyse', max: 3 },
  });
  assert.notEqual(resultaat.isError, true);
  const inhoud = resultaat.content as Array<{ type: string; text: string }>;
  const tekst = inhoud[0].text;
  assert.match(tekst, /SWOT/i);
  assert.match(tekst, /https:\/\/[a-z0-9.-]+\/.*skill-voor-claude\//);
  assert.match(tekst, /https:\/\/[a-z0-9.-]+\/assets\/skills\/.*\.zip/);
});

test('bedrijfsbrein_template geeft het volledige sjabloon terug', async () => {
  const resultaat = await client.callTool({ name: 'bedrijfsbrein_template', arguments: {} });
  assert.notEqual(resultaat.isError, true);
  const inhoud = resultaat.content as Array<{ type: string; text: string }>;
  const tekst = inhoud[0].text;
  assert.ok(tekst.length > 10_000, 'het sjabloon hoort duizenden tekens lang te zijn');
  assert.match(tekst, /bedrijfsbrein/i);
  assert.match(tekst, /https:\/\/[a-z0-9.-]+\/bedrijfsbrein-sjabloon\//);
  assert.match(tekst, /https:\/\/[a-z0-9.-]+\/assets\/skills\/bedrijfsbrein-sjabloon\.zip/);
});
