import { useState, useEffect, useRef } from "react";
import {
  Github,
  Loader2,
  CheckCircle,
  XCircle,
  Copy,
  ExternalLink,
  RefreshCw,
  LogOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { trpc } from "@/utils/trpc";
import { message } from "antd";

/**
 * GitHub Copilot 连接组件
 *
 * 提供 Device Flow OAuth 授权流程的用户界面
 */
export function CopilotConnect() {
  const utils = trpc.useContext();

  // 获取连接状态
  const { data: status, isLoading: statusLoading } =
    trpc.copilotAuth.getStatus.useQuery();

  // 授权弹窗状态
  const [showAuthDialog, setShowAuthDialog] = useState(false);
  const [authStep, setAuthStep] = useState<
    "idle" | "starting" | "waiting" | "completing" | "success" | "error"
  >("idle");
  const [userCode, setUserCode] = useState("");
  const [verificationUri, setVerificationUri] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  // 轮询控制
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const isPollingRef = useRef(false);

  // 启动授权
  const startAuthMutation = trpc.copilotAuth.startAuth.useMutation({
    onSuccess: (data: { userCode: string; verificationUri: string; expiresIn: number }) => {
      setUserCode(data.userCode);
      setVerificationUri(data.verificationUri);
      setAuthStep("waiting");

      // 自动打开浏览器（如果在 Electron 环境）
      if (window.electronAPI?.copilotAuth) {
        window.electronAPI.copilotAuth.openVerificationPage(data.verificationUri);
      }

      // 开始轮询
      startPolling();
    },
    onError: (error: Error) => {
      setErrorMessage(error.message);
      setAuthStep("error");
    },
  });

  // 完成授权
  const completeAuthMutation = trpc.copilotAuth.completeAuth.useMutation({
    onSuccess: () => {
      stopPolling();
      setAuthStep("success");
      utils.copilotAuth.getStatus.invalidate();
      utils.aiConfig.listProviders.invalidate();
      utils.aiConfig.listModels.invalidate();
      message.success("GitHub Copilot 连接成功");

      // 延迟关闭弹窗
      setTimeout(() => {
        setShowAuthDialog(false);
        resetAuthState();
      }, 1500);
    },
    onError: (error: { message: string; data?: { code?: string } }) => {
      // 如果是等待授权，继续轮询
      if (error.data?.code === "PRECONDITION_FAILED") {
        // 授权待定，继续等待
        return;
      }

      stopPolling();
      setErrorMessage(error.message);
      setAuthStep("error");
    },
  });

  // 取消授权
  const cancelAuthMutation = trpc.copilotAuth.cancelAuth.useMutation();

  // 断开连接
  const disconnectMutation = trpc.copilotAuth.disconnect.useMutation({
    onSuccess: () => {
      utils.copilotAuth.getStatus.invalidate();
      utils.aiConfig.listProviders.invalidate();
      utils.aiConfig.listModels.invalidate();
      message.success("已断开 GitHub Copilot 连接");
    },
    onError: (error: Error) => {
      message.error(`断开连接失败: ${error.message}`);
    },
  });

  // 刷新 Token
  const refreshTokenMutation = trpc.copilotAuth.refreshToken.useMutation({
    onSuccess: () => {
      utils.copilotAuth.getStatus.invalidate();
      message.success("Token 已刷新");
    },
    onError: (error: Error) => {
      message.error(`刷新 Token 失败: ${error.message}`);
    },
  });

  // 开始轮询
  const startPolling = () => {
    if (isPollingRef.current) return;
    isPollingRef.current = true;

    const poll = () => {
      if (!isPollingRef.current) return;

      completeAuthMutation.mutate();

      // 继续轮询（每 5 秒）
      pollingRef.current = setTimeout(poll, 5000);
    };

    // 首次延迟 3 秒后开始轮询
    pollingRef.current = setTimeout(poll, 3000);
  };

  // 停止轮询
  const stopPolling = () => {
    isPollingRef.current = false;
    if (pollingRef.current) {
      clearTimeout(pollingRef.current);
      pollingRef.current = null;
    }
  };

  // 重置授权状态
  const resetAuthState = () => {
    setAuthStep("idle");
    setUserCode("");
    setVerificationUri("");
    setErrorMessage("");
    stopPolling();
  };

  // 开始授权流程
  const handleStartAuth = () => {
    resetAuthState();
    setShowAuthDialog(true);
    setAuthStep("starting");
    startAuthMutation.mutate({});
  };

  // 取消授权
  const handleCancelAuth = () => {
    cancelAuthMutation.mutate();
    setShowAuthDialog(false);
    resetAuthState();
  };

  // 复制用户码
  const handleCopyCode = async () => {
    try {
      if (window.electronAPI?.copilotAuth) {
        await window.electronAPI.copilotAuth.copyUserCode(userCode);
      } else {
        await navigator.clipboard.writeText(userCode);
      }
      message.success("已复制到剪贴板");
    } catch {
      message.error("复制失败");
    }
  };

  // 打开授权页面
  const handleOpenVerificationPage = () => {
    if (window.electronAPI?.copilotAuth) {
      window.electronAPI.copilotAuth.openVerificationPage(verificationUri);
    } else {
      window.open(verificationUri, "_blank");
    }
  };

  // 断开连接
  const handleDisconnect = () => {
    if (confirm("确定要断开 GitHub Copilot 连接吗？这将删除相关的供应商和模型配置。")) {
      disconnectMutation.mutate();
    }
  };

  // 组件卸载时清理
  useEffect(() => {
    return () => {
      stopPolling();
    };
  }, []);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <CardTitle className="text-base flex items-center gap-2">
              <Github className="h-4 w-4" />
              GitHub Copilot
            </CardTitle>
            <CardDescription>
              使用 GitHub Copilot 订阅访问 GPT-4o、Claude、o3 等模型
            </CardDescription>
          </div>
          {statusLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : status?.connected ? (
            <Badge variant="default" className="bg-green-500">
              <CheckCircle className="h-3 w-3 mr-1" />
              已连接
            </Badge>
          ) : (
            <Badge variant="secondary">
              <XCircle className="h-3 w-3 mr-1" />
              未连接
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {status?.connected ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium">
                  {status.username ? `@${status.username}` : "GitHub 用户"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {status.isExpired
                    ? "Token 已过期，请刷新"
                    : `Token 有效期至 ${new Date(status.expiresAt!).toLocaleString()}`}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => refreshTokenMutation.mutate()}
                  disabled={refreshTokenMutation.isLoading}
                >
                  {refreshTokenMutation.isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  <span className="ml-1">刷新</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDisconnect}
                  disabled={disconnectMutation.isLoading}
                >
                  {disconnectMutation.isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <LogOut className="h-4 w-4" />
                  )}
                  <span className="ml-1">断开</span>
                </Button>
              </div>
            </div>
            <div className="text-xs text-muted-foreground">
              <p>已自动创建 GitHub Copilot 供应商和默认模型配置。</p>
              <p>您可以在下方的"AI 模型"部分管理具体模型。</p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              连接 GitHub Copilot 后，您可以使用 GPT-4o、Claude Sonnet、o3-mini 等多种 AI 模型。
            </p>
            <Button onClick={handleStartAuth} disabled={startAuthMutation.isLoading}>
              {startAuthMutation.isLoading && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              <Github className="h-4 w-4 mr-2" />
              连接 GitHub Copilot
            </Button>
          </div>
        )}
      </CardContent>

      {/* 授权弹窗 */}
      <Dialog open={showAuthDialog} onOpenChange={(open) => {
        if (!open) {
          handleCancelAuth();
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Github className="h-5 w-5" />
              连接 GitHub Copilot
            </DialogTitle>
            <DialogDescription>
              通过 GitHub 设备授权连接您的 Copilot 订阅
            </DialogDescription>
          </DialogHeader>

          <div className="py-6">
            {authStep === "starting" && (
              <div className="flex flex-col items-center gap-4">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">正在启动授权流程...</p>
              </div>
            )}

            {authStep === "waiting" && (
              <div className="space-y-6">
                <div className="text-center space-y-2">
                  <p className="text-sm text-muted-foreground">
                    请在浏览器中输入以下代码完成授权：
                  </p>
                  <div className="flex items-center justify-center gap-2">
                    <code className="text-2xl font-mono font-bold tracking-widest bg-muted px-4 py-2 rounded">
                      {userCode}
                    </code>
                    <Button variant="outline" size="icon" onClick={handleCopyCode}>
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="flex justify-center">
                  <Button variant="outline" onClick={handleOpenVerificationPage}>
                    <ExternalLink className="h-4 w-4 mr-2" />
                    打开授权页面
                  </Button>
                </div>

                <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  等待授权中...
                </div>
              </div>
            )}

            {authStep === "completing" && (
              <div className="flex flex-col items-center gap-4">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">正在完成授权...</p>
              </div>
            )}

            {authStep === "success" && (
              <div className="flex flex-col items-center gap-4">
                <CheckCircle className="h-12 w-12 text-green-500" />
                <p className="text-sm font-medium">连接成功！</p>
              </div>
            )}

            {authStep === "error" && (
              <div className="flex flex-col items-center gap-4">
                <XCircle className="h-12 w-12 text-destructive" />
                <p className="text-sm text-destructive">{errorMessage}</p>
                <Button variant="outline" onClick={handleStartAuth}>
                  重试
                </Button>
              </div>
            )}
          </div>

          <DialogFooter>
            {authStep === "waiting" && (
              <Button variant="outline" onClick={handleCancelAuth}>
                取消
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
