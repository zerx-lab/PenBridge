import { useState, useEffect, useRef } from "react";
import { trpc } from "../utils/trpc";
import { MultiSelect, type MultiSelectOption } from "@/components/ui/multi-select";

interface TagOption {
  tag_id: string;
  tag_name: string;
}

interface LabelValue {
  value: string;
  label: string;
}

interface JuejinTagSelectProps {
  value?: LabelValue[];
  onChange?: (tags: LabelValue[]) => void;
  placeholder?: string;
  disabled?: boolean;
  maxCount?: number;
  // getPopupContainer 在新组件中不再需要，但保留接口兼容性
  getPopupContainer?: () => HTMLElement;
}

/**
 * 掘金标签选择组件
 * 支持搜索掘金的标签，最多选择3个
 */
export function JuejinTagSelect({
  value = [],
  onChange,
  placeholder = "搜索并选择标签（至少1个，最多3个）",
  disabled = false,
  maxCount = 3,
}: JuejinTagSelectProps) {
  const [searchValue, setSearchValue] = useState("");
  const [debouncedSearchValue, setDebouncedSearchValue] = useState("");
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
  const { data: searchResults, isFetching } = trpc.juejin.searchTags.useQuery(
    { keyword: debouncedSearchValue },
    {
      enabled: debouncedSearchValue.length >= 1,
      staleTime: 30000,
    }
  );

  // 处理搜索
  const handleSearch = (keyword: string) => {
    setSearchValue(keyword);
  };

  // 处理选择变化
  const handleChange = (newValues: MultiSelectOption[]) => {
    // 转换为 LabelValue 类型
    const labelValues: LabelValue[] = newValues.map((v) => ({
      value: v.value,
      label: v.label,
    }));
    onChange?.(labelValues);
  };

  // 构建选项列表
  const options: MultiSelectOption[] = (searchResults || []).map(
    (tag: TagOption) => ({
      value: tag.tag_id,
      label: tag.tag_name,
    })
  );

  // 转换 value 为 MultiSelectOption 类型
  const selectedValues: MultiSelectOption[] = value.map((v) => ({
    value: v.value,
    label: v.label,
  }));

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
      value={selectedValues}
      onChange={handleChange}
      options={options}
      placeholder={placeholder}
      searchPlaceholder="输入关键词搜索标签..."
      disabled={disabled}
      maxCount={maxCount}
      onSearch={handleSearch}
      loading={isFetching}
      emptyMessage={getEmptyMessage()}
    />
  );
}

export default JuejinTagSelect;
