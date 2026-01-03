import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from "typeorm";

/**
 * GitHub Copilot 认证实体
 * 存储 OAuth 认证信息
 */
@Entity("copilot_auth")
export class CopilotAuth {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  userId!: number;

  // OAuth access_token（长期有效，用于刷新 Copilot API token）
  @Column()
  refreshToken!: string;

  // Copilot API token（短期有效，约 30 分钟）
  @Column()
  accessToken!: string;

  // Copilot API token 过期时间戳（毫秒）
  @Column({ type: "integer" })
  expiresAt!: number;

  // GitHub Enterprise URL（可选，企业版使用）
  @Column({ nullable: true })
  enterpriseUrl?: string;

  // GitHub 用户名（可选，用于显示）
  @Column({ nullable: true })
  username?: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
