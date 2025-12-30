import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
} from "typeorm";
import { Article } from "./Article";
import { User } from "./User";

/**
 * 定时任务状态
 */
export enum TaskStatus {
  PENDING = "pending",     // 待执行
  RUNNING = "running",     // 执行中
  SUCCESS = "success",     // 成功
  FAILED = "failed",       // 失败
  CANCELLED = "cancelled", // 已取消
}

/**
 * 支持的发布平台
 */
export enum Platform {
  TENCENT = "tencent",  // 腾讯云开发者社区
  JUEJIN = "juejin",    // 掘金（预留）
  CSDN = "csdn",        // CSDN（预留）
}

/**
 * 腾讯云发布配置
 */
export interface TencentPublishConfig {
  tagIds: number[];
  tagNames?: string[];  // 用于显示
  sourceType: 1 | 2 | 3;  // 1-原创, 2-转载, 3-翻译
  summary?: string;
}

/**
 * 掘金发布配置
 */
export interface JuejinPublishConfig {
  categoryId: string;       // 分类ID
  categoryName?: string;    // 分类名称，用于显示
  tagIds: string[];         // 标签ID列表
  tagNames?: string[];      // 标签名称列表，用于显示
  briefContent: string;     // 文章摘要（50-100字）
  isOriginal: 0 | 1;        // 0-转载, 1-原创
}

/**
 * 平台配置类型
 */
export type PlatformConfig = TencentPublishConfig | JuejinPublishConfig;

/**
 * 定时发布任务实体
 */
@Entity("scheduled_tasks")
export class ScheduledTask {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => Article, { onDelete: "CASCADE" })
  article!: Article;

  @Column()
  articleId!: number;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  user!: User;

  @Column()
  userId!: number;

  @Column({ type: "text", default: Platform.TENCENT })
  platform!: Platform;

  @Column({ type: "simple-json" })
  config!: PlatformConfig;

  @Column()
  scheduledAt!: Date;

  @Column({ type: "text", default: TaskStatus.PENDING })
  status!: TaskStatus;

  @Column({ type: "text", nullable: true })
  errorMessage?: string;

  @Column({ nullable: true })
  executedAt?: Date;

  @Column({ nullable: true })
  resultUrl?: string;  // 发布成功后的文章链接

  @Column({ default: 0 })
  retryCount!: number;  // 重试次数

  @Column({ default: 3 })
  maxRetries!: number;  // 最大重试次数

  @Column({ default: false })
  notified!: boolean;  // 是否已发送通知

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
