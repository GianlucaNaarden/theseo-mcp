import { createMcpHandler } from 'agents/mcp/server';
import { SITE, siteUit } from './config';
import { datasetUit, maakGebruiksteller } from './gebruiksteller';
import { createServer, GRATIS_TOOLS, SERVER_NAAM, SERVER_VERSIE } from './server';

/**
 * Remote MCP-server van TheSEO als stateless Cloudflare Worker.
 * Het MCP-endpoint is /mcp (Streamable HTTP). /.well-known/* geeft 404: deze
 * server heeft geen OAuth, en een client die daar metadata zoekt moet een
 * eerlijke 404 krijgen in plaats van de uitleg hieronder (kaart-theseo-mcp 56).
 * De rest van de paden geeft een korte uitleg, zodat een browserbezoeker niet
 * tegen een kale 404 aankijkt.
 */
type McpHandler = ReturnType<typeof createMcpHandler>;

/**
 * Een handler per Worker-omgeving. De bindingen gaan als deps mee in de
 * factory; er staat geen binding in een globale variabele. Is env per
 * verzoek een ander object, dan komt er gewoon een nieuwe handler.
 */
const handlers = new WeakMap<object, McpHandler>();
const LEGE_ENV = Object.freeze({});

function handlerVoor(env: unknown): McpHandler {
  const sleutel = typeof env === 'object' && env !== null ? env : LEGE_ENV;
  const bestaand = handlers.get(sleutel);
  if (bestaand) return bestaand;

  const site = siteUit(env);
  const teller = maakGebruiksteller(datasetUit(env));
  const nieuw = createMcpHandler(() => createServer({ site, teller }));
  handlers.set(sleutel, nieuw);
  return nieuw;
}

function isWellKnown(pad: string): boolean {
  return pad === '/.well-known' || pad.startsWith('/.well-known/');
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/mcp') {
      return handlerVoor(env)(request, env, ctx);
    }

    if (isWellKnown(url.pathname)) {
      return Response.json({ fout: 'Niet gevonden.' }, { status: 404 });
    }

    const tellerActief = datasetUit(env) !== undefined;
    return Response.json({
      naam: SERVER_NAAM,
      versie: SERVER_VERSIE,
      wat: 'Open-source remote MCP-server van TheSEO met zeven gratis marketing-tools.',
      endpoint: '/mcp',
      tools: [...GRATIS_TOOLS],
      gebruiksteller: {
        status: tellerActief ? 'actief' : 'niet_geconfigureerd',
        releaseklaar: tellerActief,
      },
      site: SITE,
    });
  },
} satisfies ExportedHandler<Env>;
