import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import "./Temperature.scss";

type TemperatureResponse = {
  success: boolean;
  latest: {
    id: string;
    temperature: number | null;
    unit: string | null;
    sensorId: string | null;
    createdAt: number | null;
  } | null;
  error?: string;
};

const REFRESH_INTERVAL_MS = 15000;

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

const formatTemperature = (value: number | null) => {
  if (value === null || Number.isNaN(value)) {
    return "--";
  }

  return value.toFixed(2);
};

const Temperature = () => {
  const [data, setData] = useState<TemperatureResponse["latest"]>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState("");

  const loadTemperature = async (showLoader = false) => {
    if (showLoader) {
      setIsLoading(true);
    } else {
      setIsRefreshing(true);
    }

    try {
      const response = await fetch("/api/temperature", {
        method: "GET",
        headers: {
          Accept: "application/json"
        }
      });

      const result = (await response.json()) as TemperatureResponse;

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Не удалось получить температуру");
      }

      setData(result.latest);
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
    void loadTemperature(true);

    const intervalId = window.setInterval(() => {
      void loadTemperature(false);
    }, REFRESH_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  return (
    <main className="temperature-page">
      <div className="temperature-shell">
        <header className="temperature-header">
          <div>
            <p className="temperature-kicker">Датчик ESP32</p>
            <h1>Температура зала</h1>
            <p className="temperature-subtitle">
              Страница автоматически обновляет последнее значение, которое пришло на сервер с
              микросхемы.
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
              <strong>{isRefreshing ? "Идет обновление" : "Автообновление каждые 15 сек"}</strong>
            </article>
          </div>
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
              Сервер отвечает нормально, и последнее значение уже доступно на обычной странице.
            </p>
          )}
        </section>
      </div>
    </main>
  );
};

export default Temperature;
