/**
 * skill_zoeken toont premiumnamen alleen als het platform ze meegeeft
 * (alleen voor een ingelogde abonnee). Anoniem blijft alles gratis.
 * De namen hieronder zijn verzonnen testnamen, geen echte premium skills.
 */
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { McpServer } from '@modelcontextprotocol/server';
import catalogus from '../src/catalogus.json';
import { createServer, registreerGratisTools, type GratisDeps } from '../src/server';
import { zoekMetPremium, type PremiumSkillNaam } from '../src/tools/skill-zoeken';
import { sluitAlles, tekstUit, verbindMet } from './hulp/mcp-client';

after(sluitAlles);

const NEP_PREMIUM: PremiumSkillNaam[] = [
  { slug: 'nep-proefvak-boekhouder', naam: 'Nep proefvak boekhouder', zin: 'Testzin voor een verzonnen premium skill.' },
  { slug: 'nep-proefvak-swot-plus', naam: 'Nep swot plus', zin: 'Nog een verzonnen testzin zonder inhoud.' },
];

function server(deps: GratisDeps): McpServer {
  const s = new McpServer({ name: 'proef', version: '0.0.0' });
  registreerGratisTools(s, deps);
  return s;
}

async function zoek(factory: () => McpServer, onderwerp: string, max = 5) {
  const client = await verbindMet(factory);
  const resultaat = await client.callTool({ name: 'skill_zoeken', arguments: { onderwerp, max } });
  assert.notEqual(resultaat.isError, true);
  const { tools } = await client.listTools();
  const beschrijving = tools.find((t) => t.name === 'skill_zoeken')?.description ?? '';
  return { tekst: tekstUit(resultaat), beschrijving };
}

test('anoniem: geen premiumnaam, geen woord premium, ook niet in de beschrijving', async () => {
  for (const factory of [() => createServer(), () => server({})]) {
    const { tekst, beschrijving } = await zoek(factory, 'proefvak boekhouder swot');
    assert.doesNotMatch(tekst, /Nep proefvak|premium/i);
    assert.doesNotMatch(beschrijving, /premium/i);
  }
});

test('met een premiumlijst van het platform: naam en zin, geen link en geen zip', async () => {
  const { tekst, beschrijving } = await zoek(() => server({ premiumSkills: NEP_PREMIUM }), 'proefvak boekhouder');
  assert.match(tekst, /Nep proefvak boekhouder \(premium\)/);
  assert.match(tekst, /Testzin voor een verzonnen premium skill\./);
  assert.match(beschrijving, /premium/i);

  const blok = tekst.split('\n\n').find((deel) => deel.includes('Nep proefvak boekhouder')) ?? '';
  const regels = blok.split('\n');
  const start = regels.findIndex((r) => r.includes('Nep proefvak boekhouder'));
  const premiumRegels = regels.slice(start, start + 3).join('\n');
  assert.doesNotMatch(premiumRegels, /https?:\/\/|\.zip|\/skills\/premium\//);
  assert.doesNotMatch(tekst, /nep-proefvak-boekhouder\.zip/);
});

test('een lege premiumlijst geeft exact hetzelfde als anoniem', async () => {
  const anoniem = await zoek(() => server({}), 'swot analyse', 3);
  const leeg = await zoek(() => server({ premiumSkills: [] }), 'swot analyse', 3);
  assert.equal(leeg.tekst, anoniem.tekst);
  assert.equal(leeg.beschrijving, anoniem.beschrijving);
});

test('zoekMetPremium rangschikt gratis en premium samen en houdt max aan', () => {
  const alleenGratis = zoekMetPremium(catalogus.skills, [], 'swot', 3);
  assert.ok(alleenGratis.length >= 1);
  assert.ok(alleenGratis.every((t) => t.soort === 'gratis'));

  const samen = zoekMetPremium(catalogus.skills, NEP_PREMIUM, 'swot', 2);
  assert.equal(samen.length, 2);
  assert.ok(samen.some((t) => t.soort === 'premium' && t.skill.slug === 'nep-proefvak-swot-plus'));

  const premiumBovenaan = zoekMetPremium(catalogus.skills, NEP_PREMIUM, 'proefvak', 5);
  assert.deepEqual(premiumBovenaan.map((t) => t.skill.slug), ['nep-proefvak-boekhouder', 'nep-proefvak-swot-plus']);

  assert.deepEqual(zoekMetPremium(catalogus.skills, NEP_PREMIUM, ' a ', 5), []);
});
