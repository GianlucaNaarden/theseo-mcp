import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import {
  brancheNamen,
  getal,
  index,
  kort,
  metBron,
  percentage,
  zoekBranche,
  type Branche,
} from './ai-index-gedeeld';

/** Hoeveel tekens van een weigertekst we tonen. De letterlijke reden is het
 *  punt van dit veld, dus ruim, maar niet zo ruim dat twaalf weigeringen het
 *  hele antwoord opslokken. */
const MAX_WEIGERTEKST = 220;

function tellingen(b: Branche): string[] {
  const ongeldig = b.weigeringen.length;
  const regels = [
    `Metingen: ${getal(b.geldig)} van de ${getal(b.metingen)} geldig `
    + `(${b.vragen.length} vragen maal ${index.meta.meetmomentenPerVraag} meetmomenten).`,
  ];
  if (ongeldig > 0) {
    regels.push(
      `Weigeringen: ${ongeldig}, niet meegeteld in de tellingen hieronder.`,
    );
  } else {
    regels.push('Weigeringen: geen, alle metingen leverden een lijst op.');
  }
  regels.push(
    `Vermeldingen: ${getal(b.vermeldingen)} bedrijfsnamen genoemd, `
    + `verdeeld over ${getal(b.uniekeBedrijven)} verschillende namen.`,
  );
  return regels;
}

function topLijst(b: Branche): string[] {
  const breedte = Math.max(...b.top.map(([naam]) => naam.length));
  return b.top.map(([naam, totaal, actueel], i) => {
    const nummer = String(i + 1).padStart(2, ' ');
    const telling = String(totaal).padStart(4, ' ');
    const woord = (totaal === 1 ? 'vermelding,' : 'vermeldingen,').padEnd(14);
    return `  ${nummer}. ${naam.padEnd(breedte)} ${telling} ${woord}`
      + `nu in ${actueel} van de ${b.vragen.length} vragen`;
  });
}

/**
 * Het aandeel van de top tien in alle vermeldingen.
 *
 * Bewust maar een percentage in deze regel: twee los afgeronde percentages
 * tellen op tot 100,1 en dat leest als een rekenfout. Het restaantal staat er
 * als absoluut getal naast, dat is even informatief en klopt altijd.
 */
function concentratie(b: Branche): string[] {
  const rest = b.vermeldingen - b.topTotaal;
  const overigeNamen = b.uniekeBedrijven - b.top.length;
  return [
    `Concentratie: ${getal(b.topTotaal)} van de ${getal(b.vermeldingen)} vermeldingen `
    + `(${percentage(b.topTotaal, b.vermeldingen)}) gaan naar deze tien namen. `
    + `De overige ${getal(rest)} vermeldingen zijn verdeeld over `
    + `${getal(overigeNamen)} andere namen.`,
  ];
}

function weigeringen(b: Branche): string[] {
  const aantal = b.weigeringen.length;
  if (aantal === 0) return [];
  const kop = aantal === 1 ? 'De weigering' : `De ${aantal} weigeringen`;
  return [
    '',
    `${kop}, met de letterlijke reden van het model:`,
    ...b.weigeringen.map(([vraagNr, meetmoment, tekst]) =>
      `  - vraag ${vraagNr}, meetmoment ${meetmoment}: "${kort(tekst, MAX_WEIGERTEKST)}"`),
  ];
}

export function registreerAiIndexBranche(server: McpServer): void {
  server.registerTool(
    'ai_index_branche',
    {
      title: 'AI-Index: wie noemt het model in een branche',
      description:
        'Geeft voor een van de negen branches van de Nationale AI-Index van theseo.nl: het aantal '
        + 'geldige metingen, het aantal weigeringen met de letterlijke reden van het model, de tien '
        + 'meest genoemde bedrijven met hun aantal vermeldingen, en hoe geconcentreerd het beeld is '
        + '(welk aandeel van alle vermeldingen naar die tien gaat). '
        + 'Dit zijn tellingen van wat het model gpt-5-mini uit zichzelf noemt, niets meer. '
        + 'Grenzen die je bij het gebruik moet aanhouden: dit is niet ChatGPT met webzoeken maar '
        + 'gpt-5-mini via de API zonder webtoegang en zonder geheugen, dus doe geen uitspraken over '
        + 'ChatGPT als product; er is met temperature 1 gemeten, dus verschillen tussen meetmomenten '
        + 'zijn deels toeval en er zijn geen trends over de tijd uit af te leiden; de data zegt niets '
        + 'over bezoekers, klikken of omzet; de bedrijfsnamen zijn modeloutput en geen geverifieerd '
        + 'register, ze zijn niet nagelopen bij de KvK; en een hoge of lage plek is een telling, geen '
        + 'kwaliteitsoordeel over een bedrijf.',
      inputSchema: z.object({
        branche: z
          .string()
          .min(2)
          .max(60)
          .describe(
            'De branche, bijvoorbeeld "zorg", "logistiek" of "Detailhandel & Elektronica". '
            + 'Kleine letters en een deel van de naam zijn genoeg.',
          ),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ branche }) => {
      const uitkomst = zoekBranche(branche);

      if (uitkomst.soort === 'geen') {
        return {
          content: [{
            type: 'text',
            text: metBron([
              `Geen branche gevonden voor "${branche}". De AI-Index meet negen branches:`,
              ...brancheNamen().map((n) => `  - ${n}`),
            ]),
          }],
        };
      }

      if (uitkomst.soort === 'meerdere') {
        return {
          content: [{
            type: 'text',
            text: metBron([
              `"${branche}" past op meer dan een branche. Kies er een:`,
              ...uitkomst.kandidaten.map((k) => `  - ${k.branche.naam}`),
            ]),
          }],
        };
      }

      const b = uitkomst.treffer.branche;

      return {
        content: [{
          type: 'text',
          text: metBron([
            `AI-Index, branche ${b.naam}`,
            '',
            ...tellingen(b),
            '',
            'Meest genoemde bedrijven, geteld over alle geldige metingen. Achteraan staat het '
            + `actuele beeld: in hoeveel van de ${b.vragen.length} vragen de naam in het laatste `
            + 'antwoord staat.',
            ...topLijst(b),
            '',
            ...concentratie(b),
            ...weigeringen(b),
            '',
            'Let op: dit is een telling van modelkennis, geen kwaliteitsoordeel en geen ranglijst '
            + 'van de beste bedrijven. Verschillen tussen meetmomenten zijn met temperature 1 deels '
            + 'toeval, dus lees hier geen trend in. Over bezoekers, klikken of omzet zegt deze data '
            + 'niets, en de namen zijn modeloutput die wij niet bij de KvK hebben nagelopen.',
          ]),
        }],
      };
    },
  );
}
