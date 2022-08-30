declare module "ical2json" {
  export function convert(ical: string): Calendar;
  export function revert(json: Calendar): string;
}

type Calendar = {
  VCALENDAR: {
    VEVENT: CalendarEvent[];
  }[];
};

type CalendarEvent = {
  UID: string;
  SUMMARY: string;
  DESCRIPTION: string;
  LOCATION?: string;
  GEO?: string;
};
