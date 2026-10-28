/**
 * Wat naar buiten gaat (server.json voor de registers, package.json voor het
 * platform, README op GitHub) klopt met de code.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import catalogus from '../src/catalogus.json';
import { SERVER_VERSIE } from '../src/server';

const wortel = (pad: string) => fileURLToPath(new URL(`../${pad}`, import.meta.url));
const lees = (pad: string) => readFileSync(wortel(pad), 'utf8');
const json = (pad: string) => JSON.parse(lees(pad)) as Record<string, any>;

const PEER_VERSIES: Record<string, string> = {
  '@modelcontextprotocol/server': '2.0.0',
  zod: '4.4.3',
};

test('server.json wijst naar mcp.theseo.nl en telt de echte catalogus', () => {
  const server = json('server.json');
  assert.deepEqual(server.remotes, [{ type: 'streamable-http', url: 'https://mcp.theseo.nl/mcp' }]);
  assert.equal(server.version, json('package.json').version);
  assert.equal(server.version, SERVER_VERSIE);
  assert.ok(server.description.length <= 100, `description is ${server.description.length} tekens`);
  const getal = server.description.match(/\d+/)?.[0];
  assert.equal(Number(getal), catalogus.aantal, 'het aantal skills in server.json volgt de catalogus');
  assert.doesNotMatch(JSON.stringify(server), /[\u2013\u2014]/);
});

test('package.json exporteert de bibliotheek en pint zod en de MCP-server als peer', () => {
  const pakket = json('package.json');
  const punt = pakket.exports?.['.'];
  assert.ok(punt, 'exports["."] ontbreekt');
  for (const veld of ['types', 'default']) {
    assert.ok(existsSync(wortel(punt[veld])), `exports["."].${veld} wijst naar een bestand dat niet bestaat`);
  }

  for (const [naam, versie] of Object.entries(PEER_VERSIES)) {
    assert.equal(pakket.peerDependencies?.[naam], versie, `${naam} hoort vast op ${versie} als peer`);
    assert.equal(pakket.devDependencies?.[naam], versie, `${naam} hoort lokaal dezelfde vaste versie te hebben`);
    assert.equal(pakket.dependencies?.[naam], undefined, `${naam} mag geen gewone dependency zijn (twee kopieen)`);
    const geinstalleerd = json(`node_modules/${naam}/package.json`).version;
    assert.equal(geinstalleerd, versie, `${naam} in node_modules is ${geinstalleerd}`);
  }

  for (const groep of ['dependencies', 'devDependencies', 'peerDependencies']) {
    for (const [naam, versie] of Object.entries(pakket[groep] ?? {})) {
      assert.match(String(versie), /^\d+\.\d+\.\d+$/, `${groep}.${naam} is niet vastgepind (${versie})`);
    }
  }
});

test('de bibliotheek trekt geen Worker-ingang of agents mee', () => {
  const ingang = lees(json('package.json').exports['.'].default);
  assert.doesNotMatch(ingang, /from ['"]agents|from ['"]\.\/index['"]/);
  assert.doesNotMatch(lees('src/server.ts'), /from ['"]agents/);
});

test('de README zegt wat er echt bewaard wordt', () => {
  const readme = lees('README.md');
  assert.doesNotMatch(readme, /slaat niets op/i);
  assert.match(readme, /Analytics Engine/);
  assert.match(readme, /lead/i);
  assert.match(readme, /X-TheSEO-Kanaal/);
  assert.match(readme, /registreerGratisTools/);
  assert.doesNotMatch(readme, /[\u2013\u2014]/);
  assert.doesNotMatch(readme, /tseo_/);
});
