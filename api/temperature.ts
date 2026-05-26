import type { VercelRequest, VercelResponse } from "@vercel/node";
import { initializeApp, getApps } from "firebase/app";
import {
  doc,
  getDoc,
  getFirestore,
  setDoc
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyC929fAMDt9rPegQWLb_veehh67Bn5dZ0s",
  authDomain: "temperaturedata-68177.firebaseapp.com",
  databaseURL: "https://temperaturedata-68177-default-rtdb.firebaseio.com",
  projectId: "temperaturedata-68177",
  storageBucket: "temperaturedata-68177.firebasestorage.app",
  messagingSenderId: "819491718849",
  appId: "1:819491718849:web:3f5b0cb01a3d30947fb640",
  measurementId: "G-ZVT9WSNQV0"
};

const app = getApps().length ? getApps()[0]! : initializeApp(firebaseConfig);
const db = getFirestore(app);
const INFO_COLLECTION = "info";
const TEMPERATURE_DOC_ID = "temperature";
const LEGACY_INFO_DOC_ID = "info";
const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
const MONTH_MS = 30 * DAY_MS;
const HALF_YEAR_MS = 183 * DAY_MS;
const HISTORY_RETENTION_MS = HALF_YEAR_MS;
const MAX_HISTORY_POINTS = 6000;
const MAX_CHART_POINTS = 96;
const VALID_PERIODS = ["day", "week", "month", "halfYear"] as const;

type ReportPeriod = (typeof VALID_PERIODS)[number];

type ParsedPayload = {
  temperature: number | null;
  unit: string | null;
  sensorId: string | null;
  raw: unknown;
};

type TemperatureHistoryEntry = {
  temperature: number;
  createdAt: number;
  unit: string;
  sensorId: string | null;
};

type ReportPoint = {
  temperature: number | null;
  createdAt: number;
  unit: string;
  sensorId: string | null;
};

const sendCorsHeaders = (res: VercelResponse) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
};

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
};

const toNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().replace(",", ".");

  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const extractFromRecord = (record: Record<string, unknown>): ParsedPayload => {
  const directTemperature =
    record.temperature ?? record.temp ?? record.value ?? record.data;

  return {
    temperature: toNumber(directTemperature),
    unit: typeof record.unit === "string" ? record.unit : null,
    sensorId:
      typeof record.sensorId === "string"
        ? record.sensorId
        : typeof record.deviceId === "string"
          ? record.deviceId
          : null,
    raw: record
  };
};

const parsePayload = (body: unknown): ParsedPayload => {
  const record = asRecord(body);

  if (record) {
    return extractFromRecord(record);
  }

  if (typeof body === "string") {
    const trimmed = body.trim();

    if (!trimmed) {
      return {
        temperature: null,
        unit: null,
        sensorId: null,
        raw: body
      };
    }

    try {
      const parsedJson = JSON.parse(trimmed) as unknown;
      const jsonRecord = asRecord(parsedJson);

      if (jsonRecord) {
        return extractFromRecord(jsonRecord);
      }
    } catch {
      // Not JSON, keep parsing below.
    }

    const params = new URLSearchParams(trimmed);
    const temperature =
      params.get("temperature") ??
      params.get("temp") ??
      params.get("value") ??
      trimmed;

    return {
      temperature: toNumber(temperature),
      unit: params.get("unit"),
      sensorId: params.get("sensorId") ?? params.get("deviceId"),
      raw: body
    };
  }

  return {
    temperature: toNumber(body),
    unit: null,
    sensorId: null,
    raw: body
  };
};

const normalizeHistory = (value: unknown): TemperatureHistoryEntry[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      const record = asRecord(entry);

      if (!record) {
        return null;
      }

      const temperature = toNumber(record.temperature);
      const createdAt = toNumber(record.createdAt);

      if (temperature === null || createdAt === null) {
        return null;
      }

      return {
        temperature,
        createdAt,
        unit: typeof record.unit === "string" ? record.unit : "C",
        sensorId: typeof record.sensorId === "string" ? record.sensorId : null
      } satisfies TemperatureHistoryEntry;
    })
    .filter((entry): entry is TemperatureHistoryEntry => entry !== null)
    .sort((left, right) => left.createdAt - right.createdAt);
};

const trimHistory = (
  history: TemperatureHistoryEntry[],
  now: number
): TemperatureHistoryEntry[] => {
  const earliestAllowed = now - HISTORY_RETENTION_MS;
  const filteredByAge = history.filter((entry) => entry.createdAt >= earliestAllowed);

  if (filteredByAge.length <= MAX_HISTORY_POINTS) {
    return filteredByAge;
  }

  return filteredByAge.slice(filteredByAge.length - MAX_HISTORY_POINTS);
};

const downsampleHistory = (
  points: TemperatureHistoryEntry[]
): TemperatureHistoryEntry[] => {
  if (points.length <= MAX_CHART_POINTS) {
    return points;
  }

  const step = (points.length - 1) / (MAX_CHART_POINTS - 1);

  return Array.from({ length: MAX_CHART_POINTS }, (_, index) => {
    const pointIndex = Math.min(
      points.length - 1,
      Math.round(index * step)
    );

    return points[pointIndex]!;
  });
};

const getPeriodWindow = (period: ReportPeriod) => {
  switch (period) {
    case "week":
      return WEEK_MS;
    case "month":
      return MONTH_MS;
    case "halfYear":
      return HALF_YEAR_MS;
    case "day":
    default:
      return DAY_MS;
  }
};

const getPeriodPointCount = (period: ReportPeriod) => {
  switch (period) {
    case "week":
      return 7;
    case "month":
      return 30;
    case "halfYear":
      return 183;
    case "day":
    default:
      return null;
  }
};

const getDayStart = (timestamp: number) => {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
};

const buildReportPoints = (
  history: TemperatureHistoryEntry[],
  period: ReportPeriod,
  now: number
): ReportPoint[] => {
  if (period === "day") {
    return downsampleHistory(history).map((entry) => ({
      temperature: entry.temperature,
      createdAt: entry.createdAt,
      unit: entry.unit,
      sensorId: entry.sensorId
    }));
  }

  const pointCount = getPeriodPointCount(period);

  if (!pointCount) {
    return [];
  }

  const dayBuckets = new Map<number, TemperatureHistoryEntry[]>();

  history.forEach((entry) => {
    const dayStart = getDayStart(entry.createdAt);
    const bucket = dayBuckets.get(dayStart) ?? [];
    bucket.push(entry);
    dayBuckets.set(dayStart, bucket);
  });

  const todayStart = getDayStart(now);

  return Array.from({ length: pointCount }, (_, index) => {
    const offset = pointCount - index - 1;
    const dayStart = todayStart - offset * DAY_MS;
    const bucket = dayBuckets.get(dayStart) ?? [];

    if (bucket.length === 0) {
      return {
        temperature: null,
        createdAt: dayStart,
        unit: "C",
        sensorId: null
      };
    }

    const average =
      bucket.reduce((sum, entry) => sum + entry.temperature, 0) / bucket.length;
    const latestEntry = bucket[bucket.length - 1]!;

    return {
      temperature: Number(average.toFixed(2)),
      createdAt: dayStart,
      unit: latestEntry.unit,
      sensorId: latestEntry.sensorId
    };
  });
};

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  sendCorsHeaders(res);

  try {
    if (req.method === "OPTIONS") {
      return res.status(204).end();
    }

    const temperatureRef = doc(db, INFO_COLLECTION, TEMPERATURE_DOC_ID);
    const legacyInfoRef = doc(db, INFO_COLLECTION, LEGACY_INFO_DOC_ID);
    const [temperatureDoc, legacyInfoDoc] = await Promise.all([
      getDoc(temperatureRef),
      getDoc(legacyInfoRef)
    ]);

    const temperatureData = temperatureDoc.exists()
      ? temperatureDoc.data()
      : legacyInfoDoc.exists()
        ? legacyInfoDoc.data()
        : undefined;
    const history = normalizeHistory(temperatureData?.temperatureHistory);

    if (req.method === "GET") {
      const rawPeriod =
        typeof req.query.period === "string" ? req.query.period : "day";
      const period = VALID_PERIODS.includes(rawPeriod as ReportPeriod)
        ? (rawPeriod as ReportPeriod)
        : "day";
      const now = Date.now();
      const from = now - getPeriodWindow(period);
      const filteredHistory = history.filter((entry) => entry.createdAt >= from);
      const chartPoints = buildReportPoints(filteredHistory, period, now);
      const temperatures = filteredHistory.map((entry) => entry.temperature);

      return res.status(200).json({
        success: true,
        latest: temperatureData
          ? {
              id: temperatureDoc.exists() ? temperatureDoc.id : legacyInfoDoc.id,
              temperature: temperatureData.temperature ?? null,
              unit: temperatureData.temperatureUnit ?? null,
              sensorId: temperatureData.temperatureSensorId ?? null,
              createdAt: temperatureData.temperatureUpdatedAt ?? null
            }
          : null,
        report: {
          period,
          from,
          to: now,
          points: chartPoints,
          count: filteredHistory.length,
          min: temperatures.length ? Math.min(...temperatures) : null,
          max: temperatures.length ? Math.max(...temperatures) : null
        }
      });
    }

    if (req.method !== "POST") {
      return res.status(405).json({
        success: false,
        error: "Method not allowed"
      });
    }

    const payload = parsePayload(req.body);

    if (payload.temperature === null) {
      return res.status(400).json({
        success: false,
        error:
          "Temperature value is missing. Send JSON like {\"temperature\": 24.6} or a plain number."
      });
    }

    const createdAt = Date.now();
    const unit = payload.unit ?? "C";
    const nextHistoryEntry: TemperatureHistoryEntry = {
      temperature: payload.temperature,
      createdAt,
      unit,
      sensorId: payload.sensorId
    };
    const nextHistory = trimHistory([...history, nextHistoryEntry], createdAt);
    const nextData = {
      temperature: payload.temperature,
      temperatureUnit: unit,
      temperatureSensorId: payload.sensorId,
      temperatureSource: "esp32",
      temperatureUpdatedAt: createdAt,
      temperatureRaw: payload.raw,
      temperatureHistory: nextHistory
    };

    await setDoc(
      temperatureRef,
      {
        ...(temperatureDoc.exists() ? temperatureDoc.data() : {}),
        ...nextData
      },
      { merge: true }
    );

    return res.status(200).json({
      success: true,
      id: TEMPERATURE_DOC_ID,
      temperature: payload.temperature,
      unit,
      sensorId: payload.sensorId,
      createdAt
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown server error";

    return res.status(500).json({
      success: false,
      error: message
    });
  }
}
