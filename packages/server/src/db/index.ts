import { DataSource } from "typeorm";
import { User } from "../entities/User";
import { Article } from "../entities/Article";
import { Folder } from "../entities/Folder";
import { ScheduledTask } from "../entities/ScheduledTask";
import { EmailConfig } from "../entities/EmailConfig";
import { AdminUser } from "../entities/AdminUser";
import { AdminSession } from "../entities/AdminSession";
import { AIProvider, AIModel } from "../entities/AIProvider";
import { AIChatSession, AIChatMessage } from "../entities/AIChat";
// @ts-ignore
import initSqlJs from "sql.js";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { dirname } from "path";

const DB_PATH = "data/pen-bridge.db";

// 确保数据目录存在
const dataDir = dirname(DB_PATH);
if (!existsSync(dataDir)) {
  mkdirSync(dataDir, { recursive: true });
}

// 防抖保存：避免频繁写入磁盘
let saveTimeout: ReturnType<typeof setTimeout> | null = null;
let pendingData: Uint8Array | null = null;
const SAVE_DEBOUNCE_MS = 100; // 100ms 防抖

const debouncedSave = (data: Uint8Array) => {
  pendingData = data;
  if (saveTimeout) {
    clearTimeout(saveTimeout);
  }
  saveTimeout = setTimeout(() => {
    if (pendingData) {
      writeFileSync(DB_PATH, Buffer.from(pendingData));
      pendingData = null;
    }
    saveTimeout = null;
  }, SAVE_DEBOUNCE_MS);
};

export const AppDataSource = new DataSource({
  type: "sqljs",
  database: existsSync(DB_PATH) ? readFileSync(DB_PATH) : undefined,
  synchronize: true, // 自动迁移数据模型
  logging: false,
  entities: [User, Article, Folder, ScheduledTask, EmailConfig, AdminUser, AdminSession, AIProvider, AIModel, AIChatSession, AIChatMessage],
  driver: await initSqlJs(),
  autoSave: true,
  autoSaveCallback: debouncedSave, // 使用防抖保存
});

export async function initDatabase() {
  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
    console.log("Database initialized");
  }
  return AppDataSource;
}
