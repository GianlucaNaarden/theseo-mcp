/**
 * De publieke ingang van het pakket theseo-mcp (package.json "exports").
 * Hier staat alleen wat een andere Worker nodig heeft om de zeven gratis tools
 * in zijn eigen McpServer te zetten. Geen Worker-ingang, geen agents, geen
 * premium inhoud.
 *
 *   import { registreerGratisTools } from 'theseo-mcp';
 *   registreerGratisTools(server, { site: env.SITE_WORKER, teller, premiumSkills });
 */
export {
  createServer,
  GRATIS_TOOLS,
  registreerGratisTools,
  SERVER_NAAM,
  SERVER_VERSIE,
  type GratisDeps,
} from './server';
export { KANAAL_KOP, KANAAL_MCP, type SiteFetcher } from './config';
export {
  maakGebruiksteller,
  type Gebruiksteller,
  type SchrijfbareDataset,
  type ToolNaam,
} from './gebruiksteller';
export { valideerPremiumSkills, type PremiumSkillNaam } from './premium-namen';
// De ingebakken AI-Index en de zoekfuncties erop, alleen lezen: het platform rekent er
// eigen tools op (zoals de gat-analyse) zonder de telling opnieuw te bouwen.
export {
  brancheNamen,
  datum,
  getal,
  index as aiIndex,
  normaliseer,
  telwoord,
  zoekBedrijf,
  zoekBranche,
  type AiIndex,
  type BedrijfRij,
  type Branche,
  type BedrijfUitkomst,
  type BrancheUitkomst,
} from './tools/ai-index-gedeeld';
