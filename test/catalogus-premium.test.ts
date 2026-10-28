/**
 * De publieke repo mag nooit een premium skill bevatten (KM:123). Deze test
 * faalt zodra er een premium-zip, een pad onder /skills/premium/ of een
 * premium toolnaam (tseo_) in de gratis catalogus belandt, en controleert
 * dat de generator zelf stopt in plaats van zo'n catalogus weg te schrijven.
 */
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import catalogus from '../src/catalogus.json';
import { premiumInCatalogus, premiumReden } from '../scripts/premium-grens.mjs';

const GENERATOR = fileURLToPath(new URL('../scripts/genereer-catalogus.mjs', import.meta.url));
const tijdelijk: string[] = [];
after(() => {
  for (const map of tijdelijk) rmSync(map, { recursive: true, force: true });
});

const GEWOON = {
  slug: 'swot-analyse-skill-voor-claude',
  naam: 'SWOT-analyse',
  cluster: 'STRATEGIE',
  beschrijving: 'Een gewone gratis skill. Het woord premium in een beschrijving is geen probleem.',
  pagina: 'https://theseo.nl/skills/swot-analyse-skill-voor-claude/',
  download: 'https://theseo.nl/assets/skills/swot-analyse-skill-voor-claude.zip',
};

test('de ingebakken catalogus bevat geen premium skill', () => {
  assert.deepEqual(premiumInCatalogus(catalogus.skills), []);
  assert.doesNotMatch(JSON.stringify(catalogus), /\/skills\/premium\/|tseo_/);
});

test('premiumReden herkent elk premiumkenmerk en laat een gewone skill door', () => {
  assert.equal(premiumReden(GEWOON), null);
  assert.match(String(premiumReden({ ...GEWOON, pagina: 'https://theseo.nl/skills/premium/vak/' })), /skills\/premium/);
  assert.match(String(premiumReden({ ...GEWOON, slug: 'premium-boekhouder', download: 'https://theseo.nl/assets/skills/premium-boekhouder.zip' })), /premium/);
  assert.match(String(premiumReden({ ...GEWOON, download: 'https://theseo.nl/assets/skills/premium/geheim.zip' })), /download/);
  assert.match(String(premiumReden({ ...GEWOON, beschrijving: 'Roept tseo_proefnaam aan als eerste stap.' })), /tseo_/);
});

/* ── De generator zelf, tegen een nep-site in een tijdelijke map ─────── */

function zipMet(zipPad: string, bestanden: Record<string, string>): void {
  const werk = mkdtempSync(join(tmpdir(), 'mc1-zip-'));
  tijdelijk.push(werk);
  for (const [naam, inhoud] of Object.entries(bestanden)) writeFileSync(join(werk, naam), inhoud);
  execFileSync('zip', ['-j', '-q', zipPad, ...Object.keys(bestanden).map((n) => join(werk, n))]);
}

function skillMd(beschrijving: string): string {
  return `---\nname: proef\ndescription: ${beschrijving}\n---\n# Proefskill\n`;
}

function nepSiteRepo(extra: (publicDir: string) => void): { repo: string; uit: string } {
  const repo = mkdtempSync(join(tmpdir(), 'mc1-site-'));
  const uit = mkdtempSync(join(tmpdir(), 'mc1-uit-'));
  tijdelijk.push(repo, uit);
  const pub = join(repo, 'public');
  mkdirSync(join(pub, 'skills'), { recursive: true });
  mkdirSync(join(pub, 'assets', 'skills'), { recursive: true });
  writeFileSync(join(pub, 'skills', 'index.html'), [
    '<span class="ann">INS · PROEFCLUSTER</span>',
    '<a href="/skills/proef-skill-voor-claude/">Proefskill</a>',
  ].join('\n'));
  zipMet(join(pub, 'assets', 'skills', 'proef-skill-voor-claude.zip'), {
    'SKILL.md': skillMd('Een proefskill met een beschrijving die lang genoeg is voor de catalogus.'),
  });
  zipMet(join(pub, 'assets', 'skills', 'bedrijfsbrein-sjabloon.zip'), {
    'bedrijfsbrein.md': '# Bedrijfsbrein proef\n',
    'LEESMIJ.md': '# Leesmij proef\n',
  });
  extra(pub);
  return { repo, uit };
}

function draaiGenerator(repo: string, uit: string) {
  return spawnSync(process.execPath, [GENERATOR, repo], {
    encoding: 'utf8',
    env: { ...process.env, THESEO_CATALOGUS_UIT: uit },
  });
}

function artikel(pub: string, pad: string, zip: string): void {
  mkdirSync(join(pub, pad), { recursive: true });
  writeFileSync(join(pub, pad, 'index.html'), `<a href="/assets/skills/${zip}.zip">download</a>`);
}

test('de generator stopt bij een premium-zip en schrijft dan niets weg', () => {
  const { repo, uit } = nepSiteRepo((pub) => {
    artikel(pub, 'blog/proefartikel', 'premium-geheim');
    zipMet(join(pub, 'assets', 'skills', 'premium-geheim.zip'), {
      'SKILL.md': skillMd('Een zip met premium in de naam hoort nooit in de gratis catalogus.'),
    });
  });
  const run = draaiGenerator(repo, uit);
  assert.equal(run.status, 1, run.stderr);
  assert.match(run.stderr, /premium/i);
  assert.equal(existsSync(join(uit, 'catalogus.json')), false);
});

test('de generator stopt bij een premium toolnaam in een beschrijving', () => {
  const { repo, uit } = nepSiteRepo((pub) => {
    artikel(pub, 'blog/ander-artikel', 'gewone-naam-skill');
    zipMet(join(pub, 'assets', 'skills', 'gewone-naam-skill.zip'), {
      'SKILL.md': skillMd('Roept eerst tseo_proefnaam aan en hoort dus bij premium.'),
    });
  });
  const run = draaiGenerator(repo, uit);
  assert.equal(run.status, 1, run.stderr);
  assert.match(run.stderr, /tseo_/);
  assert.equal(existsSync(join(uit, 'catalogus.json')), false);
});

test('een zip die alleen onder /skills/premium/ gelinkt is komt niet in de catalogus', () => {
  const { repo, uit } = nepSiteRepo((pub) => {
    artikel(pub, 'skills/premium', 'alleen-op-premiumpagina');
    zipMet(join(pub, 'assets', 'skills', 'alleen-op-premiumpagina.zip'), {
      'SKILL.md': skillMd('Deze zip staat alleen op de premiumhub en hoort niet in de gratis catalogus.'),
    });
  });
  const run = draaiGenerator(repo, uit);
  assert.equal(run.status, 0, run.stderr);
  const geschreven = JSON.parse(readFileSync(join(uit, 'catalogus.json'), 'utf8')) as {
    skills: Array<{ slug: string }>;
  };
  assert.deepEqual(geschreven.skills.map((s) => s.slug), ['proef-skill-voor-claude']);
});
