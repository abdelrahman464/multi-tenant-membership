export const WEEKDAYS = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
] as const;

export type Weekday = (typeof WEEKDAYS)[number];

export type DayHours = { open: string; close: string };

export type BranchHours = Record<Weekday, DayHours | null>;

export type HoursException = {
  date: string;
  hours: DayHours | null;
};

export const HOURS_EXCEPTIONS_MAX = 366;
