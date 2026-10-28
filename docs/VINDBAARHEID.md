# Vindbaar maken: registers en connectorlijsten

Stand 28-10-2026. Endpoint: `https://mcp.theseo.nl/mcp`. Beginpagina: `https://mcp.theseo.nl/`. Server-card: `https://mcp.theseo.nl/.well-known/mcp/server-card.json`.

Per lijst staat hieronder wat klaarstaat en wat alleen Gianluca kan doen (inloggen, account, betalen, voorwaarden accepteren). De teksten onderaan zijn voor elke lijst bruikbaar.

## 1. Officieel MCP-register (eerst, de rest leest het)

Glama en PulseMCP nemen servers uit dit register over; GitHub (github.com/mcp) en daarmee VS Code kiezen eruit.

Klaar: `server.json` (naam `nl.theseo/theseo-mcp`, versie 0.5.0, gekeurd met `./tools/mcp-publisher validate`).

Gianluca, eenmalig:

1. In Cloudflare, zone theseo.nl, DNS: een TXT-record op het hoofddomein. Naam `@`, inhoud:
   `v=MCPv1; k=ed25519; p=WDZTS6WebFFpNGzRr9AmyzB6xJGRvjnZ/lgAXsGwsQg=`
   (Een extra TXT naast SPF en google-site-verification mag.)
2. Controleren en publiceren in de terminal:

```bash
dig +short TXT theseo.nl @1.1.1.1 | grep MCPv1
```

```bash
cd ~/projecten/theseo-mcp && ./tools/mcp-publisher login dns --domain theseo.nl --private-key "$(cat ~/.mcp-theseo-dns.hex)" && ./tools/mcp-publisher publish
```

3. Nakijken:

```bash
curl -s "https://registry.modelcontextprotocol.io/v0/servers?search=nl.theseo"
```

Daarna een mail naar partnerships@github.com met de vraag om opname in github.com/mcp (tekst B hieronder).

## 2. Claude-directory (claude.ai)

Waar: https://claude.ai/directory/manage, Submit new, MCP connector. Kan alleen met een betaald Claude-plan.

Klaar: elke tool heeft een titel en readOnlyHint of destructiveHint; de gratis tools werken zonder inlog; de accounttools gebruiken OAuth (lazy auth: 401 met resource_metadata). Privacy: https://theseo.nl/privacy/. Documentatie: https://mcp.theseo.nl/.

Gianluca: inloggen, het formulier invullen met tekst A, categorieën "Marketing" en "Research", een testaccount voor de reviewers aanmaken (een gewoon account op mcp.theseo.nl, geen premium nodig voor de gratis tools), de verklaringen accepteren.

## 3. ChatGPT

Gebruikers kunnen hem nu al zelf toevoegen in de ontwikkelaarsmodus (Connectors, aangepaste MCP-server, de URL).

Publieke vermelding: https://platform.openai.com/plugins. Vraagt identiteitsverificatie, een domeinbestand op `https://mcp.theseo.nl/.well-known/openai-apps-challenge` (de token krijg je in het portaal; dan zet ik die route erbij), website-, support-, privacy- en voorwaarden-URL, een icoon, vijf goede en drie foute testgevallen (lijst C) en een korte video. De naam mag geen "MCP" bevatten: gebruik "TheSEO". Let op: een project met EU-dataresidentie kan niet indienen.

## 4. Smithery

Waar: https://smithery.ai/new, URL plakken. Smithery leest de server-card. Gianluca: inloggen. Let op: Smithery stuurt verkeer via een eigen gateway; de gratis tools bewaren niets, dus dat is in orde.

## 5. Glama

`glama.json` staat in de root van deze repo. Na publicatie in het officiële register neemt Glama de server over; claimen gaat met GitHub-inlog (Gianluca).

## 6. PulseMCP

Neemt geen losse aanmeldingen meer aan; komt vanzelf uit het officiële register.

## 7. Overige lijsten

- mcp.so: https://mcp.so/submit, type Remote Server, repo-URL. Gratis pad onzeker; publiceren met badge kost 39 dollar eenmalig. Gianluca beslist.
- MCP Market: https://mcpmarket.com/submit, Remote MCP, repo-URL. Gratis wachtrij van 4 tot 6 weken, of 29 dollar binnen 24 uur. Gianluca beslist.
- LobeHub: `npx @lobehub/market-cli` (lhm login, lhm github connect, lhm plugin init --url https://mcp.theseo.nl/mcp, lhm plugin publish). Vraagt GitHub-inlog van Gianluca.
- Cursor Marketplace: alleen als plugin met `plugin.json` in een Git-repo, met handmatige review (https://cursor.com/marketplace/publish).
- Gemini: alleen in de VS voor gebruikers; publiek via het Google Connected Apps Platform (https://connected.google.com/console), met een domeinbestand en review.
- Perplexity: gebruikers met een betaald plan voegen hem zelf toe; publiek alleen via het voorstelformulier https://pplx.ai/connector-form-submission, zonder garantie.

## Teksten

### A. Vermelding (naam, korte zin, beschrijving)

Naam: TheSEO

Korte zin (onder 200 tekens): Meet hoe vaak AI-modellen je bedrijf noemen, zie in welke vragen je concurrenten wel genoemd worden, check AI-crawlers en zoek Nederlandse vakregels met bron.

Beschrijving (onder 2000 tekens):

TheSEO is een Nederlands bureau voor zichtbaarheid. Deze server geeft je AI-assistent eigen metingen die nergens anders staan.

Zonder account:
- ai_zichtbaarheid_merk: hoe vaak AI-modellen je bedrijf noemen bij vaste vragen in je branche, per model met een betrouwbaarheidsinterval, en of het verschil met de vorige meting buiten de meetruis valt. Per model staat erbij of het al gemeten is.
- ai_index_gat: in welke vragen van je branche concurrenten genoemd worden en jij niet.
- ai_crawler_check: of robots.txt van een site de crawlers van OpenAI, Anthropic, Perplexity, Google en anderen toelaat, of er een llms.txt is, of de pagina op noindex staat en of er bedrijfsmarkup is.
- vakregels: Nederlandse regels, instanties, keurmerken en vergunningen per beroep, met bron en controledatum, alleen voor beroepen waarvan wij de bronnen hebben gecontroleerd.
- ai_index_branche, ai_index_vragen, ai_index_bedrijf: de open data van de Nationale AI-Index (CC BY 4.0).
- skill_zoeken en bedrijfsbrein_template: 149 gratis Nederlandstalige Claude-skills en een invulbaar bedrijfsbrein.

Met een account: geheugen, profiel, taken, logboek en bewijs tussen gesprekken, en premium skills. Je ziet en wist zelf wat er bewaard wordt.

De gratis tools bewaren niets over wie belt. Methode: https://theseo.nl/ai-index/methodologie/.

### B. Mail aan GitHub

Onderwerp: Opname in github.com/mcp: nl.theseo/theseo-mcp

Hallo, onze remote MCP-server staat in het officiële MCP-register als nl.theseo/theseo-mcp (https://mcp.theseo.nl/mcp, broncode van de gratis tools: https://github.com/GianlucaNaarden/theseo-mcp). Hij meet hoe vaak AI-modellen Nederlandse bedrijven noemen en geeft Nederlandse vakregels met bron. We vragen of hij in de GitHub MCP Registry opgenomen kan worden. Met vriendelijke groet, Gianluca Amante Naarden, TheSEO.

### C. Testgevallen

Goed:
1. "Hoe vaak noemt AI Coolblue in detailhandel?" verwacht: ai_zichtbaarheid_merk, per model een aandeel of niet gemeten.
2. "In welke vragen over logistiek wordt PostNL niet genoemd maar de concurrenten wel?" verwacht: ai_index_gat.
3. "Blokkeert theseo.nl de crawler van OpenAI?" verwacht: ai_crawler_check met per crawler toegestaan of niet.
4. "Welke regels gelden er voor een garage in Nederland?" verwacht: vakregels met RDW- en BOVAG-bronnen.
5. "Welke vragen stelt de AI-Index aan het model voor horeca?" verwacht: ai_index_vragen.

Fout (de tool hoort niets te verzinnen):
1. "Wat is de omzet van Coolblue?" verwacht: geen tool, of de melding dat dit buiten de index valt.
2. "Welke regels gelden er voor een dakdekker?" verwacht: vakregels zegt dat er nog geen gecontroleerde data is.
3. "Check de crawlers van http://localhost" verwacht: geweigerd, alleen openbare https-adressen.
