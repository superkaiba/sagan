export interface ExperimentEstimate {
  remainingMinutes: number | null;
  updatedAt: string | null;
  source: string | null;
  podId: string | null;
  message: string | null;
  progressPct: number | null;
}

type JsonRecord = Record<string, unknown>;
export type ExperimentEstimateOptions = {
  source?: 'manual' | 'pod' | 'spec' | 'agent';
  podId?: string | null;
  message?: string | null;
  progressPct?: number | null;
};

export type ExperimentProgressUpdate = ExperimentEstimateOptions & {
  remainingMinutes?: number | null;
};

const UI_KEY = 'saganUi';
const REMAINING_MINUTES_KEY = 'estimatedRemainingMinutes';
const UPDATED_AT_KEY = 'estimatedRemainingUpdatedAt';
const SOURCE_KEY = 'estimatedRemainingSource';
const POD_ID_KEY = 'estimatedRemainingPodId';
const MESSAGE_KEY = 'estimatedRemainingMessage';
const PROGRESS_KEY = 'progressPct';

export function getExperimentEstimate(planJson: unknown): ExperimentEstimate {
  if (!isPlainRecord(planJson)) return emptyEstimate();
  const ui = isPlainRecord(planJson[UI_KEY]) ? planJson[UI_KEY] : planJson;
  return {
    remainingMinutes: finiteWholeMinutes(ui[REMAINING_MINUTES_KEY]),
    updatedAt: parseIsoString(ui[UPDATED_AT_KEY]),
    source: stringOrNull(ui[SOURCE_KEY]),
    podId: stringOrNull(ui[POD_ID_KEY]),
    message: stringOrNull(ui[MESSAGE_KEY]),
    progressPct: finiteProgress(ui[PROGRESS_KEY]),
  };
}

export function mergeExperimentEstimate(
  planJson: unknown,
  remainingMinutes: number | null,
  options: ExperimentEstimateOptions = {},
): JsonRecord {
  const base: JsonRecord = isPlainRecord(planJson) ? { ...planJson } : planJson == null ? {} : { value: planJson };
  const ui: JsonRecord = isPlainRecord(base[UI_KEY]) ? { ...(base[UI_KEY] as JsonRecord) } : {};

  if (remainingMinutes == null) {
    delete ui[REMAINING_MINUTES_KEY];
    delete ui[UPDATED_AT_KEY];
    delete ui[SOURCE_KEY];
    delete ui[POD_ID_KEY];
    delete ui[MESSAGE_KEY];
    delete ui[PROGRESS_KEY];
  } else {
    ui[REMAINING_MINUTES_KEY] = Math.max(0, Math.floor(remainingMinutes));
    ui[UPDATED_AT_KEY] = new Date().toISOString();
    if (options.source) ui[SOURCE_KEY] = options.source;
    if (options.podId) ui[POD_ID_KEY] = options.podId;
    if (options.message) ui[MESSAGE_KEY] = options.message.slice(0, 500);
    if (options.progressPct != null && Number.isFinite(options.progressPct)) {
      ui[PROGRESS_KEY] = Math.max(0, Math.min(100, options.progressPct));
    }
  }

  if (Object.keys(ui).length > 0) {
    base[UI_KEY] = ui;
  } else {
    delete base[UI_KEY];
  }

  return base;
}

export function mergeExperimentProgress(
  planJson: unknown,
  update: ExperimentProgressUpdate,
): JsonRecord {
  const base: JsonRecord = isPlainRecord(planJson) ? { ...planJson } : planJson == null ? {} : { value: planJson };
  const ui: JsonRecord = isPlainRecord(base[UI_KEY]) ? { ...(base[UI_KEY] as JsonRecord) } : {};

  ui[UPDATED_AT_KEY] = new Date().toISOString();
  if (update.source) ui[SOURCE_KEY] = update.source;
  if (update.podId !== undefined) {
    if (update.podId) ui[POD_ID_KEY] = update.podId;
    else delete ui[POD_ID_KEY];
  }
  if (update.message !== undefined) {
    if (update.message) ui[MESSAGE_KEY] = update.message.slice(0, 500);
    else delete ui[MESSAGE_KEY];
  }
  if (update.progressPct !== undefined) {
    if (update.progressPct != null && Number.isFinite(update.progressPct)) {
      ui[PROGRESS_KEY] = Math.max(0, Math.min(100, update.progressPct));
    } else {
      delete ui[PROGRESS_KEY];
    }
  }
  if (update.remainingMinutes !== undefined) {
    if (update.remainingMinutes != null && Number.isFinite(update.remainingMinutes)) {
      ui[REMAINING_MINUTES_KEY] = Math.max(0, Math.floor(update.remainingMinutes));
    } else {
      delete ui[REMAINING_MINUTES_KEY];
    }
  }

  if (Object.keys(ui).length > 0) {
    base[UI_KEY] = ui;
  } else {
    delete base[UI_KEY];
  }

  return base;
}

function finiteWholeMinutes(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
  return Math.floor(value);
}

function finiteProgress(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(100, value));
}

function parseIsoString(value: unknown) {
  if (typeof value !== 'string') return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? value : null;
}

function stringOrNull(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : null;
}

function emptyEstimate(): ExperimentEstimate {
  return {
    remainingMinutes: null,
    updatedAt: null,
    source: null,
    podId: null,
    message: null,
    progressPct: null,
  };
}

function isPlainRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
