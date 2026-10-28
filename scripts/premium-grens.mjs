/**
 * De grens tussen gratis en premium voor de skill-catalogus.
 *
 * Deze repo is publiek (MIT). Alles wat in src/catalogus.json belandt staat op
 * GitHub en gaat via skill_zoeken naar iedereen. Een premium skill hoort daar
 * nooit in (kaart-theseo-mcp 123). De generator pakt elke zip die ergens in
 * de public-map van de site gelinkt is, dus deze controle staat tussen de
 * site en de catalogus: de generator stopt, en een test faalt, zodra een
 * kandidaat er premium uitziet.
 *
 * Kenmerken, zonder ook maar een premium naam te kennen:
 *   - de pagina hangt onder /skills/premium/ (de premiumhub op de site);
 *   - de download wijkt af van het vaste patroon /assets/skills/<slug>.zip;
 *   - het woord premium is een los deel van de slug (premium-boekhouder);
 *   - ergens staat een premium toolnaam (alles wat met tseo_ begint).
 * Het woord premium in een gewone beschrijving telt niet: een gratis skill
 * mag over premiumprijzen gaan.
 */

export const PREMIUM_PAGINA = '/skills/premium/';

function padVan(adres) {
  try {
    return new URL(adres).pathname;
  } catch {
    return String(adres ?? '');
  }
}

/** Geeft de reden waarom een catalogusregel premium lijkt, of null. */
export function premiumReden(skill) {
  const slug = String(skill?.slug ?? '');
  const pagina = padVan(skill?.pagina);
  const download = padVan(skill?.download);

  if (pagina.startsWith(PREMIUM_PAGINA)) return `${slug}: pagina hangt onder ${PREMIUM_PAGINA}`;
  if (download !== `/assets/skills/${slug}.zip`) return `${slug}: download volgt niet /assets/skills/<slug>.zip`;
  if (slug.split(/[^a-z0-9]+/).includes('premium')) return `${slug}: premium in de slug`;
  if (/tseo_/.test(JSON.stringify(skill))) return `${slug}: noemt een premium toolnaam (tseo_)`;
  return null;
}

/** Alle redenen voor een hele lijst; leeg betekent schoon. */
export function premiumInCatalogus(skills) {
  return (skills ?? []).map(premiumReden).filter((reden) => reden !== null);
}

/** True als een webpad van een pagina bij de premiumhub hoort. */
export function isPremiumPagina(webPad) {
  return String(webPad).startsWith(PREMIUM_PAGINA);
}
