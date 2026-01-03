import { AppDataSource } from "../db";
import { User } from "../entities/User";

export interface CsdnLoginResult {
  success: boolean;
  message: string;
  user?: {
    id: number;
    nickname?: string;
    avatarUrl?: string;
    userId?: string;
  };
}

/**
 * 从客户端设置 CSDN cookies（Electron 客户端调用）
 */
export async function setCsdnCookiesFromClient(
  cookiesJson: string,
  nickname?: string,
  avatarUrl?: string,
  userId?: string
): Promise<CsdnLoginResult> {
  try {
    const userRepo = AppDataSource.getRepository(User);

    // 尝试从 cookies 中提取用户信息
    let finalNickname = nickname;
    let finalAvatarUrl = avatarUrl;
    let finalUserId = userId;

    if (!finalNickname || !finalUserId) {
      try {
        const cookies = JSON.parse(cookiesJson);
        
        // 从 UserName cookie 获取用户 ID
        const userNameCookie = cookies.find((c: any) => c.name === "UserName");
        if (userNameCookie?.value) {
          finalUserId = finalUserId || userNameCookie.value;
        }

        // 从 UserNick cookie 获取用户昵称（URL 编码的）
        const userNickCookie = cookies.find((c: any) => c.name === "UserNick");
        if (userNickCookie?.value) {
          try {
            finalNickname = finalNickname || decodeURIComponent(userNickCookie.value);
          } catch {
            finalNickname = finalNickname || userNickCookie.value;
          }
        }

        // 如果没有 UserNick，使用 userId 作为昵称
        if (!finalNickname && finalUserId) {
          finalNickname = finalUserId;
        }

        // 设置默认头像
        if (!finalAvatarUrl) {
          finalAvatarUrl = "https://profile-avatar.csdnimg.cn/default.jpg!1";
        }

        console.log("[CsdnAuth] 从 cookies 中提取用户信息:", {
          nickname: finalNickname,
          avatarUrl: finalAvatarUrl,
          userId: finalUserId,
        });
      } catch (parseError) {
        console.warn("[CsdnAuth] 解析 cookies 失败:", parseError);
      }
    }

    // 查找或创建用户（使用同一个用户记录，id=1）
    let user = await userRepo.findOne({ where: { id: 1 } });
    if (!user) {
      user = userRepo.create({
        csdnCookies: cookiesJson,
        csdnNickname: finalNickname,
        csdnAvatarUrl: finalAvatarUrl,
        csdnUserId: finalUserId,
        csdnLoggedIn: true,
        csdnLastLoginAt: new Date(),
      });
    } else {
      user.csdnCookies = cookiesJson;
      user.csdnNickname = finalNickname || user.csdnNickname;
      user.csdnAvatarUrl = finalAvatarUrl || user.csdnAvatarUrl;
      user.csdnUserId = finalUserId || user.csdnUserId;
      user.csdnLoggedIn = true;
      user.csdnLastLoginAt = new Date();
    }

    await userRepo.save(user);

    return {
      success: true,
      message: "Cookie 设置成功",
      user: {
        id: user.id,
        nickname: user.csdnNickname,
        avatarUrl: user.csdnAvatarUrl,
        userId: user.csdnUserId,
      },
    };
  } catch (error) {
    console.error("设置 CSDN Cookie 失败:", error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "设置 Cookie 失败",
    };
  }
}

/**
 * 使用保存的 cookies 验证登录状态（自动登录）
 */
export async function csdnAutoLogin(userId: number = 1): Promise<CsdnLoginResult> {
  const userRepo = AppDataSource.getRepository(User);
  const user = await userRepo.findOne({ where: { id: userId } });

  if (!user || !user.csdnCookies) {
    return {
      success: false,
      message: "未找到保存的 CSDN 登录信息，请使用客户端登录",
    };
  }

  // 只检查本地状态：有 cookies 且标记为已登录就认为登录有效
  if (user.csdnLoggedIn && user.csdnCookies) {
    console.log("[CsdnAuth] 使用本地保存的登录状态:", {
      nickname: user.csdnNickname,
      avatarUrl: user.csdnAvatarUrl,
    });

    return {
      success: true,
      message: "自动登录成功",
      user: {
        id: user.id,
        nickname: user.csdnNickname,
        avatarUrl: user.csdnAvatarUrl,
        userId: user.csdnUserId,
      },
    };
  }

  return {
    success: false,
    message: "未登录，请使用客户端登录",
  };
}

/**
 * 获取当前 CSDN 登录状态
 */
export async function getCsdnLoginStatus(userId: number = 1): Promise<{
  isLoggedIn: boolean;
  user?: {
    id: number;
    nickname?: string;
    avatarUrl?: string;
    userId?: string;
  };
}> {
  const userRepo = AppDataSource.getRepository(User);
  const user = await userRepo.findOne({ where: { id: userId } });

  if (!user) {
    return { isLoggedIn: false };
  }

  return {
    isLoggedIn: user.csdnLoggedIn ?? false,
    user: user.csdnLoggedIn
      ? {
          id: user.id,
          nickname: user.csdnNickname,
          avatarUrl: user.csdnAvatarUrl,
          userId: user.csdnUserId,
        }
      : undefined,
  };
}

/**
 * CSDN 登出
 */
export async function csdnLogout(userId: number = 1): Promise<void> {
  const userRepo = AppDataSource.getRepository(User);
  const user = await userRepo.findOne({ where: { id: userId } });

  if (user) {
    user.csdnLoggedIn = false;
    user.csdnCookies = undefined;
    await userRepo.save(user);
  }
}

/**
 * 获取 CSDN Cookies JSON
 */
export async function getCsdnCookies(userId: number = 1): Promise<string | null> {
  const userRepo = AppDataSource.getRepository(User);
  const user = await userRepo.findOne({ where: { id: userId } });

  if (!user || !user.csdnCookies || !user.csdnLoggedIn) {
    return null;
  }

  return user.csdnCookies;
}
