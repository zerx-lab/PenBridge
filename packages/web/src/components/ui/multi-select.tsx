"use client"

import * as React from "react"
import { X, ChevronsUpDown, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"

export interface MultiSelectOption {
  value: string
  label: string
}

interface MultiSelectProps {
  /** 当前选中的值 */
  value?: MultiSelectOption[]
  /** 值变化回调 */
  onChange?: (value: MultiSelectOption[]) => void
  /** 可选项列表 */
  options?: MultiSelectOption[]
  /** 占位符 */
  placeholder?: string
  /** 搜索框占位符 */
  searchPlaceholder?: string
  /** 是否禁用 */
  disabled?: boolean
  /** 最大选择数量 */
  maxCount?: number
  /** 搜索关键词变化回调 */
  onSearch?: (keyword: string) => void
  /** 是否正在加载 */
  loading?: boolean
  /** 无匹配项时的提示 */
  emptyMessage?: string
  /** 类名 */
  className?: string
}

/**
 * 多选下拉组件
 * 使用 Popover + Command 实现，支持远程搜索
 */
export function MultiSelect({
  value = [],
  onChange,
  options = [],
  placeholder = "请选择...",
  searchPlaceholder = "搜索...",
  disabled = false,
  maxCount,
  onSearch,
  loading = false,
  emptyMessage = "未找到匹配项",
  className,
}: MultiSelectProps) {
  const [open, setOpen] = React.useState(false)
  const [searchValue, setSearchValue] = React.useState("")
  const triggerRef = React.useRef<HTMLDivElement>(null)
  const [triggerWidth, setTriggerWidth] = React.useState(0)

  // 更新触发器宽度
  React.useEffect(() => {
    if (triggerRef.current) {
      setTriggerWidth(triggerRef.current.offsetWidth)
    }
  }, [open])

  // 处理搜索
  const handleSearch = (keyword: string) => {
    setSearchValue(keyword)
    onSearch?.(keyword)
  }

  // 处理选择
  const handleSelect = (option: MultiSelectOption) => {
    const isSelected = value.some((v) => v.value === option.value)
    
    if (isSelected) {
      // 取消选择
      onChange?.(value.filter((v) => v.value !== option.value))
    } else {
      // 检查是否达到最大数量
      if (maxCount && value.length >= maxCount) {
        return
      }
      onChange?.([...value, option])
    }
  }

  // 移除已选项
  const handleRemove = (optionValue: string, e?: React.MouseEvent) => {
    e?.preventDefault()
    e?.stopPropagation()
    onChange?.(value.filter((v) => v.value !== optionValue))
  }

  // 清空所有选择
  const handleClear = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    onChange?.([])
  }

  // 判断是否已选中
  const isSelected = (optionValue: string) => {
    return value.some((v) => v.value === optionValue)
  }

  // 判断是否达到最大数量
  const isMaxReached = maxCount ? value.length >= maxCount : false

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {/* 使用 div 而不是 Button，避免嵌套 button 的问题 */}
        <div
          ref={triggerRef}
          role="combobox"
          aria-expanded={open}
          aria-disabled={disabled}
          tabIndex={disabled ? -1 : 0}
          className={cn(
            "flex w-full items-center justify-between font-normal h-auto min-h-9 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            "cursor-pointer select-none",
            disabled && "cursor-not-allowed opacity-50",
            !value.length && "text-muted-foreground",
            className
          )}
          onClick={() => !disabled && setOpen(true)}
          onKeyDown={(e) => {
            if (!disabled && (e.key === "Enter" || e.key === " ")) {
              e.preventDefault()
              setOpen(true)
            }
          }}
        >
          <div className="flex flex-wrap gap-1 flex-1">
            {value.length > 0 ? (
              value.map((option) => (
                <Badge
                  key={option.value}
                  variant="secondary"
                  className="px-1.5 py-0 h-5 gap-0.5 text-xs font-normal"
                >
                  {option.label}
                  <span
                    role="button"
                    tabIndex={0}
                    className="ml-0.5 rounded-full outline-none ring-offset-background focus:ring-2 focus:ring-ring focus:ring-offset-1 hover:bg-muted-foreground/20 cursor-pointer"
                    onMouseDown={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                    }}
                    onClick={(e) => handleRemove(option.value, e)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault()
                        e.stopPropagation()
                        handleRemove(option.value)
                      }
                    }}
                  >
                    <X className="size-3" />
                  </span>
                </Badge>
              ))
            ) : (
              <span>{placeholder}</span>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0 ml-2">
            {value.length > 0 && (
              <span
                role="button"
                tabIndex={0}
                className="rounded-full outline-none ring-offset-background focus:ring-2 focus:ring-ring focus:ring-offset-1 hover:bg-muted-foreground/20 p-0.5 cursor-pointer"
                onMouseDown={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                }}
                onClick={handleClear}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault()
                    e.stopPropagation()
                    onChange?.([])
                  }
                }}
              >
                <X className="size-3 text-muted-foreground" />
              </span>
            )}
            <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
          </div>
        </div>
      </PopoverTrigger>
      {/* 条件渲染：只在 Popover 打开时才渲染 Command 组件，减少初始渲染开销 */}
      {open && (
        <PopoverContent
          className="p-0"
          style={{ width: triggerWidth > 0 ? triggerWidth : undefined }}
          align="start"
        >
          <Command shouldFilter={false}>
            <CommandInput
              placeholder={searchPlaceholder}
              value={searchValue}
              onValueChange={handleSearch}
            />
            <CommandList>
              {loading ? (
                <div className="py-6 text-center text-sm">
                  <Loader2 className="size-4 animate-spin mx-auto" />
                </div>
              ) : options.length === 0 ? (
                <CommandEmpty>{emptyMessage}</CommandEmpty>
              ) : (
                <CommandGroup>
                  {options.map((option) => {
                    const selected = isSelected(option.value)
                    const disabledOption = !selected && isMaxReached
                    return (
                      <CommandItem
                        key={option.value}
                        value={option.value}
                        onSelect={() => !disabledOption && handleSelect(option)}
                        disabled={disabledOption}
                        className={cn(
                          "cursor-pointer",
                          selected && "bg-accent",
                          disabledOption && "opacity-50 cursor-not-allowed"
                        )}
                      >
                        <div
                          className={cn(
                            "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary",
                            selected
                              ? "bg-primary text-primary-foreground"
                              : "opacity-50"
                          )}
                        >
                          {selected && (
                            <svg
                              className="size-3"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth={3}
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M5 13l4 4L19 7"
                              />
                            </svg>
                          )}
                        </div>
                        {option.label}
                      </CommandItem>
                    )
                  })}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      )}
    </Popover>
  )
}

export default MultiSelect
