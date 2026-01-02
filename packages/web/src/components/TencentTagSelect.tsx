import { useState, useEffect, useRef } from "react";
import { trpc } from "../utils/trpc";
import { MultiSelect, type MultiSelectOption } from "@/components/ui/multi-select";

interface TagOption {
  tagId: number;
  tagName: string;
}

interface TencentTagSelectProps {
  value?: number[];
  onChange?: (tagIds: number[]) => void;
  placeholder?: string;
  disabled?: boolean;
  // getPopupContainer 在新组件中不再需要，但保留接口兼容性
  getPopupContainer?: () => HTMLElement;
}

/**
 * 腾讯云标签选择组件
 * 支持搜索腾讯云开发者社区的标签
 */
export function TencentTagSelect({
  value = [],
  onChange,
  placeholder = "搜索并选择标签（发布文章至少需要1个标签）",
  disabled = false,
}: TencentTagSelectProps) {
  const [searchValue, setSearchValue] = useState("");
  const [debouncedSearchValue, setDebouncedSearchValue] = useState("");
  // 存储已选中标签的完整信息（id + name）
  const [selectedOptions, setSelectedOptions] = useState<MultiSelectOption[]>([]);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 防抖处理搜索值
  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    if (!searchValue.trim()) {
      setDebouncedSearchValue("");
      return;
    }

    debounceTimerRef.current = setTimeout(() => {
      setDebouncedSearchValue(searchValue.trim());
    }, 300);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [searchValue]);

  // 搜索标签 - 只在有内容时才请求
  const { data: searchResults, isFetching } = trpc.sync.searchTags.useQuery(
    { keyword: debouncedSearchValue },
    {
      enabled: debouncedSearchValue.length >= 1,
      staleTime: 30000,
    }
  );

  // 当外部 value 变化且为空时，清空内部状态
  useEffect(() => {
    if (!value || value.length === 0) {
      setSelectedOptions([]);
    }
  }, [value]);

  // 处理搜索
  const handleSearch = (keyword: string) => {
    setSearchValue(keyword);
  };

  // 处理选择变化
  const handleChange = (newValues: MultiSelectOption[]) => {
    setSelectedOptions(newValues);
    // 转换为 number[] 类型
    onChange?.(newValues.map((item) => Number(item.value)));
  };

  // 构建选项列表
  const options: MultiSelectOption[] = (searchResults || []).map(
    (tag: TagOption) => ({
      value: String(tag.tagId),
      label: tag.tagName,
    })
  );

  // 判断是否正在输入（防抖中）
  const isTyping = searchValue.trim() !== debouncedSearchValue;

  // 计算提示消息
  const getEmptyMessage = () => {
    if (isTyping && searchValue.trim()) {
      return "正在输入...";
    }
    if (debouncedSearchValue) {
      return "未找到匹配的标签";
    }
    return "请输入关键词搜索标签";
  };

  return (
    <MultiSelect
      value={selectedOptions}
      onChange={handleChange}
      options={options}
      placeholder={placeholder}
      searchPlaceholder="输入关键词搜索标签..."
      disabled={disabled}
      onSearch={handleSearch}
      loading={isFetching}
      emptyMessage={getEmptyMessage()}
    />
  );
}

export default TencentTagSelect;
