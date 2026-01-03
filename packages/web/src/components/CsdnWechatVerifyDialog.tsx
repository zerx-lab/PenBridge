import { useState, useEffect, useCallback } from "react";
import { Loader2, RefreshCw, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  LightDialog,
  LightDialogHeader,
  LightDialogTitle,
  LightDialogDescription,
  LightDialogFooter,
} from "@/components/ui/light-dialog";

interface CsdnWechatVerifyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 微信验证二维码 URL */
  qrCodeUrl: string;
  /** 验证完成回调 */
  onVerifyComplete: () => void;
  /** 取消回调 */
  onCancel?: () => void;
}

/**
 * CSDN 微信验证弹窗
 * 使用 iframe 展示微信扫码二维码，兼容 Web 和 Electron
 */
export function CsdnWechatVerifyDialog({
  open,
  onOpenChange,
  qrCodeUrl,
  onVerifyComplete,
  onCancel,
}: CsdnWechatVerifyDialogProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  // 重置状态
  useEffect(() => {
    if (open) {
      setIsLoading(true);
      setLoadError(false);
    }
  }, [open, qrCodeUrl]);

  // iframe 加载完成
  const handleIframeLoad = useCallback(() => {
    setIsLoading(false);
    setLoadError(false);
  }, []);

  // iframe 加载错误
  const handleIframeError = useCallback(() => {
    setIsLoading(false);
    setLoadError(true);
  }, []);

  // 刷新二维码
  const handleRefresh = useCallback(() => {
    setIsLoading(true);
    setLoadError(false);
    // 通过修改 key 强制重新加载 iframe
    const iframe = document.getElementById("csdn-wechat-verify-iframe") as HTMLIFrameElement;
    if (iframe) {
      iframe.src = qrCodeUrl;
    }
  }, [qrCodeUrl]);

  // 用户确认已完成验证
  const handleVerifyComplete = useCallback(() => {
    onVerifyComplete();
    onOpenChange(false);
  }, [onVerifyComplete, onOpenChange]);

  // 取消
  const handleCancel = useCallback(() => {
    onCancel?.();
    onOpenChange(false);
  }, [onCancel, onOpenChange]);

  return (
    <LightDialog open={open} onOpenChange={onOpenChange} className="sm:max-w-[450px]">
      <LightDialogHeader>
        <LightDialogTitle>微信安全验证</LightDialogTitle>
        <LightDialogDescription>
          CSDN 需要进行微信扫码验证，请使用已绑定 CSDN 账号的微信扫描下方二维码完成验证
        </LightDialogDescription>
      </LightDialogHeader>

      <div className="py-4">
        {/* 二维码区域 */}
        <div className="relative w-full flex items-center justify-center bg-muted/30 rounded-lg overflow-hidden" style={{ height: 340 }}>
          {/* 加载状态 */}
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <span className="text-sm text-muted-foreground">加载中...</span>
              </div>
            </div>
          )}

          {/* 加载错误 */}
          {loadError && (
            <div className="absolute inset-0 flex items-center justify-center bg-background z-10">
              <div className="flex flex-col items-center gap-3">
                <span className="text-sm text-destructive">二维码加载失败</span>
                <Button variant="outline" size="sm" onClick={handleRefresh}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  重新加载
                </Button>
              </div>
            </div>
          )}

          {/* 微信二维码 iframe */}
          <iframe
            id="csdn-wechat-verify-iframe"
            src={qrCodeUrl}
            className="w-full h-full border-0"
            onLoad={handleIframeLoad}
            onError={handleIframeError}
            sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
            title="微信扫码验证"
          />
        </div>

        {/* 提示信息 */}
        <div className="mt-4 space-y-2 text-sm text-muted-foreground">
          <p>1. 请使用与 CSDN 账号绑定的微信扫描二维码</p>
          <p>2. 在微信中确认授权后，点击下方"已完成验证"按钮</p>
          <p>3. 验证完成后将自动重试发布文章</p>
        </div>
      </div>

      <LightDialogFooter>
        <Button variant="outline" onClick={handleCancel}>
          取消发布
        </Button>
        <Button variant="outline" onClick={handleRefresh}>
          <RefreshCw className="h-4 w-4 mr-2" />
          刷新二维码
        </Button>
        <Button onClick={handleVerifyComplete}>
          <CheckCircle2 className="h-4 w-4 mr-2" />
          已完成验证
        </Button>
      </LightDialogFooter>
    </LightDialog>
  );
}

export default CsdnWechatVerifyDialog;
