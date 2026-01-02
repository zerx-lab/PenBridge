/**
 * 注册 remark-directive 插件
 * 用于解析 :::, ::, : 语法
 */

import { $remark } from "@milkdown/kit/utils";
import directive from "remark-directive";

/**
 * remark-directive 插件
 */
export const remarkDirectivePlugin = $remark("remarkDirective", () => directive);
