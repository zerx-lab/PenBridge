import { existsSync, readdirSync, unlinkSync, rmdirSync, renameSync, mkdirSync, statSync } from "fs";
import { join, basename } from "path";
import { getUploadDir } from "./dataDir";

/**
 * 图片清理配置
 */
const CLEANUP_CONFIG = {
  /** 图片需要保持未引用状态的时间（毫秒），超过此时间才会被删除 */
  MIN_UNUSED_TIME_MS: 5 * 60 * 1000, // 5分钟
  /** 回收站目录名 */
  TRASH_DIR: ".trash",
  /** 回收站保留时间（毫秒） */
  TRASH_RETENTION_MS: 24 * 60 * 60 * 1000, // 24小时
};

/**
 * 记录图片首次被标记为未引用的时间
 * key: `${articleId}/${filename}`
 */
const unusedImageTimestamps = new Map<string, number>();

/**
 * 从文章内容中提取所有引用的图片文件名
 * 支持多种格式：
 * - Markdown 图片: ![alt](url)
 * - HTML img 标签: <img src="url" />
 * - 带有标题的图片: ![alt](url "title")
 * - URL 编码的文件名
 */
function extractReferencedImages(content: string, articleId: number): Set<string> {
  const referencedImages = new Set<string>();
  
  // 辅助函数：从 URL 中提取文件名
  const extractFilename = (url: string): string | null => {
    // 处理 URL 编码
    let decodedUrl: string;
    try {
      decodedUrl = decodeURIComponent(url);
    } catch {
      decodedUrl = url;
    }
    
    // 匹配 /uploads/{articleId}/{filename} 格式
    const uploadPathMatch = decodedUrl.match(/\/uploads\/(\d+)\/([^/?#\s"']+)/);
    if (uploadPathMatch) {
      const imgArticleId = parseInt(uploadPathMatch[1], 10);
      const filename = uploadPathMatch[2];
      // 只收集属于当前文章的图片
      if (imgArticleId === articleId) {
        return filename;
      }
    }
    return null;
  };
  
  // 1. 匹配标准 Markdown 图片语法: ![alt](url) 或 ![alt](url "title")
  const markdownImageRegex = /!\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  let match;
  
  while ((match = markdownImageRegex.exec(content)) !== null) {
    const filename = extractFilename(match[1]);
    if (filename) {
      referencedImages.add(filename);
    }
  }
  
  // 2. 匹配 HTML img 标签: <img src="url" /> 或 <img src='url' />
  const htmlImgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
  
  while ((match = htmlImgRegex.exec(content)) !== null) {
    const filename = extractFilename(match[1]);
    if (filename) {
      referencedImages.add(filename);
    }
  }
  
  // 3. 匹配直接的 URL 引用（可能在代码块或其他地方）
  const directUrlRegex = /\/uploads\/(\d+)\/([^/?#\s"'<>]+)/g;
  
  while ((match = directUrlRegex.exec(content)) !== null) {
    const imgArticleId = parseInt(match[1], 10);
    if (imgArticleId === articleId) {
      let filename = match[2];
      // 处理 URL 编码
      try {
        filename = decodeURIComponent(filename);
      } catch {
        // 保持原样
      }
      referencedImages.add(filename);
    }
  }
  
  return referencedImages;
}

/**
 * 获取文章上传目录中的所有文件（排除回收站）
 */
function getUploadedFiles(articleId: number): string[] {
  const articleDir = join(getUploadDir(), String(articleId));
  
  if (!existsSync(articleDir)) {
    return [];
  }
  
  try {
    return readdirSync(articleDir).filter(
      (file) => file !== CLEANUP_CONFIG.TRASH_DIR && !file.startsWith(".")
    );
  } catch {
    return [];
  }
}

/**
 * 获取文件的修改时间
 */
function getFileModifiedTime(filePath: string): number | null {
  try {
    const stats = statSync(filePath);
    return stats.mtimeMs;
  } catch {
    return null;
  }
}

/**
 * 将文件移动到回收站而不是直接删除
 */
function moveToTrash(articleId: number, filename: string): boolean {
  const articleDir = join(getUploadDir(), String(articleId));
  const trashDir = join(articleDir, CLEANUP_CONFIG.TRASH_DIR);
  const srcPath = join(articleDir, filename);
  const destPath = join(trashDir, `${Date.now()}_${filename}`);
  
  try {
    // 确保回收站目录存在
    if (!existsSync(trashDir)) {
      mkdirSync(trashDir, { recursive: true });
    }
    
    renameSync(srcPath, destPath);
    console.log(`[ImageCleanup] 移动到回收站: ${filename}`);
    return true;
  } catch (error) {
    console.error(`[ImageCleanup] 移动到回收站失败: ${filename}`, error);
    return false;
  }
}

/**
 * 从回收站恢复文件
 */
function restoreFromTrash(articleId: number, filename: string): boolean {
  const articleDir = join(getUploadDir(), String(articleId));
  const trashDir = join(articleDir, CLEANUP_CONFIG.TRASH_DIR);
  
  if (!existsSync(trashDir)) {
    return false;
  }
  
  try {
    const trashFiles = readdirSync(trashDir);
    // 找到匹配的文件（格式: timestamp_filename）
    const matchingFile = trashFiles.find((f) => f.endsWith(`_${filename}`));
    
    if (matchingFile) {
      const srcPath = join(trashDir, matchingFile);
      const destPath = join(articleDir, filename);
      renameSync(srcPath, destPath);
      console.log(`[ImageCleanup] 从回收站恢复: ${filename}`);
      return true;
    }
  } catch (error) {
    console.error(`[ImageCleanup] 从回收站恢复失败: ${filename}`, error);
  }
  
  return false;
}

/**
 * 清理过期的回收站文件
 */
function cleanupTrash(articleId: number): void {
  const trashDir = join(getUploadDir(), String(articleId), CLEANUP_CONFIG.TRASH_DIR);
  
  if (!existsSync(trashDir)) {
    return;
  }
  
  const now = Date.now();
  
  try {
    const files = readdirSync(trashDir);
    
    for (const file of files) {
      // 文件名格式: timestamp_originalFilename
      const timestampMatch = file.match(/^(\d+)_/);
      if (timestampMatch) {
        const timestamp = parseInt(timestampMatch[1], 10);
        if (now - timestamp > CLEANUP_CONFIG.TRASH_RETENTION_MS) {
          const filePath = join(trashDir, file);
          try {
            unlinkSync(filePath);
            console.log(`[ImageCleanup] 清理过期回收站文件: ${file}`);
          } catch {
            // 忽略删除错误
          }
        }
      }
    }
    
    // 如果回收站为空，删除回收站目录
    const remainingFiles = readdirSync(trashDir);
    if (remainingFiles.length === 0) {
      rmdirSync(trashDir);
    }
  } catch {
    // 忽略错误
  }
}

/**
 * 清理文章中未被引用的图片
 * 采用安全策略：
 * 1. 图片需要持续未被引用超过一定时间才会被移动到回收站
 * 2. 先移动到回收站，而不是直接删除
 * 3. 如果图片重新被引用，会从回收站恢复
 * 
 * @param articleId 文章 ID
 * @param content 文章内容
 * @returns 清理结果
 */
export async function cleanupUnusedImages(
  articleId: number,
  content: string
): Promise<{ deleted: string[]; kept: string[]; restored: string[]; errors: string[] }> {
  const result = {
    deleted: [] as string[],
    kept: [] as string[],
    restored: [] as string[],
    errors: [] as string[],
  };

  // 获取文章引用的图片
  const referencedImages = extractReferencedImages(content, articleId);
  
  // 获取上传目录中的所有文件
  const uploadedFiles = getUploadedFiles(articleId);
  
  const articleDir = join(getUploadDir(), String(articleId));
  const now = Date.now();

  // 首先检查是否有图片需要从回收站恢复
  for (const filename of referencedImages) {
    const filePath = join(articleDir, filename);
    if (!existsSync(filePath)) {
      // 文件不存在，尝试从回收站恢复
      if (restoreFromTrash(articleId, filename)) {
        result.restored.push(filename);
      }
    }
    
    // 清除未引用标记（如果有的话）
    const key = `${articleId}/${filename}`;
    unusedImageTimestamps.delete(key);
  }

  if (uploadedFiles.length === 0) {
    // 清理过期的回收站文件
    cleanupTrash(articleId);
    return result;
  }

  for (const filename of uploadedFiles) {
    const key = `${articleId}/${filename}`;
    
    if (referencedImages.has(filename)) {
      // 文件被引用，保留并清除未引用标记
      result.kept.push(filename);
      unusedImageTimestamps.delete(key);
    } else {
      // 文件未被引用
      const filePath = join(articleDir, filename);
      
      // 检查是否是新上传的文件（5分钟内）
      const modifiedTime = getFileModifiedTime(filePath);
      if (modifiedTime && now - modifiedTime < CLEANUP_CONFIG.MIN_UNUSED_TIME_MS) {
        // 新上传的文件，暂不处理
        result.kept.push(filename);
        console.log(`[ImageCleanup] 跳过新上传的图片: ${filename}`);
        continue;
      }
      
      // 检查是否已经被标记为未引用
      const firstUnusedTime = unusedImageTimestamps.get(key);
      
      if (!firstUnusedTime) {
        // 首次标记为未引用
        unusedImageTimestamps.set(key, now);
        result.kept.push(filename);
        console.log(`[ImageCleanup] 标记未引用图片: ${filename}，将在 ${CLEANUP_CONFIG.MIN_UNUSED_TIME_MS / 1000} 秒后清理`);
      } else if (now - firstUnusedTime < CLEANUP_CONFIG.MIN_UNUSED_TIME_MS) {
        // 未达到最小未引用时间，保留
        result.kept.push(filename);
      } else {
        // 超过最小未引用时间，移动到回收站
        if (moveToTrash(articleId, filename)) {
          result.deleted.push(filename);
          unusedImageTimestamps.delete(key);
        } else {
          result.errors.push(`${filename}: 移动到回收站失败`);
        }
      }
    }
  }

  // 清理过期的回收站文件
  cleanupTrash(articleId);

  // 如果目录只剩回收站，不删除目录
  try {
    const remainingFiles = readdirSync(articleDir);
    const nonTrashFiles = remainingFiles.filter(
      (f) => f !== CLEANUP_CONFIG.TRASH_DIR
    );
    if (nonTrashFiles.length === 0 && !remainingFiles.includes(CLEANUP_CONFIG.TRASH_DIR)) {
      rmdirSync(articleDir);
      console.log(`[ImageCleanup] 删除空目录: ${articleDir}`);
    }
  } catch {
    // 忽略目录删除错误
  }

  if (result.deleted.length > 0 || result.restored.length > 0) {
    console.log(
      `[ImageCleanup] 文章 ${articleId} 清理完成: 移除 ${result.deleted.length} 个, 恢复 ${result.restored.length} 个, 保留 ${result.kept.length} 个`
    );
  }

  return result;
}

/**
 * 删除文章的所有上传图片（用于文章删除时）
 * @param articleId 文章 ID
 */
export async function deleteAllArticleImages(articleId: number): Promise<void> {
  const articleDir = join(getUploadDir(), String(articleId));
  
  if (!existsSync(articleDir)) {
    return;
  }

  try {
    // 递归删除目录（包括回收站）
    const deleteRecursively = (dir: string) => {
      const files = readdirSync(dir);
      for (const file of files) {
        const filePath = join(dir, file);
        try {
          const stat = statSync(filePath);
          if (stat.isDirectory()) {
            deleteRecursively(filePath);
            rmdirSync(filePath);
          } else {
            unlinkSync(filePath);
          }
        } catch {
          // 忽略单个文件删除错误
        }
      }
    };
    
    deleteRecursively(articleDir);
    rmdirSync(articleDir);
    
    // 清理内存中的标记
    for (const key of unusedImageTimestamps.keys()) {
      if (key.startsWith(`${articleId}/`)) {
        unusedImageTimestamps.delete(key);
      }
    }
    
    console.log(`[ImageCleanup] 删除文章 ${articleId} 的所有图片目录`);
  } catch (error) {
    console.error(`[ImageCleanup] 删除文章 ${articleId} 图片目录失败:`, error);
  }
}

/**
 * 立即清理指定文章的回收站（用于手动触发）
 * @param articleId 文章 ID
 */
export async function emptyTrash(articleId: number): Promise<{ deleted: string[] }> {
  const result = { deleted: [] as string[] };
  const trashDir = join(getUploadDir(), String(articleId), CLEANUP_CONFIG.TRASH_DIR);
  
  if (!existsSync(trashDir)) {
    return result;
  }
  
  try {
    const files = readdirSync(trashDir);
    
    for (const file of files) {
      const filePath = join(trashDir, file);
      try {
        unlinkSync(filePath);
        result.deleted.push(file);
      } catch {
        // 忽略删除错误
      }
    }
    
    // 删除回收站目录
    if (readdirSync(trashDir).length === 0) {
      rmdirSync(trashDir);
    }
    
    console.log(`[ImageCleanup] 清空文章 ${articleId} 回收站，删除 ${result.deleted.length} 个文件`);
  } catch (error) {
    console.error(`[ImageCleanup] 清空回收站失败:`, error);
  }
  
  return result;
}

/**
 * 获取图片清理配置（供外部查询）
 */
export function getCleanupConfig() {
  return { ...CLEANUP_CONFIG };
}
