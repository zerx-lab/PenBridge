// 文件夹项类型
export interface FolderItem {
  id: number;
  name: string;
  parentId?: number;
  isExpanded: boolean;
  order: number;
}

// 文章项类型
export interface ArticleItem {
  id: number;
  title: string;
  folderId?: number;
  order: number;
  status: string;
}

// 树节点类型
export interface TreeNode {
  type: "folder" | "article";
  id: number;
  name: string;
  parentId?: number;
  isExpanded?: boolean;
  status?: string;
  children?: TreeNode[];
}

// 拖拽数据类型
export interface DragData {
  type: "folder" | "article";
  id: number;
  name: string;
  parentId?: number;
}

// 拖拽目标类型
export type DropTarget =
  | {
      type: "folder";
      id: number;
    }
  | {
      type: "root";
    };

// 删除目标类型
export interface DeleteTarget {
  type: "folder" | "article";
  id: number;
  name: string;
}
