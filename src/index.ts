import { createMcpHandler } from 'agents/mcp/server';
import { SITE } from './config';
import { createServer, SERVER_NAAM, SERVER_VERSIE } from './server';

/**
 * Remote MCP-server van TheSEO als stateless Cloudflare Worker.
 * Het MCP-endpoint is /mcp (Streamable HTTP); de rest van de paden geeft
 * een korte uitleg terug zodat een browserbezoeker niet tegen een kale 404
 * aankijkt.
 */
const handler = createMcpHandler(createServer);

export default {
  fetch(request: Request, env: unknown, ctx: ExecutionContext): Promise<Response> | Response {
    const url = new URL(request.url);

    if (url.pathname === '/mcp') {
      return handler(request, env, ctx);
    }

    return Response.json({
      naam: SERVER_NAAM,
      versie: SERVER_VERSIE,
      wat: 'Open-source remote MCP-server van TheSEO met vier gratis marketing-tools.',
      endpoint: '/mcp',
      tools: ['seo_scan', 'lokale_vindbaarheid_check', 'skill_zoeken', 'bedrijfsbrein_template'],
      site: SITE,
    });
  },
} satisfies ExportedHandler;
