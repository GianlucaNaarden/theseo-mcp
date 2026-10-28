export const TOOL_NAMEN = Object.freeze([
  'seo_scan',
  'lokale_vindbaarheid_check',
  'skill_zoeken',
  'bedrijfsbrein_template',
  'ai_index_branche',
  'ai_index_vragen',
  'ai_index_bedrijf',
] as const);

export type ToolNaam = typeof TOOL_NAMEN[number];
export type Gebruiksteller = (tool: ToolNaam) => void;

/**
 * Het deel van een Analytics Engine-dataset dat de teller gebruikt. Bewust een
 * eigen structureel type in plaats van de Workers-global, zodat het platform
 * deze bibliotheek ook kan typechecken zonder dezelfde ambient types.
 */
export interface SchrijfbareDataset {
  writeDataPoint(punt: { indexes?: string[]; blobs?: string[]; doubles?: number[] }): void;
}

/**
 * Pakt alleen de Analytics Engine-binding uit een Worker-omgeving. Ontbreekt
 * die, dan is de uitkomst undefined en blijft de teller een no-op, zodat een
 * configuratiefout nooit een inhoudelijk toolresultaat breekt.
 */
export function datasetUit(env: unknown): SchrijfbareDataset | undefined {
  const kandidaat = (env as { MCP_USAGE?: SchrijfbareDataset } | null | undefined)?.MCP_USAGE;
  return kandidaat && typeof kandidaat.writeDataPoint === 'function' ? kandidaat : undefined;
}

/**
 * Maakt een privacyarme teller. Analytics Engine bewaart per aanroep exact:
 * index1 = toolnaam, blob1 = UTC-dag en double1 = 1. De functie krijgt geen
 * toolargumenten of Request en kan die dus ook niet per ongeluk opslaan.
 */
export function maakGebruiksteller(
  dataset: SchrijfbareDataset | undefined,
  nu: () => Date = () => new Date(),
): Gebruiksteller {
  if (!dataset) return () => {};

  return (tool) => {
    let utcDag = 'onbekend';
    try {
      utcDag = nu().toISOString().slice(0, 10);
      dataset.writeDataPoint({
        indexes: [tool],
        blobs: [utcDag],
        doubles: [1],
      });
    } catch {
      // Bewust geen foutobject loggen: een providerfout mag geen requestdata
      // of andere onverwachte details in observability krijgen.
      console.error(JSON.stringify({
        event: 'mcp_usage_write_failed',
        tool,
        utc_day: utcDag,
      }));
    }
  };
}
