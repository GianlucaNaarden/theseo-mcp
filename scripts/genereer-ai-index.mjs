#!/usr/bin/env node
/**
 * Genereert src/ai-index.json: een compacte index op de open data van de
 * Nationale AI-Index, gelezen uit de site-repo.
 *
 * Bronnen in de site-repo (niets wordt verzonnen of bijgeschat):
 *   - public/ai-index/open-data/data/ai-index.json  → alle 2.520 metingen
 *   - public/ai-index/open-data/data/summary.json   → de top 10 per branche
 *
 * Waarom een eigen index en niet het ruwe bestand: ai-index.json is 1,4 MB en
 * bevat per meting de volledige antwoordtekst. Een Worker hoeft dat niet in
 * zijn bundel te dragen om te kunnen tellen. We bewaren daarom alleen wat de
 * drie MCP-tools nodig hebben: per branche de vragenlijst en de tellingen, per
 * bedrijf de vindplaatsen, en de letterlijke tekst van de 19 weigeringen.
 *
 * Waarom summary.json er ook bij komt: dat bestand is de bron van de
 * ranglijsten op de open-datapagina. We tellen zelf opnieuw uit ai-index.json
 * en leggen de uitkomst ernaast. Wijkt het af, dan stopt het script, want dan
 * klopt onze telling niet met wat er gepubliceerd is.
 *
 * Gebruik:
 *   node scripts/genereer-ai-index.mjs [pad-naar-site-repo]
 *   THESEO_SITE_REPO=/pad node scripts/genereer-ai-index.mjs
 */

import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BRON_PAGINA = 'https://theseo.nl/ai-index/open-data/';
const DATA_PAD = join('public', 'ai-index', 'open-data', 'data');

const KANDIDAAT_REPOS = [
  process.argv[2],
  process.env.THESEO_SITE_REPO,
  '/Users/gianlucaamantenaardenwerk/Library/Mobile Documents/com~apple~CloudDocs/THESEAO/theseo-cloudflare-site',
  join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'theseo-cloudflare-site'),
].filter(Boolean);

const siteRepo = KANDIDAAT_REPOS.find((p) => existsSync(join(p, DATA_PAD, 'ai-index.json')));
if (!siteRepo) {
  console.error('Site-repo niet gevonden. Geef het pad mee als argument of zet THESEO_SITE_REPO.');
  process.exit(1);
}

const uitDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const uitBestand = join(uitDir, 'ai-index.json');

/*
 * Wat hier bewust NIET gebeurt: normaliseren.
 *
 * De open-datapagina beschrijft een zoeksleutel (vergelijken zonder
 * hoofdletters, accenten, spaties, koppeltekens en punten). Die sleutel hoort
 * niet in dit bestand thuis, om twee redenen. Ten eerste zou hij naast elke
 * weergavenaam nog eens 3.807 keer in de bundel staan terwijl hij uit de naam
 * af te leiden is; dat kostte 55 KB. Ten tweede zou dezelfde functie dan op
 * twee plekken bestaan, hier en in de tool, en uit elkaar kunnen lopen.
 *
 * De index telt daarom precies zoals de brondata het opschrijft: per
 * weergavenaam. Het samenvallen van schrijfwijzen gebeurt pas bij het
 * opzoeken, in src/tools/ai-index-gedeeld.ts, en alleen om iets te vinden,
 * nooit om tellingen bij elkaar op te tellen.
 */

const ruw = JSON.parse(readFileSync(join(siteRepo, DATA_PAD, 'ai-index.json'), 'utf8'));
const samenvatting = JSON.parse(readFileSync(join(siteRepo, DATA_PAD, 'summary.json'), 'utf8'));

const metingen = ruw.metingen;
if (!Array.isArray(metingen) || metingen.length === 0) {
  console.error('ai-index.json bevat geen metingen; index niet weggeschreven.');
  process.exit(1);
}

/* -- 1. Branches opbouwen in de volgorde van de brondata --------------- */

const brancheVolgorde = [];
const perBranche = new Map();

function branche(naam) {
  let b = perBranche.get(naam);
  if (!b) {
    b = {
      naam,
      vragen: new Map(),
      metingen: 0,
      geldig: 0,
      vermeldingen: 0,
      weigeringen: [],
      tellingen: new Map(),
    };
    perBranche.set(naam, b);
    brancheVolgorde.push(b);
  }
  return b;
}

/* -- 2. Bedrijven opbouwen --------------------------------------------- */

// De weergavenaam uit de brondata is de sleutel. Wat het exportscript van de
// site al heeft samengevoegd blijft samengevoegd, wat het apart hield blijft
// apart. Deze index voegt uit zichzelf niets samen.
const bedrijven = new Map();

function bedrijf(naam) {
  let b = bedrijven.get(naam);
  if (!b) {
    b = { naam, totaal: 0, actueel: 0, perBranche: new Map() };
    bedrijven.set(naam, b);
  }
  return b;
}

for (const m of metingen) {
  const b = branche(m.branche);
  b.metingen += 1;
  if (!b.vragen.has(m.vraag_nr)) b.vragen.set(m.vraag_nr, m.vraag);

  if (!m.geldig) {
    // De letterlijke weigertekst is het antwoord op "met welke reden";
    // parafraseren zou de enige controleerbare bron ervan weggooien.
    b.weigeringen.push([m.vraag_nr, m.meetmoment, m.antwoord_ruw]);
    continue;
  }

  b.geldig += 1;
  b.vermeldingen += m.bedrijven.length;

  for (const naam of m.bedrijven) {
    const bd = bedrijf(naam);
    bd.totaal += 1;
    if (m.meetmoment === 0) bd.actueel += 1;

    b.tellingen.set(naam, (b.tellingen.get(naam) ?? 0) + 1);

    let vak = bd.perBranche.get(m.branche);
    if (!vak) {
      vak = { aantal: 0, actueel: 0, vragen: new Map() };
      bd.perBranche.set(m.branche, vak);
    }
    vak.aantal += 1;
    if (m.meetmoment === 0) vak.actueel += 1;
    vak.vragen.set(m.vraag_nr, (vak.vragen.get(m.vraag_nr) ?? 0) + 1);
  }
}

/* -- 3. Top 10 per branche en controle tegen summary.json -------------- */

const fouten = [];
const brancheIndex = new Map(brancheVolgorde.map((b, i) => [b.naam, i]));

const branchesUit = brancheVolgorde.map((b) => {
  const gesorteerd = [...b.tellingen.entries()].sort(
    (x, y) => y[1] - x[1] || x[0].localeCompare(y[0]),
  );
  const top = gesorteerd.slice(0, 10);

  // Het actuele beeld per topnaam: in hoeveel van de 40 vragen staat de naam
  // in het antwoord van meetmoment 0.
  const topUit = top.map(([naam, aantal]) => {
    const vak = bedrijf(naam).perBranche.get(b.naam);
    return [naam, aantal, vak ? vak.actueel : 0];
  });

  const gepubliceerd = samenvatting.branches.find((s) => s.branche === b.naam);
  if (!gepubliceerd) {
    fouten.push(`${b.naam}: staat niet in summary.json`);
  } else {
    if (gepubliceerd.geldige_metingen !== b.geldig) {
      fouten.push(
        `${b.naam}: geldige metingen ${b.geldig} tegen ${gepubliceerd.geldige_metingen} in summary.json`,
      );
    }
    gepubliceerd.top10.forEach((rij, i) => {
      const eigen = topUit[i];
      if (!eigen || eigen[0] !== rij.bedrijf || eigen[1] !== rij.vermeldingen_totaal) {
        fouten.push(
          `${b.naam} plek ${i + 1}: eigen telling ${eigen ? `${eigen[0]} ${eigen[1]}` : 'ontbreekt'} `
          + `tegen ${rij.bedrijf} ${rij.vermeldingen_totaal} in summary.json`,
        );
      }
    });
  }

  return {
    naam: b.naam,
    metingen: b.metingen,
    geldig: b.geldig,
    vermeldingen: b.vermeldingen,
    uniekeBedrijven: b.tellingen.size,
    topTotaal: top.reduce((som, [, aantal]) => som + aantal, 0),
    top: topUit,
    weigeringen: b.weigeringen,
    vragen: [...b.vragen.entries()].sort((x, y) => x[0] - y[0]),
  };
});

if (fouten.length > 0) {
  console.error('De eigen telling wijkt af van summary.json; index niet weggeschreven:');
  for (const f of fouten) console.error(`  - ${f}`);
  process.exit(1);
}

/* -- 4. Bedrijvenlijst compact wegschrijven ---------------------------- */

// Rij: [weergavenaam, totaal, actueel, [[brancheIndex, aantal, actueel,
// [[vraagNr, aantal], ...]], ...]]. Arrays in plaats van objecten, omdat de
// veldnamen anders 3.807 keer in de bundel terechtkomen.
const bedrijvenUit = [...bedrijven.values()]
  .sort((a, b) => b.totaal - a.totaal || a.naam.localeCompare(b.naam))
  .map((bd) => [
    bd.naam,
    bd.totaal,
    bd.actueel,
    [...bd.perBranche.entries()].map(([brancheNaam, vak]) => [
      brancheIndex.get(brancheNaam),
      vak.aantal,
      vak.actueel,
      [...vak.vragen.entries()].sort((x, y) => y[1] - x[1] || x[0] - y[0]),
    ]),
  ]);

const geldig = branchesUit.reduce((som, b) => som + b.geldig, 0);
const ongeldig = branchesUit.reduce((som, b) => som + b.weigeringen.length, 0);

const index = {
  gegenereerd: new Date().toISOString(),
  bron: BRON_PAGINA,
  meta: {
    model: ruw.meta.model,
    temperature: ruw.meta.temperature,
    prompt: ruw.meta.prompt,
    licentie: ruw.meta.licentie,
    meetcyclus: ruw.meta.meetcyclus,
    laatsteMeting: ruw.meta.laatste_meting,
    aantalBranches: branchesUit.length,
    aantalVragen: branchesUit.reduce((som, b) => som + b.vragen.length, 0),
    aantalMetingen: metingen.length,
    aantalGeldig: geldig,
    aantalOngeldig: ongeldig,
    meetmomentenPerVraag: 7,
    uniekeBedrijfsnamen: bedrijvenUit.length,
  },
  branches: branchesUit,
  bedrijven: bedrijvenUit,
};

if (index.meta.aantalMetingen !== ruw.meta.aantal_metingen
  || index.meta.aantalOngeldig !== ruw.meta.aantal_ongeldig) {
  console.error('De aantallen wijken af van het meta-blok van de brondata; niet weggeschreven.');
  process.exit(1);
}

writeFileSync(uitBestand, `${JSON.stringify(index)}\n`);

const kb = Math.round(statSync(uitBestand).size / 1024);
console.log(
  `src/ai-index.json geschreven: ${index.branches.length} branches, `
  + `${index.meta.aantalVragen} vragen, ${index.meta.uniekeBedrijfsnamen} bedrijfsnamen, `
  + `${index.meta.aantalOngeldig} weigeringen, ${kb} KB.`,
);
