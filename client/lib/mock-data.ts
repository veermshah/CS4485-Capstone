export type Building = {
  id: string;
  address: string;
  damageClass: "No Damage" | "Minor" | "Major" | "Destroyed";
  confidence: number;
  labelSource: "VLM" | "FEMA";
  runId: string;
  updatedAt: string;
};

export type Run = {
  id: string;
  datasetId: string;
  name: string;
  startedAt: string;
  status: "Completed" | "Running" | "Failed";
};

export type Job = {
  id: string;
  dataset: string;
  status: "Queued" | "Running" | "Completed" | "Failed";
  startedAt: string;
  owner: string;
};

export type Dataset = {
  id: string;
  name: string;
  region: string;
  buildingCount: number;
  updatedAt: string;
};

export const damageClasses: Building["damageClass"][] = [
  "No Damage",
  "Minor",
  "Major",
  "Destroyed",
];

export const runs: Run[] = [
  {
    id: "run-1302",
    datasetId: "ds-001",
    name: "Wildfire Baseline",
    startedAt: "2026-02-11 09:34",
    status: "Completed",
  },
  {
    id: "run-1303",
    datasetId: "ds-001",
    name: "Wildfire VLM v2",
    startedAt: "2026-02-13 14:08",
    status: "Running",
  },
];

export const buildings: Building[] = [
  {
    id: "BLDG-0001",
    address: "129 Harbor St",
    damageClass: "Major",
    confidence: 82,
    labelSource: "VLM",
    runId: "run-1302",
    updatedAt: "2026-02-13 12:44",
  },
  {
    id: "BLDG-0002",
    address: "14 Seabreeze Ave",
    damageClass: "No Damage",
    confidence: 91,
    labelSource: "FEMA",
    runId: "run-1302",
    updatedAt: "2026-02-13 12:50",
  },
  {
    id: "BLDG-0003",
    address: "228 Ferry Rd",
    damageClass: "Destroyed",
    confidence: 77,
    labelSource: "VLM",
    runId: "run-1303",
    updatedAt: "2026-02-14 08:12",
  },
  {
    id: "BLDG-0004",
    address: "8 Bayfront Ct",
    damageClass: "Minor",
    confidence: 69,
    labelSource: "FEMA",
    runId: "run-1303",
    updatedAt: "2026-02-14 08:36",
  },
  {
    id: "BLDG-0005",
    address: "75 Dune Blvd",
    damageClass: "Major",
    confidence: 74,
    labelSource: "VLM",
    runId: "run-1303",
    updatedAt: "2026-02-14 09:02",
  },
  {
    id: "BLDG-0006",
    address: "57 Dockside Dr",
    damageClass: "No Damage",
    confidence: 88,
    labelSource: "FEMA",
    runId: "run-1302",
    updatedAt: "2026-02-13 13:05",
  },
  {
    id: "BLDG-0007",
    address: "312 Redwood Ave",
    damageClass: "Minor",
    confidence: 63,
    labelSource: "VLM",
    runId: "run-1303",
    updatedAt: "2026-02-14 10:14",
  },
  {
    id: "BLDG-0008",
    address: "88 Oakmont Ln",
    damageClass: "Destroyed",
    confidence: 86,
    labelSource: "VLM",
    runId: "run-1303",
    updatedAt: "2026-02-14 10:26",
  },
  {
    id: "BLDG-0009",
    address: "140 Pine Ridge Rd",
    damageClass: "Major",
    confidence: 72,
    labelSource: "FEMA",
    runId: "run-1303",
    updatedAt: "2026-02-14 10:39",
  },
  {
    id: "BLDG-0010",
    address: "19 Healdsburg Way",
    damageClass: "No Damage",
    confidence: 93,
    labelSource: "FEMA",
    runId: "run-1302",
    updatedAt: "2026-02-14 10:52",
  },
  {
    id: "BLDG-0011",
    address: "402 Cypress St",
    damageClass: "Minor",
    confidence: 66,
    labelSource: "VLM",
    runId: "run-1303",
    updatedAt: "2026-02-14 11:05",
  },
  {
    id: "BLDG-0012",
    address: "265 Calistoga Blvd",
    damageClass: "Major",
    confidence: 79,
    labelSource: "FEMA",
    runId: "run-1303",
    updatedAt: "2026-02-14 11:18",
  },
];

export const jobs: Job[] = [
  {
    id: "job-778",
    dataset: "Wildfires",
    status: "Completed",
    startedAt: "2026-02-13 08:02",
    owner: "A. Lee",
  },
  {
    id: "job-779",
    dataset: "Wildfires",
    status: "Running",
    startedAt: "2026-02-14 15:44",
    owner: "M. Patel",
  },
  {
    id: "job-780",
    dataset: "Wildfires",
    status: "Queued",
    startedAt: "2026-02-15 10:21",
    owner: "J. Kim",
  },
];

export const datasets: Dataset[] = [
  {
    id: "ds-001",
    name: "Wildfires",
    region: "California",
    buildingCount: 18432,
    updatedAt: "2026-02-15",
  },
];
