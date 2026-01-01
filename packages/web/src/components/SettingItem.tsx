import { ReactNode } from "react";

interface SettingItemProps {
  icon: ReactNode;
  label: string;
  description?: string;
  action?: ReactNode;
  onClick?: () => void;
}

/**
 * Notion 风格设置项组件
 * 用于设置面板中的单个设置项
 */
export function SettingItem({
  icon,
  label,
  description,
  action,
  onClick,
}: SettingItemProps) {
  const content = (
    <div className="flex items-center justify-between py-2.5 px-2 rounded-md hover:bg-accent/50 transition-colors group -mx-2">
      <div className="flex items-center gap-3">
        <span className="text-muted-foreground group-hover:text-foreground transition-colors">
          {icon}
        </span>
        <span className="text-sm">{label}</span>
      </div>
      {action && <div className="flex items-center">{action}</div>}
      {description && !action && (
        <span className="text-sm text-muted-foreground">{description}</span>
      )}
    </div>
  );

  if (onClick) {
    return (
      <button className="w-full text-left" onClick={onClick}>
        {content}
      </button>
    );
  }

  return content;
}
