import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { get, onValue, orderByKey, query, ref, startAt } from "firebase/database";
import { database } from "../../app/firebase";
import "./Temperature.scss";

type TemperaturePoint = {
  temperature: number | null;
  createdAt: number;
  unit: string;
  sensorId: string | null;
};

type LatestTemperature = {
  id: string;
  temperature: number | null;
  unit: string | null;
  sensorId: string | null;
  createdAt: number | null;
} | null;

type ReportData = {
  period: ReportPeriod;
  from: number;
  to: number;
  points: TemperaturePoint[];
  count: number;
  min: number | null;
  max: number | null;
};

type FirebaseTemperatureNode = {
  device?: string;
  temperature?: number | null;
  updated_at?: string;
};

type ChartTooltip = {
  x: number;
  y: number;
  label: string;
  value: string;
};

const PERIOD_OPTIONS = [
  { value: "day", label: "День", heading: "За последние 24 часа" },
  { value: "week", label: "Неделя", heading: "За последние 7 дней" },
  { value: "month", label: "Месяц", heading: "За последние 30 дней" },
  { value: "halfYear", label: "Полгода", heading: "За последние 6 месяцев" }
] as const;

type ReportPeriod = (typeof PERIOD_OPTIONS)[number]["value"];

const CHART_WIDTH = 1000;
const CHART_HEIGHT = 280;
const CHART_PADDING_X = 56;
const CHART_PADDING_Y = 20;
const SENSOR_ID = "esp32";
const SENSOR_PATH = `sensors/${SENSOR_ID}`;
const HISTORY_PATH = `history/${SENSOR_ID}`;

const formatUpdatedAt = (value: number | null) => {
  if (!value) {
    return "Нет данных";
  }

  return new Date(value).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
};

const formatShortTime = (value: number) =>
  new Date(value).toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit"
  });

const formatShortDate = (value: number) =>
  new Date(value).toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit"
  });

const formatTemperature = (value: number | null) => {
  if (value === null || Number.isNaN(value)) {
    return "--";
  }

  return value.toFixed(2);
};

const getTemperatureAlert = (value: number | null) => {
  if (value === null || Number.isNaN(value)) {
    return null;
  }

  if (value > 40) {
    return {
      title: "Слишком жарко",
      message: "Клиентам жарко."
    } as const;
  }

  if (value < 22) {
    return {
      title: "Слишком холодно",
      message: "Клиенты заболеют."
    } as const;
  }

  return null;
};

const getPeriodStart = (period: ReportPeriod) => {
  const now = new Date();

  switch (period) {
    case "day":
      now.setHours(now.getHours() - 24);
      break;
    case "week":
      now.setDate(now.getDate() - 7);
      break;
    case "month":
      now.setDate(now.getDate() - 30);
      break;
    case "halfYear":
      now.setMonth(now.getMonth() - 6);
      break;
  }

  return now;
};

const parseIsoDate = (value?: string | null) => {
  if (!value) {
    return null;
  }

  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
};

const mapLatestData = (raw: FirebaseTemperatureNode | null): LatestTemperature => {
  if (!raw) {
    return null;
  }

  return {
    id: SENSOR_ID,
    temperature: typeof raw.temperature === "number" ? raw.temperature : null,
    unit: "C",
    sensorId: raw.device || SENSOR_ID.toUpperCase(),
    createdAt: parseIsoDate(raw.updated_at)
  };
};

const mapHistoryPoint = (key: string, raw: FirebaseTemperatureNode): TemperaturePoint | null => {
  const createdAt = parseIsoDate(raw.updated_at || key);

  if (!createdAt) {
    return null;
  }

  return {
    temperature: typeof raw.temperature === "number" ? raw.temperature : null,
    createdAt,
    unit: "C",
    sensorId: raw.device || SENSOR_ID.toUpperCase()
  };
};

const buildChartPath = (
  points: TemperaturePoint[],
  minValue: number,
  maxValue: number
) => {
  if (points.length === 0) {
    return "";
  }

  const drawableWidth = CHART_WIDTH - CHART_PADDING_X * 2;
  const drawableHeight = CHART_HEIGHT - CHART_PADDING_Y * 2;
  const safeRange = Math.max(maxValue - minValue, 1);
  const stepX = points.length === 1 ? 0 : drawableWidth / (points.length - 1);

  return points
    .map((point, index) => {
      if (point.temperature === null) {
        return "";
      }

      const x = CHART_PADDING_X + stepX * index;
      const y =
        CHART_HEIGHT -
        CHART_PADDING_Y -
        ((point.temperature - minValue) / safeRange) * drawableHeight;

      const previousPoint = points[index - 1];
      const command =
        index === 0 || previousPoint?.temperature === null ? "M" : "L";

      return `${command} ${x} ${y}`;
    })
    .filter(Boolean)
    .join(" ");
};

const Temperature = () => {
  const [data, setData] = useState<LatestTemperature>(null);
  const [report, setReport] = useState<ReportData>();
  const [selectedPeriod, setSelectedPeriod] = useState<ReportPeriod>("day");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [tooltip, setTooltip] = useState<ChartTooltip | null>(null);
  const isAlertLoopRunningRef = useRef(false);

  const loadHistory = async (period: ReportPeriod, showLoader = false) => {
    if (showLoader) {
      setIsLoading(true);
    } else {
      setIsRefreshing(true);
    }

    try {
      const fromDate = getPeriodStart(period);
      const fromIso = fromDate.toISOString();
      const to = Date.now();

      const historyQuery = query(ref(database, HISTORY_PATH), orderByKey(), startAt(fromIso));
      const snapshot = await get(historyQuery);
      const raw = snapshot.val() as Record<string, FirebaseTemperatureNode> | null;

      const points = raw
        ? Object.entries(raw)
            .map(([key, value]) => mapHistoryPoint(key, value))
            .filter((point): point is TemperaturePoint => point !== null)
            .sort((a, b) => a.createdAt - b.createdAt)
        : [];

      const values = points
        .map((point) => point.temperature)
        .filter((value): value is number => value !== null);

      setReport({
        period,
        from: fromDate.getTime(),
        to,
        points,
        count: points.length,
        min: values.length ? Math.min(...values) : null,
        max: values.length ? Math.max(...values) : null
      });

      setError("");
    } catch {
      setError("Не удалось получить историю температуры");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    const sensorRef = ref(database, SENSOR_PATH);

    const unsubscribe = onValue(
      sensorRef,
      (snapshot) => {
        const raw = snapshot.val() as FirebaseTemperatureNode | null;
        setData(mapLatestData(raw));
        setError("");
        setIsLoading(false);
      },
      () => {
        setError("Не удалось получить текущее значение температуры");
        setIsLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    void loadHistory(selectedPeriod, true);
  }, [selectedPeriod]);

  useEffect(() => {
    if (isLoading || error || isAlertLoopRunningRef.current) {
      return;
    }

    const initialAlert = getTemperatureAlert(data?.temperature ?? null);

    if (!initialAlert) {
      return;
    }

    isAlertLoopRunningRef.current = true;

    void (async () => {
      let nextAlert: ReturnType<typeof getTemperatureAlert> = initialAlert;

      while (nextAlert) {
        window.alert(`${nextAlert.title}. ${nextAlert.message}`);
        nextAlert = getTemperatureAlert(data?.temperature ?? null);
        if (nextAlert) {
          break;
        }
      }

      isAlertLoopRunningRef.current = false;
    })();
  }, [data, isLoading, error]);

  const chart = useMemo(() => {
    const points = report?.points ?? [];
    const latestTemperature = data?.temperature ?? null;
    const minValue =
      report?.min ?? (latestTemperature !== null ? latestTemperature : null);
    const maxValue =
      report?.max ?? (latestTemperature !== null ? latestTemperature : null);

    const visiblePoints = points.filter((point) => point.temperature !== null);

    if (visiblePoints.length === 0 || minValue === null || maxValue === null) {
      return null;
    }

    const paddedMin = Math.floor((minValue - 1) * 10) / 10;
    const paddedMax = Math.ceil((maxValue + 1) * 10) / 10;
    const path = buildChartPath(points, paddedMin, paddedMax);

    return {
      points,
      path,
      minValue: paddedMin,
      maxValue: paddedMax
    };
  }, [data?.temperature, report]);

  const selectedPeriodOption =
    PERIOD_OPTIONS.find((option) => option.value === selectedPeriod) ??
    PERIOD_OPTIONS[0];

  const xAxisLabels = useMemo(() => {
    if (!chart || chart.points.length === 0) {
      return [];
    }

    const labelCount = selectedPeriod === "day" ? 4 : 5;
    const lastIndex = chart.points.length - 1;
    const drawableWidth = CHART_WIDTH - CHART_PADDING_X * 2;

    return Array.from({ length: labelCount }, (_, index) => {
      const ratio = index / (labelCount - 1);
      const pointIndex = Math.round(lastIndex * ratio);
      const point = chart.points[pointIndex]!;

      return {
        x:
          chart.points.length === 1
            ? CHART_WIDTH / 2
            : CHART_PADDING_X + (drawableWidth / lastIndex) * pointIndex,
        label:
          selectedPeriod === "day"
            ? formatShortTime(point.createdAt)
            : formatShortDate(point.createdAt)
      };
    });
  }, [chart, selectedPeriod]);

  return (
    <main className="temperature-page">
      <div className="temperature-shell">
        <header className="temperature-header">
          <div>
            <p className="temperature-kicker">Датчик ESP32</p>
            <h1>Температура зала</h1>
            <p className="temperature-subtitle">
              Страница читает текущее значение из Firebase, строит график по `history/esp32`
              и показывает минимальные и максимальные значения за выбранный интервал.
            </p>
          </div>

          <div className="temperature-actions">
            <button
              type="button"
              className="temperature-refresh-button"
              onClick={() => void loadHistory(selectedPeriod, false)}
              disabled={isRefreshing}
            >
              {isRefreshing ? "Обновляем..." : "Обновить"}
            </button>
            <Link className="temperature-link" to="/">
              Главная
            </Link>
          </div>
        </header>

        <section className="temperature-hero-card">
          <div className="temperature-reading-block">
            <p className="temperature-reading-label">Текущее значение</p>
            <div className="temperature-reading">
              <strong>{formatTemperature(data?.temperature ?? null)}</strong>
              <span>{data?.unit || "C"}</span>
            </div>
          </div>

          <div className="temperature-meta-grid">
            <article className="temperature-meta-card">
              <span>Последнее обновление</span>
              <strong>{formatUpdatedAt(data?.createdAt ?? null)}</strong>
            </article>
            <article className="temperature-meta-card">
              <span>Источник</span>
              <strong>{data?.sensorId || "ESP32"}</strong>
            </article>
            <article className="temperature-meta-card">
              <span>Режим</span>
              <strong>{isRefreshing ? "Идет обновление" : "Live из Firebase"}</strong>
            </article>
          </div>
        </section>

        <section className="temperature-summary-grid">
          <article className="temperature-summary-card">
            <span>Интервал</span>
            <strong>{selectedPeriodOption.label}</strong>
          </article>
          <article className="temperature-summary-card">
            <span>Минимум</span>
            <strong>{formatTemperature(report?.min ?? null)} C</strong>
          </article>
          <article className="temperature-summary-card">
            <span>Максимум</span>
            <strong>{formatTemperature(report?.max ?? null)} C</strong>
          </article>
          <article className="temperature-summary-card">
            <span>Точек</span>
            <strong>{report?.points.length ?? 0}</strong>
          </article>
        </section>

        <section className="temperature-chart-card">
          <div className="temperature-chart-header">
            <div>
              <p className="temperature-chart-kicker">График температуры</p>
              <h2>{selectedPeriodOption.heading}</h2>
            </div>
          </div>

          <div className="temperature-period-switcher" role="tablist" aria-label="Период графика">
            {PERIOD_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={
                  option.value === selectedPeriod
                    ? "temperature-period-button temperature-period-button-active"
                    : "temperature-period-button"
                }
                onClick={() => setSelectedPeriod(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>

          {chart ? (
            <div className="temperature-chart-wrap">
              <div className="temperature-chart-axis-label temperature-chart-axis-label-y">
                Температура, °C
              </div>
              <svg
                className="temperature-chart"
                viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
                role="img"
                aria-label="График температуры за выбранный период"
                preserveAspectRatio="none"
              >
                {[0, 0.5, 1].map((ratio) => {
                  const y = CHART_PADDING_Y + (CHART_HEIGHT - CHART_PADDING_Y * 2) * ratio;

                  return (
                    <line
                      key={ratio}
                      x1={CHART_PADDING_X}
                      y1={y}
                      x2={CHART_WIDTH - CHART_PADDING_X}
                      y2={y}
                      className="temperature-chart-grid"
                    />
                  );
                })}

                {[chart.maxValue, (chart.maxValue + chart.minValue) / 2, chart.minValue].map(
                  (value, index) => {
                    const ratio = index / 2;
                    const y = CHART_PADDING_Y + (CHART_HEIGHT - CHART_PADDING_Y * 2) * ratio;

                    return (
                      <text
                        key={`${value}-${index}`}
                        x={CHART_PADDING_X - 12}
                        y={y + 4}
                        textAnchor="end"
                        className="temperature-chart-y-label"
                      >
                        {value.toFixed(1)}
                      </text>
                    );
                  }
                )}

                <path d={chart.path} className="temperature-chart-line" />

                {chart.points.map((point, index) => {
                  if (point.temperature === null) {
                    return null;
                  }

                  const drawableWidth = CHART_WIDTH - CHART_PADDING_X * 2;
                  const drawableHeight = CHART_HEIGHT - CHART_PADDING_Y * 2;
                  const safeRange = Math.max(chart.maxValue - chart.minValue, 1);
                  const x =
                    chart.points.length === 1
                      ? CHART_WIDTH / 2
                      : CHART_PADDING_X + (drawableWidth / (chart.points.length - 1)) * index;
                  const y =
                    CHART_HEIGHT -
                    CHART_PADDING_Y -
                    ((point.temperature - chart.minValue) / safeRange) * drawableHeight;

                  const label =
                    selectedPeriod === "day"
                      ? formatShortTime(point.createdAt)
                      : formatShortDate(point.createdAt);
                  const value = `${point.temperature.toFixed(2)} ${point.unit}`;

                  return (
                    <circle
                      key={`${point.createdAt}-${index}`}
                      cx={x}
                      cy={y}
                      r="5"
                      className="temperature-chart-point"
                      onMouseEnter={() => setTooltip({ x, y, label, value })}
                      onMouseMove={() => setTooltip({ x, y, label, value })}
                      onMouseLeave={() => setTooltip(null)}
                    />
                  );
                })}

                {xAxisLabels.map((item, index) => (
                  <text
                    key={`${item.label}-${index}`}
                    x={item.x}
                    y={CHART_HEIGHT - 2}
                    textAnchor="middle"
                    className="temperature-chart-x-label"
                  >
                    {item.label}
                  </text>
                ))}

                {tooltip && (
                  <g
                    transform={`translate(${Math.min(tooltip.x + 12, CHART_WIDTH - 140)} ${Math.max(
                      tooltip.y - 56,
                      16
                    )})`}
                  >
                    <rect
                      width="128"
                      height="46"
                      rx="12"
                      className="temperature-chart-tooltip-box"
                    />
                    <text x="12" y="18" className="temperature-chart-tooltip-label">
                      {tooltip.label}
                    </text>
                    <text x="12" y="34" className="temperature-chart-tooltip-value">
                      {tooltip.value}
                    </text>
                  </g>
                )}
              </svg>

              <div className="temperature-chart-footer">
                <span>
                  {report
                    ? selectedPeriod === "day"
                      ? formatShortTime(report.from)
                      : formatShortDate(report.from)
                    : "--"}
                </span>
                <span>
                  {report
                    ? selectedPeriod === "day"
                      ? formatShortTime(report.to)
                      : formatShortDate(report.to)
                    : "--"}
                </span>
              </div>
              <div className="temperature-chart-axis-label temperature-chart-axis-label-x">
                {selectedPeriod === "day" ? "Время" : "Дата"}
              </div>
            </div>
          ) : (
            <p className="temperature-chart-empty">
              Пока недостаточно данных для построения графика.
            </p>
          )}
        </section>

        <section className="temperature-status-card">
          {isLoading ? (
            <p className="temperature-status-text">Загружаем данные с Firebase...</p>
          ) : error ? (
            <p className="temperature-status-text temperature-status-error">{error}</p>
          ) : data?.temperature === null || data?.temperature === undefined ? (
            <p className="temperature-status-text">
              Данные пока не приходили. Отправь первое значение с ESP32.
            </p>
          ) : (
            <p className="temperature-status-text">
              Firebase отвечает нормально, и график строится на основе `history/esp32`.
            </p>
          )}
        </section>
      </div>
    </main>
  );
};

export default Temperature;
