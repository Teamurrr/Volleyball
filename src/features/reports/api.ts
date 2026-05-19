import { addDoc, collection, onSnapshot } from "firebase/firestore";

import { db } from "../../app/firebase";
import {
  normalizeAttendanceReportPlayer,
  type AttendanceReport,
  type AttendanceReportPlayer
} from "../../entities/attendanceReport";

const REPORTS_COLLECTION = "attendanceReports";

export const subscribeAttendanceReports = (
  callback: (reports: AttendanceReport[]) => void,
  onError?: (error: Error) => void
) =>
  onSnapshot(
    collection(db, REPORTS_COLLECTION),
    (snapshot) => {
      const reports = snapshot.docs
        .map((currentDoc) => {
          const value = currentDoc.data();
          const players = Array.isArray(value.players)
            ? value.players.map((player) =>
                normalizeAttendanceReportPlayer(
                  player as Partial<AttendanceReportPlayer>
                )
              )
            : [];

          return {
            id: currentDoc.id,
            createdAt: Number(value.createdAt ?? 0),
            players
          } satisfies AttendanceReport;
        })
        .sort((left, right) => right.createdAt - left.createdAt);

      callback(reports);
    },
    (error) => {
      onError?.(error);
    }
  );

export const createAttendanceReport = async (
  players: AttendanceReportPlayer[]
) => {
  await addDoc(collection(db, REPORTS_COLLECTION), {
    createdAt: Date.now(),
    players
  });
};
