/**
 * Gedeelde laag voor de drie AI-Index tools: de vorm van src/ai-index.json,
 * het opzoeken van een branche of een bedrijfsnaam, en de bronregel die onder
 * elk antwoord hoort.
 *
 * De data komt uit scripts/genereer-ai-index.mjs en is een verdichting van de
 * open dataset op theseo.nl. Er zit geen netwerk in deze tools: alles wat ze
 * teruggeven staat in het JSON-bestand en is na te rekenen in de CSV.
 */
import ruweIndex from '../ai-index.json';
import { publiekAdres } from '../config';

export type Vraag = [nr: number, tekst: string];
export type TopRij = [naam: string, totaal: number, actueel: number];
export type Weigering = [vraagNr: number, meetmoment: number, tekst: string];
export type VraagTelling = [vraagNr: number, aantal: number];
export type Vindplaats = [
  brancheIndex: number,
  aantal: number,
  actueel: number,
  vragen: VraagTelling[],
];
export type BedrijfRij = [
  naam: string,
  totaal: number,
  actueel: number,
  vindplaatsen: Vindplaats[],
];

export interface Branche {
  naam: string;
  /** Alle metingen van deze branche, geldig en ongeldig samen. */
  metingen: number;
  geldig: number;
  /** Som van alle bedrijfsvermeldingen in de geldige metingen. */
  vermeldingen: number;
  uniekeBedrijven: number;
  /** Som van de vermeldingen van de tien namen in `top`. */
  topTotaal: number;
  top: TopRij[];
  weigeringen: Weigering[];
  vragen: Vraag[];
}

export interface AiIndex {
  gegenereerd: string;
  bron: string;
  meta: {
    model: string;
    temperature: number;
    prompt: string;
    licentie: string;
    meetcyclus: string;
    laatsteMeting: string;
    aantalBranches: number;
    aantalVragen: number;
    aantalMetingen: number;
    aantalGeldig: number;
    aantalOngeldig: number;
    meetmomentenPerVraag: number;
    uniekeBedrijfsnamen: number;
  };
  branches: Branche[];
  bedrijven: BedrijfRij[];
}

// De JSON bestaat uit tuples; TypeScript leidt daar losse array-types uit af.
// Eén keer casten naar de vorm hierboven houdt de rest van de code leesbaar.
export const index = ruweIndex as unknown as AiIndex;

/**
 * De normalisatie die de open-datapagina beschrijft: vergelijken zonder
 * hoofdletters, accenten, spaties, koppeltekens en punten.
 *
 * Dit is nadrukkelijk een zoeksleutel en geen samenvoeging. Twee namen die op
 * dezelfde sleutel uitkomen blijven in de index twee regels met elk hun eigen
 * telling; wij tellen ze nooit bij elkaar op. Dat is dezelfde grens die de
 * bijsluiter trekt: schrijfwijzen mag je samenvoegen, entiteiten niet, want
 * Capgemini en Capgemini Nederland zijn door het model apart genoemd.
 */
export function normaliseer(tekst: string): string {
  return tekst
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

/**
 * De genormaliseerde sleutel per bedrijfsrij, één keer berekend.
 *
 * Waarom een cache: 3.807 namen normaliseren kost per aanroep meetbaar tijd,
 * en de uitkomst kan niet veranderen omdat de index een ingebakken bestand is.
 * Dit is afgeleide, alleen-lezen data en dus geen gedeelde staat tussen
 * verzoeken.
 */
let sleutelCache: string[] | undefined;

function sleutels(): string[] {
  if (!sleutelCache) sleutelCache = index.bedrijven.map((rij) => normaliseer(rij[0]));
  return sleutelCache;
}

/* -- Branche opzoeken --------------------------------------------------- */

export interface BrancheTreffer {
  branche: Branche;
  positie: number;
}

export type BrancheUitkomst =
  | { soort: 'gevonden'; treffer: BrancheTreffer }
  | { soort: 'meerdere'; kandidaten: BrancheTreffer[] }
  | { soort: 'geen' };

function woorden(naam: string): string[] {
  return naam.split(/\s+/).map(normaliseer).filter((w) => w.length > 0);
}

/**
 * Plakt de woorden van een branchenaam aan elkaar tot een sleutel, zonder het
 * losse woord "en".
 *
 * Waarom: de branchenamen gebruiken een ampersand, die bij het normaliseren
 * verdwijnt, maar mensen typen "zorg en welzijn". Zonder deze stap valt dat
 * naast "zorgwelzijn" en vindt de tool zijn eigen branche niet. Dit geldt
 * alleen voor branchenamen; bij bedrijfsnamen blijft "en" gewoon staan, want
 * daar kan het een deel van de naam zijn.
 */
function brancheSleutel(naam: string): string {
  return woorden(naam).filter((w) => w !== 'en').join('');
}

/**
 * Zoekt een branche op een soepel geschreven naam. De score maakt het verschil
 * tussen "it" dat op IT & Cloud Diensten hoort te vallen en "it" dat toevallig
 * ook in mobiliteit en digitale zit: een begin van de naam weegt zwaarder dan
 * een willekeurig stukje ergens middenin.
 */
export function zoekBranche(invoer: string): BrancheUitkomst {
  const zoek = brancheSleutel(invoer);
  if (zoek.length === 0) return { soort: 'geen' };

  const gescoord = index.branches.map((branche, positie) => {
    const sleutel = brancheSleutel(branche.naam);
    const delen = woorden(branche.naam);

    let score = 0;
    if (sleutel === zoek) score = 100;
    else if (sleutel.startsWith(zoek)) score = 60;
    else if (delen.some((w) => w === zoek)) score = 40;
    else if (delen.some((w) => w.startsWith(zoek))) score = 30;
    else if (sleutel.includes(zoek)) score = 10;

    return { branche, positie, score };
  });

  const beste = Math.max(...gescoord.map((g) => g.score));
  if (beste === 0) return { soort: 'geen' };

  const kandidaten = gescoord.filter((g) => g.score === beste);
  if (kandidaten.length === 1) return { soort: 'gevonden', treffer: kandidaten[0] };
  return { soort: 'meerdere', kandidaten };
}

/** De negen branchenamen, voor als een zoekopdracht niets oplevert. */
export function brancheNamen(): string[] {
  return index.branches.map((b) => b.naam);
}

/* -- Bedrijf opzoeken --------------------------------------------------- */

export interface BedrijfTreffer {
  rij: BedrijfRij;
  sleutel: string;
}

export interface BedrijfUitkomst {
  /** Rijen waarvan de genormaliseerde naam exact op de zoekterm uitkomt. */
  treffers: BedrijfTreffer[];
  /** Namen die de zoekterm bevatten maar er niet gelijk aan zijn. Die tellen
   *  apart, want het kunnen andere entiteiten zijn (Capgemini Nederland). */
  verwant: BedrijfTreffer[];
}

const MAX_VERWANT = 10;

export function zoekBedrijf(invoer: string): BedrijfUitkomst {
  const zoek = normaliseer(invoer);
  const alle = sleutels();
  const treffers: BedrijfTreffer[] = [];
  const verwant: BedrijfTreffer[] = [];
  if (zoek.length === 0) return { treffers, verwant };

  for (let i = 0; i < alle.length; i += 1) {
    const sleutel = alle[i];
    if (sleutel === zoek) treffers.push({ rij: index.bedrijven[i], sleutel });
    else if (sleutel.includes(zoek)) verwant.push({ rij: index.bedrijven[i], sleutel });
  }

  // De index staat al op aflopend totaal, dus de eerste tien verwante namen
  // zijn ook de meest genoemde.
  return { treffers, verwant: verwant.slice(0, MAX_VERWANT) };
}

/* -- Presentatie -------------------------------------------------------- */

const MAANDEN = [
  'januari', 'februari', 'maart', 'april', 'mei', 'juni',
  'juli', 'augustus', 'september', 'oktober', 'november', 'december',
];

/** Zet 2026-07-29 om naar 29 juli 2026. Bewust geen Intl: de uitkomst moet in
 *  elke omgeving hetzelfde zijn, ook in een Worker zonder locale-data. */
export function datum(isoDatum: string): string {
  const delen = isoDatum.split('-');
  const maand = MAANDEN[Number(delen[1]) - 1];
  if (delen.length !== 3 || !maand) return isoDatum;
  return `${Number(delen[2])} ${maand} ${delen[0]}`;
}

/** Duizendtallen met punten, zoals de open-datapagina ze schrijft. */
export function getal(waarde: number): string {
  return String(waarde).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/**
 * Getal met het juiste zelfstandig naamwoord erachter.
 *
 * De tellingen lopen van 1 tot in de honderden, dus zonder dit staat er
 * geregeld "1 vermeldingen" of "1 branche(s)". Dat leest als een half
 * afgemaakt sjabloon en ondermijnt het vertrouwen in de cijfers ernaast.
 */
export function telwoord(aantal: number, enkelvoud: string, meervoud: string): string {
  return `${getal(aantal)} ${aantal === 1 ? enkelvoud : meervoud}`;
}

/** Percentage op één decimaal, zonder afronding naar hele getallen die meer
 *  precisie suggereren dan er is. */
export function percentage(deel: number, geheel: number): string {
  if (geheel === 0) return '0%';
  return `${((deel / geheel) * 100).toFixed(1).replace('.', ',')}%`;
}

export function kort(tekst: string, maxLengte = 240): string {
  if (tekst.length <= maxLengte) return tekst;
  return `${tekst.slice(0, maxLengte).replace(/\s+\S*$/, '')}…`;
}

/**
 * De bronregel die onder elk antwoord van elke AI-Index tool komt.
 *
 * Waarom letterlijk overal hetzelfde: een AI-client knipt losse antwoorden uit
 * elkaar en plakt ze in andermans tekst. Dan moet elke losse brok zelf nog
 * vertellen welk model bevraagd is, hoeveel metingen eronder liggen, wanneer
 * er voor het laatst gemeten is en waar de bijsluiter staat.
 */
export function bronregel(): string {
  const m = index.meta;
  return [
    `Bron: Nationale AI-Index van TheSEO. Model ${m.model} (temperature ${m.temperature}), `
    + `${getal(m.aantalMetingen)} metingen waarvan ${getal(m.aantalGeldig)} geldig, `
    + `laatste meting ${datum(m.laatsteMeting)}. Licentie CC BY 4.0 met naamsvermelding theseo.nl. `
    + `Volledige bijsluiter met wat deze data wel en niet zegt: ${publiekAdres(index.bron)}`,
  ].join('');
}

/** Bouwt de tekstuitvoer van een tool: inhoud, witregel, bronregel. */
export function metBron(regels: string[]): string {
  return [...regels, '', bronregel()].join('\n');
}
