/**
 * De Worker-ingang: /.well-known/* geeft 404 (KM:56) en de bindingen komen
 * per verzoek uit env, niet uit een globale variabele.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import worker from '../src/index';
import { GRATIS_TOOLS } from '../src/server';
import { nepSite, type SiteAanroep } from './hulp/mcp-client';

const CTX = { waitUntil() {}, passThroughOnException() {}, props: {} } as unknown as ExecutionContext;

function haal(pad: string, env: unknown = {}, init?: RequestInit): Promise<Response> {
  return worker.fetch(new Request(`https://theseo-mcp.sales-cc8.workers.dev${pad}`, init), env as never, CTX);
}

async function roepToolAan(env: unknown, name: string, args: Record<string, unknown>) {
  const response = await haal('/mcp', env, {
    method: 'POST',
    headers: {
      Host: 'theseo-mcp.sales-cc8.workers.dev',
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      'MCP-Protocol-Version': '2025-11-25',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name, arguments: args } }),
  });
  assert.equal(response.status, 200);
  const body = await response.text();
  const frames = response.headers.get('content-type')?.includes('text/event-stream')
    ? body.split('\n').filter((l) => l.startsWith('data: ') && l.slice(6).trim()).map((l) => JSON.parse(l.slice(6)))
    : [JSON.parse(body)];
  return frames.find((frame) => frame.id === 7);
}

for (const pad of [
  '/.well-known',
  '/.well-known/oauth-protected-resource',
  '/.well-known/oauth-protected-resource/mcp',
  '/.well-known/oauth-authorization-server',
  '/.well-known/openid-configuration',
  '/.well-known/mcp.json',
]) {
  test(`${pad} geeft 404 in plaats van de uitleg`, async () => {
    const response = await haal(pad);
    assert.equal(response.status, 404);
    const body = await response.text();
    assert.doesNotMatch(body, /seo_scan|endpoint/);
  });
}

test('de uitlegroute blijft 200 en noemt de zeven tools', async () => {
  for (const pad of ['/', '/iets-anders']) {
    const response = await haal(pad);
    assert.equal(response.status, 200);
    const body = await response.json() as { tools: string[]; endpoint: string };
    assert.deepEqual(body.tools, [...GRATIS_TOOLS]);
    assert.equal(body.endpoint, '/mcp');
  }
});

test('de site-binding komt per verzoek uit env', async () => {
  const log: SiteAanroep[] = [];
  const envA = { SITE_WORKER: nepSite('A', log) };
  const envB = { SITE_WORKER: nepSite('B', log) };
  for (const env of [envA, envB, envA]) {
    const frame = await roepToolAan(env, 'seo_scan', { url: 'https://voorbeeld.nl' });
    assert.notEqual(frame.result?.isError, true, JSON.stringify(frame));
  }
  assert.deepEqual(log.map((a) => `${a.site}:${a.pad}:${a.kanaal}`), [
    'A:/api/scan:mcp',
    'B:/api/scan:mcp',
    'A:/api/scan:mcp',
  ]);
});

test('de teller komt per verzoek uit env en de statusroute ziet hem', async () => {
  const punten: unknown[] = [];
  const env = { MCP_USAGE: { writeDataPoint: (punt: unknown) => punten.push(punt) } };

  const status = await (await haal('/', env)).json() as { gebruiksteller: unknown };
  assert.deepEqual(status.gebruiksteller, { status: 'actief', releaseklaar: true });

  const frame = await roepToolAan(env, 'skill_zoeken', { onderwerp: 'swot', max: 1 });
  assert.notEqual(frame.result?.isError, true);
  assert.equal(punten.length, 1);
  assert.deepEqual((punten[0] as { indexes: string[] }).indexes, ['skill_zoeken']);

  const zonder = await (await haal('/', {})).json() as { gebruiksteller: unknown };
  assert.deepEqual(zonder.gebruiksteller, { status: 'niet_geconfigureerd', releaseklaar: false });
});
