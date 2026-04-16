console.log("BASE URL:", process.env.FIRELENS_DATA_BASE_URL);
const RAW_DATA_BASE_URL =
  process.env.FIRELENS_DATA_BASE_URL || process.env.NEXT_PUBLIC_FIRELENS_DATA_BASE_URL || "";

const DATA_BASE_URL = RAW_DATA_BASE_URL.replace(/\/+$/, "");

function quoteRegexChar(ch: string): string {
  return /[.*+?^${}()|[\]\\]/.test(ch) ? `\\${ch}` : ch;
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (ch === '"') {
      const next = line[i + 1];
      if (inQuotes && next === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === "," && !inQuotes) {
      cells.push(current);
      current = "";
      continue;
    }

    current += ch;
  }

  cells.push(current);
  return cells;
}

function parseCsv(text: string): Array<Record<string, string>> {
  const rows = text
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0);

  if (!rows.length) return [];

  const headers = splitCsvLine(rows[0]);
  const out: Array<Record<string, string>> = [];

  for (const rowLine of rows.slice(1)) {
    const values = splitCsvLine(rowLine);
    const row: Record<string, string> = {};

    headers.forEach((header, idx) => {
      row[header] = values[idx] ?? "";
    });

    out.push(row);
  }

  return out;
}

function toDigitsOnlyTileId(rawTileId: string | undefined): string | null {
  if (!rawTileId) return null;
  const match = rawTileId.match(/(\d+)$/);
  return match ? match[1] : null;
}

function ensureDataBaseUrl() {
  if (!DATA_BASE_URL) {
    throw new Error(
      "Missing FIRELENS_DATA_BASE_URL (or NEXT_PUBLIC_FIRELENS_DATA_BASE_URL). Set it to your bucket base URL.",
    );
  }
}

export function getDataBaseUrl(): string {
  ensureDataBaseUrl();
  return DATA_BASE_URL;
}

export function buildDataObjectUrl(objectPath: string): string {
  ensureDataBaseUrl();
  const cleanPath = objectPath.replace(/^\/+/, "");
  return `${DATA_BASE_URL}/${cleanPath}`;
}

export async function fetchDataJson<T>(objectPath: string): Promise<T> {
  const url = buildDataObjectUrl(objectPath);
  const response = await fetch(url, { cache: "force-cache" });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${objectPath}: HTTP ${response.status}`);
  }
  return (await response.json()) as T;
}

let datasetRowsPromise: Promise<Array<Record<string, string>>> | null = null;

export function getDatasetRows(): Promise<Array<Record<string, string>>> {
  if (!datasetRowsPromise) {
    datasetRowsPromise = (async () => {
      const url = buildDataObjectUrl("dataset_records.csv");
      const response = await fetch(url, { cache: "force-cache" });
      if (!response.ok) {
        throw new Error(`Failed to fetch dataset_records.csv: HTTP ${response.status}`);
      }
      const csvText = await response.text();
      return parseCsv(csvText);
    })();
  }

  return datasetRowsPromise;
}

let tileIdsPromise: Promise<string[]> | null = null;

export function getTileIdsFromDataset(): Promise<string[]> {
  if (!tileIdsPromise) {
    tileIdsPromise = (async () => {
      const rows = await getDatasetRows();
      const ids = new Set<string>();

      for (const row of rows) {
        const normalized = toDigitsOnlyTileId(row.tile_id);
        if (normalized) ids.add(normalized);
      }

      return Array.from(ids);
    })();
  }

  return tileIdsPromise;
}

export function normalizeTileIdFromFilename(name: string): string | null {
  const escaped = "santa-rosa-wildfire_"
    .split("")
    .map((ch) => quoteRegexChar(ch))
    .join("");
  const match = name.match(new RegExp(`^${escaped}(\\d+)_`));
  return match ? match[1] : null;
}
