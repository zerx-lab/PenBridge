/**
 * 工具权限配置 Hook
 * 管理 AI 工具的审核权限设置
 */

import { useState, useCallback, useEffect } from "react";
import type { ToolPermissionSettings } from "../types";
import { DEFAULT_PERMISSION_SETTINGS, DEFAULT_TOOLS } from "../types";

const STORAGE_KEY = "ai-tool-permission-settings";

/**
 * 从 localStorage 加载权限设置
 */
function loadSettings(): ToolPermissionSettings {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      // 合并默认设置，确保新工具也有默认权限
      return {
        yoloMode: parsed.yoloMode ?? DEFAULT_PERMISSION_SETTINGS.yoloMode,
        permissions: {
          ...DEFAULT_PERMISSION_SETTINGS.permissions,
          ...parsed.permissions,
        },
      };
    }
  } catch {
    // 解析失败，使用默认值
  }
  return DEFAULT_PERMISSION_SETTINGS;
}

/**
 * 保存权限设置到 localStorage
 */
function saveSettings(settings: ToolPermissionSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    console.error("保存权限设置失败");
  }
}

export interface UseToolPermissionsReturn {
  // 当前设置
  settings: ToolPermissionSettings;
  // 是否开启 YOLO 模式
  isYoloMode: boolean;
  // 切换 YOLO 模式
  toggleYoloMode: () => void;
  // 设置 YOLO 模式
  setYoloMode: (enabled: boolean) => void;
  // 检查工具是否需要审核
  requiresApproval: (toolName: string) => boolean;
  // 设置单个工具的审核权限
  setToolApproval: (toolName: string, requires: boolean) => void;
  // 批量设置所有工具的审核权限
  setAllToolsApproval: (requires: boolean) => void;
  // 重置为默认设置
  resetToDefault: () => void;
  // 获取工具列表（用于 UI 展示）
  getToolList: () => typeof DEFAULT_TOOLS;
}

export function useToolPermissions(): UseToolPermissionsReturn {
  const [settings, setSettings] = useState<ToolPermissionSettings>(loadSettings);

  // 设置变化时保存到 localStorage
  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  // 切换 YOLO 模式
  const toggleYoloMode = useCallback(() => {
    setSettings(prev => ({
      ...prev,
      yoloMode: !prev.yoloMode,
    }));
  }, []);

  // 设置 YOLO 模式
  const setYoloMode = useCallback((enabled: boolean) => {
    setSettings(prev => ({
      ...prev,
      yoloMode: enabled,
    }));
  }, []);

  // 检查工具是否需要审核
  const requiresApproval = useCallback((toolName: string): boolean => {
    // YOLO 模式下所有工具都不需要审核
    if (settings.yoloMode) {
      return false;
    }
    // 检查具体工具的设置
    return settings.permissions[toolName] ?? true; // 默认需要审核
  }, [settings]);

  // 设置单个工具的审核权限
  const setToolApproval = useCallback((toolName: string, requires: boolean) => {
    setSettings(prev => ({
      ...prev,
      permissions: {
        ...prev.permissions,
        [toolName]: requires,
      },
    }));
  }, []);

  // 批量设置所有工具的审核权限
  const setAllToolsApproval = useCallback((requires: boolean) => {
    setSettings(prev => ({
      ...prev,
      permissions: DEFAULT_TOOLS.reduce((acc, tool) => {
        acc[tool.toolName] = requires;
        return acc;
      }, {} as Record<string, boolean>),
    }));
  }, []);

  // 重置为默认设置
  const resetToDefault = useCallback(() => {
    setSettings(DEFAULT_PERMISSION_SETTINGS);
  }, []);

  // 获取工具列表
  const getToolList = useCallback(() => DEFAULT_TOOLS, []);

  return {
    settings,
    isYoloMode: settings.yoloMode,
    toggleYoloMode,
    setYoloMode,
    requiresApproval,
    setToolApproval,
    setAllToolsApproval,
    resetToDefault,
    getToolList,
  };
}
