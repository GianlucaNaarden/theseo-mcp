# De server aanmelden bij de registers

Stand 2026-08-11. De server draait en alle vier de tools zijn getest tegen de
live omgeving. Wat nog moet gebeuren is de aanmelding, en daar is een keer een
handeling van Gianluca voor nodig omdat de registers om een eigenaarsbewijs
vragen.

## 1. De officiele MCP Registry

`server.json` is geldig (`./tools/mcp-publisher validate` geeft groen). De
naam die we claimen is `nl.theseo/theseo-mcp`. Zo'n naam op het eigen domein
mag alleen als je aantoont dat je theseo.nl bezit, en dat gaat via een
DNS-record. Het alternatief is inloggen met GitHub, maar dan word je
`io.github.gianlucanaarden/theseo-mcp`, wat zwakker staat: het is dan een
GitHub-account dat publiceert in plaats van het merk.

### Stap 1: het DNS-record (jij, eenmalig)

Zet in Cloudflare bij de zone theseo.nl een TXT-record:

```
naam:    _mcp-registry
type:    TXT
waarde:  v=MCPv1; k=ed25519; p=WDZTS6WebFFpNGzRr9AmyzB6xJGRvjnZ/lgAXsGwsQg=
```

De bijbehorende prive-sleutel staat in `~/.mcp-theseo-dns.key` (en de hex-vorm
in `~/.mcp-theseo-dns.hex`), alleen leesbaar voor jouw gebruiker. Die sleutel
hoort nergens in git en nergens in een chat. Raakt hij kwijt, dan genereren we
een nieuw paar en vervang je het TXT-record.

Controleren of het record er staat:

```bash
dig +short TXT _mcp-registry.theseo.nl @1.1.1.1
```

### Stap 2: inloggen en publiceren

```bash
cd ~/projecten/theseo-mcp && ./tools/mcp-publisher login dns --domain theseo.nl --private-key "$(cat ~/.mcp-theseo-dns.hex)" && ./tools/mcp-publisher publish
```

Daarna staat hij in het register:

```bash
curl -s "https://registry.modelcontextprotocol.io/v0/servers?search=theseo"
```

### Als je liever de snelle route neemt

```bash
cd ~/projecten/theseo-mcp && ./tools/mcp-publisher login github
```

Pas dan wel eerst in `server.json` de naam aan naar
`io.github.gianlucanaarden/theseo-mcp`, anders weigert het register de
publicatie omdat je die namespace niet bezit.

## 2. PulseMCP

Aanmelden via het formulier op https://www.pulsemcp.com/submit. Gegevens die
ze vragen, alvast op een rij:

- Naam: TheSEO marketing-tools
- Endpoint: https://theseo-mcp.sales-cc8.workers.dev/mcp (Streamable HTTP)
- Repository: https://github.com/GianlucaNaarden/theseo-mcp
- Website: https://theseo.nl
- Licentie: MIT
- Beschrijving: Gratis SEO-scan, lokale vindbaarheidscheck en 94 Nederlandse
  Claude-skills van theseo.nl
- Categorie: marketing en SEO
- Authenticatie: geen, alle tools zijn gratis en lezen alleen

## 3. Glama

Glama indexeert publieke repositories zelf zodra ze een `server.json` of een
MCP-manifest zien; toevoegen kan via https://glama.ai/mcp/servers (knop Add
Server) met dezelfde gegevens als hierboven.

## Wat er nog niet werkt

`lokale_vindbaarheid_check` geeft een eerlijke melding dat hij niet
geconfigureerd is. Die tool leunt op `/api/vcheck` van de site-Worker en die
heeft een Google Places-sleutel nodig:

```bash
cd ~/projecten/theseo-cloudflare-site && npx wrangler secret put GOOGLE_PLACES_API_KEY
```

Zolang die ontbreekt is de tool wel zichtbaar maar niet bruikbaar. Overweeg
hem pas aan te melden bij de registers als die sleutel er is, of laat hem
staan: hij liegt niet, hij zegt gewoon dat hij nog niet klaar is.
