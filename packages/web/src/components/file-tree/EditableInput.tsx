import { useState, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";

interface EditableInputProps {
  defaultValue: string;
  onSave: (value: string) => void;
  onCancel: () => void;
}

/**
 * 可编辑的输入框组件
 * 用于文件夹和文章的重命名操作
 */
export function EditableInput({
  defaultValue,
  onSave,
  onCancel,
}: EditableInputProps) {
  const [value, setValue] = useState(defaultValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      if (value.trim()) {
        onSave(value.trim());
      }
    } else if (e.key === "Escape") {
      onCancel();
    }
  };

  return (
    <Input
      ref={inputRef}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={handleKeyDown}
      onBlur={() => {
        if (value.trim()) {
          onSave(value.trim());
        } else {
          onCancel();
        }
      }}
      className="h-6 text-sm px-1 py-0"
    />
  );
}
