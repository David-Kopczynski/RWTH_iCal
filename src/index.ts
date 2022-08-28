import { app } from "electron";

// Check for multiple instances
if (!app.requestSingleInstanceLock()) app.quit();
