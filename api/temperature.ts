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

type ParsedPayload = {
  temperature: number | null;
  unit: string | null;
  sensorId: string | null;
  raw: unknown;
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

    if (req.method === "GET") {
      const latest = infoDoc?.data();

      return res.status(200).json({
        success: true,
        latest: latest
          ? {
              id: infoDoc.id,
              temperature: latest.temperature ?? null,
              unit: latest.temperatureUnit ?? null,
              sensorId: latest.temperatureSensorId ?? null,
              createdAt: latest.temperatureUpdatedAt ?? null
            }
          : null
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
    const nextData = {
      temperature: payload.temperature,
      temperatureUnit: payload.unit ?? "C",
      temperatureSensorId: payload.sensorId,
      temperatureSource: "esp32",
      temperatureUpdatedAt: createdAt,
      temperatureRaw: payload.raw
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
      unit: payload.unit ?? "C",
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
