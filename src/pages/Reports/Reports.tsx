import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import "./Reports.scss";

import { useAttendanceReports } from "../../features/reports/hook";

const formatReportDate = (value: number) =>
  new Date(value).toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });

const Reports = () => {
  const { reports, reportsError } = useAttendanceReports();
  const [printReportId, setPrintReportId] = useState<string | null>(null);

  useEffect(() => {
    const resetPrintReport = () => setPrintReportId(null);

    window.addEventListener("afterprint", resetPrintReport);
    return () => window.removeEventListener("afterprint", resetPrintReport);
  }, []);

  const printSingleReport = (reportId: string) => {
    setPrintReportId(reportId);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => window.print());
    });
  };

  return (
    <main className="reports-page">
      <div className="reports-shell">
        <header className="reports-header">
          <div>
            <p className="reports-kicker">Оплаты по датам</p>
            <h1>Отчеты</h1>
            <p className="reports-subtitle">
              В каждом отчете показаны только пришедшие игроки и их статус оплаты.
              Пустая колонка extra предназначена для отметок после печати.
            </p>
          </div>

          <div className="reports-header-actions">
            <button
              type="button"
              className="reports-print-button"
              onClick={() => window.print()}
            >
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

        {reportsError && <p className="reports-message">{reportsError}</p>}

        {!reportsError && reports.length === 0 && (
          <div className="reports-empty-card">
            <h2>Отчетов пока нет</h2>
            <p>Зафиксируйте первый отчет в админке.</p>
          </div>
        )}

        <section className="reports-list" aria-label="Отчеты по оплатам">
          {reports.map((report) => {
            const attendedPlayers = report.players.filter(
              (player) => player.willCome === "yes"
            );
            const paidPlayersCount = attendedPlayers.filter((player) => player.paid).length;

            return (
              <article
                key={report.id}
                className={`payment-report-card${
                  printReportId && printReportId !== report.id
                    ? " payment-report-card--hidden-for-print"
                    : ""
                }`}
              >
                <div className="payment-report-heading">
                  <h2>Дата: {formatReportDate(report.createdAt)}</h2>
                  <div className="payment-report-heading-actions">
                    <span>
                      Оплатили: {paidPlayersCount} из {attendedPlayers.length}
                    </span>
                    <button
                      type="button"
                      className="payment-report-pdf-button"
                      onClick={() => printSingleReport(report.id)}
                    >
                      PDF за эту дату
                    </button>
                  </div>
                </div>

                {attendedPlayers.length > 0 ? (
                  <table className="payment-report-table">
                    <thead>
                      <tr>
                        <th className="payment-report-number">№</th>
                        <th>Имя</th>
                        <th className="payment-report-paid">Оплатил</th>
                        <th className="payment-report-extra">extra</th>
                      </tr>
                    </thead>
                    <tbody>
                      {attendedPlayers.map((player, index) => (
                        <tr key={`${report.id}-${player.playerId || index}`}>
                          <td className="payment-report-number">{index + 1}</td>
                          <td>{player.name}</td>
                          <td className="payment-report-paid">
                            {player.paid ? "Да" : "Нет"}
                          </td>
                          <td className="payment-report-extra" aria-label="Место для отметки" />
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="payment-report-empty">В этом отчете пришедших нет.</p>
                )}
              </article>
            );
          })}
        </section>
      </div>
    </main>
  );
};

export default Reports;
