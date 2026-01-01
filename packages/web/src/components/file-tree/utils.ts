import type { FolderItem, ArticleItem, TreeNode } from "./types";

/**
 * 构建树结构
 * 将文件夹和文章列表转换为树形结构
 */
export function buildTree(
  folders: FolderItem[],
  articles: ArticleItem[]
): TreeNode[] {
  const folderMap = new Map<number, TreeNode>();
  const rootNodes: TreeNode[] = [];

  // 创建文件夹节点
  folders.forEach((folder) => {
    folderMap.set(folder.id, {
      type: "folder",
      id: folder.id,
      name: folder.name,
      parentId: folder.parentId,
      isExpanded: folder.isExpanded,
      children: [],
    });
  });

  // 构建文件夹层级
  folders.forEach((folder) => {
    const node = folderMap.get(folder.id)!;
    if (folder.parentId && folderMap.has(folder.parentId)) {
      folderMap.get(folder.parentId)!.children!.push(node);
    } else {
      rootNodes.push(node);
    }
  });

  // 添加文章到对应文件夹或根目录
  articles.forEach((article) => {
    const articleNode: TreeNode = {
      type: "article",
      id: article.id,
      name: article.title || "无标题",
      parentId: article.folderId,
      status: article.status,
    };

    if (article.folderId && folderMap.has(article.folderId)) {
      folderMap.get(article.folderId)!.children!.push(articleNode);
    } else {
      rootNodes.push(articleNode);
    }
  });

  return rootNodes;
}
