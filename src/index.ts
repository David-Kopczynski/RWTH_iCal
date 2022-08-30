import { app, dialog } from "electron";
import * as fs from "fs";
import * as ical2json from "ical2json";

const DEFAULT_CONFIG: {
  location: { [key: string]: string };
  naming: {
    [key: string]: {
      SUMMARY: string;
      DESCRIPTION: string;
    };
  };
} = {
  location: {},
  naming: {},
};

// Check for multiple instances
if (!app.requestSingleInstanceLock()) app.quit();

app.on("ready", async () => {
  // Setup the app config
  const data = app.getPath("appData") + "\\rwth_ical\\config.json";
  let config = DEFAULT_CONFIG;
  try {
    config = JSON.parse(fs.readFileSync(data, "utf-8"));
  } catch (_) {
    fs.writeFileSync(data, JSON.stringify(DEFAULT_CONFIG));
  }

  // Open prompt to select ics file
  const open = await dialog.showOpenDialog({
    properties: ["openFile"],
    title: "Select an ics file",
    filters: [{ name: "iCalendar", extensions: ["ics"] }],
  });

  if (!open.filePaths.length) return app.exit(-1);
  const file = fs.readFileSync(open.filePaths[0], "utf-8");

  // Get iCal data
  const ics = ical2json.convert(file);

  // Update summary and description of events
  ics.VCALENDAR.map(
    (calendar) =>
      (calendar.VEVENT = calendar.VEVENT.map((event) => {
        // Check if summary data is missing
        if (!config.naming[event.SUMMARY])
          // Get additional information from user

          return { ...event, ...config.naming[event.SUMMARY] };
      })
        // Delete unimportant events
        .filter((event) => event.SUMMARY))
  );

  // Update location and geo of events

  // Write updated config
  fs.writeFileSync(data, JSON.stringify(config), { flag: "a+" });

  // Write new iCal from updated data
  const write = await dialog.showOpenDialog({
    properties: ["promptToCreate"],
    title: "Save iCalendar",
    defaultPath: open.filePaths[0],
    buttonLabel: "Save",
    filters: [{ name: "iCalendar", extensions: ["ics"] }],
  });

  if (!write.filePaths.length) return app.exit(-1);
  fs.writeFileSync(write.filePaths[0], ical2json.revert(ics), { flag: "a+" });

  app.exit(0);
});
