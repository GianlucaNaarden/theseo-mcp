#!/usr/bin/env node
/**
 * Genereert de statische data voor de MCP-server uit de lokale site-repo:
 *
 *   1. src/catalogus.json      – de catalogus van gratis Claude-skills
 *   2. src/bedrijfsbrein.json  – de volledige inhoud van het bedrijfsbrein-sjabloon
 *
 * Bronnen in de site-repo (niets wordt verzonnen, alles komt uit bestanden
 * die ook live op theseo.nl staan):
 *   - public/skills/index.html                    → de lijst met skills (naam, pagina, cluster)
 *   - public/assets/skills/<slug>.zip → SKILL.md  → de beschrijving per skill
 *   - public/assets/skills/bedrijfsbrein-sjabloon.zip → het sjabloon zelf
 *
 * Gebruik:
 *   node scripts/genereer-catalogus.mjs [pad-naar-site-repo]
 *   THESEO_SITE_REPO=/pad node scripts/genereer-catalogus.mjs
 *
 * Vereist het `unzip` commando (standaard aanwezig op macOS en Linux).
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

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

const uitDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');

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

/* ── 1. Skills uit de indexpagina ─────────────────────────────────────── */

const indexHtml = readFileSync(join(siteRepo, 'public', 'skills', 'index.html'), 'utf8');

// Elke sectie heeft een cluster-label (<span class="ann">…</span>) gevolgd
// door de links van dat cluster. We lopen door de pagina heen en onthouden
// het laatst geziene label, zodat elke skill zijn cluster meekrijgt.
const tokens = [...indexHtml.matchAll(
  /<span class="ann">([^<]+)<\/span>|<a href="(\/[^"]*skill-voor-claude[^"]*)">([^<]+)<\/a>/g,
)];

const skills = [];
const fouten = [];
const gezien = new Set();
let huidigCluster = '';

for (const t of tokens) {
  if (t[1]) {
    // Labels zien eruit als "INS · SCHRIJVEN EN OVERTUIGEN"; het deel na de
    // punt is de leesbare clusternaam.
    huidigCluster = t[1].replace(/^[^·]*·\s*/, '').trim();
    continue;
  }

  const pad = t[2];
  const naam = t[3].trim();
  const slug = pad.replace(/\/+$/, '').split('/').pop();

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
  });
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
