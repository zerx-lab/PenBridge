import { z } from "zod";
import { t, protectedProcedure } from "../shared";
import {
  setCsdnCookiesFromClient,
  csdnAutoLogin,
  getCsdnLoginStatus,
  csdnLogout,
} from "../../services/csdnAuth";

// CSDN 认证相关路由
export const csdnAuthRouter = t.router({
  // 获取登录状态
  status: protectedProcedure.query(async () => {
    return getCsdnLoginStatus();
  }),

  // 自动登录（使用保存的 cookies）
  autoLogin: protectedProcedure.mutation(async () => {
    return csdnAutoLogin();
  }),

  // 登出
  logout: protectedProcedure.mutation(async () => {
    await csdnLogout();
    return { success: true };
  }),

  // 从客户端设置 cookies（Electron 客户端调用）
  setCookies: protectedProcedure
    .input(
      z.object({
        cookies: z.string(),
        nickname: z.string().optional(),
        avatarUrl: z.string().optional(),
        userId: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      return setCsdnCookiesFromClient(
        input.cookies,
        input.nickname,
        input.avatarUrl,
        input.userId
      );
    }),
});
