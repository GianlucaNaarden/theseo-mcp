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
import { index, normaliseer, zoekBedrijf, zoekBranche } from '../src/tools/ai-index-gedeeld';

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

/* -- De gegenereerde index --------------------------------------------- */

test('de index klopt met het meta-blok van de open data', () => {
  assert.equal(index.meta.model, 'gpt-5-mini');
  assert.equal(index.meta.temperature, 1);
  assert.equal(index.meta.aantalBranches, 9);
  assert.equal(index.meta.aantalVragen, 360);
  assert.equal(index.meta.aantalMetingen, 2520);
  assert.equal(index.meta.aantalOngeldig, 19);
  assert.equal(index.meta.aantalGeldig + index.meta.aantalOngeldig, index.meta.aantalMetingen);
  assert.equal(index.branches.length, 9);
  assert.equal(index.bedrijven.length, index.meta.uniekeBedrijfsnamen);
});

test('elke branche telt intern kloppend', () => {
  let vragen = 0;
  let geldig = 0;
  let weigeringen = 0;

  for (const b of index.branches) {
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

  assert.equal(vragen, index.meta.aantalVragen);
  assert.equal(geldig, index.meta.aantalGeldig);
  assert.equal(weigeringen, index.meta.aantalOngeldig);
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
  assert.equal(alle.length, 19);
  for (const [vraagNr, meetmoment, tekst] of alle) {
    assert.ok(vraagNr >= 1 && vraagNr <= 40);
    assert.ok(meetmoment <= 0 && meetmoment >= -6);
    assert.ok(tekst.length > 20, `weigering bij vraag ${vraagNr} heeft geen leesbare reden`);
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

  // De open-datapagina publiceert 92 voor Capgemini en 71 voor Capgemini
  // Nederland in IT & Cloud Diensten. Blijven die twee getallen staan, dan
  // heeft de normalisatie de entiteiten niet samengevoegd.
  const it = index.branches.findIndex((b) => b.naam === 'IT & Cloud Diensten');
  const vind = (rij: typeof treffers[0]['rij']) =>
    rij[3].find(([brancheIndex]) => brancheIndex === it)?.[1];
  assert.equal(vind(treffers[0].rij), 92);
  assert.equal(vind(apart.rij), 71);
});

test('een naam die er niet in staat levert niets op', () => {
  const { treffers, verwant } = zoekBedrijf('Zwiebelfisch Kwatschbedrijf');
  assert.equal(treffers.length, 0);
  assert.equal(verwant.length, 0);
});

/* -- De tools via de echte handler -------------------------------------- */

test('ai_index_branche geeft tellingen, top tien en concentratie', async () => {
  const tekst = await roep('ai_index_branche', { branche: 'detailhandel' });
  assert.match(tekst, /Detailhandel & Elektronica/);
  assert.match(tekst, /280 van de 280 geldig/);
  assert.match(tekst, /Coolblue\s+248 vermeldingen/);
  assert.match(tekst, /Concentratie: 1\.235 van de 2\.800 vermeldingen \(44,1%\)/);
  assert.match(tekst, /Weigeringen: geen/);
});

test('ai_index_branche geeft de weigeringen met de letterlijke reden', async () => {
  const tekst = await roep('ai_index_branche', { branche: 'zorg' });
  assert.match(tekst, /Zorg & Welzijn/);
  assert.match(tekst, /Weigeringen: 12/);
  assert.match(tekst, /De 12 weigeringen, met de letterlijke reden van het model:/);
  assert.match(tekst, /Het spijt me|Sorry/);
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
  // 287 over alle branches samen, waarvan 248 in de branche waar de
  // open-datapagina Coolblue op plek 1 zet.
  assert.match(tekst, /Coolblue: 287 vermeldingen over alle geldige metingen/);
  assert.match(tekst, /Detailhandel & Elektronica: 248 vermeldingen in 38 van de 40 vragen/);
  assert.match(tekst, /vraag \d+, \d van de 7 meetmomenten: "/);
});

test('ai_index_bedrijf zegt uitdrukkelijk dat afwezigheid geen oordeel is', async () => {
  const tekst = await roep('ai_index_bedrijf', { bedrijfsnaam: 'Zwiebelfisch Kwatschbedrijf' });
  assert.match(tekst, /komt niet voor in de 2\.501 geldige metingen/);
  assert.match(tekst, /uitdrukkelijk geen oordeel over dit bedrijf/);
  assert.match(tekst, /steekproef met een vast vragenlijstje/);
});

test('ai_index_bedrijf voegt Capgemini en Capgemini Nederland niet samen', async () => {
  const tekst = await roep('ai_index_bedrijf', { bedrijfsnaam: 'Capgemini' });
  assert.match(tekst, /Capgemini: 100 vermeldingen over alle geldige metingen/);
  assert.match(tekst, /IT & Cloud Diensten: 92 vermeldingen/);
  assert.match(tekst, /Capgemini Nederland: 75 vermeldingen/);
  assert.match(tekst, /tellen apart/);
  // 175 zou de opgetelde variant zijn; die mag nergens staan.
  assert.doesNotMatch(tekst, /175 vermeldingen/);
});

/* -- De bronregel ------------------------------------------------------- */

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
  assert.match(eerste, /Model gpt-5-mini \(temperature 1\)/);
  assert.match(eerste, /2\.520 metingen waarvan 2\.501 geldig/);
  assert.match(eerste, /laatste meting 29 juli 2026/);
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
