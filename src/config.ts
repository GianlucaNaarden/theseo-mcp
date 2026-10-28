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
 * Tot 22 september 2026 draaide theseo.nl nog de oude WordPress-site en gaf
 * elke https://theseo.nl/assets/skills/... link een 404. Daarom wezen de
 * links naar het Worker-adres.
 *
 * Sinds 22-09-2026 ongeveer 22:00 wijst theseo.nl via een route naar de
 * site-Worker. Gemeten op die avond: https://theseo.nl/ geeft de nieuwe
 * startpagina, alle 474 Nederlandse paginas geven 200 en de skill-downloads
 * staan er. Daarmee is de voorwaarde uit de regel hierboven vervuld en gaat
 * dit terug naar SITE, zodat elke AI die onze skills ophaalt het echte adres
 * krijgt in plaats van een testadres.
 */
export const PUBLIEKE_BASIS = SITE;

/** Zet theseo.nl-adressen om naar het adres dat vandaag werkt. */
export function publiekAdres(url: string): string {
  return typeof url === 'string' ? url.replace('https://theseo.nl', PUBLIEKE_BASIS) : url;
}

/** Hoe lang we maximaal op een upstream-antwoord wachten (ms). */
export const UPSTREAM_TIMEOUT_MS = 30_000;

/** De kop waarmee de site een aanroep via MCP herkent (BOUWPLAN MC1, ST2). */
export const KANAAL_KOP = 'X-TheSEO-Kanaal';
export const KANAAL_MCP = 'mcp';

/**
 * Alles met een fetch-methode: in productie de service-binding naar de
 * site-Worker (Fetcher), in tests een nepversie.
 *
 * Waarom de binding nodig is: een gewone fetch van deze Worker naar de
 * workers.dev URL van de site-Worker blijft binnen hetzelfde account hangen en
 * belandt bij de statische bestanden in plaats van bij het script. `/api/scan`
 * bestaat daar niet als bestand, dus kwam er een 404 met een HTML-pagina terug
 * en meldde elke scan "onleesbaar antwoord" (Cloudflare-fout 1042, commit
 * 6e855b0). Een service-binding is de ondersteunde route van Worker naar
 * Worker en gaat rechtstreeks naar het script.
 *
 * De binding gaat als parameter mee (deps), nooit via een globale variabele,
 * zodat het platform en deze Worker elk hun eigen binding meegeven.
 */
export interface SiteFetcher {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

export type UpstreamAntwoord = { data?: Record<string, unknown>; fout?: string };
export type Upstream = (pad: string, body: Record<string, unknown>) => Promise<UpstreamAntwoord>;

/** Pakt de site-binding uit een Worker-omgeving, of niets als die ontbreekt. */
export function siteUit(env: unknown): SiteFetcher | undefined {
  const kandidaat = (env as { SITE_WORKER?: SiteFetcher } | null | undefined)?.SITE_WORKER;
  return kandidaat && typeof kandidaat.fetch === 'function' ? kandidaat : undefined;
}

/**
 * Maakt de functie waarmee een tool een TheSEO API-endpoint aanroept. Zonder
 * binding valt hij terug op gewone fetch (handig lokaal, niet in productie).
 * Elk verzoek draagt de kanaalkop; de body is alleen de toolinvoer.
 */
export function maakUpstream(site?: SiteFetcher): Upstream {
  return async (pad, body) => {
    const verzoek: RequestInit = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', [KANAAL_KOP]: KANAAL_MCP },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    };
    let res: Response;
    try {
      res = site
        ? await site.fetch(`${UPSTREAM_BASIS}${pad}`, verzoek)
        : await fetch(`${UPSTREAM_BASIS}${pad}`, verzoek);
    } catch {
      return { fout: 'De TheSEO server reageerde niet op tijd. Probeer het zo nog eens.' };
    }
    return leesAntwoord(res);
  };
}

/** Zet een upstream-antwoord om naar data of een eerlijk Nederlands foutbericht. */
async function leesAntwoord(res: Response): Promise<UpstreamAntwoord> {
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
