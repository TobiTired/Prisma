const {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  clipboard,
  nativeImage,
  shell,
} = require("electron");
const path = require("path");
const fs = require("fs/promises");
const JSZip = require("jszip");
const { autoUpdater } = require("electron-updater");
const {
  publicUpdateInfo,
  friendlyUpdateError,
} = require("./update-policy.cjs");
const {
  PRIMARY_EXTENSION,
  PROJECT_EXTENSIONS,
  isProjectPath,
  isLegacyProjectPath,
  prismaPathFor,
} = require("./project-file.cjs");

let win;
let updateDownloaded = false;
let updateCheckInProgress = false;
let currentCheckManual = false;
let pendingProjectPath = process.argv.find(
  (arg) => isProjectPath(arg) && !arg.startsWith("--"),
);
const settingsPath = () => path.join(app.getPath("userData"), "settings.json");
const legacySettingsPaths = () => [
  path.join(app.getPath("appData"), "TobiArt", "settings.json"),
  path.join(app.getPath("appData"), "tobiart", "settings.json"),
];
async function readSettings() {
  try {
    return JSON.parse(await fs.readFile(settingsPath(), "utf8"));
  } catch {
    for (const legacyPath of legacySettingsPaths()) {
      try {
        const settings = JSON.parse(await fs.readFile(legacyPath, "utf8"));
        await writeSettings(settings);
        return settings;
      } catch {}
    }
    return {};
  }
}
async function writeSettings(value) {
  await fs.mkdir(path.dirname(settingsPath()), { recursive: true });
  await fs.writeFile(settingsPath(), JSON.stringify(value, null, 2));
}
function createWindow() {
  win = new BrowserWindow({
    width: 1500,
    height: 920,
    minWidth: 1050,
    minHeight: 680,
    backgroundColor: "#17181d",
    title: "Prisma",
    titleBarStyle: "hiddenInset",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
    },
  });
  const dev = !app.isPackaged;
  win.loadURL(
    dev
      ? "http://localhost:5173"
      : `file://${path.join(__dirname, "../dist/index.html")}`,
  );
  win.webContents.setZoomFactor(1);
  win.webContents.on("zoom-changed", (event, direction) => {
    event.preventDefault();
    win.webContents.setZoomFactor(1);
    win.webContents.send("editor-zoom-wheel", direction);
  });
  win.webContents.on("did-finish-load", () => {
    if (pendingProjectPath) {
      win.webContents.send("open-project-path", pendingProjectPath);
      pendingProjectPath = null;
    }
    setTimeout(() => checkForUpdates(false), 5000);
  });
}

autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = false;
autoUpdater.allowPrerelease = false;
autoUpdater.setFeedURL({
  provider: "github",
  owner: "TobiTired",
  repo: "Prisma",
  private: false,
  channel: "latest",
});

function sendUpdate(status, extra = {}) {
  if (!win?.isDestroyed()) win.webContents.send("update-state", { status, ...extra });
}

async function checkForUpdates(manual = false) {
  if (!app.isPackaged) {
    if (manual)
      sendUpdate("development", {
        message: "Update checks are available in installed stable builds.",
      });
    return { status: "development" };
  }
  if (updateCheckInProgress) {
    if (manual)
      sendUpdate("checking", {
        manual: true,
        message: "An update check is already in progress.",
      });
    return { status: "checking" };
  }
  updateCheckInProgress = true;
  currentCheckManual = manual;
  try {
    sendUpdate("checking", { manual });
    const result = await autoUpdater.checkForUpdates();
    return { status: "checking", version: result?.updateInfo?.version };
  } catch (error) {
    const friendly = friendlyUpdateError(error);
    console.error("Prisma update check failed:", friendly.technical);
    sendUpdate("error", { ...friendly, manual });
    return { status: "error", message: friendly.message };
  } finally {
    updateCheckInProgress = false;
  }
}

autoUpdater.on("update-available", (info) =>
  sendUpdate("available", { ...publicUpdateInfo(info), manual: currentCheckManual }),
);
autoUpdater.on("update-not-available", (info) =>
  sendUpdate("current", {
    version: info?.version || app.getVersion(),
    manual: currentCheckManual,
  }),
);
autoUpdater.on("download-progress", (progress) =>
  sendUpdate("downloading", {
    percent: Math.max(0, Math.min(100, progress?.percent || 0)),
    transferred: progress?.transferred || 0,
    total: progress?.total || 0,
  }),
);
autoUpdater.on("update-downloaded", (info) => {
  updateDownloaded = true;
  sendUpdate("downloaded", publicUpdateInfo(info));
});
autoUpdater.on("error", (error) =>
  (() => {
    const friendly = friendlyUpdateError(error);
    console.error("Prisma updater error:", friendly.technical);
    sendUpdate("error", { ...friendly, manual: currentCheckManual });
  })(),
);
app.on("open-file", (event, filePath) => {
  event.preventDefault();
  if (win?.webContents) win.webContents.send("open-project-path", filePath);
  else pendingProjectPath = filePath;
});
if (!app.requestSingleInstanceLock()) app.quit();
app.on("second-instance", (_event, argv) => {
  const filePath = argv.find(isProjectPath);
  if (filePath) win?.webContents.send("open-project-path", filePath);
  if (win?.isMinimized()) win.restore();
  win?.focus();
});
app.whenReady().then(createWindow);
app.whenReady().then(() => app.setAppUserModelId("art.tobi.editor"));
app.on("window-all-closed", () => process.platform !== "darwin" && app.quit());
app.on(
  "activate",
  () => BrowserWindow.getAllWindows().length === 0 && createWindow(),
);

ipcMain.handle("pick-images", async () => {
  const r = await dialog.showOpenDialog(win, {
    properties: ["openFile", "multiSelections"],
    filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp"] }],
  });
  if (r.canceled) return [];
  return Promise.all(
    r.filePaths.map(async (p) => ({
      name: path.basename(p),
      data: `data:${mime(p)};base64,${(await fs.readFile(p)).toString("base64")}`,
    })),
  );
});
ipcMain.handle("choose-image-folder", async () => {
  const result = await dialog.showOpenDialog(win, {
    properties: ["openDirectory"],
  });
  if (result.canceled) return null;
  const settings = await readSettings();
  settings.imageFolder = result.filePaths[0];
  await writeSettings(settings);
  return listImageFolder(settings.imageFolder);
});
ipcMain.handle("get-image-folder", async () => {
  const settings = await readSettings();
  return settings.imageFolder ? listImageFolder(settings.imageFolder) : null;
});
ipcMain.handle("read-library-image", async (_event, filePath) => ({
  name: path.basename(filePath),
  data: `data:${mime(filePath)};base64,${(await fs.readFile(filePath)).toString("base64")}`,
}));
ipcMain.handle("image-thumbnail", async (_event, filePath) => {
  try {
    try {
      const thumbnail = await nativeImage.createThumbnailFromPath(filePath, {
        width: 220,
        height: 160,
      });
      if (!thumbnail.isEmpty()) return { data: thumbnail.toDataURL() };
    } catch {}
    const bytes = await fs.readFile(filePath);
    const source = nativeImage.createFromBuffer(bytes);
    if (source.isEmpty())
      return {
        data: `data:${mime(filePath)};base64,${bytes.toString("base64")}`,
      };
    return { data: source.resize({ width: 220, quality: "good" }).toDataURL() };
  } catch (error) {
    return { error: error.message || "Unable to load thumbnail" };
  }
});
async function listImageFolder(folder) {
  try {
    const entries = await fs.readdir(folder, { withFileTypes: true });
    const images = entries
      .filter(
        (entry) => entry.isFile() && /\.(png|jpe?g|webp)$/i.test(entry.name),
      )
      .map((entry) => ({
        name: entry.name,
        path: path.join(folder, entry.name),
      }))
      .sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { numeric: true }),
      );
    return {
      folder,
      images,
    };
  } catch {
    return { folder, images: [], unavailable: true };
  }
}
ipcMain.handle("save-project", async (_, { project, currentPath, saveAs }) => {
  let target = currentPath;
  const migratingLegacyProject = isLegacyProjectPath(target);
  if (!target || saveAs || migratingLegacyProject) {
    const r = await dialog.showSaveDialog(win, {
      defaultPath: migratingLegacyProject
        ? prismaPathFor(target)
        : `${project.name || "Untitled"}${PRIMARY_EXTENSION}`,
      filters: [{ name: "Prisma Project", extensions: ["prisma"] }],
    });
    if (r.canceled) return null;
    target = r.filePath;
  }
  const zip = new JSZip();
  const clean = JSON.parse(JSON.stringify(project));
  delete clean.preview;
  const assets = {};
  for (const o of clean.objects)
    if (o.type === "image" && o.src?.startsWith("data:")) {
      const id = o.assetId || `asset-${o.id}`;
      const [, meta, base64] = o.src.match(/^data:(.*?);base64,(.*)$/) || [];
      if (base64) {
        const ext = meta.includes("png")
          ? "png"
          : meta.includes("webp")
            ? "webp"
            : "jpg";
        const file = `assets/${id}.${ext}`;
        zip.file(file, base64, { base64: true });
        assets[id] = file;
        o.assetId = id;
        delete o.src;
      }
    }
  clean.assets = assets;
  zip.file("project.json", JSON.stringify(clean, null, 2));
  if (project.preview)
    zip.file("preview.png", project.preview.split(",")[1], { base64: true });
  await fs.writeFile(
    target,
    await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }),
  );
  return target;
});
ipcMain.handle("open-project", async (_, supplied) => {
  try {
    let target = typeof supplied === "string" ? supplied : null;
    if (!target) {
      const r = await dialog.showOpenDialog(win, {
        properties: ["openFile"],
        filters: [
          { name: "Prisma Projects", extensions: PROJECT_EXTENSIONS.map((ext) => ext.slice(1)) },
          { name: "Legacy TobiArt Projects", extensions: ["tobiart"] },
        ],
      });
      if (r.canceled) return null;
      target = r.filePaths[0];
    }
    const zip = await JSZip.loadAsync(await fs.readFile(target));
    const manifest = zip.file("project.json");
    if (!manifest)
      throw new Error("This file does not contain a compatible Prisma project manifest.");
    const project = JSON.parse(await manifest.async("string"));
    if (
      !project ||
      !Number.isFinite(project.width) ||
      !Number.isFinite(project.height) ||
      !Array.isArray(project.objects)
    )
      throw new Error("The project data is incomplete or invalid.");
    for (const o of project.objects)
      if (o.type === "image" && o.assetId && project.assets?.[o.assetId]) {
        const f = zip.file(project.assets[o.assetId]);
        if (!f)
          throw new Error(
            `Embedded image is missing: ${project.assets[o.assetId]}`,
          );
        const ext = path.extname(project.assets[o.assetId]).slice(1);
        o.src = `data:image/${ext === "jpg" ? "jpeg" : ext};base64,${await f.async("base64")}`;
      }
    delete project.assets;
    return { project, path: target };
  } catch (error) {
    return { error: error.message || "Unable to open this project." };
  }
});
ipcMain.handle(
  "export-image",
  async (_, { dataUrl, format, quality, name }) => {
    const ext = format === "jpeg" ? "jpg" : format;
    const r = await dialog.showSaveDialog(win, {
      defaultPath: `${name || "thumbnail"}.${ext}`,
      filters: [{ name: ext.toUpperCase(), extensions: [ext] }],
    });
    if (r.canceled) return null;
    await fs.writeFile(
      r.filePath,
      Buffer.from(dataUrl.split(",")[1], "base64"),
    );
    return r.filePath;
  },
);
ipcMain.handle("clipboard-image", () => {
  const im = clipboard.readImage();
  return im.isEmpty() ? null : im.toDataURL();
});
ipcMain.handle("check-for-updates", () => checkForUpdates(true));
ipcMain.handle("get-app-info", () => ({
  name: app.getName(),
  version: app.getVersion(),
  description: "Lightweight thumbnail editor",
  repository: "https://github.com/TobiTired/Prisma",
}));
ipcMain.handle("open-external", (_event, url) => {
  if (url === "https://github.com/TobiTired/Prisma") return shell.openExternal(url);
  return false;
});
ipcMain.handle("download-update", async () => {
  try {
    updateDownloaded = false;
    await autoUpdater.downloadUpdate();
    return { ok: true };
  } catch (error) {
    const friendly = friendlyUpdateError(error);
    console.error("Prisma update download failed:", friendly.technical);
    sendUpdate("error", { ...friendly, manual: true });
    return { ok: false, error: friendly.message };
  }
});
ipcMain.handle("install-update", () => {
  if (!updateDownloaded) return { ok: false, error: "The verified update has not finished downloading." };
  setImmediate(() => autoUpdater.quitAndInstall(false, true));
  return { ok: true };
});
function mime(p) {
  const e = path.extname(p).toLowerCase();
  return e === ".png"
    ? "image/png"
    : e === ".webp"
      ? "image/webp"
      : "image/jpeg";
}
