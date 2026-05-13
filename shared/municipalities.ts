import type { MunicipalityBlock, MunicipalityDefinition } from "./types.ts";

export const DEFAULT_CITY = "Chandigarh";
export const CHANDIGARH_SECTORS = Array.from({ length: 56 }, (_, index) => index + 1);

export const MUNICIPALITY_MAP: MunicipalityDefinition[] = [
  {
    id: "north-chandigarh",
    name: "North Chandigarh Municipality",
    blocks: [
      {
        id: "north-block-a",
        name: "Block A",
        sectors: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      },
      {
        id: "north-block-b",
        name: "Block B",
        sectors: [11, 12, 13, 14, 15, 16, 17, 18, 19, 20],
      },
    ],
  },
  {
    id: "central-chandigarh",
    name: "Central Chandigarh Municipality",
    blocks: [
      {
        id: "central-block-a",
        name: "Block A",
        sectors: [21, 22, 23, 24, 25, 26, 27, 28],
      },
      {
        id: "central-block-b",
        name: "Block B",
        sectors: [29, 30, 31, 32, 33, 34, 35, 36, 37, 38],
      },
    ],
  },
  {
    id: "south-chandigarh",
    name: "South Chandigarh Municipality",
    blocks: [
      {
        id: "south-block-a",
        name: "Block A",
        sectors: [39, 40, 41, 42, 43, 44, 45, 46],
      },
      {
        id: "south-block-b",
        name: "Block B",
        sectors: [47, 48, 49, 50, 51, 52, 53, 54, 55, 56],
      },
    ],
  },
];

export interface SectorRoute {
  municipalityId: string;
  municipalityName: string;
  blockId: string;
  blockName: string;
  sector: number;
}

export function normalizeSector(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value)) {
    return CHANDIGARH_SECTORS.includes(value) ? value : null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  const exactMatch = trimmed.match(/^sector\s*(\d{1,2})$/i) ?? trimmed.match(/^(\d{1,2})$/);
  const exactValue = exactMatch?.[1];
  const parsedValue = exactValue ? Number.parseInt(exactValue, 10) : Number.parseInt(trimmed, 10);

  if (!Number.isInteger(parsedValue)) {
    return null;
  }

  return CHANDIGARH_SECTORS.includes(parsedValue) ? parsedValue : null;
}

export function extractSectorFromText(...values: Array<string | null | undefined>) {
  for (const value of values) {
    if (!value) {
      continue;
    }

    const match = value.match(/\bsector\s*(\d{1,2})\b/i);
    const normalized = normalizeSector(match?.[1] ?? "");

    if (normalized) {
      return normalized;
    }
  }

  return null;
}

export function findSectorRoute(sector: number | null): SectorRoute | null {
  if (!sector) {
    return null;
  }

  for (const municipality of MUNICIPALITY_MAP) {
    for (const block of municipality.blocks) {
      if (block.sectors.includes(sector)) {
        return {
          municipalityId: municipality.id,
          municipalityName: municipality.name,
          blockId: block.id,
          blockName: block.name,
          sector,
        };
      }
    }
  }

  return null;
}

export function findBlockById(municipalityId: string, blockId: string): MunicipalityBlock | null {
  const municipality = MUNICIPALITY_MAP.find((item) => item.id === municipalityId);

  if (!municipality) {
    return null;
  }

  return municipality.blocks.find((item) => item.id === blockId) ?? null;
}
