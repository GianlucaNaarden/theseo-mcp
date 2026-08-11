/**
 * Vaste adressen van de TheSEO endpoints die deze MCP-server aanroept.
 * Dit zijn publieke URL's, geen secrets. De scan- en vindbaarheidslogica
 * leeft op de site-Worker; deze server is bewust alleen een doorgeefluik.
 */
export const UPSTREAM_BASIS = 'https://theseo-site.sales-cc8.workers.dev';
export const SITE = 'https://theseo.nl';

/**
 * Het adres dat we in antwoorden aan gebruikers meegeven.
 *
 * Let op: theseo.nl draait op dit moment nog de oude WordPress-site. De
 * nieuwe paginas en alle skill-downloads staan op de Worker. Zolang de
 * overzetting niet gedaan is, geeft elke https://theseo.nl/assets/skills/...
 * link een 404, en dat is precies wat een gebruiker van skill_zoeken te zien
 * kreeg. Daarom wijzen de links voorlopig naar het Worker-adres.
 *
 * Bij de overzetting: zet dit terug op SITE en klaar. De catalogus zelf
 * bewaart de theseo.nl-adressen, dus er hoeft verder niets mee te gebeuren.
 */
export const PUBLIEKE_BASIS = UPSTREAM_BASIS;

/** Zet theseo.nl-adressen om naar het adres dat vandaag werkt. */
export function publiekAdres(url: string): string {
  return typeof url === 'string' ? url.replace('https://theseo.nl', PUBLIEKE_BASIS) : url;
}

/** Hoe lang we maximaal op een upstream-antwoord wachten (ms). */
export const UPSTREAM_TIMEOUT_MS = 30_000;

/**
 * De service-binding naar de site-Worker.
 *
 * Waarom dit nodig is: een gewone fetch van deze Worker naar de workers.dev
 * URL van de site-Worker blijft binnen hetzelfde account hangen en belandt bij
 * de statische bestanden in plaats van bij het script. `/api/scan` bestaat
 * daar niet als bestand, dus kwam er een 404 met een HTML-pagina terug en
 * meldde elke scan "onleesbaar antwoord". Van buitenaf werkte dezelfde
 * aanroep wel, wat het lang onzichtbaar hield. Een service-binding is de
 * ondersteunde route van Worker naar Worker en gaat rechtstreeks naar het
 * script.
 */
let siteBinding: { fetch: typeof fetch } | undefined;

/** Wordt bij elk verzoek gezet vanuit de Worker-entry. De binding is per
 *  deployment constant, dus dit is veilig bij gelijktijdige verzoeken. */
export function zetSiteBinding(env: unknown): void {
  const kandidaat = (env as { SITE_WORKER?: { fetch: typeof fetch } } | null)?.SITE_WORKER;
  if (kandidaat && typeof kandidaat.fetch === 'function') siteBinding = kandidaat;
}

/**
 * Roept een TheSEO API-endpoint aan en geeft het JSON-antwoord terug,
 * of een eerlijk Nederlands foutbericht als het niet lukt.
 */
export async function roepUpstreamAan(
  pad: string,
  body: Record<string, unknown>,
): Promise<{ data?: Record<string, unknown>; fout?: string }> {
  const verzoek: RequestInit = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  };
  let res: Response;
  try {
    res = siteBinding
      ? await siteBinding.fetch(`${UPSTREAM_BASIS}${pad}`, verzoek)
      : await fetch(`${UPSTREAM_BASIS}${pad}`, verzoek);
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
