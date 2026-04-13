export type AttendanceStatus = "yes" | "maybe" | "no";

export type Player = {
  id: string;
  name: string;
  willCome: AttendanceStatus;
  paid: boolean;
  photo: string;
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
  return "Нет";
};
