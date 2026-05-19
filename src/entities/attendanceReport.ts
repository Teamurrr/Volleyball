import { normalizeAttendanceStatus, type AttendanceStatus } from "./player";

export type AttendanceReportPlayer = {
  playerId: string;
  name: string;
  position: string;
  elo: number;
  willCome: AttendanceStatus;
  paid: boolean;
};

export type AttendanceReport = {
  id: string;
  createdAt: number;
  players: AttendanceReportPlayer[];
};

export const normalizeAttendanceReportPlayer = (
  value: Partial<AttendanceReportPlayer> & { playerId?: string; name?: string }
): AttendanceReportPlayer => ({
  playerId: value.playerId ?? "",
  name: value.name ?? "Без имени",
  position: value.position ?? "",
  elo: Number(value.elo ?? 0),
  willCome: normalizeAttendanceStatus(value.willCome),
  paid: Boolean(value.paid)
});
