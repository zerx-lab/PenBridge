import { shell, ipcMain, clipboard } from "electron";

/**
 * GitHub Copilot 认证辅助模块
 *
 * 注意：主要的认证逻辑在后端实现（通过 tRPC API）
 * 此模块仅提供 Electron 端的辅助功能：
 * - 打开浏览器进行授权
 * - 复制用户码到剪贴板
 */

/**
 * 注册 GitHub Copilot 相关的 IPC 处理器
 */
export function registerCopilotAuthHandlers() {
  // 打开 GitHub 设备授权页面
  ipcMain.handle(
    "copilotAuth:openVerificationPage",
    async (_event, verificationUri: string) => {
      try {
        await shell.openExternal(verificationUri);
        return { success: true };
      } catch (error) {
        return {
          success: false,
          message: error instanceof Error ? error.message : "打开授权页面失败",
        };
      }
    }
  );

  // 复制用户码到剪贴板
  ipcMain.handle("copilotAuth:copyUserCode", async (_event, userCode: string) => {
    try {
      clipboard.writeText(userCode);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : "复制失败",
      };
    }
  });
}
