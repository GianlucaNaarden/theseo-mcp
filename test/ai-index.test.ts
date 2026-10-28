/**
 * Tests van de drie AI-Index tools.
 *
 * De helft praat via een echte MCP-client tegen dezelfde handler die in
 * productie draait, zoals in smoke.test.ts; de andere helft controleert de
 * gegenereerde index en de losse zoekfuncties, zoals in skill-zoeken.test.ts.
 * Er is geen netwerk bij betrokken: deze drie tools lezen alleen src/ai-index.json.
 */
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { createServer } from '../src/server';
import {
  datum,
  getal,
  index,
  normaliseer,
  percentage,
  telwoord,
  zoekBedrijf,
  zoekBranche,
  type BedrijfRij,
  type Branche,
} from '../src/tools/ai-index-gedeeld';

/*
 * Over de verwachtingen in dit bestand: elk getal dat uit een data-uitgave komt
 * (aantal metingen, weigeringen, vermeldingen per bedrijf, de datum van de
 * laatste meting) wordt hier uit `index` zelf afgeleid en nooit als literal
 * gezet. Dan blijft de suite groen bij de volgende uitgave van de open data.
 * Literals blijven alleen staan waar ze de meetmethode vastleggen (model,
 * temperature, negen branches, veertig vragen per branche) of een zoekterm zijn.
 */

const meta = index.meta;

const handler = createMcpHandler(createServer);
const client = new Client(
  { name: 'theseo-mcp-aiindex-testclient', version: '0.0.1' },
  { versionNegotiation: { mode: 'auto' } },
);

before(async () => {
  const transport = new StreamableHTTPClientTransport(new URL('http://test.local/mcp'), {
    fetch: (url: string | URL, init?: RequestInit) => handler.fetch(new Request(url, init)),
  });
  await client.connect(transport);
});

after(async () => {
  await client.close();
  await handler.close();
});

async function roep(naam: string, argumenten: Record<string, unknown>): Promise<string> {
  const resultaat = await client.callTool({ name: naam, arguments: argumenten });
  assert.notEqual(resultaat.isError, true, `${naam} gaf een fout terug`);
  const inhoud = resultaat.content as Array<{ type: string; text: string }>;
  return inhoud[0].text;
}

function brancheMetNaam(naam: string): Branche {
  const gevonden = index.branches.find((b) => b.naam === naam);
  assert.ok(gevonden, `branche "${naam}" staat niet in de index`);
  return gevonden;
}

function bedrijfMetNaam(naam: string): BedrijfRij {
  const gevonden = index.bedrijven.find((rij) => rij[0] === naam);
  assert.ok(gevonden, `bedrijf "${naam}" staat niet in de index`);
  return gevonden;
}

/** Aantal vermeldingen van een bedrijfsrij in een branche, uit de index zelf. */
function aantalInBranche(rij: BedrijfRij, brancheNaam: string): number {
  const brancheIndex = index.branches.findIndex((b) => b.naam === brancheNaam);
  const vindplaats = rij[3].find(([i]) => i === brancheIndex);
  assert.ok(vindplaats, `${rij[0]} staat niet in ${brancheNaam}`);
  return vindplaats[1];
}

function escapeRegex(tekst: string): string {
  return tekst.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/* -- De gegenereerde index --------------------------------------------- */

test('de index klopt met het meta-blok van de open data', () => {
  // De methode: dit model, deze instelling, negen branches (de tooltekst noemt
  // "negen branches"). Alles hieronder volgt uit de data zelf.
  assert.equal(meta.model, 'gpt-5-mini');
  assert.equal(meta.temperature, 1);
  assert.equal(index.branches.length, 9);
  assert.equal(meta.aantalBranches, index.branches.length);

  const vragen = index.branches.reduce((som, b) => som + b.vragen.length, 0);
  const metingen = index.branches.reduce((som, b) => som + b.metingen, 0);
  assert.equal(meta.aantalVragen, vragen);
  assert.equal(meta.aantalMetingen, metingen);
  assert.equal(meta.aantalMetingen, meta.aantalVragen * meta.meetmomentenPerVraag);
  assert.equal(meta.aantalGeldig + meta.aantalOngeldig, meta.aantalMetingen);
  assert.ok(meta.aantalOngeldig >= 0 && meta.aantalOngeldig < meta.aantalMetingen);
  assert.equal(index.bedrijven.length, meta.uniekeBedrijfsnamen);

  // De laatste meting is een echte kalenderdatum en ligt niet na het moment
  // waarop het bestand is gegenereerd.
  assert.match(meta.laatsteMeting, /^\d{4}-\d{2}-\d{2}$/);
  const dag = new Date(`${meta.laatsteMeting}T00:00:00Z`);
  assert.equal(dag.toISOString().slice(0, 10), meta.laatsteMeting, 'geen bestaande datum');
  assert.ok(meta.laatsteMeting <= index.gegenereerd.slice(0, 10), 'laatste meting ligt na de generatiedatum');
  assert.ok(meta.meetcyclus.length > 0, 'de meetcyclus is leeg');
});

test('elke branche telt intern kloppend', () => {
  let vragen = 0;
  let geldig = 0;
  let weigeringen = 0;

  for (const b of index.branches) {
    // Veertig vragen per branche is de vaste meetmethode (zie HARDE_MAX in de vragen-tool).
    assert.equal(b.vragen.length, 40, `${b.naam}: geen 40 vragen`);
    assert.equal(b.geldig + b.weigeringen.length, b.metingen, `${b.naam}: metingen tellen niet op`);
    assert.equal(b.top.length, 10, `${b.naam}: geen top tien`);
    assert.ok(b.topTotaal <= b.vermeldingen, `${b.naam}: top telt meer dan alle vermeldingen`);
    assert.equal(
      b.topTotaal,
      b.top.reduce((som, [, aantal]) => som + aantal, 0),
      `${b.naam}: topTotaal is niet de som van de top tien`,
    );
    for (const [nr, tekst] of b.vragen) {
      assert.ok(nr >= 1 && nr <= 40, `${b.naam}: rare vraagnummer ${nr}`);
      assert.ok(tekst.length > 10, `${b.naam}: vraag ${nr} is te kort om echt te zijn`);
    }
    vragen += b.vragen.length;
    geldig += b.geldig;
    weigeringen += b.weigeringen.length;
  }

  assert.equal(vragen, meta.aantalVragen);
  assert.equal(geldig, meta.aantalGeldig);
  assert.equal(weigeringen, meta.aantalOngeldig);
});

test('de vermeldingen per bedrijf tellen op tot de vermeldingen per branche', () => {
  const perBranche = new Array<number>(index.branches.length).fill(0);
  for (const [, totaal, , vindplaatsen] of index.bedrijven) {
    let som = 0;
    for (const [brancheIndex, aantal] of vindplaatsen) {
      perBranche[brancheIndex] += aantal;
      som += aantal;
    }
    assert.equal(som, totaal, 'het totaal van een bedrijf is niet de som van zijn branches');
  }
  index.branches.forEach((b, i) => {
    assert.equal(perBranche[i], b.vermeldingen, `${b.naam}: vermeldingen lopen niet gelijk`);
  });
});

test('elke weigering bewaart de letterlijke tekst van het model', () => {
  const alle = index.branches.flatMap((b) => b.weigeringen);
  assert.equal(alle.length, meta.aantalOngeldig);
  // Meetmoment 0 is het actuele antwoord; de oudste ligt meetmomentenPerVraag - 1 terug.
  const oudste = -(meta.meetmomentenPerVraag - 1);
  for (const [vraagNr, meetmoment, tekst] of alle) {
    assert.ok(vraagNr >= 1 && vraagNr <= 40);
    assert.ok(meetmoment <= 0 && meetmoment >= oudste, `meetmoment ${meetmoment} valt buiten ${oudste}..0`);
    assert.ok(tekst.trim().length > 20, `weigering bij vraag ${vraagNr} heeft geen leesbare reden`);
  }
});

/* -- De zoekfuncties ---------------------------------------------------- */

test('normalisatie laat schrijfwijzen samenvallen', () => {
  assert.equal(normaliseer('Bol.com'), normaliseer('bol.com'));
  assert.equal(normaliseer('Bol.com'), normaliseer('BOL COM'));
  assert.equal(normaliseer('Loods 5'), normaliseer('Loods5'));
  assert.equal(normaliseer('Montèl'), normaliseer('Montel'));
  assert.equal(normaliseer('Kuehne + Nagel'), normaliseer('Kuehne+Nagel'));
});

test('normalisatie voegt geen entiteiten samen', () => {
  assert.notEqual(normaliseer('Capgemini'), normaliseer('Capgemini Nederland'));
  assert.notEqual(normaliseer('Deloitte'), normaliseer('Deloitte Nederland'));
});

test('een branche is te vinden op een deel van de naam in kleine letters', () => {
  for (const [invoer, verwacht] of [
    ['zorg', 'Zorg & Welzijn'],
    ['logistiek', 'Logistiek & Fulfilment'],
    ['detailhandel', 'Detailhandel & Elektronica'],
    ['wonen', 'Meubels & Wonen'],
    ['saas', 'SaaS & Cloudsoftware'],
    ['horeca', 'Horeca & Beleving'],
    ['auto', 'Automotive & Mobiliteit'],
    ['marketing', 'Marketing & Digitale Groei'],
    ['zorg & welzijn', 'Zorg & Welzijn'],
    ['ZORG EN WELZIJN', 'Zorg & Welzijn'],
  ] as const) {
    const uitkomst = zoekBranche(invoer);
    assert.equal(uitkomst.soort, 'gevonden', `"${invoer}" leverde geen enkele branche op`);
    if (uitkomst.soort === 'gevonden') assert.equal(uitkomst.treffer.branche.naam, verwacht);
  }
});

test('een korte term wint bij het begin van de naam, niet ergens middenin', () => {
  // "it" zit ook in mobiliteit en digitale; alleen IT & Cloud Diensten begint ermee.
  const uitkomst = zoekBranche('it');
  assert.equal(uitkomst.soort, 'gevonden');
  if (uitkomst.soort === 'gevonden') assert.equal(uitkomst.treffer.branche.naam, 'IT & Cloud Diensten');
});

test('een heel woord wint van een halve naam', () => {
  // "cloud" zit in SaaS & Cloudsoftware, maar staat als los woord in
  // IT & Cloud Diensten. Die laatste hoort te winnen.
  const uitkomst = zoekBranche('cloud');
  assert.equal(uitkomst.soort, 'gevonden');
  if (uitkomst.soort === 'gevonden') assert.equal(uitkomst.treffer.branche.naam, 'IT & Cloud Diensten');
});

test('een vaag stukje tekst geeft de kandidaten terug in plaats van te gokken', () => {
  // "ing" zit alleen als staart in Beleving en Marketing en nergens als woord.
  const uitkomst = zoekBranche('ing');
  assert.equal(uitkomst.soort, 'meerdere');
  if (uitkomst.soort === 'meerdere') assert.ok(uitkomst.kandidaten.length >= 2);
});

test('een onbekende branche levert niets op, geen gokwerk', () => {
  assert.equal(zoekBranche('kwatsch').soort, 'geen');
  assert.equal(zoekBranche('').soort, 'geen');
});

test('een bedrijf is te vinden op elke schrijfwijze', () => {
  for (const invoer of ['Bol.com', 'bol.com', 'BOL COM', 'bolcom']) {
    const { treffers } = zoekBedrijf(invoer);
    assert.equal(treffers.length, 1, `"${invoer}" gaf geen enkele treffer`);
    assert.equal(treffers[0].rij[0], 'Bol.com');
  }
});

test('zoeken op Capgemini houdt Capgemini Nederland apart', () => {
  const { treffers, verwant } = zoekBedrijf('Capgemini');
  assert.equal(treffers.length, 1);
  assert.equal(treffers[0].rij[0], 'Capgemini');

  const apart = verwant.find((v) => v.rij[0] === 'Capgemini Nederland');
  assert.ok(apart, 'Capgemini Nederland hoort als aparte naam terug');

  // Twee verschillende namen met twee verschillende zoeksleutels, en elk komt
  // terug als precies zijn eigen rij uit de index (identiteit, dus geen kopie
  // waarin tellingen zijn opgeteld). De exacte aantallen zetten we niet vast:
  // die verschuiven per data-uitgave.
  assert.notEqual(treffers[0].rij[0], apart.rij[0]);
  assert.notEqual(treffers[0].sleutel, apart.sleutel);
  assert.strictEqual(treffers[0].rij, bedrijfMetNaam('Capgemini'));
  assert.strictEqual(apart.rij, bedrijfMetNaam('Capgemini Nederland'));

  // Het totaal van Capgemini is de som van zijn eigen branches en bevat niets
  // van Capgemini Nederland.
  const eigenSom = treffers[0].rij[3].reduce((som, [, aantal]) => som + aantal, 0);
  assert.equal(treffers[0].rij[1], eigenSom);
});

test('een naam die er niet in staat levert niets op', () => {
  const { treffers, verwant } = zoekBedrijf('Zwiebelfisch Kwatschbedrijf');
  assert.equal(treffers.length, 0);
  assert.equal(verwant.length, 0);
});

/* -- De tools via de echte handler -------------------------------------- */

test('ai_index_branche geeft tellingen, top tien en concentratie', async () => {
  // Elke branche, op zijn volledige naam: de verwachting komt uit de index zelf.
  for (const b of index.branches) {
    const tekst = await roep('ai_index_branche', { branche: b.naam });
    const waar = `branche ${b.naam}`;

    assert.ok(tekst.includes(`AI-Index, branche ${b.naam}`), `${waar}: kop ontbreekt`);
    assert.ok(tekst.includes(`${getal(b.geldig)} van de ${getal(b.metingen)} geldig`), `${waar}: metingen`);
    assert.ok(tekst.includes('metingen'), `${waar}: het woord metingen ontbreekt`);

    // Alle tien namen staan erin, met hun eigen telling en het actuele beeld.
    assert.equal(b.top.length, 10);
    for (const [naam, totaal, actueel] of b.top) {
      const rij = new RegExp(
        `^\\s*\\d+\\. ${escapeRegex(naam)}\\s+${totaal} vermeldingen?, nu in ${actueel} van de ${b.vragen.length} vragen$`,
        'm',
      );
      assert.match(tekst, rij, `${waar}: de regel van ${naam} klopt niet met de index`);
    }

    assert.ok(
      tekst.includes(
        `Concentratie: ${getal(b.topTotaal)} van de ${getal(b.vermeldingen)} vermeldingen `
        + `(${percentage(b.topTotaal, b.vermeldingen)})`,
      ),
      `${waar}: concentratie`,
    );

    if (b.weigeringen.length === 0) {
      assert.match(tekst, /Weigeringen: geen/, `${waar}: heeft geen weigeringen`);
    } else {
      assert.ok(tekst.includes(`Weigeringen: ${b.weigeringen.length},`), `${waar}: aantal weigeringen`);
    }
  }
});

test('ai_index_branche geeft de weigeringen met de letterlijke reden', async (t) => {
  // De branche met de meeste weigeringen.
  const b = [...index.branches].sort((x, y) => y.weigeringen.length - x.weigeringen.length)[0];
  if (b.weigeringen.length === 0) {
    t.skip('geen enkele weigering in deze data-uitgave');
    return;
  }

  const tekst = await roep('ai_index_branche', { branche: b.naam });
  assert.ok(tekst.includes(b.naam), 'de branche met de meeste weigeringen is niet gevonden');
  assert.ok(tekst.includes(`Weigeringen: ${b.weigeringen.length},`));

  const n = b.weigeringen.length;
  const kop = n === 1 ? 'De weigering' : `De ${n} weigeringen`;
  assert.ok(tekst.includes(`${kop}, met de letterlijke reden van het model:`));

  // Elke weigering staat er met vraagnummer, meetmoment en het begin van de
  // letterlijke tekst van het model (lange teksten worden afgekapt).
  for (const [vraagNr, meetmoment, reden] of b.weigeringen) {
    const begin = reden.slice(0, 40);
    assert.ok(
      tekst.includes(`vraag ${vraagNr}, meetmoment ${meetmoment}: "${begin}`),
      `weigering bij vraag ${vraagNr}, meetmoment ${meetmoment} ontbreekt of is niet letterlijk`,
    );
  }
});

test('ai_index_branche geeft bij een onbekende branche de lijst met branches', async () => {
  const tekst = await roep('ai_index_branche', { branche: 'kwatsch' });
  assert.match(tekst, /Geen branche gevonden/);
  for (const b of index.branches) assert.ok(tekst.includes(b.naam), `${b.naam} ontbreekt in de lijst`);
});

test('ai_index_vragen geeft letterlijke vragen plus de meetmethode', async () => {
  const tekst = await roep('ai_index_vragen', { branche: 'horeca', max: 3 });
  assert.match(tekst, /Horeca & Beleving/);
  assert.match(tekst, /Je bent een objectieve adviseur/);
  assert.match(tekst, /Model: gpt-5-mini, temperature 1, via de API/);
  assert.ok(tekst.includes(`Prompt: "${meta.prompt}"`), 'de prompt staat er niet letterlijk in');
  assert.ok(tekst.includes(`Cyclus: ${meta.meetcyclus}.`), 'de meetcyclus uit de meta staat er niet in');
  assert.ok(
    tekst.includes(`Per vraag worden ${meta.meetmomentenPerVraag} antwoorden bewaard`),
    'het aantal meetmomenten per vraag klopt niet met de meta',
  );
  assert.match(tekst, /3 van de 40 vragen/);
  assert.match(tekst, /Nog 37 vragen niet getoond/);
  const [nr, vraag] = index.branches.find((b) => b.naam === 'Horeca & Beleving')!.vragen[0];
  assert.ok(tekst.includes(vraag), `vraag ${nr} staat er niet letterlijk in`);
});

test('ai_index_vragen kan de hele lijst van veertig geven', async () => {
  const tekst = await roep('ai_index_vragen', { branche: 'saas', max: 40 });
  assert.match(tekst, /40 van de 40 vragen/);
  assert.doesNotMatch(tekst, /niet getoond/);
});

test('ai_index_bedrijf vindt een bedrijf met branches en vragen', async () => {
  const tekst = await roep('ai_index_bedrijf', { bedrijfsnaam: 'coolblue' });
  assert.match(tekst, /"coolblue" komt voor in de AI-Index/);

  // De tellingen komen uit de index: het totaal over alle branches, en per
  // branche het aantal vermeldingen en in hoeveel vragen de naam voorkwam.
  const [naam, totaal, , vindplaatsen] = bedrijfMetNaam('Coolblue');
  assert.ok(
    tekst.includes(`${naam}: ${telwoord(totaal, 'vermelding', 'vermeldingen')} over alle geldige metingen`),
    'het totaal van Coolblue klopt niet met de index',
  );
  assert.ok(vindplaatsen.length > 0, 'Coolblue hoort in minstens een branche voor te komen');
  for (const [brancheIndex, aantal, , vragen] of vindplaatsen) {
    const branche = index.branches[brancheIndex];
    assert.ok(
      tekst.includes(
        `${branche.naam}: ${telwoord(aantal, 'vermelding', 'vermeldingen')} in `
        + `${vragen.length} van de ${branche.vragen.length} vragen`,
      ),
      `${branche.naam}: de telling van Coolblue klopt niet met de index`,
    );
  }
  assert.match(
    tekst,
    new RegExp(`vraag \\d+, \\d+ van de ${meta.meetmomentenPerVraag} meetmomenten: "`),
  );
});

test('ai_index_bedrijf zegt uitdrukkelijk dat afwezigheid geen oordeel is', async () => {
  const tekst = await roep('ai_index_bedrijf', { bedrijfsnaam: 'Zwiebelfisch Kwatschbedrijf' });
  assert.ok(
    tekst.includes(`komt niet voor in de ${getal(meta.aantalGeldig)} geldige metingen`),
    'het aantal geldige metingen in de zin klopt niet met de meta',
  );
  assert.match(tekst, /uitdrukkelijk geen oordeel over dit bedrijf/);
  assert.match(tekst, /steekproef met een vast vragenlijstje/);
});

test('ai_index_bedrijf voegt Capgemini en Capgemini Nederland niet samen', async () => {
  const capgemini = bedrijfMetNaam('Capgemini');
  const nederland = bedrijfMetNaam('Capgemini Nederland');
  const vermeldingen = (aantal: number) => telwoord(aantal, 'vermelding', 'vermeldingen');

  const tekst = await roep('ai_index_bedrijf', { bedrijfsnaam: 'Capgemini' });
  assert.ok(
    tekst.includes(`Capgemini: ${vermeldingen(capgemini[1])} over alle geldige metingen`),
    'het totaal van Capgemini klopt niet met de index',
  );
  assert.ok(
    tekst.includes(`IT & Cloud Diensten: ${vermeldingen(aantalInBranche(capgemini, 'IT & Cloud Diensten'))}`),
    'de telling van Capgemini in IT & Cloud Diensten klopt niet met de index',
  );
  assert.ok(
    tekst.includes(`Capgemini Nederland: ${vermeldingen(nederland[1])}`),
    'Capgemini Nederland hoort met zijn eigen telling terug',
  );
  assert.match(tekst, /tellen apart/);
  assert.doesNotMatch(tekst, /schrijfwijzen in de brondata/, 'de twee namen zijn als een naam behandeld');

  // De opgetelde variant (Capgemini plus Capgemini Nederland) mag bij geen van
  // beide namen als telling staan, noch totaal noch in IT & Cloud Diensten.
  const somTotaal = capgemini[1] + nederland[1];
  const somIt = aantalInBranche(capgemini, 'IT & Cloud Diensten')
    + aantalInBranche(nederland, 'IT & Cloud Diensten');
  assert.doesNotMatch(tekst, new RegExp(`Capgemini( Nederland)?: ${escapeRegex(getal(somTotaal))} vermeldingen`));
  assert.doesNotMatch(tekst, new RegExp(`IT & Cloud Diensten: ${escapeRegex(getal(somIt))} vermeldingen`));
});

/* -- De bronregel ------------------------------------------------------- */

test('datum en getal schrijven zoals de open-datapagina', () => {
  // Vaste invoer, geen data-uitgave: dit houdt de formatteerfuncties eerlijk
  // nu de rest van het bestand zijn verwachtingen ermee opbouwt.
  assert.equal(datum('2026-07-29'), '29 juli 2026');
  assert.equal(datum('2026-10-26'), '26 oktober 2026');
  assert.equal(datum('2026-01-05'), '5 januari 2026');
  assert.equal(datum('geen datum'), 'geen datum');
  assert.equal(getal(2520), '2.520');
  assert.equal(getal(999), '999');
  assert.equal(getal(1234567), '1.234.567');
  assert.equal(telwoord(1, 'vermelding', 'vermeldingen'), '1 vermelding');
  assert.equal(telwoord(1200, 'vermelding', 'vermeldingen'), '1.200 vermeldingen');
});

test('elke uitvoer eindigt met dezelfde bronregel', async () => {
  const uitvoer = await Promise.all([
    roep('ai_index_branche', { branche: 'zorg' }),
    roep('ai_index_branche', { branche: 'kwatsch' }),
    roep('ai_index_vragen', { branche: 'logistiek' }),
    roep('ai_index_vragen', { branche: 'kwatsch' }),
    roep('ai_index_bedrijf', { bedrijfsnaam: 'PostNL' }),
    roep('ai_index_bedrijf', { bedrijfsnaam: 'Zwiebelfisch Kwatschbedrijf' }),
  ]);

  const laatsteRegels = uitvoer.map((t) => t.trimEnd().split('\n').pop());
  const eerste = laatsteRegels[0]!;

  assert.match(eerste, /^Bron: Nationale AI-Index van TheSEO\./);
  assert.ok(eerste.includes(`Model ${meta.model} (temperature ${meta.temperature})`));
  assert.ok(
    eerste.includes(`${getal(meta.aantalMetingen)} metingen waarvan ${getal(meta.aantalGeldig)} geldig`),
    'de bronregel noemt niet het aantal metingen en geldige metingen uit de meta',
  );
  assert.ok(
    eerste.includes(`laatste meting ${datum(meta.laatsteMeting)}.`),
    'de bronregel noemt niet de datum van de laatste meting uit de meta',
  );
  // Los van de formatteerfunctie: het is een Nederlandse datum met maandnaam.
  assert.match(eerste, /laatste meting \d{1,2} [a-z]+ \d{4}\./);
  assert.match(eerste, /CC BY 4\.0 met naamsvermelding theseo\.nl/);
  assert.match(eerste, /https:\/\/[a-z0-9.-]+\/ai-index\/open-data\/$/);

  for (const regel of laatsteRegels) {
    assert.equal(regel, eerste, 'alle tools horen exact dezelfde bronregel te geven');
  }
});

test('geen enkele uitvoer suggereert verkeer, trend of ChatGPT als product', async () => {
  const uitvoer = await Promise.all([
    roep('ai_index_branche', { branche: 'marketing' }),
    roep('ai_index_vragen', { branche: 'marketing' }),
    roep('ai_index_bedrijf', { bedrijfsnaam: 'Dept' }),
  ]);

  for (const tekst of uitvoer) {
    // Deze woorden mogen alleen voorkomen in de zin die ze juist ontkent,
    // dus we controleren dat er nergens een bewering zonder die ontkenning staat.
    assert.doesNotMatch(tekst, /stijgt|daalt|groeit|neemt toe|neemt af|trend van/i);
    assert.doesNotMatch(tekst, /meer bezoekers|meer verkeer|meer omzet/i);
    assert.match(tekst, /zegt (deze data )?niets|niet ChatGPT/i);
  }
});

test('de tool-beschrijvingen dragen de grenzen mee naar de client', async () => {
  const { tools } = await client.listTools();
  const aiTools = tools.filter((t) => t.name.startsWith('ai_index_'));
  assert.equal(aiTools.length, 3);

  for (const tool of aiTools) {
    const d = tool.description ?? '';
    assert.ok(d.length > 400, `${tool.name}: beschrijving te kort om de grenzen te dragen`);
    assert.match(d, /temperature 1/, `${tool.name}: mist de uitleg over samplingruis`);
    assert.match(d, /gpt-5-mini/, `${tool.name}: mist het model`);
    assert.match(d, /ChatGPT/, `${tool.name}: mist de grens rond ChatGPT als product`);
    assert.match(d, /bezoekers|zoekvolume|verkeer/, `${tool.name}: mist de grens rond verkeer`);
    assert.equal(tool.annotations?.readOnlyHint, true, `${tool.name}: readOnlyHint staat niet aan`);
  }
});
