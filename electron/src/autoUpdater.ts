import { autoUpdater, UpdateInfo } from "electron-updater";
import { app, BrowserWindow, ipcMain, dialog } from "electron";

// 更新状态
export interface UpdateStatus {
  checking: boolean;
  available: boolean;
  downloading: boolean;
  downloaded: boolean;
  error: string | null;
  progress: number;
  version: string | null;
  releaseNotes: string | null;
}

// 当前更新状态
let updateStatus: UpdateStatus = {
  checking: false,
  available: false,
  downloading: false,
  downloaded: false,
  error: null,
  progress: 0,
  version: null,
  releaseNotes: null,
};

// 主窗口引用
let mainWindow: BrowserWindow | null = null;

// 发送更新状态到渲染进程
function sendUpdateStatus() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("updater:status", updateStatus);
  }
}

// 重置状态
function resetStatus() {
  updateStatus = {
    checking: false,
    available: false,
    downloading: false,
    downloaded: false,
    error: null,
    progress: 0,
    version: null,
    releaseNotes: null,
  };
}

// 初始化自动更新
export function initAutoUpdater(win: BrowserWindow) {
  mainWindow = win;

  // 配置 autoUpdater
  autoUpdater.autoDownload = false; // 不自动下载，让用户决定
  autoUpdater.autoInstallOnAppQuit = true; // 退出时自动安装

  // 开发环境下也启用更新检查（用于测试）
  // autoUpdater.forceDevUpdateConfig = true;

  // 日志输出
  autoUpdater.logger = {
    info: (message: string) => console.log("[AutoUpdater]", message),
    warn: (message: string) => console.warn("[AutoUpdater]", message),
    error: (message: string) => console.error("[AutoUpdater]", message),
    debug: (message: string) => console.log("[AutoUpdater Debug]", message),
  };

  // 检查更新开始
  autoUpdater.on("checking-for-update", () => {
    console.log("[AutoUpdater] 正在检查更新...");
    resetStatus();
    updateStatus.checking = true;
    sendUpdateStatus();
  });

  // 有可用更新
  autoUpdater.on("update-available", (info: UpdateInfo) => {
    console.log("[AutoUpdater] 发现新版本:", info.version);
    updateStatus.checking = false;
    updateStatus.available = true;
    updateStatus.version = info.version;
    updateStatus.releaseNotes =
      typeof info.releaseNotes === "string"
        ? info.releaseNotes
        : Array.isArray(info.releaseNotes)
          ? info.releaseNotes.map((note) => note.note || "").join("\n")
          : null;
    sendUpdateStatus();
  });

  // 无可用更新
  autoUpdater.on("update-not-available", (_info: UpdateInfo) => {
    console.log("[AutoUpdater] 当前已是最新版本");
    resetStatus();
    sendUpdateStatus();
  });

  // 下载进度
  autoUpdater.on("download-progress", (progress) => {
    console.log(`[AutoUpdater] 下载进度: ${progress.percent.toFixed(2)}%`);
    updateStatus.downloading = true;
    updateStatus.progress = progress.percent;
    sendUpdateStatus();
  });

  // 下载完成
  autoUpdater.on("update-downloaded", (info: UpdateInfo) => {
    console.log("[AutoUpdater] 更新下载完成:", info.version);
    updateStatus.downloading = false;
    updateStatus.downloaded = true;
    updateStatus.progress = 100;
    sendUpdateStatus();

    // 弹出对话框提示用户
    dialog
      .showMessageBox(mainWindow!, {
        type: "info",
        title: "更新已就绪",
        message: `新版本 ${info.version} 已下载完成`,
        detail: "是否立即重启应用以完成更新？",
        buttons: ["立即重启", "稍后"],
        defaultId: 0,
        cancelId: 1,
      })
      .then((result) => {
        if (result.response === 0) {
          autoUpdater.quitAndInstall();
        }
      });
  });

  // 更新错误
  autoUpdater.on("error", (error: Error) => {
    console.error("[AutoUpdater] 更新错误:", error.message);
    updateStatus.checking = false;
    updateStatus.downloading = false;
    updateStatus.error = error.message;
    sendUpdateStatus();
  });

  // 注册 IPC 处理器
  registerUpdaterHandlers();

  // 应用启动后延迟检查更新（仅在打包后的生产环境）
  if (app.isPackaged) {
    setTimeout(() => {
      checkForUpdates();
    }, 5000); // 延迟 5 秒检查
  }
}

// 检查更新
async function checkForUpdates() {
  try {
    await autoUpdater.checkForUpdates();
  } catch (error) {
    console.error("[AutoUpdater] 检查更新失败:", error);
    updateStatus.error = error instanceof Error ? error.message : "检查更新失败";
    sendUpdateStatus();
  }
}

// 开始下载更新
async function downloadUpdate() {
  try {
    updateStatus.downloading = true;
    updateStatus.progress = 0;
    sendUpdateStatus();
    await autoUpdater.downloadUpdate();
  } catch (error) {
    console.error("[AutoUpdater] 下载更新失败:", error);
    updateStatus.downloading = false;
    updateStatus.error = error instanceof Error ? error.message : "下载更新失败";
    sendUpdateStatus();
  }
}

// 安装更新并重启
function installUpdate() {
  autoUpdater.quitAndInstall();
}

// 注册 IPC 处理器
function registerUpdaterHandlers() {
  // 检查更新
  ipcMain.handle("updater:check", async () => {
    await checkForUpdates();
    return updateStatus;
  });

  // 下载更新
  ipcMain.handle("updater:download", async () => {
    await downloadUpdate();
    return updateStatus;
  });

  // 安装更新
  ipcMain.handle("updater:install", () => {
    installUpdate();
  });

  // 获取当前状态
  ipcMain.handle("updater:getStatus", () => {
    return updateStatus;
  });

  // 获取当前应用版本
  ipcMain.handle("updater:getVersion", () => {
    return app.getVersion();
  });
}
