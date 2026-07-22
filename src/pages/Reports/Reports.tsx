import { useState } from "react";
import { Link } from "react-router-dom";
import type { TDocumentDefinitions } from "pdfmake/interfaces";
import "./Reports.scss";

import type { AttendanceReport } from "../../entities/attendanceReport";
import { useAttendanceReports } from "../../features/reports/hook";

const formatReportDate = (value: number) =>
  new Date(value).toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });

const formatFileDate = (value: number) => {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

const Reports = () => {
  const { reports, reportsError } = useAttendanceReports();
  const [downloadingReportId, setDownloadingReportId] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);

  const downloadReportPdf = async (report: AttendanceReport) => {
    const attendedPlayers = report.players.filter((player) => player.willCome === "yes");
    const paidPlayersCount = attendedPlayers.filter((player) => player.paid).length;
    const tableBody = attendedPlayers.map((player, index) => [
      { text: String(index + 1), alignment: "center" as const },
      player.name,
      { text: player.paid ? "Да" : "Нет", alignment: "center" as const },
      "",
      "",
      ""
    ]);
    const documentDefinition: TDocumentDefinitions = {
      pageSize: "A4",
      pageMargins: [32, 32, 32, 32],
      content: [
        {
          text: `Отчет за ${formatReportDate(report.createdAt)}`,
          style: "title"
        },
        {
          text: `Пришли: ${attendedPlayers.length} · Оплатили: ${paidPlayersCount}`,
          margin: [0, 0, 0, 12]
        },
        {
          table: {
            headerRows: 1,
            widths: [28, "*", 60, 60, 60, 75],
            body: [
              [
                { text: "№", style: "tableHeader", alignment: "center" },
                { text: "Имя", style: "tableHeader" },
                { text: "Оплатил", style: "tableHeader", alignment: "center" },
                { text: "f1", style: "tableHeader", alignment: "center" },
                { text: "f2", style: "tableHeader", alignment: "center" },
                { text: "extra", style: "tableHeader", alignment: "center" }
              ],
              ...tableBody
            ]
          },
          layout: {
            fillColor: (rowIndex: number) => (rowIndex === 0 ? "#eef2f0" : null),
            hLineColor: () => "#6b7280",
            vLineColor: () => "#6b7280",
            paddingTop: () => 6,
            paddingBottom: () => 6
          }
        }
      ],
      defaultStyle: {
        font: "Roboto",
        fontSize: 10,
        color: "#111827"
      },
      styles: {
        title: {
          fontSize: 16,
          bold: true,
          margin: [0, 0, 0, 8]
        },
        tableHeader: {
          bold: true
        }
      }
    };

    setDownloadingReportId(report.id);
    setPdfError(null);

    try {
      const [pdfMakeModule, pdfFonts] = await Promise.all([
        import("pdfmake/build/pdfmake"),
        import("pdfmake/build/vfs_fonts")
      ]);
      const pdfMake = pdfMakeModule.default;

      pdfMake.addVirtualFileSystem(pdfFonts.default);
      await pdfMake
        .createPdf(documentDefinition)
        .download(`volleyball-report-${formatFileDate(report.createdAt)}.pdf`);
    } catch {
      setPdfError("Не удалось скачать PDF. Попробуйте еще раз.");
    } finally {
      setDownloadingReportId(null);
    }
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
            <Link className="reports-link" to="/adminx">
              Админка
            </Link>
            <Link className="reports-link" to="/">
              Главная
            </Link>
          </div>
        </header>

        {reportsError && <p className="reports-message">{reportsError}</p>}
        {pdfError && <p className="reports-message">{pdfError}</p>}

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
              <article key={report.id} className="payment-report-card">
                <div className="payment-report-heading">
                  <h2>Дата: {formatReportDate(report.createdAt)}</h2>
                  <div className="payment-report-heading-actions">
                    <span>
                      Оплатили: {paidPlayersCount} из {attendedPlayers.length}
                    </span>
                    <button
                      type="button"
                      className="payment-report-pdf-button"
                      onClick={() => void downloadReportPdf(report)}
                      disabled={downloadingReportId === report.id}
                    >
                      {downloadingReportId === report.id ? "Создаем PDF..." : "Скачать PDF"}
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
                        <th className="payment-report-mark">f1</th>
                        <th className="payment-report-mark">f2</th>
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
                          <td className="payment-report-mark" aria-label="Место для отметки f1" />
                          <td className="payment-report-mark" aria-label="Место для отметки f2" />
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
