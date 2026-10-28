import { McpServer, type McpRequestContext } from '@modelcontextprotocol/server';
import { maakUpstream, type SiteFetcher } from './config';
import { TOOL_NAMEN, type Gebruiksteller } from './gebruiksteller';
import { valideerPremiumSkills, type PremiumSkillNaam } from './premium-namen';
import { registreerAiIndexBedrijf } from './tools/ai-index-bedrijf';
import { registreerAiIndexBranche } from './tools/ai-index-branche';
import { registreerAiIndexVragen } from './tools/ai-index-vragen';
import { registreerBedrijfsbrein } from './tools/bedrijfsbrein';
import { registreerSeoScan } from './tools/seo-scan';
import { registreerSkillZoeken } from './tools/skill-zoeken';
import { registreerVindbaarheid } from './tools/vindbaarheid';

export const SERVER_NAAM = 'theseo-mcp';
export const SERVER_VERSIE = '0.5.0';

/** De zeven gratis tools, in vaste volgorde. */
export const GRATIS_TOOLS = TOOL_NAMEN;

/**
 * Wat de gratis tools van buiten nodig hebben. Alles gaat als parameter mee;
 * er is geen globale binding, zodat deze Worker en het platform elk hun eigen
 * site-binding, teller en premiumlijst gebruiken.
 */
export interface GratisDeps {
  /** Service-binding naar de site-Worker. Zonder binding valt het terug op fetch. */
  site?: SiteFetcher;
  /** Privacyarme teller per tool. Zonder teller wordt er niets geteld. */
  teller?: Gebruiksteller;
  /**
   * Premium skills die skill_zoeken met naam en een zin mag tonen. Alleen
   * zetten voor een ingelogde abonnee; anoniem leeg laten.
   */
  premiumSkills?: readonly PremiumSkillNaam[];
}

const TEL_NIET: Gebruiksteller = () => {};
const DEPS_SLEUTELS = new Set(['site', 'teller', 'premiumSkills']);

function controleerDeps(deps: unknown): GratisDeps {
  if (typeof deps !== 'object' || deps === null || Array.isArray(deps)) {
    throw new TypeError('registreerGratisTools verwacht een deps-object.');
  }
  const onbekend = Object.keys(deps).filter((sleutel) => !DEPS_SLEUTELS.has(sleutel));
  if (onbekend.length > 0) {
    throw new TypeError(`Onbekende deps voor registreerGratisTools: ${onbekend.join(', ')}.`);
  }
  const { site, teller } = deps as GratisDeps;
  if (teller !== undefined && typeof teller !== 'function') {
    throw new TypeError('deps.teller moet een functie zijn.');
  }
  if (site !== undefined && typeof (site as { fetch?: unknown } | null)?.fetch !== 'function') {
    throw new TypeError('deps.site moet een fetch-methode hebben (de service-binding naar de site).');
  }
  return deps as GratisDeps;
}

/**
 * Registreert de zeven gratis tools op een bestaande McpServer. Dit is de
 * export waarmee theseo-platform dezelfde tools in zijn eigen server zet,
 * naast de premium tools (ontwerp-techniek 3.2).
 */
export function registreerGratisTools(server: McpServer, deps: GratisDeps = {}): void {
  const { site, teller } = controleerDeps(deps);
  const premium = valideerPremiumSkills(deps.premiumSkills);
  const tel = teller ?? TEL_NIET;
  const upstream = maakUpstream(site);

  registreerSeoScan(server, tel, upstream);
  registreerVindbaarheid(server, tel, upstream);
  registreerSkillZoeken(server, tel, premium);
  registreerBedrijfsbrein(server, tel);
  registreerAiIndexBranche(server, tel);
  registreerAiIndexVragen(server, tel);
  registreerAiIndexBedrijf(server, tel);
}

function isRequestContext(waarde: object): boolean {
  return 'era' in waarde || 'requestInfo' in waarde || 'authInfo' in waarde;
}

/**
 * Bouwt een verse McpServer met de zeven TheSEO-tools. De handler roept deze
 * factory per request aan (stateless), dus hier mag geen gedeelde staat in.
 *
 * Accepteert drie vormen, zodat bestaande aanroepen blijven werken: niets of
 * een McpRequestContext (de SDK geeft die rechtstreeks mee; die wordt nooit
 * als invoer behandeld), alleen een teller, of een volledig deps-object.
 */
export function createServer(
  invoer?: McpRequestContext | Gebruiksteller | GratisDeps,
): McpServer {
  let deps: GratisDeps = {};
  if (typeof invoer === 'function') deps = { teller: invoer };
  else if (invoer && !isRequestContext(invoer)) deps = invoer as GratisDeps;

  const server = new McpServer({
    name: SERVER_NAAM,
    title: 'TheSEO marketing-tools',
    version: SERVER_VERSIE,
  });
  registreerGratisTools(server, deps);
  return server;
}
