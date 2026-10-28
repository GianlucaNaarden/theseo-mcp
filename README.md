# theseo-mcp

Open-source remote MCP-server van [TheSEO](https://theseo.nl), instituut voor zichtbaarheid. Voor zover wij hebben kunnen nagaan de eerste MCP-server van een Nederlands marketingbureau.

MCP (Model Context Protocol) is de open standaard waarmee AI-assistenten zoals Claude externe tools kunnen gebruiken. Voeg deze server één keer toe en je AI kan zelf een SEO-scan draaien, lokale vindbaarheid checken, gratis Claude-skills opzoeken, het bedrijfsbrein-sjabloon ophalen en onze eigen AI-Index bevragen. Alles wat deze server aanbiedt is gratis en vraagt geen account.

De server draait als Cloudflare Worker met Streamable HTTP transport.

**Endpoint:** `https://mcp.theseo.nl/mcp`

Op mcp.theseo.nl draaien deze tools samen met de tools van het TheSEO-platform: de AI-zichtbaarheid per model (`ai_zichtbaarheid_merk`), de gat-analyse per branche (`ai_index_gat`), de AI-crawlercheck (`ai_crawler_check`), Nederlandse vakregels met bron (`vakregels`) en, met een account, geheugen, taken en premium skills. Uitleg en installatie: [mcp.theseo.nl](https://mcp.theseo.nl/). `seo_scan` en `lokale_vindbaarheid_check` staan daar voorlopig uit, omdat de siteflow erachter nog een lead bewaart; ze werken wel op de losse server `https://theseo-mcp.sales-cc8.workers.dev/mcp`.

## De zeven tools in deze repo

### 1. `seo_scan`

Scant een URL op 24 SEO-punten in vier categorieën: techniek, on-page, content en AI-gereedheid. Dit is dezelfde scanner als de [gratis SEO-scan](https://theseo.nl/gratis-seo-scan/) op theseo.nl.

Voorbeeld-aanroep:

> "Draai een SEO-scan op https://voorbeeld.nl en vat de grootste problemen samen."

```json
{ "url": "https://voorbeeld.nl" }
```

Je krijgt per categorie een score (0 tot 100) en per punt een eerlijke uitleg van wat er goed of mis is.

### 2. `lokale_vindbaarheid_check`

Controleert hoe vindbaar een bedrijf is in Google Maps: bestaat er een Google Bedrijfsprofiel, en zijn openingstijden, foto's, beoordeling, reviews, website en telefoonnummer op orde. Dezelfde check als de [lokale vindbaarheidschecker](https://theseo.nl/lokale-vindbaarheid-checker/).

Voorbeeld-aanroep:

> "Check de lokale vindbaarheid van Bakkerij Jansen in Utrecht."

```json
{ "bedrijfsnaam": "Bakkerij Jansen", "stad": "Utrecht" }
```

De score telt alleen mee wat werkelijk gemeten is. Wat niet meetbaar is komt terug als niet gemeten, nooit als onvoldoende.

### 3. `skill_zoeken`

Doorzoekt de volledige catalogus van gratis Nederlandstalige Claude-skills van theseo.nl op onderwerp. Per treffer krijg je de naam, de beschrijving, de uitlegpagina en de directe download-URL van de zip.

De catalogus bevat twee soorten skills. De denk-, schrijf- en coachskills van de [skills-hub](https://theseo.nl/skills/), en de vakskills die bij een artikel horen: lokale SEO per beroep, linkbuilding, WordPress en Google Ads. Het exacte aantal staat in `src/catalogus.json` onder `aantal`, met de verdeling in `aantal_hub` en `aantal_artikel`.

Voorbeeld-aanroep:

> "Is er een gratis skill die me helpt met een SWOT-analyse?"

```json
{ "onderwerp": "swot analyse", "max": 5 }
```

### 4. `bedrijfsbrein_template`

Geeft de volledige inhoud van het gratis [bedrijfsbrein-sjabloon](https://theseo.nl/bedrijfsbrein-sjabloon/) terug: een invulbaar `bedrijfsbrein.md` contextbestand dat een AI leert wie je bedrijf is. Handig om het sjabloon direct in een gesprek te laten invullen.

Voorbeeld-aanroep:

> "Haal het bedrijfsbrein-sjabloon op en vul het in voor mijn schildersbedrijf."

Deze tool heeft geen parameters.


### 5. `ai_index_branche`

Geeft per branche wat onze eigen AI-Index gemeten heeft: het aantal geldige metingen, de weigeringen met de letterlijke reden van het model, de tien meest genoemde bedrijven en hoe geconcentreerd het beeld is.

```json
{ "branche": "logistiek" }
```

### 6. `ai_index_vragen`

Geeft de letterlijke vragen die wij aan het model stellen voor een branche, plus de meetmethode. Daarmee kun je de meting zelf naspelen.

```json
{ "branche": "horeca", "max": 5 }
```

### 7. `ai_index_bedrijf`

Zoekt of een bedrijfsnaam voorkomt in de metingen, en zo ja in welke branches en bij welke vragen. Komt een naam er niet in voor, dan zegt de tool dat het uitdrukkelijk geen oordeel is: het is een steekproef met een vaste vragenlijst.

```json
{ "bedrijfsnaam": "bol.com" }
```

Alle drie eindigen met dezelfde bronregel: het model, het aantal metingen, de laatste meetdatum, de licentie CC BY 4.0 en de link naar de volledige bijsluiter. Geen trends over de tijd en geen uitspraken over bezoekersaantallen: de metingen zijn met temperature 1 gedaan, dus verschillen tussen momenten zijn ook samplingruis.

## Installatie

### Claude (claude.ai en de desktop-app)

1. Ga naar Instellingen, dan Connectors.
2. Kies Connector toevoegen en plak de URL: `https://mcp.theseo.nl/mcp`
3. Klaar. Vraag Claude bijvoorbeeld om een SEO-scan van je site.

### Claude Code

```bash
claude mcp add --transport http theseo https://mcp.theseo.nl/mcp
```

### Cursor

Voeg toe aan `~/.cursor/mcp.json` (of `.cursor/mcp.json` in je project):

```json
{
  "mcpServers": {
    "theseo-mcp": {
      "url": "https://mcp.theseo.nl/mcp"
    }
  }
}
```

## Eerlijke grenzen

- De SEO-scan bekijkt één pagina op 24 automatisch meetbare punten. Het is een goede eerste indruk, geen volledige audit. Een echte audit kijkt naar meerdere pagina's, concurrentie, zoekwoorden en zoekintentie, en dat blijft handwerk.
- De vindbaarheidscheck meet wat via de Google Places API meetbaar is. Criteria die niet meetbaar zijn (zoals de positie in het lokale kaartblok zonder live zoekopdracht) worden expliciet als niet gemeten teruggegeven en tellen niet mee in de score.
- De check werkt pas als de bijbehorende API-sleutel op de TheSEO server staat. Ontbreekt die, dan krijg je het eerlijke foutbericht van de API te zien in plaats van een verzonnen resultaat.
- De skill-catalogus is een momentopname die met de site meegenereerd wordt. Nieuwe skills verschijnen na een nieuwe deploy van deze server.

## Wat er bewaard wordt

- Deze server heeft geen database, geen accounts en geen inlog.
- Per tool-aanroep schrijft hij één telpunt naar Cloudflare Analytics Engine (dataset `theseo_mcp_tool_usage`): de toolnaam, de UTC-dag en het getal 1. Geen invoer, geen IP-adres, geen headers en geen gesprekstekst. Zo zien we welke tools gebruikt worden, niet door wie.
- `seo_scan` en `lokale_vindbaarheid_check` sturen je invoer door naar de site-Worker van theseo.nl, met de kop `X-TheSEO-Kanaal: mcp`, zodat de site ziet dat de aanroep via MCP kwam. Die siteflow bewaart nu het gescande webadres, of de bedrijfsnaam en plaats, samen met de uitslag als lead in het CRM van TheSEO, net als het formulier op de site. Daarom staat bij deze twee tools `readOnlyHint: false`.
- De andere vijf tools lezen alleen gegevens die in de server zijn ingebakken en sturen niets door.
- De Worker-logs bevatten alleen eigen foutmeldingen zonder invoer; de standaard aanroeplogs van Cloudflare staan uit (`invocation_logs: false` in `wrangler.jsonc`).

## Zelf draaien of meebouwen

Vereist Node 20 of nieuwer.

```bash
npm install
npm test              # alle tests, in-process en zonder netwerk
npm run dev           # lokaal op http://localhost:8787/mcp
npm run check         # TypeScript-controle
npm run dry-run       # controleer de deploy zonder te deployen
npm run deploy        # deploy naar Cloudflare (eigen account nodig)
```

De skill-catalogus (`src/catalogus.json`) en het bedrijfsbrein-sjabloon (`src/bedrijfsbrein.json`) worden gegenereerd uit de site-repo van theseo.nl:

```bash
npm run genereer-catalogus -- /pad/naar/theseo-cloudflare-site
```

Het script leest twee bronnen: de skills-hub en alle overige HTML in `public/`. Een zip die op schijf staat maar nergens op de site gelinkt is blijft er bewust buiten, want dan is hij nog niet uitgegeven.

**Onderhoudsregel.** Wie een skill-zip aan de site toevoegt, synct dezelfde dag drie dingen: de site zelf, de GitHub-repo `claude-skills-nederlands`, en deze catalogus. Ging dat mis, dan bestaat de skill wel als download maar vindt `skill_zoeken` hem niet. Dat is precies wat er tussen 11 en 18 augustus 2026 gebeurde: de catalogus las alleen de skills-hub en miste daardoor elke vakskill die bij een artikel hoort. Volgorde: catalogus genereren, `npm test`, `npm run check`, `npm run deploy`, daarna committen en pushen. Genereer altijd vlak voor de deploy, niet een dag ervoor; er komen regelmatig skills bij.

Premium skills komen nooit in deze publieke catalogus. Het script slaat pagina's onder `/skills/premium/` over en stopt met een foutmelding, zonder iets weg te schrijven, zodra een regel premium lijkt: een pagina onder `/skills/premium/`, het woord premium als deel van de slug, een downloadlink die afwijkt van `/assets/skills/<slug>.zip` of een premium toolnaam. De test `test/catalogus-premium.test.ts` controleert hetzelfde op de ingebakken catalogus en op het script zelf.

Het script stopt ook met een foutmelding als het op de skills-hub geen enkele skill vindt. Dat is geen overdreven voorzichtigheid: toen die pagina in augustus 2026 werd herbouwd naar een doorzoekbaar tegelraster, vond het oude patroon niets meer en schreef het script zonder klagen een catalogus zonder clusterlabels weg. Loopt het script daarop vast, pas dan de patronen in doorgang 1 aan.

De server zelf bevat geen secrets. De scan- en checklogica draait op de site-Worker van theseo.nl; deze MCP-server roept alleen de publieke endpoints daarvan aan.

## Gebruiken als bibliotheek

De zeven tools zijn ook als functie te gebruiken, zodat een andere Worker ze in zijn eigen MCP-server kan zetten, naast eigen tools. Het pakket exporteert `registreerGratisTools(server, deps)`:

```ts
import { McpServer } from '@modelcontextprotocol/server';
import { maakGebruiksteller, registreerGratisTools } from 'theseo-mcp';

const server = new McpServer({ name: 'mijn-server', version: '1.0.0' });
registreerGratisTools(server, {
  site: env.SITE_WORKER, // service binding naar de site-Worker
  teller: maakGebruiksteller(env.MCP_USAGE), // optioneel
});
```

- Er is geen globale binding: alles gaat via `deps`. Een onbekende of verkeerde sleutel in `deps` geeft direct een `TypeError`.
- Elke aanroep naar de site draagt de kop `X-TheSEO-Kanaal: mcp`. Wil je extra koppen meesturen, zoals een handtekening, geef dan als `site` een eigen object met een `fetch` die ze toevoegt.
- `premiumSkills` is optioneel: een lijst met `slug`, `naam` en `zin`. Alleen dan toont `skill_zoeken` die namen ook, gemarkeerd als premium en zonder download. Laat de lijst leeg voor anonieme gebruikers. Deze repo bevat zelf geen enkele premium skill; `valideerPremiumSkills` controleert de lijst.
- `zod` 4.4.3 en `@modelcontextprotocol/server` 2.0.0 zijn `peerDependencies` met een vaste versie. De gebruikende Worker levert ze, zodat er maar één kopie van zod in de bundel zit.
- Het pakket levert TypeScript-bron en importeert JSON. De gebruikende Worker heeft daarom `resolveJsonModule` nodig in zijn `tsconfig.json`; Wrangler en Vitest bundelen de bron zelf.

## Techniek

- TypeScript, [`@modelcontextprotocol/server`](https://www.npmjs.com/package/@modelcontextprotocol/server) v2 (de officiële MCP TypeScript SDK)
- [`agents`](https://www.npmjs.com/package/agents) van Cloudflare voor de stateless Streamable HTTP handler
- Cloudflare Workers, deployment via `wrangler`
- Tests met de officiële MCP-client tegen de echte handler, in-process en zonder netwerk

## Licentie

[MIT](./LICENSE). Gemaakt door [TheSEO](https://theseo.nl). Vragen of ideeën: open een issue.
