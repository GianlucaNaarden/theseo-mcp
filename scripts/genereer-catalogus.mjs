#!/usr/bin/env node
/**
 * Genereert de statische data voor de MCP-server uit de lokale site-repo:
 *
 *   1. src/catalogus.json     : de catalogus van gratis Claude-skills
 *   2. src/bedrijfsbrein.json : de volledige inhoud van het bedrijfsbrein-sjabloon
 *
 * Bronnen in de site-repo (niets wordt verzonnen, alles komt uit bestanden
 * die ook live op theseo.nl staan):
 *   - public/skills/index.html                    → de lijst met hub-skills (naam, pagina, cluster)
 *   - alle overige HTML in public/                → skills die bij een artikel horen
 *   - public/assets/skills/<slug>.zip → SKILL.md  → de beschrijving per skill
 *   - public/assets/skills/bedrijfsbrein-sjabloon.zip → het sjabloon zelf
 *
 * Waarom twee doorgangen. De skills-hub toont de losse denk- en schrijfskills.
 * Daarnaast draagt bijna elk artikel op de site een eigen skill-zip die nergens
 * op die hub staat: de vakskills (lokale SEO per beroep) en de artikelskills.
 * Tot en met augustus 2026 keek dit script alleen naar de hub, waardoor
 * skill_zoeken precies de nieuwste skills nooit kon vinden. De tweede doorgang
 * loopt daarom over alle HTML in public/ en pakt elke zip die daar gelinkt
 * wordt en nog niet in de catalogus zit. Een zip die op schijf staat maar
 * nergens gelinkt is blijft er bewust buiten: dan is hij nog niet uitgegeven.
 *
 * Premium blijft buiten. Pagina's onder /skills/premium/ leveren nooit een
 * catalogusregel op, en voor het wegschrijven controleert premium-grens.mjs
 * elke regel. Lijkt er een premium, dan stopt het script met code 1 en
 * schrijft het niets weg (kaart-theseo-mcp 123).
 *
 * Gebruik:
 *   node scripts/genereer-catalogus.mjs [pad-naar-site-repo]
 *   THESEO_SITE_REPO=/pad node scripts/genereer-catalogus.mjs
 *   THESEO_CATALOGUS_UIT=/map  schrijft naar een andere map dan src/ (voor tests)
 *
 * Vereist het `unzip` commando (standaard aanwezig op macOS en Linux).
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isPremiumPagina, premiumInCatalogus } from './premium-grens.mjs';

const SITE = 'https://theseo.nl';

const KANDIDAAT_REPOS = [
  process.argv[2],
  process.env.THESEO_SITE_REPO,
  '/Users/gianlucaamantenaardenwerk/Library/Mobile Documents/com~apple~CloudDocs/THESEAO/theseo-cloudflare-site',
  join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'theseo-cloudflare-site'),
].filter(Boolean);

const siteRepo = KANDIDAAT_REPOS.find((p) => existsSync(join(p, 'public', 'skills', 'index.html')));
if (!siteRepo) {
  console.error('Site-repo niet gevonden. Geef het pad mee als argument of zet THESEO_SITE_REPO.');
  process.exit(1);
}

const uitDir = process.env.THESEO_CATALOGUS_UIT
  || join(dirname(fileURLToPath(import.meta.url)), '..', 'src');

/** Leest een bestand uit een zip zonder extra dependencies. */
function uitZip(zipPad, patroon) {
  return execFileSync('unzip', ['-p', zipPad, patroon], {
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
  });
}

/**
 * Haalt het description-veld uit de YAML-frontmatter van een SKILL.md.
 * Ondersteunt zowel een gewone regel (description: tekst) als YAML
 * blok-scalars (description: >- of |), die in een deel van de skills
 * gebruikt worden.
 */
function beschrijvingUitSkillMd(inhoud) {
  const frontmatter = inhoud.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatter) return null;

  const regels = frontmatter[1].split('\n');
  const start = regels.findIndex((r) => r.startsWith('description:'));
  if (start === -1) return null;

  const waarde = regels[start].slice('description:'.length).trim();
  const blokMarkering = waarde.match(/^([>|])[+-]?$/);
  if (!blokMarkering) return waarde || null;

  // Blok-scalar: alle volgende ingesprongen regels horen bij de waarde.
  const blokRegels = [];
  for (let i = start + 1; i < regels.length; i += 1) {
    const regel = regels[i];
    if (regel.trim() === '') {
      blokRegels.push('');
      continue;
    }
    if (!/^\s/.test(regel)) break;
    blokRegels.push(regel.trim());
  }
  // Gevouwen stijl (>) plakt regels met spaties; letterlijke stijl (|)
  // behoudt regeleinden.
  const scheidingsteken = blokMarkering[1] === '>' ? ' ' : '\n';
  const tekst = blokRegels.join(scheidingsteken).replace(/\s+$/, '').trim();
  return tekst || null;
}

/** Eerste kop uit een SKILL.md, als leesbare naam. */
function naamUitSkillMd(inhoud) {
  const kop = inhoud.match(/^#\s+(.+)$/m);
  if (kop) return kop[1].trim();
  const frontmatter = inhoud.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatter) return null;
  const regel = frontmatter[1].split('\n').find((r) => r.startsWith('name:'));
  return regel ? regel.slice('name:'.length).trim() || null : null;
}

/**
 * De sectie waar een pagina volgens haar eigen kruimelpad onder valt. Dat is de
 * op een na laatste kruimel: Home, <sectie>, <pagina>. Zo komt het clusterlabel
 * uit de site zelf en niet uit een lijst in dit script die bij elke nieuwe golf
 * zou verouderen.
 */
function sectieUitKruimelpad(html) {
  const namen = [...html.matchAll(/"name"\s*:\s*"((?:[^"\\]|\\.)*)"\s*,\s*"item"/g)]
    .map((m) => m[1].replace(/\\"/g, '"'));
  if (namen.length < 3) return null;
  return namen[namen.length - 2].trim().toUpperCase() || null;
}

/** Alle HTML-bestanden onder een map, recursief. */
function htmlBestanden(map) {
  const uit = [];
  for (const item of readdirSync(map, { withFileTypes: true })) {
    const pad = join(map, item.name);
    if (item.isDirectory()) uit.push(...htmlBestanden(pad));
    else if (item.isFile() && item.name.endsWith('.html')) uit.push(pad);
  }
  return uit;
}

/** Het webpad van een HTML-bestand in public/. */
function webPad(publicDir, bestand) {
  const rel = relative(publicDir, bestand).split(sep).join('/');
  return `/${rel.replace(/index\.html$/, '')}`;
}

/* ── 1. Skills uit de indexpagina ─────────────────────────────────────── */

const indexHtml = readFileSync(join(siteRepo, 'public', 'skills', 'index.html'), 'utf8');

// Elke sectie heeft een cluster-label (<span class="ann">…</span>) gevolgd
// door de links van dat cluster. We lopen door de pagina heen en onthouden
// het laatst geziene label, zodat elke skill zijn cluster meekrijgt.
//
// De patronen zijn bewust ruim. De hub is in augustus 2026 herbouwd van een
// rij kale links naar een doorzoekbaar tegelraster, waarbij het anker extra
// attributen kreeg en de naam in een eigen span belandde. Het oude, strakke
// patroon vond daarna nul skills en dit script schreef zonder klagen een
// catalogus zonder clusters weg. Vandaar: attributen zijn toegestaan, de naam
// komt uit de titelspan als die er is, en onderaan deze doorgang staat een
// harde controle die stopt zodra de hub niets meer oplevert.
const tokens = [...indexHtml.matchAll(
  /<span class="ann[^"]*">([^<]+)<\/span>|<a\b[^>]*href="(\/[^"]*skill-voor-claude[^"]*)"[^>]*>([\s\S]*?)<\/a>/g,
)];

/** Alleen "INS · COACHEN EN LEREN" is een clusterlabel, "42 skills" niet. */
function clusterLabel(tekst) {
  const schoon = tekst.replace(/&middot;/g, '·').trim();
  return /^[A-Z]{2,4}\s*·\s*\S/.test(schoon) ? schoon.replace(/^[^·]*·\s*/, '').trim() : null;
}

/** De naam uit een anker: de titelspan als die er is, anders de kale tekst. */
function naamUitAnker(binnenkant) {
  const titel = binnenkant.match(/<span class="[^"]*-tile-n"[^>]*>([\s\S]*?)<\/span>/);
  const bron = titel ? titel[1] : binnenkant;
  return bron.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

const skills = [];
const fouten = [];
const gezien = new Set();
let huidigCluster = '';

for (const t of tokens) {
  if (t[1] !== undefined) {
    const label = clusterLabel(t[1]);
    if (label) huidigCluster = label;
    continue;
  }

  const pad = t[2];
  const naam = naamUitAnker(t[3]);
  const slug = pad.replace(/\/+$/, '').split('/').pop();

  if (!naam) {
    fouten.push(`${slug}: geen leesbare naam in het anker op de skills-hub`);
    continue;
  }

  if (gezien.has(slug)) continue;
  gezien.add(slug);

  const zipPad = join(siteRepo, 'public', 'assets', 'skills', `${slug}.zip`);
  if (!existsSync(zipPad)) {
    fouten.push(`${slug}: geen zip gevonden op ${zipPad}`);
    continue;
  }

  let beschrijving = null;
  try {
    beschrijving = beschrijvingUitSkillMd(uitZip(zipPad, '*SKILL.md'));
  } catch (err) {
    fouten.push(`${slug}: SKILL.md niet leesbaar uit zip (${err.message})`);
    continue;
  }
  if (!beschrijving) {
    fouten.push(`${slug}: geen description-veld in SKILL.md frontmatter`);
    continue;
  }

  skills.push({
    slug,
    naam,
    cluster: huidigCluster,
    beschrijving,
    pagina: `${SITE}${pad}`,
    download: `${SITE}/assets/skills/${slug}.zip`,
    bron: 'skills-hub',
  });
}

const uitHub = skills.length;

// Harde stop. De skills-hub is de plek waar de clusters vandaan komen; levert
// hij niets op, dan is de opmaak veranderd en zouden alle hub-skills stilzwijgend
// in de tweede doorgang belanden, zonder cluster. Liever een rode melding dan
// een catalogus die er compleet uitziet.
if (uitHub === 0) {
  console.error(
    'Geen enkele skill gevonden op public/skills/index.html. De opmaak van die pagina '
    + 'is waarschijnlijk gewijzigd; pas de patronen in doorgang 1 aan voordat je verder gaat.',
  );
  process.exit(1);
}
const zonderCluster = skills.filter((s) => !s.cluster).length;
if (zonderCluster > 0) {
  console.error(`${zonderCluster} hub-skill(s) zonder clusterlabel; controleer de labels op de hub.`);
}

/* ── 1b. Skills die bij een artikel horen ─────────────────────────────── */

const publicDir = join(siteRepo, 'public');
const hubZips = new Set(skills.map((s) => s.slug));

// Uitgesloten: het bedrijfsbrein-sjabloon. Dat is geen skill maar een
// invulbaar contextbestand en heeft in deze server een eigen tool
// (bedrijfsbrein_template). In de skill-catalogus zou het dubbelop staan.
const GEEN_SKILL = new Set(['bedrijfsbrein-sjabloon']);

const artikelSkills = new Map(); // zipnaam → { pagina, sectie }
let premiumPaginas = 0;

for (const bestand of htmlBestanden(publicDir)) {
  const pad = webPad(publicDir, bestand);
  if (isPremiumPagina(pad)) {
    premiumPaginas += 1;
    continue;
  }

  const html = readFileSync(bestand, 'utf8');
  const zips = [...html.matchAll(/\/assets\/skills\/([a-z0-9._-]+)\.zip/g)].map((m) => m[1]);
  if (zips.length === 0) continue;

  const sectie = sectieUitKruimelpad(html);

  for (const zip of new Set(zips)) {
    if (hubZips.has(zip) || GEEN_SKILL.has(zip) || artikelSkills.has(zip)) continue;
    artikelSkills.set(zip, { pagina: pad, sectie });
  }
}

for (const [zip, { pagina, sectie }] of [...artikelSkills].sort((a, b) => a[0].localeCompare(b[0]))) {
  const zipPad = join(publicDir, 'assets', 'skills', `${zip}.zip`);
  if (!existsSync(zipPad)) {
    fouten.push(`${zip}: gelinkt op ${pagina} maar geen zip op schijf`);
    continue;
  }

  let md;
  try {
    md = uitZip(zipPad, '*SKILL.md');
  } catch (err) {
    fouten.push(`${zip}: SKILL.md niet leesbaar uit zip (${err.message})`);
    continue;
  }

  const beschrijving = beschrijvingUitSkillMd(md);
  const naam = naamUitSkillMd(md);
  if (!beschrijving || !naam) {
    fouten.push(`${zip}: geen description of kop in SKILL.md`);
    continue;
  }

  skills.push({
    slug: zip,
    naam,
    cluster: sectie || 'KENNISBANK',
    beschrijving,
    pagina: `${SITE}${pagina}`,
    download: `${SITE}/assets/skills/${zip}.zip`,
    bron: 'artikel',
  });
}

const uitArtikel = skills.length - uitHub;
console.log(`Gevonden: ${uitHub} skills op de skills-hub, ${uitArtikel} bij een artikel.`);
if (premiumPaginas > 0) {
  console.log(`${premiumPaginas} pagina('s) onder /skills/premium/ overgeslagen: premium hoort niet in de gratis catalogus.`);
}

// Harde stop voor premium. Liever geen nieuwe catalogus dan een premium skill
// op GitHub en in skill_zoeken.
const premiumRedenen = premiumInCatalogus(skills);
if (premiumRedenen.length > 0) {
  console.error('Gestopt: deze regels lijken premium en horen niet in de gratis catalogus:');
  for (const reden of premiumRedenen) console.error(`  - ${reden}`);
  console.error('Er is niets weggeschreven.');
  process.exit(1);
}

if (fouten.length > 0) {
  console.error(`${fouten.length} skill(s) overgeslagen:`);
  for (const f of fouten) console.error(`  - ${f}`);
}
if (skills.length === 0) {
  console.error('Geen enkele skill gevonden; catalogus niet weggeschreven.');
  process.exit(1);
}

const catalogus = {
  gegenereerd: new Date().toISOString(),
  bron: `${SITE}/skills/`,
  aantal: skills.length,
  aantal_hub: uitHub,
  aantal_artikel: uitArtikel,
  skills,
};
writeFileSync(join(uitDir, 'catalogus.json'), `${JSON.stringify(catalogus, null, 2)}\n`);
console.log(`src/catalogus.json geschreven: ${skills.length} skills, ${fouten.length} fouten.`);

/* ── 2. Bedrijfsbrein-sjabloon ────────────────────────────────────────── */

const breinZip = join(siteRepo, 'public', 'assets', 'skills', 'bedrijfsbrein-sjabloon.zip');
if (!existsSync(breinZip)) {
  console.error(`bedrijfsbrein-sjabloon.zip niet gevonden op ${breinZip}`);
  process.exit(1);
}

const sjabloon = uitZip(breinZip, '*bedrijfsbrein.md');
const leesmij = uitZip(breinZip, '*LEESMIJ.md');
if (!sjabloon.trim() || !leesmij.trim()) {
  console.error('Het bedrijfsbrein-sjabloon of de LEESMIJ is leeg; niet weggeschreven.');
  process.exit(1);
}

const bedrijfsbrein = {
  gegenereerd: new Date().toISOString(),
  pagina: `${SITE}/bedrijfsbrein-sjabloon/`,
  download: `${SITE}/assets/skills/bedrijfsbrein-sjabloon.zip`,
  leesmij,
  sjabloon,
};
writeFileSync(join(uitDir, 'bedrijfsbrein.json'), `${JSON.stringify(bedrijfsbrein, null, 2)}\n`);
console.log(`src/bedrijfsbrein.json geschreven: sjabloon ${sjabloon.length} tekens, leesmij ${leesmij.length} tekens.`);

if (fouten.length > 0) process.exit(2);
