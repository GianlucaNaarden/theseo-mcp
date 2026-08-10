/**
 * Vaste adressen van de TheSEO endpoints die deze MCP-server aanroept.
 * Dit zijn publieke URL's, geen secrets. De scan- en vindbaarheidslogica
 * leeft op de site-Worker; deze server is bewust alleen een doorgeefluik.
 */
export const UPSTREAM_BASIS = 'https://theseo-site.sales-cc8.workers.dev';
export const SITE = 'https://theseo.nl';

/** Hoe lang we maximaal op een upstream-antwoord wachten (ms). */
export const UPSTREAM_TIMEOUT_MS = 30_000;

/**
 * Roept een TheSEO API-endpoint aan en geeft het JSON-antwoord terug,
 * of een eerlijk Nederlands foutbericht als het niet lukt.
 */
export async function roepUpstreamAan(
  pad: string,
  body: Record<string, unknown>,
): Promise<{ data?: Record<string, unknown>; fout?: string }> {
  let res: Response;
  try {
    res = await fetch(`${UPSTREAM_BASIS}${pad}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch {
    return { fout: 'De TheSEO server reageerde niet op tijd. Probeer het zo nog eens.' };
  }

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    return { fout: `De TheSEO server gaf een onleesbaar antwoord (status ${res.status}).` };
  }

  if (typeof data !== 'object' || data === null) {
    return { fout: `De TheSEO server gaf een onverwacht antwoord (status ${res.status}).` };
  }

  const record = data as Record<string, unknown>;
  if (!res.ok || typeof record.error === 'string') {
    // Het upstream-foutbericht is al in het Nederlands en eerlijk (bijvoorbeeld
    // "De lokale check is nog niet geconfigureerd op de server."). Doorgeven.
    const bericht = typeof record.error === 'string'
      ? record.error
      : `De TheSEO server gaf status ${res.status}.`;
    return { fout: bericht };
  }

  return { data: record };
}
