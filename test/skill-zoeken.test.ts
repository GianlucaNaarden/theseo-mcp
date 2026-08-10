/**
 * Tests van de zoekfunctie en de integriteit van de gegenereerde catalogus.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import catalogus from '../src/catalogus.json';
import { zoekSkills } from '../src/tools/skill-zoeken';

test('de catalogus bevat 94 skills met complete velden', () => {
  assert.equal(catalogus.aantal, 94);
  assert.equal(catalogus.skills.length, 94);

  const slugs = new Set(catalogus.skills.map((s) => s.slug));
  assert.equal(slugs.size, 94, 'slugs horen uniek te zijn');

  for (const skill of catalogus.skills) {
    assert.ok(skill.naam.length > 0, `${skill.slug}: lege naam`);
    assert.ok(skill.cluster.length > 0, `${skill.slug}: leeg cluster`);
    assert.ok(skill.beschrijving.length >= 40, `${skill.slug}: beschrijving te kort`);
    assert.match(skill.pagina, /^https:\/\/theseo\.nl\/.+\/$/, `${skill.slug}: rare paginalink`);
    assert.equal(
      skill.download,
      `https://theseo.nl/assets/skills/${skill.slug}.zip`,
      `${skill.slug}: download-URL volgt het vaste patroon niet`,
    );
  }
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
