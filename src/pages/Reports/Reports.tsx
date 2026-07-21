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

  return (
    <main className="reports-page">
      <div className="reports-shell">
        <header className="reports-header">
          <div>
            <p className="reports-kicker">Оплаты по датам</p>
            <h1>Отчеты</h1>
            <p className="reports-subtitle">
              В каждом отчете показаны только оплатившие игроки. Пустая колонка
              extra предназначена для отметок после печати.
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
            const paidPlayers = report.players.filter((player) => player.paid);

            return (
              <article key={report.id} className="payment-report-card">
                <div className="payment-report-heading">
                  <h2>Дата: {formatReportDate(report.createdAt)}</h2>
                  <span>Оплатили: {paidPlayers.length}</span>
                </div>

                {paidPlayers.length > 0 ? (
                  <table className="payment-report-table">
                    <thead>
                      <tr>
                        <th className="payment-report-number">№</th>
                        <th>Оплатил</th>
                        <th className="payment-report-extra">extra</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paidPlayers.map((player, index) => (
                        <tr key={`${report.id}-${player.playerId || index}`}>
                          <td className="payment-report-number">{index + 1}</td>
                          <td>{player.name}</td>
                          <td className="payment-report-extra" aria-label="Место для отметки" />
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="payment-report-empty">В этом отчете оплативших нет.</p>
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
