import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import type { Gebruiksteller } from '../gebruiksteller';
import {
  getal,
  index,
  kort,
  metBron,
  telwoord,
  zoekBedrijf,
  type BedrijfRij,
} from './ai-index-gedeeld';

/** Hoeveel vragen we per branche uitschrijven. Een veelgenoemde naam zit in
 *  tientallen vragen; die allemaal tonen maakt het antwoord onleesbaar zonder
 *  dat het iets toevoegt aan het beeld. */
const MAX_VRAGEN_PER_BRANCHE = 5;

/**
 * De uitleg die hoort bij een naam die niet in de data staat.
 *
 * Waarom dit er letterlijk in staat: "komt niet voor" leest als een diskwalificatie,
 * en dat is het niet. De AI-Index bevraagt 360 vaste vragen in negen branches;
 * verreweg de meeste Nederlandse bedrijven komen daar per definitie niet in voor.
 */
const GEEN_OORDEEL = [
  'Dit is uitdrukkelijk geen oordeel over dit bedrijf.',
  '',
  `De AI-Index is een steekproef met een vast vragenlijstje: ${getal(index.meta.aantalVragen)} vragen `
  + `in ${index.meta.aantalBranches} branches, elk om tien namen. Dat leverde in totaal `
  + `${getal(index.meta.uniekeBedrijfsnamen)} verschillende bedrijfsnamen op, en dat is een fractie `
  + 'van het Nederlandse bedrijfsleven. Niet voorkomen is dus de normale uitkomst. Het kan net zo '
  + 'goed betekenen dat de branche van dit bedrijf niet gemeten wordt, dat geen van de vragen bij '
  + 'het aanbod past, of dat het model de naam net niet noemde in de metingen die er zijn.',
];

function vraagTekst(brancheIndex: number, vraagNr: number): string {
  const paar = index.branches[brancheIndex]?.vragen.find(([nr]) => nr === vraagNr);
  return paar ? paar[1] : '(vraag onbekend)';
}

function rijNaarRegels(rij: BedrijfRij): string[] {
  const [naam, totaal, actueel, vindplaatsen] = rij;
  const regels = [
    `${naam}: ${telwoord(totaal, 'vermelding', 'vermeldingen')} over alle geldige metingen, `
    + `waarvan ${actueel} in de actuele antwoorden.`,
  ];

  for (const [brancheIndex, aantal, brancheActueel, vragen] of vindplaatsen) {
    const branche = index.branches[brancheIndex];
    regels.push(
      `  ${branche.naam}: ${telwoord(aantal, 'vermelding', 'vermeldingen')} in `
      + `${vragen.length} van de ${branche.vragen.length} vragen, `
      + `nu in ${brancheActueel} van die vragen.`,
    );
    for (const [vraagNr, keer] of vragen.slice(0, MAX_VRAGEN_PER_BRANCHE)) {
      regels.push(
        `    vraag ${vraagNr}, ${keer} van de ${index.meta.meetmomentenPerVraag} meetmomenten: `
        + `"${kort(vraagTekst(brancheIndex, vraagNr), 160)}"`,
      );
    }
    const rest = vragen.length - MAX_VRAGEN_PER_BRANCHE;
    if (rest > 0) {
      regels.push(`    en nog ${telwoord(rest, 'vraag', 'vragen')} in deze branche`);
    }
  }

  return regels;
}

export function registreerAiIndexBedrijf(server: McpServer, telGebruik: Gebruiksteller): void {
  server.registerTool(
    'ai_index_bedrijf',
    {
      title: 'AI-Index: komt een bedrijfsnaam voor in de metingen',
      description:
        'Zoekt of een bedrijfsnaam voorkomt in de metingen van de Nationale AI-Index van theseo.nl. '
        + 'Zo ja: in welke branches, hoe vaak, en bij welke vragen. Zo nee: dat de naam er niet in '
        + 'staat, met de uitleg dat dat geen oordeel is. Schrijfwijzen vallen samen door te '
        + 'vergelijken zonder hoofdletters, accenten, spaties, koppeltekens en punten; verschillende '
        + 'entiteiten worden nooit samengevoegd, dus Capgemini en Capgemini Nederland blijven twee '
        + 'aparte tellingen precies zoals het model ze noemde. '
        + 'Niet voorkomen is geen oordeel: het is een steekproef met een vaste vragenlijst waarin de '
        + 'meeste bedrijven niet voorkomen. Wel voorkomen zegt niets over bezoekers, klikken of omzet. '
        + 'Gemeten met gpt-5-mini via de API zonder webtoegang, niet in ChatGPT als product, met '
        + 'temperature 1, dus zonder trend over de tijd. De namen zijn modeloutput die niet bij de KvK '
        + 'is nagelopen; het model kan namen verhaspelen.',
      inputSchema: z.object({
        bedrijfsnaam: z
          .string()
          .min(2)
          .max(120)
          .describe('De bedrijfsnaam die je wilt opzoeken, bijvoorbeeld "Coolblue" of "bol.com"'),
      }),
      // title ook in annotations: de Claude-directory leest hem daar (portaal 28-10-2026).
      annotations: { title: 'AI-Index: komt een bedrijfsnaam voor in de metingen', readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ bedrijfsnaam }) => {
      telGebruik('ai_index_bedrijf');
      const { treffers, verwant } = zoekBedrijf(bedrijfsnaam);

      if (treffers.length === 0 && verwant.length === 0) {
        return {
          content: [{
            type: 'text',
            text: metBron([
              `"${bedrijfsnaam}" komt niet voor in de ${getal(index.meta.aantalGeldig)} geldige `
              + 'metingen van de AI-Index.',
              '',
              ...GEEN_OORDEEL,
            ]),
          }],
        };
      }

      const regels: string[] = [];

      if (treffers.length === 0) {
        regels.push(
          `"${bedrijfsnaam}" komt niet als losse naam voor in de metingen.`,
          '',
        );
      } else {
        regels.push(
          `"${bedrijfsnaam}" komt voor in de AI-Index.`,
          '',
        );
        if (treffers.length > 1) {
          regels.push(
            `Let op: er staan ${treffers.length} schrijfwijzen in de brondata die op dezelfde naam `
            + 'uitkomen. Ze worden hieronder apart geteld, want wij voegen tellingen niet samen.',
            '',
          );
        }
        for (const t of treffers) {
          regels.push(...rijNaarRegels(t.rij), '');
        }
      }

      if (verwant.length > 0) {
        regels.push(
          `${treffers.length === 0 ? 'Deze' : 'Andere'} namen in de data bevatten je zoekterm wel. `
          + 'Ze tellen apart, want het model noemde ze apart en samenvoegen zou een interpretatie '
          + 'over de data heen leggen die er niet in zit:',
        );
        for (const v of verwant) {
          const [naam, totaal, actueel, vindplaatsen] = v.rij;
          regels.push(
            `  - ${naam}: ${telwoord(totaal, 'vermelding', 'vermeldingen')}, `
            + `waarvan ${actueel} actueel, in `
            + `${telwoord(vindplaatsen.length, 'branche', 'branches')}`,
          );
        }
        regels.push('');
      }

      regels.push(
        'Let op: een vermelding is een telling van wat het model uit zichzelf noemde, geen '
        + 'kwaliteitsoordeel en geen bezoekersaantal. Over verkeer, klikken of omzet zegt deze data '
        + 'niets. Verschillen tussen meetmomenten zijn met temperature 1 deels toeval, dus lees er '
        + 'geen trend in. De namen zijn modeloutput en niet nagelopen bij de KvK.',
      );

      return { content: [{ type: 'text', text: metBron(regels) }] };
    },
  );
}
