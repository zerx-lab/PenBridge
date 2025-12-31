import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from "typeorm";
import { AdminUser, AdminRole } from "./AdminUser";

@Entity("admin_sessions")
export class AdminSession {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index() // 显式索引，优化 token 查询验证
  @Column({ unique: true })
  token!: string;

  @Column()
  adminId!: number;

  @ManyToOne(() => AdminUser, { onDelete: "CASCADE" })
  @JoinColumn({ name: "adminId" })
  admin!: AdminUser;

  @Column()
  username!: string;

  @Column({ type: "varchar" })
  role!: AdminRole;

  @Column()
  expiresAt!: Date;

  @CreateDateColumn()
  createdAt!: Date;
}
