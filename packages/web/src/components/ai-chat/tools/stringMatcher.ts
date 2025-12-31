/**
 * 精确字符串匹配工具
 * 
 * 设计原则（参考 Claude Code Edit tool）：
 * 1. 只进行精确字符串匹配，不使用模糊匹配
 * 2. 如果找不到匹配，返回失败
 * 3. 如果找到多个匹配，返回失败（除非使用 replaceAll）
 * 4. 自动处理换行符标准化和行号前缀
 */

export interface MatchResult {
  found: boolean;
  matchCount: number;
  position?: number;
  /** 所有匹配的位置 */
  positions?: number[];
  /** 匹配策略：exact=精确匹配，normalized=标准化后匹配 */
  strategy: 'exact' | 'normalized' | 'none';
  /** 错误信息 */
  error?: string;
  /** 警告信息 */
  warnings: string[];
  /** 多匹配时的预览信息 */
  matchPreviews?: MatchPreview[];
}

export interface MatchPreview {
  position: number;
  lineNumber: number;
  preview: string;
}

/**
 * 标准化换行符（统一为 LF）
 */
export function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

/**
 * 去除行号前缀
 * 匹配格式："  1 | 内容" 或 " 10 | 内容" 或 "100 | 内容"
 */
export function stripLineNumbers(text: string): string {
  return text.replace(/^\s*\d+\s+[|→]\s*/gm, '');
}

/**
 * 获取文本在内容中的行号
 */
function getLineNumber(content: string, position: number): number {
  return content.substring(0, position).split('\n').length;
}

/**
 * 获取匹配位置的上下文预览
 */
function getContextPreview(content: string, position: number, contextLines: number = 2): string {
  const lines = content.split('\n');
  const lineNum = getLineNumber(content, position);
  const start = Math.max(0, lineNum - 1 - contextLines);
  const end = Math.min(lines.length, lineNum + contextLines);

  return lines.slice(start, end)
    .map((line, i) => {
      const currentLine = start + i + 1;
      const marker = currentLine === lineNum ? '→' : ' ';
      return `${marker} ${currentLine.toString().padStart(4)} | ${line}`;
    })
    .join('\n');
}

/**
 * 查找所有匹配位置
 */
function findAllOccurrences(content: string, search: string): number[] {
  const positions: number[] = [];
  let position = 0;

  while (position < content.length) {
    const index = content.indexOf(search, position);
    if (index === -1) break;
    positions.push(index);
    position = index + 1;
  }

  return positions;
}

/**
 * 精确字符串匹配（Claude Code 风格）
 * 
 * 匹配逻辑：
 * 1. 首先尝试精确匹配
 * 2. 如果精确匹配失败，尝试标准化换行符后匹配
 * 3. 如果还是失败，尝试去除行号前缀后匹配
 * 
 * 匹配结果：
 * - 找到 0 个：返回失败，错误 "搜索文本未找到匹配"
 * - 找到 1 个：返回成功
 * - 找到多个：返回失败，错误 "搜索文本找到多次匹配，需要提供更多上下文来唯一定位"
 * 
 * @param content 文档内容
 * @param searchText 要查找的文本
 * @param options.requireUnique 是否要求唯一匹配（默认 true）
 */
export function exactMatch(
  content: string,
  searchText: string,
  options: {
    requireUnique?: boolean;
  } = {}
): MatchResult {
  const warnings: string[] = [];
  const requireUnique = options.requireUnique ?? true;

  // 验证搜索文本不能为空
  if (!searchText || searchText.trim() === '') {
    return {
      found: false,
      matchCount: 0,
      strategy: 'none',
      error: '搜索文本不能为空',
      warnings: [],
    };
  }

  // 策略 1：精确匹配（原始内容）
  const exactPositions = findAllOccurrences(content, searchText);
  
  if (exactPositions.length === 1) {
    return {
      found: true,
      matchCount: 1,
      position: exactPositions[0],
      positions: exactPositions,
      strategy: 'exact',
      warnings: [],
    };
  }

  if (exactPositions.length > 1) {
    if (requireUnique) {
      return {
        found: false,
        matchCount: exactPositions.length,
        positions: exactPositions,
        strategy: 'exact',
        error: '搜索文本找到多次匹配，需要提供更多上下文来唯一定位',
        warnings: [],
        matchPreviews: exactPositions.slice(0, 5).map(pos => ({
          position: pos,
          lineNumber: getLineNumber(content, pos),
          preview: getContextPreview(content, pos, 1),
        })),
      };
    }
    // 不要求唯一时，返回所有位置
    return {
      found: true,
      matchCount: exactPositions.length,
      position: exactPositions[0],
      positions: exactPositions,
      strategy: 'exact',
      warnings: [`找到 ${exactPositions.length} 个匹配`],
    };
  }

  // 策略 2：标准化换行符后匹配
  const normalizedContent = normalizeLineEndings(content);
  const normalizedSearch = normalizeLineEndings(searchText);

  if (normalizedSearch !== searchText) {
    warnings.push('已标准化换行符');
  }

  const normalizedPositions = findAllOccurrences(normalizedContent, normalizedSearch);

  if (normalizedPositions.length === 1) {
    return {
      found: true,
      matchCount: 1,
      position: normalizedPositions[0],
      positions: normalizedPositions,
      strategy: 'normalized',
      warnings,
    };
  }

  if (normalizedPositions.length > 1) {
    if (requireUnique) {
      return {
        found: false,
        matchCount: normalizedPositions.length,
        positions: normalizedPositions,
        strategy: 'normalized',
        error: '搜索文本找到多次匹配，需要提供更多上下文来唯一定位',
        warnings,
        matchPreviews: normalizedPositions.slice(0, 5).map(pos => ({
          position: pos,
          lineNumber: getLineNumber(normalizedContent, pos),
          preview: getContextPreview(normalizedContent, pos, 1),
        })),
      };
    }
    return {
      found: true,
      matchCount: normalizedPositions.length,
      position: normalizedPositions[0],
      positions: normalizedPositions,
      strategy: 'normalized',
      warnings: [...warnings, `找到 ${normalizedPositions.length} 个匹配`],
    };
  }

  // 策略 3：去除行号前缀后匹配
  const cleanedSearch = stripLineNumbers(normalizedSearch);

  if (cleanedSearch !== normalizedSearch) {
    warnings.push('已移除行号前缀');

    const cleanedPositions = findAllOccurrences(normalizedContent, cleanedSearch);

    if (cleanedPositions.length === 1) {
      return {
        found: true,
        matchCount: 1,
        position: cleanedPositions[0],
        positions: cleanedPositions,
        strategy: 'normalized',
        warnings,
      };
    }

    if (cleanedPositions.length > 1) {
      if (requireUnique) {
        return {
          found: false,
          matchCount: cleanedPositions.length,
          positions: cleanedPositions,
          strategy: 'normalized',
          error: '搜索文本找到多次匹配，需要提供更多上下文来唯一定位',
          warnings,
          matchPreviews: cleanedPositions.slice(0, 5).map(pos => ({
            position: pos,
            lineNumber: getLineNumber(normalizedContent, pos),
            preview: getContextPreview(normalizedContent, pos, 1),
          })),
        };
      }
      return {
        found: true,
        matchCount: cleanedPositions.length,
        position: cleanedPositions[0],
        positions: cleanedPositions,
        strategy: 'normalized',
        warnings: [...warnings, `找到 ${cleanedPositions.length} 个匹配`],
      };
    }
  }

  // 未找到任何匹配
  return {
    found: false,
    matchCount: 0,
    strategy: 'none',
    error: '搜索文本未找到匹配',
    warnings,
  };
}

/**
 * 执行精确替换
 * 
 * @param content 原始内容
 * @param searchText 要查找的文本
 * @param replaceText 替换文本
 * @param options.replaceAll 是否替换所有匹配（默认 false）
 */
export function exactReplace(
  content: string,
  searchText: string,
  replaceText: string,
  options: {
    replaceAll?: boolean;
  } = {}
): {
  success: boolean;
  newContent?: string;
  matchCount: number;
  error?: string;
  warnings: string[];
  matchPreviews?: MatchPreview[];
} {
  const replaceAll = options.replaceAll ?? false;

  // 先进行匹配
  const matchResult = exactMatch(content, searchText, {
    requireUnique: !replaceAll,
  });

  if (!matchResult.found) {
    return {
      success: false,
      matchCount: matchResult.matchCount,
      error: matchResult.error,
      warnings: matchResult.warnings,
      matchPreviews: matchResult.matchPreviews,
    };
  }

  // 执行替换
  const normalizedContent = normalizeLineEndings(content);
  const normalizedSearch = stripLineNumbers(normalizeLineEndings(searchText));
  const normalizedReplace = normalizeLineEndings(replaceText);

  let newContent: string;
  
  if (replaceAll) {
    // 替换所有匹配
    newContent = normalizedContent.split(normalizedSearch).join(normalizedReplace);
  } else {
    // 只替换第一个匹配
    newContent = normalizedContent.replace(normalizedSearch, normalizedReplace);
  }

  return {
    success: true,
    newContent,
    matchCount: matchResult.matchCount,
    warnings: matchResult.warnings,
  };
}
