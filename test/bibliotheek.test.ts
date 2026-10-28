/**
 * Contracttest op de geimporteerde tools: precies zoals het platform
 * (theseo-platform) ze binnenhaalt, via de eigen pakketnaam en het
 * exports-veld van package.json, op een eigen McpServer naast eigen tools.
 */
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import {
  GRATIS_TOOLS,
  KANAAL_KOP,
  KANAAL_MCP,
  registreerGratisTools,
  type GratisDeps,
} from 'theseo-mcp';
import { nepSite, sluitAlles, tekstUit, verbindMet, type SiteAanroep } from './hulp/mcp-client';

after(sluitAlles);

const NETWERKTOOLS = ['seo_scan', 'lokale_vindbaarheid_check'];

function platformServer(deps: GratisDeps): McpServer {
  const server = new McpServer({ name: 'platform-proef', version: '0.0.0' });
  server.registerTool(
    'platform_eigen',
    {
      title: 'Eigen tool van het platform',
      description: 'Staat naast de gratis tools om te bewijzen dat ze samen in een lijst passen.',
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    async () => ({ content: [{ type: 'text', text: 'ok' }] }),
  );
  registreerGratisTools(server, deps);
  return server;
}

test('het pakket exporteert registreerGratisTools via zijn eigen naam', () => {
  assert.equal(typeof registreerGratisTools, 'function');
  assert.deepEqual([...GRATIS_TOOLS], [
    'seo_scan',
    'lokale_vindbaarheid_check',
    'skill_zoeken',
    'bedrijfsbrein_template',
    'ai_index_branche',
    'ai_index_vragen',
    'ai_index_bedrijf',
  ]);
  assert.ok(Object.isFrozen(GRATIS_TOOLS), 'de toollijst hoort onveranderlijk te zijn');
  assert.equal(KANAAL_KOP, 'X-TheSEO-Kanaal');
  assert.equal(KANAAL_MCP, 'mcp');
});

test('de zeven gratis tools komen in dezelfde tools/list als de tools van het platform', async () => {
  const client = await verbindMet(() => platformServer({}));
  const { tools } = await client.listTools();
  assert.deepEqual(
    tools.map((t) => t.name).sort(),
    [...GRATIS_TOOLS, 'platform_eigen'].sort(),
  );
});

test('elke gratis tool voldoet aan het toolcontract', async () => {
  const client = await verbindMet(() => platformServer({}));
  const { tools } = await client.listTools();
  for (const naam of GRATIS_TOOLS) {
    const tool = tools.find((t) => t.name === naam);
    assert.ok(tool, `${naam} ontbreekt`);
    assert.ok(tool.title && tool.title.length > 3, `${naam} mist een title`);
    assert.ok(tool.description && tool.description.length > 40, `${naam} mist een beschrijving`);
    assert.equal(typeof tool.annotations?.readOnlyHint, 'boolean', `${naam} mist readOnlyHint`);
    assert.equal(typeof tool.annotations?.openWorldHint, 'boolean', `${naam} mist openWorldHint`);
    const zichtbaar = `${tool.title} ${tool.description}`;
    assert.doesNotMatch(zichtbaar, /[\u2013\u2014]/, `${naam} bevat een gedachtestreepje`);
    assert.doesNotMatch(zichtbaar, /premium|tseo_|upgrade|korting|abonne/i, `${naam} noemt premium of verkoop`);

    if (NETWERKTOOLS.includes(naam)) {
      assert.equal(tool.annotations?.readOnlyHint, false, `${naam} stuurt invoer door en is niet alleen-lezen`);
      assert.equal(tool.annotations?.destructiveHint, false, `${naam} wist of overschrijft niets`);
      assert.equal(tool.annotations?.openWorldHint, true, `${naam} praat met de site`);
    } else {
      assert.equal(tool.annotations?.readOnlyHint, true, `${naam} leest alleen ingebakken data`);
      assert.equal(tool.annotations?.openWorldHint, false, `${naam} praat met niemand buiten de bundel`);
    }
  }
});

test('twee servers in hetzelfde proces delen geen site-binding', async () => {
  const log: SiteAanroep[] = [];
  const clientA = await verbindMet(() => platformServer({ site: nepSite('A', log) }));
  const clientB = await verbindMet(() => platformServer({ site: nepSite('B', log) }));

  for (const client of [clientA, clientB, clientA]) {
    const resultaat = await client.callTool({ name: 'seo_scan', arguments: { url: 'https://voorbeeld.nl' } });
    assert.notEqual(resultaat.isError, true, tekstUit(resultaat));
  }
  assert.deepEqual(log.map((a) => a.site), ['A', 'B', 'A']);
});

test('elke aanroep naar de site draagt de kanaalkop en verder alleen de toolinvoer', async () => {
  const log: SiteAanroep[] = [];
  const client = await verbindMet(() => platformServer({ site: nepSite('S', log) }));

  await client.callTool({ name: 'seo_scan', arguments: { url: 'https://voorbeeld.nl' } });
  await client.callTool({
    name: 'lokale_vindbaarheid_check',
    arguments: { bedrijfsnaam: 'Bakkerij Proef', stad: 'Utrecht' },
  });

  assert.deepEqual(log, [
    { site: 'S', pad: '/api/scan', kanaal: 'mcp', body: { url: 'https://voorbeeld.nl' } },
    {
      site: 'S',
      pad: '/api/vcheck',
      kanaal: 'mcp',
      body: { bedrijfsnaam: 'Bakkerij Proef', stad: 'Utrecht' },
    },
  ]);
});

test('de teller komt uit deps en telt onder de publieke toolnaam', async () => {
  const geteld: string[] = [];
  const client = await verbindMet(() => platformServer({ teller: (tool) => geteld.push(tool) }));
  await client.callTool({ name: 'skill_zoeken', arguments: { onderwerp: 'swot', max: 1 } });
  await client.callTool({ name: 'bedrijfsbrein_template', arguments: {} });
  assert.deepEqual(geteld, ['skill_zoeken', 'bedrijfsbrein_template']);
});

test('verkeerde deps worden direct geweigerd, niet pas bij een aanroep', () => {
  const server = () => new McpServer({ name: 'x', version: '0.0.0' });
  assert.throws(() => registreerGratisTools(server(), { teller: 'geen functie' } as never), TypeError);
  assert.throws(() => registreerGratisTools(server(), { site: {} } as never), TypeError);
  assert.throws(() => registreerGratisTools(server(), { sitee: nepSite('x', []) } as never), TypeError);
  assert.throws(
    () => registreerGratisTools(server(), {
      premiumSkills: [{ slug: 'Hoofdletters Mogen Niet', naam: 'Proef', zin: 'Een zin van genoeg lengte.' }],
    }),
    TypeError,
  );
  assert.throws(
    () => registreerGratisTools(server(), {
      premiumSkills: [{ slug: 'proef', naam: 'Proef', zin: 'Kijk op https://voorbeeld.nl voor meer.' }],
    }),
    TypeError,
  );
});
