# theseo-mcp

Open-source remote MCP-server van [TheSEO](https://theseo.nl), instituut voor zichtbaarheid. Voor zover wij hebben kunnen nagaan de eerste MCP-server van een Nederlands marketingbureau.

MCP (Model Context Protocol) is de open standaard waarmee AI-assistenten zoals Claude externe tools kunnen gebruiken. Voeg deze server één keer toe en je AI kan zelf een SEO-scan draaien, lokale vindbaarheid checken, gratis Claude-skills opzoeken, het bedrijfsbrein-sjabloon ophalen en onze eigen AI-Index bevragen. Alles wat deze server aanbiedt is gratis en vraagt geen account.

De server draait als Cloudflare Worker met Streamable HTTP transport.

**Endpoint:** `https://theseo-mcp.sales-cc8.workers.dev/mcp`

## De zeven tools

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

Doorzoekt de catalogus van 94 gratis Nederlandstalige Claude-skills van theseo.nl op onderwerp. Per treffer krijg je de naam, de beschrijving, de uitlegpagina en de directe download-URL van de zip.

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
2. Kies Connector toevoegen en plak de URL: `https://theseo-mcp.sales-cc8.workers.dev/mcp`
3. Klaar. Vraag Claude bijvoorbeeld om een SEO-scan van je site.

### Claude Code

```bash
claude mcp add --transport http theseo-mcp https://theseo-mcp.sales-cc8.workers.dev/mcp
```

### Cursor

Voeg toe aan `~/.cursor/mcp.json` (of `.cursor/mcp.json` in je project):

```json
{
  "mcpServers": {
    "theseo-mcp": {
      "url": "https://theseo-mcp.sales-cc8.workers.dev/mcp"
    }
  }
}
```

## Eerlijke grenzen

- De SEO-scan bekijkt één pagina op 24 automatisch meetbare punten. Het is een goede eerste indruk, geen volledige audit. Een echte audit kijkt naar meerdere pagina's, concurrentie, zoekwoorden en zoekintentie, en dat blijft handwerk.
- De vindbaarheidscheck meet wat via de Google Places API meetbaar is. Criteria die niet meetbaar zijn (zoals de positie in het lokale kaartblok zonder live zoekopdracht) worden expliciet als niet gemeten teruggegeven en tellen niet mee in de score.
- De check werkt pas als de bijbehorende API-sleutel op de TheSEO server staat. Ontbreekt die, dan krijg je het eerlijke foutbericht van de API te zien in plaats van een verzonnen resultaat.
- De skill-catalogus is een momentopname die met de site meegenereerd wordt. Nieuwe skills verschijnen na een nieuwe deploy van deze server.
- Deze server slaat niets op. Er is geen tracking, geen database en er zijn geen accounts.

## Zelf draaien of meebouwen

Vereist Node 20 of nieuwer.

```bash
npm install
npm test              # smoke-test plus tests van de skill-zoeker
npm run dev           # lokaal op http://localhost:8787/mcp
npm run check         # TypeScript-controle
npm run dry-run       # controleer de deploy zonder te deployen
npm run deploy        # deploy naar Cloudflare (eigen account nodig)
```

De skill-catalogus (`src/catalogus.json`) en het bedrijfsbrein-sjabloon (`src/bedrijfsbrein.json`) worden gegenereerd uit de site-repo van theseo.nl:

```bash
npm run genereer-catalogus -- /pad/naar/theseo-cloudflare-site
```

De server zelf bevat geen secrets. De scan- en checklogica draait op de site-Worker van theseo.nl; deze MCP-server roept alleen de publieke endpoints daarvan aan.

## Techniek

- TypeScript, [`@modelcontextprotocol/server`](https://www.npmjs.com/package/@modelcontextprotocol/server) v2 (de officiële MCP TypeScript SDK)
- [`agents`](https://www.npmjs.com/package/agents) van Cloudflare voor de stateless Streamable HTTP handler
- Cloudflare Workers, deployment via `wrangler`
- Tests met de officiële MCP-client tegen de echte handler, in-process en zonder netwerk

## Licentie

[MIT](./LICENSE). Gemaakt door [TheSEO](https://theseo.nl). Vragen of ideeën: open een issue.
