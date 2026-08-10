import { McpServer } from '@modelcontextprotocol/server';
import { registreerBedrijfsbrein } from './tools/bedrijfsbrein';
import { registreerSeoScan } from './tools/seo-scan';
import { registreerSkillZoeken } from './tools/skill-zoeken';
import { registreerVindbaarheid } from './tools/vindbaarheid';

export const SERVER_NAAM = 'theseo-mcp';
export const SERVER_VERSIE = '0.1.0';

/**
 * Bouwt een verse McpServer met de vier TheSEO-tools. De handler roept deze
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

  return server;
}
