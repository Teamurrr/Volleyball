import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import "./Temperature.scss";

type TemperaturePoint = {
  temperature: number | null;
  createdAt: number;
  unit: string;
  sensorId: string | null;
};

type TemperatureResponse = {
  success: boolean;
  latest: {
    id: string;
    temperature: number | null;
    unit: string | null;
    sensorId: string | null;
    createdAt: number | null;
  } | null;
  report?: {
    period: string;
    from: number;
    to: number;
    points: TemperaturePoint[];
    count: number;
    min: number | null;
    max: number | null;
  };
  error?: string;
};

const PERIOD_OPTIONS = [
  { value: "day", label: "День", heading: "За последние 24 часа" },
  { value: "week", label: "Неделя", heading: "За последние 7 дней" },
  { value: "month", label: "Месяц", heading: "За последние 30 дней" },
  { value: "halfYear", label: "Полгода", heading: "За последние 6 месяцев" }
] as const;

type ReportPeriod = (typeof PERIOD_OPTIONS)[number]["value"];

const REFRESH_INTERVAL_MS = 5000;
const CHART_WIDTH = 960;
const CHART_HEIGHT = 280;
const CHART_PADDING_X = 24;
const CHART_PADDING_Y = 20;

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
  const [data, setData] = useState<TemperatureResponse["latest"]>(null);
  const [report, setReport] = useState<TemperatureResponse["report"]>();
  const [selectedPeriod, setSelectedPeriod] = useState<ReportPeriod>("day");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState("");
  const isAlertLoopRunningRef = useRef(false);
  const selectedPeriodRef = useRef<ReportPeriod>("day");

  const fetchTemperature = async (period: ReportPeriod) => {
    const response = await fetch(`/api/temperature?period=${period}`, {
      method: "GET",
      headers: {
        Accept: "application/json"
      }
    });

    const result = (await response.json()) as TemperatureResponse;

    if (!response.ok || !result.success) {
      throw new Error(result.error || "Не удалось получить температуру");
    }

    return result;
  };

  const loadTemperature = async (showLoader = false, period = selectedPeriodRef.current) => {
    if (showLoader) {
      setIsLoading(true);
    } else {
      setIsRefreshing(true);
    }

    try {
      const result = await fetchTemperature(period);
      setData(result.latest);
      setReport(result.report);
      setError("");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Не удалось получить температуру"
      );
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    selectedPeriodRef.current = selectedPeriod;
    void loadTemperature(true, selectedPeriod);

    return undefined;
  }, [selectedPeriod]);

  useEffect(() => {
    if (selectedPeriodRef.current !== selectedPeriod) {
      selectedPeriodRef.current = selectedPeriod;
    }

    const intervalId = window.setInterval(() => {
      void loadTemperature(false, selectedPeriodRef.current);
    }, REFRESH_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
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

        try {
          const result = await fetchTemperature(selectedPeriodRef.current);
          setData(result.latest);
          setReport(result.report);
          setError("");
          nextAlert = getTemperatureAlert(result.latest?.temperature ?? null);
        } catch (requestError) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : "Не удалось получить температуру"
          );
          nextAlert = null;
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

    const visiblePoints = points.filter(
      (point) => point.temperature !== null
    );

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

  return (
    <main className="temperature-page">
      <div className="temperature-shell">
        <header className="temperature-header">
          <div>
            <p className="temperature-kicker">Датчик ESP32</p>
            <h1>Температура зала</h1>
            <p className="temperature-subtitle">
              Страница автоматически обновляет последнее значение, строит график температуры за
              день и показывает минимальные и максимальные значения за выбранный интервал.
            </p>
          </div>

          <div className="temperature-actions">
            <button
              type="button"
              className="temperature-refresh-button"
              onClick={() => void loadTemperature(false)}
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
              <strong>{isRefreshing ? "Идет обновление" : "Автообновление каждые 5 сек"}</strong>
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
              <svg
                className="temperature-chart"
                viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
                role="img"
                aria-label="График температуры за день"
                preserveAspectRatio="none"
              >
                {[0, 0.5, 1].map((ratio) => {
                  const y =
                    CHART_PADDING_Y +
                    (CHART_HEIGHT - CHART_PADDING_Y * 2) * ratio;

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
                      : CHART_PADDING_X +
                        (drawableWidth / (chart.points.length - 1)) * index;
                  const y =
                    CHART_HEIGHT -
                    CHART_PADDING_Y -
                    ((point.temperature - chart.minValue) / safeRange) *
                      drawableHeight;

                  return (
                    <circle
                      key={`${point.createdAt}-${index}`}
                      cx={x}
                      cy={y}
                      r="4"
                      className="temperature-chart-point"
                    >
                      <title>
                        {`${selectedPeriod === "day" ? formatShortTime(point.createdAt) : formatShortDate(point.createdAt)} - ${point.temperature.toFixed(2)} ${point.unit}`}
                      </title>
                    </circle>
                  );
                })}
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
            </div>
          ) : (
            <p className="temperature-chart-empty">
              Пока недостаточно данных для построения графика за день.
            </p>
          )}
        </section>

        <section className="temperature-status-card">
          {isLoading ? (
            <p className="temperature-status-text">Загружаем данные с датчика...</p>
          ) : error ? (
            <p className="temperature-status-text temperature-status-error">{error}</p>
          ) : data?.temperature === null || data?.temperature === undefined ? (
            <p className="temperature-status-text">
              Данные пока не приходили. Отправь первое значение с ESP32.
            </p>
          ) : (
            <p className="temperature-status-text">
              Сервер отвечает нормально, и дневной отчёт по температуре уже строится на основе
              сохранённой истории.
            </p>
          )}
        </section>
      </div>
    </main>
  );
};

export default Temperature;
