// 导出选项类型
export interface ExportOptions {
  includeArticles: boolean;
  includeFolders: boolean;
  includeUsers: boolean;
  includeAdminUsers: boolean;
  includeAIProviders: boolean;
  includeEmailConfig: boolean;
  includeScheduledTasks: boolean;
  includeImages: boolean;
  includeSensitiveData: boolean;
  encryptionPassword: string;
}

// 导入选项类型
export interface ImportOptions {
  decryptionPassword: string;
  overwriteExisting: boolean;
}

// 预览数据类型
export interface PreviewData {
  version: string;
  exportedAt: string;
  isEncrypted: boolean;
  counts: {
    users: number;
    adminUsers: number;
    folders: number;
    articles: number;
    aiProviders: number;
    aiModels: number;
    emailConfig: boolean;
    scheduledTasks: number;
    images: number;
  };
}

// 导入结果类型
export interface ImportResult {
  success: boolean;
  imported: {
    users: number;
    adminUsers: number;
    folders: number;
    articles: number;
    aiProviders: number;
    aiModels: number;
    emailConfig: boolean;
    scheduledTasks: number;
    images: number;
  };
  skipped: {
    users: number;
    adminUsers: number;
    folders: number;
    articles: number;
    aiProviders: number;
    aiModels: number;
    scheduledTasks: number;
    images: number;
  };
  errors: string[];
}

// 默认导出选项
export const defaultExportOptions: ExportOptions = {
  includeArticles: true,
  includeFolders: true,
  includeUsers: true,
  includeAdminUsers: false,
  includeAIProviders: true,
  includeEmailConfig: true,
  includeScheduledTasks: true,
  includeImages: true,
  includeSensitiveData: false,
  encryptionPassword: "",
};

// 默认导入选项
export const defaultImportOptions: ImportOptions = {
  decryptionPassword: "",
  overwriteExisting: false,
};
