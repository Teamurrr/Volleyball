export type AttendanceStatus = "yes" | "maybe" | "prospect" | "no";

export type Player = {
  elo: number;
  id: string;
  name: string;
  position: string;
  willCome: AttendanceStatus;
  paid: boolean;
  photo: string;
  rating?: number;
};

export const normalizeAttendanceStatus = (
  value: AttendanceStatus | boolean | undefined
): AttendanceStatus => {
  if (value === true) return "yes";
  if (value === false || value == null) return "no";
  return value;
};

export const getAttendanceLabel = (value: AttendanceStatus) => {
  if (value === "yes") return "Да";
  if (value === "maybe") return "Возможно";
  if (value === "prospect") return "В перспективе";
  return "Нет";
};
