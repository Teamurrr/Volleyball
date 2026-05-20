import type { VercelRequest, VercelResponse } from "@vercel/node";
import { initializeApp, getApps } from "firebase/app";
import {
  addDoc,
  collection,
  getDocs,
  getFirestore,
  updateDoc
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCwtjj3eIS-rFVfzZhF4QmWEHImwDpkDvA",
  authDomain: "volleyball-c0949.firebaseapp.com",
  projectId: "volleyball-c0949",
  storageBucket: "volleyball-c0949.firebasestorage.app",
  messagingSenderId: "162106430759",
  appId: "1:162106430759:web:ae4185248cdedec2b34502",
  measurementId: "G-WVG8SBY4GD"
};

const app = getApps().length ? getApps()[0]! : initializeApp(firebaseConfig);
const db = getFirestore(app);
const INFO_COLLECTION = "info";
const DAY_MS = 24 * 60 * 60 * 1000;
const HISTORY_RETENTION_MS = 31 * DAY_MS;
const MAX_HISTORY_POINTS = 6000;
const MAX_CHART_POINTS = 96;

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

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  sendCorsHeaders(res);

  try {
    if (req.method === "OPTIONS") {
      return res.status(204).end();
    }

    const infoSnapshot = await getDocs(collection(db, INFO_COLLECTION));
    const infoDoc = infoSnapshot.docs[0];
    const infoData = infoDoc?.data();
    const history = normalizeHistory(infoData?.temperatureHistory);

    if (req.method === "GET") {
      const period =
        typeof req.query.period === "string" ? req.query.period : "day";
      const now = Date.now();
      const from = period === "day" ? now - DAY_MS : now - DAY_MS;
      const filteredHistory = history.filter((entry) => entry.createdAt >= from);
      const chartPoints = downsampleHistory(filteredHistory);
      const temperatures = filteredHistory.map((entry) => entry.temperature);

      return res.status(200).json({
        success: true,
        latest: infoData
          ? {
              id: infoDoc.id,
              temperature: infoData.temperature ?? null,
              unit: infoData.temperatureUnit ?? null,
              sensorId: infoData.temperatureSensorId ?? null,
              createdAt: infoData.temperatureUpdatedAt ?? null
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

    let infoId: string;

    if (infoDoc) {
      await updateDoc(infoDoc.ref, nextData);
      infoId = infoDoc.id;
    } else {
      const createdDoc = await addDoc(collection(db, INFO_COLLECTION), {
        pass: "",
        qrcode: "",
        totalPaid: 0,
        ...nextData
      });
      infoId = createdDoc.id;
    }

    return res.status(200).json({
      success: true,
      id: infoId,
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
