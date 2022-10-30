import { app, BrowserWindow, dialog, ipcMain } from "electron";
import * as fs from "fs";
import * as path from "path";
import * as ical2json from "ical2json";

const DEFAULT_CONFIG: {
  location: {
    [key: string]: {
      LOCATION: string;
      GEO: string;
    };
  };
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
  const readFile = dialog.showOpenDialogSync({
    properties: ["openFile"],
    title: "Select an ics file",
    filters: [{ name: "iCalendar", extensions: ["ics"] }],
  });

  if (!readFile?.length) return app.quit();
  const file = fs.readFileSync(readFile[0], "utf-8");

  // Get iCal data
  const ics = ical2json.convert(file);

  // Get various events to check which events should be ignored
  const missingEvents = new Set<string>();
  const descriptionByEvent: { [key: string]: string } = {};

  ics.VCALENDAR.forEach((calendar) =>
    calendar.VEVENT.forEach((event) => {
      if (!config.naming[event.SUMMARY]) {
        missingEvents.add(event.SUMMARY);
        descriptionByEvent[event.SUMMARY] = event.DESCRIPTION;
      }
    })
  );

  // Open modal to select events to ignore
  for await (const event of missingEvents) {
    const response = await openModal({
      text: `${event}: ${descriptionByEvent[event]}`,
      inputs: [
        {
          placeholder: "Name des Events",
        },
        {
          placeholder: "Beschreibung des Events",
        },
      ],
    });

    config.naming[event] = {
      SUMMARY: response[0],
      DESCRIPTION: response[1],
    };
  }

  // Filter events that should be ignored and update
  ics.VCALENDAR = ics.VCALENDAR.map((calendar) => {
    calendar.VEVENT = calendar.VEVENT.filter((event) => {
      // Ignore if event has empty summary
      return config.naming[event.SUMMARY].SUMMARY;
    }).map((event) => ({
      ...event,
      ...config.naming[event.SUMMARY],
    }));

    return calendar;
  });

  // Get various locations to check for changes
  const missingLocations = new Set<string>();

  ics.VCALENDAR.forEach((calendar) =>
    calendar.VEVENT.forEach((event) => {
      if (event.LOCATION && !config.location[event.LOCATION])
        missingLocations.add(event.LOCATION);
    })
  );

  // Open modal to select location and geo coordinates
  for await (const location of missingLocations) {
    const response = await openModal({
      text: `${location}`,
      inputs: [
        {
          placeholder: "Adresse des Ortes",
        },
        {
          placeholder: "Geo-Koordinaten",
        },
      ],
    });

    config.location[location] = {
      LOCATION: response[0],
      GEO: response[1],
    };
  }

  // Update location and geo of events
  ics.VCALENDAR = ics.VCALENDAR.map((calendar) => {
    calendar.VEVENT = calendar.VEVENT.map((event) => {
      if (event.LOCATION)
        return {
          ...event,
          LOCATION: config.location[event.LOCATION].LOCATION,
        };
      return event;
    });
    return calendar;
  });

  // Write updated config
  fs.writeFileSync(data, JSON.stringify(config));

  // Write new iCal from updated data
  const writeFile = dialog.showOpenDialogSync({
    properties: ["promptToCreate"],
    title: "Save iCalendar",
    defaultPath: readFile[0],
    buttonLabel: "Save",
    filters: [{ name: "iCalendar", extensions: ["ics"] }],
  });

  if (!writeFile?.length) return app.quit();
  fs.writeFileSync(writeFile[0], ical2json.revert(ics));

  app.quit();
});

/**
 * Modal manager receiving data from user
 */
type Settings = {
  text: string;
  inputs: [
    {
      placeholder: string;
    },
    {
      placeholder: string;
    }
  ];
};

let modalData: [string, string] | undefined = undefined;
let modalSettings: Settings;

ipcMain.on("data", (_, data: [string, string]) => (modalData = data));
ipcMain.on("setup", (event) => (event.returnValue = modalSettings));

const openModal = async (settings: Settings) => {
  return await new Promise<[string, string]>((res) => {
    // Setup
    modalSettings = settings;
    modalData = undefined;

    // Create modal window
    const modal = new BrowserWindow({
      title: "Eingabe RWTH_iCal",
      width: 800,
      height: 345,
      center: true,
      resizable: false,
      frame: true,
      transparent: false,
      show: false,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
      },
    });
    modal.setMenu(null);
    modal.loadFile(path.join(__dirname, "modal/modal.html"));

    // Hide while loading
    modal.once("ready-to-show", () => modal.show());

    // Response when closed
    modal.on("closed", () => {
      if (modalData !== undefined) res(modalData);
      else app.quit();
    });
  });
};
