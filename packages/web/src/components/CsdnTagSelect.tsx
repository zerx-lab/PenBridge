import { useState, useEffect, useRef } from "react";
import { trpc } from "../utils/trpc";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, X, Plus, RefreshCw, Search } from "lucide-react";
import { useDebounce } from "@/hooks/use-debounce";

interface CsdnTagSelectProps {
  value?: string[];
  onChange?: (tags: string[]) => void;
  articleTitle?: string;
  articleContent?: string;
  placeholder?: string;
  disabled?: boolean;
  maxCount?: number;
}

/**
 * CSDN 标签选择组件
 * 支持从 API 获取推荐标签，也支持实时搜索和手动输入
 */
export function CsdnTagSelect({
  value = [],
  onChange,
  articleTitle = "",
  articleContent = "",
  placeholder = "输入关键字搜索标签",
  disabled = false,
  maxCount = 5,
}: CsdnTagSelectProps) {
  const [inputValue, setInputValue] = useState("");
  const [recommendedTags, setRecommendedTags] = useState<string[]>([]);
  const [searchResults, setSearchResults] = useState<string[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // 防抖处理搜索关键字
  const debouncedKeyword = useDebounce(inputValue, 300);

  // 获取推荐标签
  const { data: tagsData, isLoading: isLoadingRecommend, refetch } = trpc.csdn.getRecommendTags.useQuery(
    { title: articleTitle, content: articleContent.substring(0, 5000) },
    {
      enabled: articleTitle.length > 0 || articleContent.length > 0,
      staleTime: 60000, // 1分钟内不重新请求
    }
  );

  // 搜索标签
  const { data: searchData, isLoading: isSearching } = trpc.csdn.searchTags.useQuery(
    { keyword: debouncedKeyword },
    {
      enabled: debouncedKeyword.length > 0,
      staleTime: 30000, // 30秒内不重新请求
    }
  );

  // 更新推荐标签
  useEffect(() => {
    if (tagsData) {
      const tags = tagsData.map((t: { name: string }) => t.name);
      setRecommendedTags(tags);
    }
  }, [tagsData]);

  // 更新搜索结果
  useEffect(() => {
    if (searchData) {
      const tags = searchData.map((t: { name: string }) => t.name);
      setSearchResults(tags);
    } else {
      setSearchResults([]);
    }
  }, [searchData]);

  // 当输入框有值时显示下拉框
  useEffect(() => {
    if (inputValue.length > 0) {
      setShowDropdown(true);
    }
  }, [inputValue]);

  // 点击外部关闭下拉框
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setShowDropdown(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // 添加标签
  const addTag = (tag: string) => {
    const trimmedTag = tag.trim();
    if (!trimmedTag) return;
    if (value.includes(trimmedTag)) return;
    if (value.length >= maxCount) return;

    onChange?.([...value, trimmedTag]);
    setInputValue("");
    setShowDropdown(false);
  };

  // 移除标签
  const removeTag = (tag: string) => {
    onChange?.(value.filter((t) => t !== tag));
  };

  // 处理输入框回车
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      // 如果有搜索结果，选择第一个；否则使用输入值
      if (searchResults.length > 0 && !value.includes(searchResults[0])) {
        addTag(searchResults[0]);
      } else if (inputValue.trim()) {
        addTag(inputValue);
      }
    } else if (e.key === "Escape") {
      setShowDropdown(false);
    }
  };

  // 处理点击推荐标签
  const handleRecommendedTagClick = (tag: string) => {
    if (!value.includes(tag) && value.length < maxCount) {
      addTag(tag);
    }
  };

  // 刷新推荐标签
  const handleRefresh = () => {
    refetch();
  };

  // 处理输入框聚焦
  const handleInputFocus = () => {
    if (inputValue.length > 0) {
      setShowDropdown(true);
    }
  };

  return (
    <div className="space-y-3">
      {/* 已选择的标签 */}
      {value.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {value.map((tag) => (
            <Badge key={tag} variant="secondary" className="gap-1 pr-1">
              {tag}
              <button
                type="button"
                onClick={() => removeTag(tag)}
                disabled={disabled}
                className="ml-1 rounded-full hover:bg-muted-foreground/20 p-0.5"
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      {/* 搜索输入框 */}
      <div className="relative">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              ref={inputRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={handleInputFocus}
              placeholder={placeholder}
              disabled={disabled || value.length >= maxCount}
              className="pl-9"
            />
            {isSearching && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 size-4 animate-spin text-muted-foreground" />
            )}
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => {
              addTag(inputValue);
            }}
            disabled={disabled || !inputValue.trim() || value.length >= maxCount}
          >
            <Plus className="size-4" />
          </Button>
        </div>

        {/* 搜索结果下拉框 */}
        {showDropdown && inputValue.length > 0 && (
          <div
            ref={dropdownRef}
            className="absolute z-50 mt-1 w-full rounded-md border bg-popover p-2 shadow-md"
          >
            {isSearching ? (
              <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                搜索中...
              </div>
            ) : searchResults.length > 0 ? (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground mb-2">搜索结果（点击添加）</p>
                <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                  {searchResults
                    .filter((tag) => !value.includes(tag))
                    .slice(0, 15)
                    .map((tag) => (
                      <Badge
                        key={tag}
                        variant="outline"
                        className="cursor-pointer hover:bg-accent transition-colors"
                        onClick={() => addTag(tag)}
                      >
                        {tag}
                      </Badge>
                    ))}
                </div>
                {searchResults.filter((tag) => !value.includes(tag)).length === 0 && (
                  <p className="text-xs text-muted-foreground py-2">
                    所有匹配标签已添加
                  </p>
                )}
              </div>
            ) : (
              <div className="py-2 text-sm text-muted-foreground">
                未找到匹配标签，按回车添加自定义标签
              </div>
            )}
          </div>
        )}
      </div>

      {/* 推荐标签 */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            推荐标签（点击添加）
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleRefresh}
            disabled={isLoadingRecommend}
            className="h-6 px-2 text-xs"
          >
            {isLoadingRecommend ? (
              <Loader2 className="size-3 mr-1 animate-spin" />
            ) : (
              <RefreshCw className="size-3 mr-1" />
            )}
            刷新
          </Button>
        </div>
        
        {isLoadingRecommend ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            正在获取推荐标签...
          </div>
        ) : recommendedTags.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {recommendedTags
              .filter((tag) => !value.includes(tag))
              .slice(0, 10)
              .map((tag) => (
                <Badge
                  key={tag}
                  variant="outline"
                  className="cursor-pointer hover:bg-accent transition-colors"
                  onClick={() => handleRecommendedTagClick(tag)}
                >
                  {tag}
                </Badge>
              ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            {articleTitle || articleContent
              ? "暂无推荐标签"
              : "请先填写文章标题和内容以获取推荐标签"}
          </p>
        )}
      </div>

      {/* 提示信息 */}
      <p className="text-xs text-muted-foreground">
        已选择 {value.length}/{maxCount} 个标签
      </p>
    </div>
  );
}

export default CsdnTagSelect;
