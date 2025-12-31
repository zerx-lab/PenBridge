import { existsSync, mkdirSync, appendFileSync, readdirSync, unlinkSync, statSync } from "fs";
import { join } from "path";

// 日志目录
const LOG_DIR = "data/logs";

// 日志文件保留天数
const LOG_RETENTION_DAYS = 7;

// 日志级别
type LogLevel = "info" | "warn" | "error" | "debug";

// 原始 console 方法
const originalConsole = {
  log: console.log.bind(console),
  info: console.info.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
  debug: console.debug.bind(console),
};

/**
 * 获取当前日期的日志文件名
 */
function getLogFileName(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}.log`;
}

/**
 * 获取当前时间戳（用于日志前缀）
 */
function getTimestamp(): string {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");
  const ms = String(now.getMilliseconds()).padStart(3, "0");
  return `${hours}:${minutes}:${seconds}.${ms}`;
}

/**
 * 格式化日志参数为字符串
 */
function formatArgs(args: any[]): string {
  return args
    .map((arg) => {
      if (typeof arg === "object") {
        try {
          return JSON.stringify(arg, null, 2);
        } catch {
          return String(arg);
        }
      }
      return String(arg);
    })
    .join(" ");
}

/**
 * 写入日志到文件
 */
function writeToFile(level: LogLevel, message: string): void {
  try {
    const logFile = join(LOG_DIR, getLogFileName());
    const timestamp = getTimestamp();
    const levelTag = level.toUpperCase().padEnd(5);
    const logLine = `[${timestamp}] [${levelTag}] ${message}\n`;
    
    appendFileSync(logFile, logLine, { encoding: "utf-8" });
  } catch (error) {
    // 写入失败时使用原始 console 输出错误
    originalConsole.error("日志写入失败:", error);
  }
}

/**
 * 创建代理的 console 方法
 */
function createProxyMethod(
  originalMethod: (...args: any[]) => void,
  level: LogLevel
): (...args: any[]) => void {
  return (...args: any[]) => {
    // 输出到标准输出
    originalMethod(...args);
    
    // 写入到日志文件
    const message = formatArgs(args);
    writeToFile(level, message);
  };
}

/**
 * 清理过期日志文件
 */
function cleanupOldLogs(): void {
  try {
    if (!existsSync(LOG_DIR)) return;
    
    const files = readdirSync(LOG_DIR);
    const now = Date.now();
    const maxAge = LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000;
    
    let cleanedCount = 0;
    for (const file of files) {
      if (!file.endsWith(".log")) continue;
      
      const filePath = join(LOG_DIR, file);
      const stat = statSync(filePath);
      const age = now - stat.mtime.getTime();
      
      if (age > maxAge) {
        unlinkSync(filePath);
        cleanedCount++;
      }
    }
    
    if (cleanedCount > 0) {
      originalConsole.log(`已清理 ${cleanedCount} 个过期日志文件`);
    }
  } catch (error) {
    originalConsole.error("清理日志文件失败:", error);
  }
}

/**
 * 初始化日志服务
 * - 创建日志目录
 * - 重写 console 方法
 * - 清理过期日志
 */
export function initLogger(): void {
  // 确保日志目录存在
  if (!existsSync(LOG_DIR)) {
    mkdirSync(LOG_DIR, { recursive: true });
  }
  
  // 重写 console 方法
  console.log = createProxyMethod(originalConsole.log, "info");
  console.info = createProxyMethod(originalConsole.info, "info");
  console.warn = createProxyMethod(originalConsole.warn, "warn");
  console.error = createProxyMethod(originalConsole.error, "error");
  console.debug = createProxyMethod(originalConsole.debug, "debug");
  
  // 清理过期日志
  cleanupOldLogs();
  
  // 记录日志服务启动
  console.log("日志服务已启动，日志文件保存在:", LOG_DIR);
}

/**
 * 获取日志文件路径
 */
export function getLogFilePath(): string {
  return join(LOG_DIR, getLogFileName());
}

/**
 * 获取日志目录路径
 */
export function getLogDir(): string {
  return LOG_DIR;
}

/**
 * 获取所有日志文件列表
 */
export function getLogFiles(): string[] {
  if (!existsSync(LOG_DIR)) return [];
  
  return readdirSync(LOG_DIR)
    .filter((file) => file.endsWith(".log"))
    .sort()
    .reverse();
}
