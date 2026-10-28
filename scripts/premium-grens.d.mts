export interface CatalogusRegel {
  slug: string;
  pagina: string;
  download: string;
  [veld: string]: unknown;
}

export declare const PREMIUM_PAGINA: '/skills/premium/';
export declare function premiumReden(skill: CatalogusRegel): string | null;
export declare function premiumInCatalogus(skills: readonly CatalogusRegel[]): string[];
export declare function isPremiumPagina(webPad: string): boolean;
