import { McpServer } from '@modelcontextprotocol/server';
import { registreerAiIndexBedrijf } from './tools/ai-index-bedrijf';
import { registreerAiIndexBranche } from './tools/ai-index-branche';
import { registreerAiIndexVragen } from './tools/ai-index-vragen';
import { registreerBedrijfsbrein } from './tools/bedrijfsbrein';
import { registreerSeoScan } from './tools/seo-scan';
import { registreerSkillZoeken } from './tools/skill-zoeken';
import { registreerVindbaarheid } from './tools/vindbaarheid';

export const SERVER_NAAM = 'theseo-mcp';
export const SERVER_VERSIE = '0.1.0';

/**
 * Bouwt een verse McpServer met de zeven TheSEO-tools. De handler roept deze
 * factory per request aan (stateless), dus hier mag geen gedeelde staat in.
 */
export function createServer(): McpServer {
  const server = new McpServer({
    name: SERVER_NAAM,
    title: 'TheSEO marketing-tools',
    version: SERVER_VERSIE,
  });

  registreerSeoScan(server);
  registreerVindbaarheid(server);
  registreerSkillZoeken(server);
  registreerBedrijfsbrein(server);
  registreerAiIndexBranche(server);
  registreerAiIndexVragen(server);
  registreerAiIndexBedrijf(server);

  return server;
}
