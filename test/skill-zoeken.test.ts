/**
 * Tests van de zoekfunctie en de integriteit van de gegenereerde catalogus.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import catalogus from '../src/catalogus.json';
import { zoekSkills } from '../src/tools/skill-zoeken';

/**
 * Het aantal skills staat hier bewust NIET als vast getal. Dat was er wel, en
 * daardoor moest iemand die de catalogus opnieuw genereerde ook deze test
 * aanpassen; in de praktijk gebeurde het omgekeerde en bleef de catalogus staan.
 * Wat hier nog wel hard staat is een ondergrens, zodat een generator die maar
 * een handvol skills vindt alsnog een rood kruis geeft.
 */
const MINIMAAL_AANTAL = 120;

test('de catalogus is compleet en intern consistent', () => {
  assert.equal(catalogus.aantal, catalogus.skills.length);
  assert.ok(
    catalogus.skills.length >= MINIMAAL_AANTAL,
    `verwacht minstens ${MINIMAAL_AANTAL} skills, gevonden ${catalogus.skills.length}`,
  );
  assert.equal(catalogus.aantal_hub + catalogus.aantal_artikel, catalogus.aantal);

  const slugs = new Set(catalogus.skills.map((s) => s.slug));
  assert.equal(slugs.size, catalogus.skills.length, 'slugs horen uniek te zijn');

  for (const skill of catalogus.skills) {
    assert.ok(skill.naam.length > 0, `${skill.slug}: lege naam`);
    assert.ok(skill.cluster.length > 0, `${skill.slug}: leeg cluster`);
    assert.ok(skill.beschrijving.length >= 40, `${skill.slug}: beschrijving te kort`);
    assert.match(skill.pagina, /^https:\/\/[a-z0-9.-]+\/.+\/$/, `${skill.slug}: rare paginalink`);
    assert.equal(
      skill.download,
      `https://theseo.nl/assets/skills/${skill.slug}.zip`,
      `${skill.slug}: download-URL volgt het vaste patroon niet`,
    );
  }
});

test('de vakskills die bij een artikel horen staan er ook in', () => {
  const bijArtikel = catalogus.skills.filter((s) => s.bron === 'artikel');
  assert.ok(bijArtikel.length > 0, 'geen enkele skill met bron artikel gevonden');

  // Concreet geval uit golf 1: deze skill hangt onder een artikel en niet onder
  // de skills-hub. Precies dit soort skill viel eerder buiten de catalogus.
  const treffers = zoekSkills(catalogus.skills, 'lokale seo dakdekker');
  assert.ok(
    treffers.some((t) => t.slug === 'lokale-seo-voor-dakdekkers-skill'),
    'de dakdekkersskill hoort vindbaar te zijn',
  );
});

test('zoeken op een naam-trefwoord zet die skill bovenaan', () => {
  const treffers = zoekSkills(catalogus.skills, 'eisenhower');
  assert.ok(treffers.length >= 1);
  assert.match(treffers[0].naam, /eisenhower/i);
});

test('zoeken op een onderwerp uit de beschrijving vindt skills', () => {
  const treffers = zoekSkills(catalogus.skills, 'cold email schrijven');
  assert.ok(treffers.length >= 1, 'verwacht minstens één treffer voor een copywriting-onderwerp');
  for (const t of treffers) {
    assert.ok(t.score > 0);
  }
});

test('meerdere zoektermen stapelen de score', () => {
  const los = zoekSkills(catalogus.skills, 'swot');
  const gecombineerd = zoekSkills(catalogus.skills, 'swot analyse strategie');
  assert.ok(gecombineerd.length >= 1);
  assert.ok(gecombineerd[0].score >= los[0].score);
});

test('een onzin-onderwerp geeft een lege lijst, geen ruis', () => {
  assert.deepEqual(zoekSkills(catalogus.skills, 'xyzzyplugh kwatsch'), []);
});

test('max begrenst het aantal resultaten', () => {
  const treffers = zoekSkills(catalogus.skills, 'coach', 3);
  assert.ok(treffers.length <= 3);
});

test('lege of te korte zoektermen geven een lege lijst', () => {
  assert.deepEqual(zoekSkills(catalogus.skills, ''), []);
  assert.deepEqual(zoekSkills(catalogus.skills, ' a '), []);
});
