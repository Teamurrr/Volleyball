import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import "./Reports.scss";

import { useAttendanceReports } from "../../features/reports/hook";
import {
  getAttendanceLabel,
  normalizeAttendanceStatus,
  type AttendanceStatus
} from "../../entities/player";

type PlayerTimelineEntry = {
  reportId: string;
  createdAt: number;
  willCome: AttendanceStatus;
  paid: boolean;
};

type PlayerAttendanceReport = {
  playerId: string;
  name: string;
  position: string;
  elo: number;
  counts: Record<AttendanceStatus, number>;
  timeline: PlayerTimelineEntry[];
};

type SnapshotPoint = {
  reportId: string;
  createdAt: number;
  counts: Record<AttendanceStatus, number>;
};

const CHART_COLORS: Record<AttendanceStatus, string> = {
  yes: "#22c55e",
  maybe: "#f59e0b",
  no: "#ef4444"
};

const STATUS_LEVEL: Record<AttendanceStatus, number> = {
  no: 0,
  maybe: 1,
  yes: 2
};

const formatShortDate = (value: number) =>
  new Date(value).toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit"
  });

const formatLongDate = (value: number) =>
  new Date(value).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });

const buildLinePath = (values: number[], width: number, height: number, maxValue: number) => {
  if (values.length === 0) {
    return "";
  }

  const safeMax = Math.max(maxValue, 1);
  const stepX = values.length === 1 ? 0 : width / (values.length - 1);

  return values
    .map((value, index) => {
      const x = stepX * index;
      const y = height - (value / safeMax) * height;
      return `${index === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");
};

const getStatusPath = (timeline: PlayerTimelineEntry[], width: number, height: number) =>
  buildLinePath(
    timeline.map((entry) => STATUS_LEVEL[entry.willCome]),
    width,
    height,
    2
  );

const Reports = () => {
  const { reports, reportsError } = useAttendanceReports();
  const [search, setSearch] = useState("");

  const playerReports = useMemo(() => {
    const playersMap = new Map<string, PlayerAttendanceReport>();

    [...reports].reverse().forEach((report) => {
      report.players.forEach((player) => {
        const normalizedStatus = normalizeAttendanceStatus(player.willCome);
        const current =
          playersMap.get(player.playerId) ??
          ({
            playerId: player.playerId,
            name: player.name,
            position: player.position,
            elo: player.elo,
            counts: {
              yes: 0,
              maybe: 0,
              no: 0
            },
            timeline: []
          } satisfies PlayerAttendanceReport);

        current.name = player.name;
        current.position = player.position;
        current.elo = player.elo;
        current.counts[normalizedStatus] += 1;
        current.timeline.push({
          reportId: report.id,
          createdAt: report.createdAt,
          willCome: normalizedStatus,
          paid: player.paid
        });

        playersMap.set(player.playerId, current);
      });
    });

    return [...playersMap.values()].sort((left, right) => {
      const totalDiff = right.timeline.length - left.timeline.length;
      if (totalDiff !== 0) {
        return totalDiff;
      }

      return left.name.localeCompare(right.name);
    });
  }, [reports]);

  const filteredReports = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    if (!normalizedSearch) {
      return playerReports;
    }

    return playerReports.filter((player) =>
      `${player.name} ${player.position}`.toLowerCase().includes(normalizedSearch)
    );
  }, [playerReports, search]);

  const totals = useMemo(
    () =>
      reports.reduce(
        (acc, report) => {
          report.players.forEach((player) => {
            const status = normalizeAttendanceStatus(player.willCome);
            acc[status] += 1;
          });

          return acc;
        },
        {
          yes: 0,
          maybe: 0,
          no: 0
        } as Record<AttendanceStatus, number>
      ),
    [reports]
  );

  const snapshotSeries = useMemo<SnapshotPoint[]>(
    () =>
      [...reports]
        .reverse()
        .map((report) => {
          const counts: Record<AttendanceStatus, number> = {
            yes: 0,
            maybe: 0,
            no: 0
          };

          report.players.forEach((player) => {
            counts[normalizeAttendanceStatus(player.willCome)] += 1;
          });

          return {
            reportId: report.id,
            createdAt: report.createdAt,
            counts
          };
        }),
    [reports]
  );

  const globalChart = useMemo(() => {
    const width = 720;
    const height = 240;
    const maxValue =
      snapshotSeries.reduce((max, item) => {
        const localMax = Math.max(item.counts.yes, item.counts.maybe, item.counts.no);
        return Math.max(max, localMax);
      }, 0) || 1;

    return {
      width,
      height,
      maxValue,
      yesPath: buildLinePath(
        snapshotSeries.map((item) => item.counts.yes),
        width,
        height,
        maxValue
      ),
      maybePath: buildLinePath(
        snapshotSeries.map((item) => item.counts.maybe),
        width,
        height,
        maxValue
      ),
      noPath: buildLinePath(
        snapshotSeries.map((item) => item.counts.no),
        width,
        height,
        maxValue
      )
    };
  }, [snapshotSeries]);

  const exportToPdf = () => {
    window.print();
  };

  return (
    <main className="reports-page">
      <div className="reports-shell">
        <header className="reports-header">
          <div>
            <p className="reports-kicker">Аналитика посещаемости</p>
            <h1>Отчеты</h1>
            <p className="reports-subtitle">
              Здесь сохраняются срезы статусов игроков из админки. Можно смотреть динамику
              посещаемости по всем игрокам и сохранять страницу в PDF.
            </p>
          </div>

          <div className="reports-header-actions">
            <button type="button" className="reports-print-button" onClick={exportToPdf}>
              Сохранить в PDF
            </button>
            <Link className="reports-link" to="/adminx">
              Админка
            </Link>
            <Link className="reports-link" to="/">
              Главная
            </Link>
          </div>
        </header>

        <section className="reports-summary-grid">
          <article className="reports-summary-card">
            <span>Снимков</span>
            <strong>{reports.length}</strong>
          </article>
          <article className="reports-summary-card">
            <span>Подтвердили</span>
            <strong>{totals.yes}</strong>
          </article>
          <article className="reports-summary-card">
            <span>Возможно</span>
            <strong>{totals.maybe}</strong>
          </article>
          <article className="reports-summary-card">
            <span>Не придут</span>
            <strong>{totals.no}</strong>
          </article>
        </section>

        {snapshotSeries.length > 0 && (
          <section className="reports-overview-card">
            <div className="reports-overview-header">
              <div>
                <h2>Общий график по снимкам</h2>
                <p>Каждая точка показывает, сколько игроков было в каждом статусе на момент сохранения.</p>
              </div>

              <div className="reports-legend">
                <span className="reports-legend-item reports-legend-yes">Да</span>
                <span className="reports-legend-item reports-legend-maybe">Возможно</span>
                <span className="reports-legend-item reports-legend-no">Нет</span>
              </div>
            </div>

            <div className="overview-chart-wrap">
              <div className="overview-chart-y-axis">
                <span>{globalChart.maxValue}</span>
                <span>{Math.round(globalChart.maxValue / 2)}</span>
                <span>0</span>
              </div>

              <div className="overview-chart-main">
                <svg
                  className="overview-chart"
                  viewBox={`0 0 ${globalChart.width} ${globalChart.height}`}
                  role="img"
                  aria-label="Общий график посещаемости по снимкам"
                  preserveAspectRatio="none"
                >
                  {[0, 0.5, 1].map((ratio) => {
                    const y = globalChart.height - globalChart.height * ratio;
                    return (
                      <line
                        key={ratio}
                        x1="0"
                        y1={y}
                        x2={globalChart.width}
                        y2={y}
                        className="overview-grid-line"
                      />
                    );
                  })}

                  <path d={globalChart.yesPath} className="overview-line overview-line-yes" />
                  <path d={globalChart.maybePath} className="overview-line overview-line-maybe" />
                  <path d={globalChart.noPath} className="overview-line overview-line-no" />

                  {snapshotSeries.map((item, index) => {
                    const x =
                      snapshotSeries.length === 1
                        ? globalChart.width / 2
                        : (globalChart.width / (snapshotSeries.length - 1)) * index;

                    return (
                      <g key={item.reportId}>
                        <circle
                          cx={x}
                          cy={
                            globalChart.height -
                            (item.counts.yes / globalChart.maxValue) * globalChart.height
                          }
                          r="4"
                          fill={CHART_COLORS.yes}
                        >
                          <title>
                            {`${formatLongDate(item.createdAt)} · Да: ${item.counts.yes}`}
                          </title>
                        </circle>
                        <circle
                          cx={x}
                          cy={
                            globalChart.height -
                            (item.counts.maybe / globalChart.maxValue) * globalChart.height
                          }
                          r="4"
                          fill={CHART_COLORS.maybe}
                        >
                          <title>
                            {`${formatLongDate(item.createdAt)} · Возможно: ${item.counts.maybe}`}
                          </title>
                        </circle>
                        <circle
                          cx={x}
                          cy={
                            globalChart.height -
                            (item.counts.no / globalChart.maxValue) * globalChart.height
                          }
                          r="4"
                          fill={CHART_COLORS.no}
                        >
                          <title>
                            {`${formatLongDate(item.createdAt)} · Нет: ${item.counts.no}`}
                          </title>
                        </circle>
                      </g>
                    );
                  })}
                </svg>

                <div className="overview-chart-dates">
                  {snapshotSeries.map((item) => (
                    <span key={item.reportId}>{formatShortDate(item.createdAt)}</span>
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}

        <section className="reports-toolbar">
          <input
            className="reports-search"
            placeholder="Поиск по игроку или амплуа"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <p className="reports-toolbar-note">Игроков в отчете: {filteredReports.length}</p>
        </section>

        {reportsError && <p className="reports-empty">{reportsError}</p>}

        {!reportsError && reports.length === 0 && (
          <div className="reports-empty-card">
            <h2>Отчетов пока нет</h2>
            <p>Зайди в админку и нажми кнопку фиксации, чтобы сохранить первый срез.</p>
          </div>
        )}

        <section className="reports-list">
          {filteredReports.map((player) => {
            const totalSnapshots = player.timeline.length;
            const attendanceRate =
              totalSnapshots > 0
                ? Math.round((player.counts.yes / totalSnapshots) * 100)
                : 0;
            const playerChartWidth = Math.max(260, player.timeline.length * 72);
            const playerChartHeight = 150;
            const statusPath = getStatusPath(
              player.timeline,
              playerChartWidth - 32,
              playerChartHeight - 24
            );

            return (
              <article key={player.playerId} className="player-report-card">
                <div className="player-report-header">
                  <div>
                    <h2>{player.name}</h2>
                    <p>
                      {player.position || "Без амплуа"}
                      {" · "}ELO: {player.elo}
                    </p>
                  </div>

                  <div className="player-report-badges">
                    <span className="player-report-badge">Снимков: {totalSnapshots}</span>
                    <span className="player-report-badge">Посещаемость: {attendanceRate}%</span>
                  </div>
                </div>

                <div className="player-report-stats">
                  <div className="player-stat player-stat-yes">
                    <span>{getAttendanceLabel("yes")}</span>
                    <strong>{player.counts.yes}</strong>
                  </div>
                  <div className="player-stat player-stat-maybe">
                    <span>{getAttendanceLabel("maybe")}</span>
                    <strong>{player.counts.maybe}</strong>
                  </div>
                  <div className="player-stat player-stat-no">
                    <span>{getAttendanceLabel("no")}</span>
                    <strong>{player.counts.no}</strong>
                  </div>
                </div>

                <div className="player-line-chart-wrap">
                  <div className="player-line-chart-axis">
                    <span>Да</span>
                    <span>Возможно</span>
                    <span>Нет</span>
                  </div>

                  <div className="player-line-chart-main">
                    <svg
                      className="player-line-chart"
                      viewBox={`0 0 ${playerChartWidth} ${playerChartHeight}`}
                      role="img"
                      aria-label={`График посещаемости ${player.name}`}
                      preserveAspectRatio="none"
                    >
                      {[0, 0.5, 1].map((ratio) => {
                        const y = 12 + (playerChartHeight - 24) * ratio;
                        return (
                          <line
                            key={ratio}
                            x1="16"
                            y1={y}
                            x2={playerChartWidth}
                            y2={y}
                            className="player-line-grid"
                          />
                        );
                      })}

                      <path
                        d={statusPath}
                        transform="translate(16 12)"
                        className="player-line-path"
                      />

                      {player.timeline.map((entry, index) => {
                        const x =
                          player.timeline.length === 1
                            ? playerChartWidth / 2
                            : 16 +
                              ((playerChartWidth - 32) / (player.timeline.length - 1)) * index;
                        const y =
                          12 +
                          (playerChartHeight - 24) -
                          (STATUS_LEVEL[entry.willCome] / 2) * (playerChartHeight - 24);

                        return (
                          <circle
                            key={entry.reportId}
                            cx={x}
                            cy={y}
                            r="5"
                            fill={CHART_COLORS[entry.willCome]}
                            className="player-line-point"
                          >
                            <title>
                              {`${formatLongDate(entry.createdAt)} · ${getAttendanceLabel(
                                entry.willCome
                              )}${entry.paid ? " · Оплачено" : ""}`}
                            </title>
                          </circle>
                        );
                      })}
                    </svg>

                    <div className="player-line-chart-dates">
                      {player.timeline.map((entry) => (
                        <span key={entry.reportId}>{formatShortDate(entry.createdAt)}</span>
                      ))}
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      </div>
    </main>
  );
};

export default Reports;
