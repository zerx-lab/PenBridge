import { BrowserWindow, session } from "electron";
import type { Cookie } from "electron";
import * as path from "path";
import {
  PLATFORM_THEMES,
  injectAuthButton,
  injectMessage,
  setupActionPolling,
} from "./authUI";

// CSDN 相关 URL
const CSDN_URL = "https://www.csdn.net";
const CSDN_DOMAIN = ".csdn.net";

// CSDN 登录所需的核心 Cookie 字段
const REQUIRED_COOKIES = ["UserToken", "UserName"];
const IMPORTANT_COOKIES = [
  "UserToken",
  "UserName",
  "UserInfo",
  "SESSION",
  "AU",
  "UN",
  "uuid_tt_dd",
  "c_first_ref",
  "c_first_page",
  "c_segment",
  "Hm_lvt_6bcd52f51e9b3dce32bec4a3997715ac",
];

export interface CsdnUserInfo {
  nickname?: string;
  avatarUrl?: string;
  userId?: string;
  isLoggedIn: boolean;
}

export interface CsdnLoginResult {
  success: boolean;
  message: string;
  user?: CsdnUserInfo;
}

export class CsdnAuth {
  private store: any;
  private loginWindow: BrowserWindow | null = null;
  private isResolved: boolean = false; // 防止重复 resolve
  private loginDetected: boolean = false; // 是否检测到登录
  private extractAuthCallback: (() => void) | null = null; // 获取鉴权的回调
  private cleanupPolling: (() => void) | null = null; // 清理轮询的函数

  constructor(store: any) {
    this.store = store;
  }

  // 获取登录状态
  getLoginStatus(): { isLoggedIn: boolean; user?: CsdnUserInfo } {
    const cookies = this.store.get("csdnCookies") as Cookie[] | undefined;
    const userInfo = this.store.get("csdnUserInfo") as CsdnUserInfo | undefined;

    if (cookies && cookies.length > 0 && userInfo?.isLoggedIn) {
      return {
        isLoggedIn: true,
        user: userInfo,
      };
    }

    return { isLoggedIn: false };
  }

  // 获取存储的 cookies
  getCookies(): string | null {
    const cookies = this.store.get("csdnCookies") as Cookie[] | undefined;
    if (cookies && cookies.length > 0) {
      return JSON.stringify(cookies);
    }
    return null;
  }

  // 打开登录窗口
  async openLoginWindow(
    parentWindow: BrowserWindow | null
  ): Promise<CsdnLoginResult> {
    // 重置状态
    this.isResolved = false;
    this.loginDetected = false;

    return new Promise((resolve) => {
      // 包装 resolve，防止重复调用
      const safeResolve = (result: CsdnLoginResult) => {
        if (!this.isResolved) {
          this.isResolved = true;
          resolve(result);
        }
      };

      // 如果登录窗口已存在，聚焦它
      if (this.loginWindow && !this.loginWindow.isDestroyed()) {
        this.loginWindow.focus();
        safeResolve({ success: false, message: "登录窗口已打开" });
        return;
      }

      // 创建独立的 session，避免影响主窗口
      const loginSession = session.fromPartition("persist:csdn-login");

      // 创建登录窗口
      this.loginWindow = new BrowserWindow({
        width: 900,
        height: 700,
        parent: parentWindow || undefined,
        modal: false,
        icon: path.join(__dirname, "../../assets/icon.ico"),
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          session: loginSession,
        },
        title: "登录 CSDN",
      });

      // 监听用户点击"获取鉴权"按钮
      const handleExtractAuth = async () => {
        if (this.isResolved) return;

        try {
          const cookies = await this.extractAllCookies(loginSession);
          if (cookies.length > 0 && this.hasRequiredCookies(cookies)) {
            console.log("用户手动获取鉴权，cookies 数量:", cookies.length);

            // 从 cookies 中提取用户信息（UserName, UserNick）
            const userInfo = this.extractUserInfoFromCookies(cookies);

            // 保存 cookies 和用户信息
            this.store.set("csdnCookies", cookies);
            this.store.set("csdnUserInfo", userInfo);

            // 关闭登录窗口
            if (this.loginWindow && !this.loginWindow.isDestroyed()) {
              this.loginWindow.close();
            }

            safeResolve({
              success: true,
              message: "登录成功",
              user: userInfo,
            });
          } else {
            // 注入提示
            injectMessage(this.loginWindow, "未检测到有效的登录信息，请先完成登录", "error");
          }
        } catch (error) {
          console.error("获取鉴权失败:", error);
          injectMessage(this.loginWindow, "获取鉴权失败，请重试", "error");
        }
      };

      // 保存回调以便后续调用
      this.extractAuthCallback = handleExtractAuth;

      // 设置动作轮询
      this.cleanupPolling = setupActionPolling(
        this.loginWindow,
        () => {
          if (this.extractAuthCallback) {
            this.extractAuthCallback();
          }
        },
        () => {
          if (this.loginWindow && !this.loginWindow.isDestroyed()) {
            this.loginWindow.close();
          }
        }
      );

      // 加载 CSDN 首页
      this.loginWindow.loadURL(CSDN_URL);

      // 页面加载完成后注入按钮
      this.loginWindow.webContents.on("did-finish-load", () => {
        console.log("页面加载完成，注入按钮");
        injectAuthButton(this.loginWindow, PLATFORM_THEMES.csdn);
      });

      // 定期检查登录状态（用于调试）
      const checkInterval = setInterval(async () => {
        if (this.isResolved) {
          clearInterval(checkInterval);
          return;
        }

        if (this.loginWindow && !this.loginWindow.isDestroyed()) {
          const cookies = await this.extractAllCookies(loginSession);
          console.log("当前 cookies 数量:", cookies.length);
          const hasUserToken = cookies.some((c) => c.name === "UserToken");
          const hasUserName = cookies.some((c) => c.name === "UserName");
          console.log("hasUserToken:", hasUserToken, "hasUserName:", hasUserName);
        } else {
          clearInterval(checkInterval);
        }
      }, 3000);

      // 窗口关闭时清理
      this.loginWindow.on("closed", () => {
        clearInterval(checkInterval);
        if (this.cleanupPolling) {
          this.cleanupPolling();
          this.cleanupPolling = null;
        }
        this.extractAuthCallback = null;
        this.loginWindow = null;
        // 如果还没有 resolve，说明用户手动关闭了窗口
        safeResolve({ success: false, message: "用户取消登录" });
      });
    });
  }

  // 从 cookies 中提取用户信息
  private extractUserInfoFromCookies(cookies: Cookie[]): CsdnUserInfo {
    const userInfo: CsdnUserInfo = { isLoggedIn: true };

    // 从 UserName cookie 获取用户 ID
    const userNameCookie = cookies.find((c) => c.name === "UserName");
    if (userNameCookie?.value) {
      userInfo.userId = userNameCookie.value;
    }

    // 从 UserNick cookie 获取用户昵称（URL 编码的）
    const userNickCookie = cookies.find((c) => c.name === "UserNick");
    if (userNickCookie?.value) {
      try {
        userInfo.nickname = decodeURIComponent(userNickCookie.value);
      } catch {
        userInfo.nickname = userNickCookie.value;
      }
    }

    // 如果没有 UserNick，使用 userId 作为昵称
    if (!userInfo.nickname && userInfo.userId) {
      userInfo.nickname = userInfo.userId;
    }

    // CSDN 的头像需要通过用户主页获取，这里暂时不设置
    // 头像 URL 格式通常是: https://profile-avatar.csdnimg.cn/{userId}.jpg
    if (userInfo.userId) {
      // 使用默认头像格式，实际头像可能不同
      userInfo.avatarUrl = `https://profile-avatar.csdnimg.cn/default.jpg!1`;
    }

    console.log("从 cookies 中提取的用户信息:", userInfo);
    return userInfo;
  }

  // 检查是否有必需的 cookies
  private hasRequiredCookies(cookies: Cookie[]): boolean {
    const cookieNames = cookies.map((c) => c.name);
    return REQUIRED_COOKIES.every((name) => cookieNames.includes(name));
  }

  // 检查登录状态（只检测，不提取）
  private async checkLoginStatus(loginSession: Electron.Session): Promise<void> {
    if (this.loginDetected) return;

    try {
      const cookies = await this.extractAllCookies(loginSession);

      // 检查是否有登录相关的 cookie
      if (this.hasRequiredCookies(cookies) && cookies.length > 5) {
        console.log("检测到登录 cookies，数量:", cookies.length);
        this.loginDetected = true;

        // 注入提示和按钮，等待用户手动点击
        injectAuthButton(this.loginWindow, PLATFORM_THEMES.csdn);
      }
    } catch (error) {
      console.error("检查登录状态失败:", error);
    }
  }

  // 提取所有 cookies
  private async extractAllCookies(loginSession: Electron.Session): Promise<Cookie[]> {
    // 获取 CSDN 域名下的所有 cookies
    const cookies = await loginSession.cookies.get({
      domain: CSDN_DOMAIN,
    });

    // 也获取不带点前缀的域名 cookies
    const cookies2 = await loginSession.cookies.get({
      domain: "csdn.net",
    });

    // 获取 www.csdn.net 的 cookies
    const cookies3 = await loginSession.cookies.get({
      domain: "www.csdn.net",
    });

    // 去重合并
    const cookieMap = new Map<string, Cookie>();
    [...cookies, ...cookies2, ...cookies3].forEach((c) => {
      cookieMap.set(`${c.name}@${c.domain}`, c);
    });

    return Array.from(cookieMap.values());
  }

  // 登出
  async logout(): Promise<{ success: boolean }> {
    // 清除存储的信息
    this.store.delete("csdnCookies");
    this.store.delete("csdnUserInfo");

    // 清除 session 中的 cookies
    const loginSession = session.fromPartition("persist:csdn-login");
    await loginSession.clearStorageData({
      storages: ["cookies"],
    });

    return { success: true };
  }
}
