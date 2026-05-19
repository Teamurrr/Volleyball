import { useEffect, useState } from "react";

import type { AttendanceReport } from "../../entities/attendanceReport";
import { subscribeAttendanceReports } from "./api";

const getReadableError = (error: unknown) => {
  if (error instanceof Error && error.message) {
    return `Не удалось загрузить отчеты по посещаемости: ${error.message}`;
  }

  return "Не удалось загрузить отчеты по посещаемости.";
};

export const useAttendanceReports = () => {
  const [reports, setReports] = useState<AttendanceReport[]>([]);
  const [reportsError, setReportsError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeAttendanceReports(
      (nextReports) => {
        setReports(nextReports);
        setReportsError(null);
      },
      (error) => {
        setReports([]);
        setReportsError(getReadableError(error));
      }
    );

    return () => unsubscribe();
  }, []);

  return { reports, reportsError };
};
