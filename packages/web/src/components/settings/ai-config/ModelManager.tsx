import { useState } from "react";
import {
  Bot,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/utils/trpc";
import { message } from "antd";
import type { Provider, Model, ModelFormData } from "./types";
import { defaultCapabilities } from "./types";

interface ModelManagerProps {
  providers: Provider[] | undefined;
  models: Model[] | undefined;
  onTestModel: (model: Model) => void;
}

export function ModelManager({ providers, models, onTestModel }: ModelManagerProps) {
  const utils = trpc.useContext();

  // 模型表单状态
  const [showModelDialog, setShowModelDialog] = useState(false);
  const [editingModel, setEditingModel] = useState<Model | null>(null);
  const [selectedProviderId, setSelectedProviderId] = useState<number | null>(null);
  const [modelForm, setModelForm] = useState<ModelFormData>({
    modelId: "",
    displayName: "",
    isDefault: false,
    contextLength: undefined,
    parameters: {
      temperature: 0.7,
      maxTokens: 4096,
    },
    capabilities: defaultCapabilities,
  });

  // 创建模型
  const createModelMutation = trpc.aiConfig.createModel.useMutation({
    onSuccess: () => {
      message.success("模型创建成功");
      setShowModelDialog(false);
      resetModelForm();
      utils.aiConfig.listModels.invalidate();
    },
    onError: (error: Error) => {
      message.error(`创建失败: ${error.message}`);
    },
  });

  // 更新模型
  const updateModelMutation = trpc.aiConfig.updateModel.useMutation({
    onSuccess: () => {
      message.success("模型更新成功");
      setShowModelDialog(false);
      setEditingModel(null);
      resetModelForm();
      utils.aiConfig.listModels.invalidate();
    },
    onError: (error: Error) => {
      message.error(`更新失败: ${error.message}`);
    },
  });

  // 删除模型
  const deleteModelMutation = trpc.aiConfig.deleteModel.useMutation({
    onSuccess: () => {
      message.success("模型已删除");
      utils.aiConfig.listModels.invalidate();
    },
    onError: (error: Error) => {
      message.error(`删除失败: ${error.message}`);
    },
  });

  const resetModelForm = () => {
    setModelForm({
      modelId: "",
      displayName: "",
      isDefault: false,
      contextLength: undefined,
      parameters: { temperature: 0.7, maxTokens: 4096 },
      capabilities: defaultCapabilities,
    });
    setSelectedProviderId(null);
  };

  const handleEditModel = (model: Model) => {
    setEditingModel(model);
    setSelectedProviderId(model.providerId);
    
    // 深度合并 capabilities，确保所有字段都有默认值
    const modelCapabilities = model.capabilities || {};
    const mergedCapabilities = {
      thinking: {
        ...defaultCapabilities.thinking,
        ...(modelCapabilities.thinking || {}),
      },
      streaming: {
        ...defaultCapabilities.streaming,
        ...(modelCapabilities.streaming || {}),
      },
      functionCalling: {
        ...defaultCapabilities.functionCalling,
        ...(modelCapabilities.functionCalling || {}),
      },
      vision: {
        ...defaultCapabilities.vision,
        ...(modelCapabilities.vision || {}),
      },
      aiLoop: {
        ...defaultCapabilities.aiLoop,
        ...(modelCapabilities.aiLoop || {}),
      },
    };
    
    setModelForm({
      modelId: model.modelId,
      displayName: model.displayName,
      isDefault: model.isDefault,
      contextLength: model.contextLength,
      parameters: model.parameters || { temperature: 0.7, maxTokens: 4096 },
      capabilities: mergedCapabilities,
    });
    setShowModelDialog(true);
  };

  const handleSaveModel = () => {
    if (!selectedProviderId) {
      message.error("请选择供应商");
      return;
    }
    if (!modelForm.modelId.trim()) {
      message.error("请输入模型标识");
      return;
    }
    if (!modelForm.displayName.trim()) {
      message.error("请输入显示名称");
      return;
    }
    // 验证工具最大调用次数
    const maxLoopCount = modelForm.capabilities.aiLoop.maxLoopCount;
    if (maxLoopCount < 1 || maxLoopCount > 100) {
      message.error("工具最大调用次数必须在 1-100 之间");
      return;
    }

    if (editingModel) {
      updateModelMutation.mutate({
        id: editingModel.id,
        ...modelForm,
      });
    } else {
      createModelMutation.mutate({
        providerId: selectedProviderId,
        ...modelForm,
      });
    }
  };

  const handleDeleteModel = (model: Model) => {
    if (confirm(`确定要删除模型 "${model.displayName}" 吗？`)) {
      deleteModelMutation.mutate({ id: model.id });
    }
  };

  const getProviderName = (providerId: number) => {
    return providers?.find((p) => p.id === providerId)?.name || "未知供应商";
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <CardTitle className="text-base flex items-center gap-2">
              <Bot className="h-4 w-4" />
              AI 模型
            </CardTitle>
            <CardDescription>
              配置具体的模型，如 GPT-4o、Claude-3-Opus 等
            </CardDescription>
          </div>
          <Dialog open={showModelDialog} onOpenChange={(open) => {
            setShowModelDialog(open);
            if (!open) {
              setEditingModel(null);
              resetModelForm();
            }
          }}>
            <DialogTrigger asChild>
              <Button size="sm" disabled={!providers || providers.length === 0}>
                <Plus className="h-4 w-4 mr-1" />
                添加模型
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[85vh] flex flex-col">
              <DialogHeader>
                <DialogTitle>{editingModel ? "编辑模型" : "添加模型"}</DialogTitle>
                <DialogDescription>
                  配置具体的 AI 模型
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4 overflow-y-auto flex-1 pr-2">
                <div className="space-y-2">
                  <Label htmlFor="model-provider">所属供应商</Label>
                  <Select
                    value={selectedProviderId?.toString() || ""}
                    onValueChange={(value) => setSelectedProviderId(parseInt(value))}
                    disabled={!!editingModel}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="选择供应商" />
                    </SelectTrigger>
                    <SelectContent>
                      {providers?.map((provider) => (
                        <SelectItem key={provider.id} value={provider.id.toString()}>
                          {provider.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="model-id">模型标识</Label>
                  <Input
                    id="model-id"
                    placeholder="如: gpt-4o、claude-3-opus-20240229"
                    value={modelForm.modelId}
                    onChange={(e) => setModelForm({ ...modelForm, modelId: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">
                    请输入 API 调用时使用的模型名称
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="model-displayName">显示名称</Label>
                  <Input
                    id="model-displayName"
                    placeholder="如: GPT-4o 最新版"
                    value={modelForm.displayName}
                    onChange={(e) => setModelForm({ ...modelForm, displayName: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="model-contextLength">上下文最大长度 (Tokens)</Label>
                  <Input
                    id="model-contextLength"
                    type="number"
                    min="1"
                    placeholder="如: 128000 (可选)"
                    value={modelForm.contextLength || ""}
                    onChange={(e) => setModelForm({ 
                      ...modelForm, 
                      contextLength: e.target.value ? parseInt(e.target.value) : undefined 
                    })}
                  />
                  <p className="text-xs text-muted-foreground">
                    模型支持的最大上下文长度，用于在 AI 助手中展示 Token 使用进度
                  </p>
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="model-isDefault" className="flex items-center gap-2">
                    设为默认模型
                  </Label>
                  <Switch
                    id="model-isDefault"
                    checked={modelForm.isDefault}
                    onCheckedChange={(checked) => setModelForm({ ...modelForm, isDefault: checked })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>模型参数</Label>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="model-temperature" className="text-xs text-muted-foreground">
                        Temperature ({modelForm.parameters.temperature})
                      </Label>
                      <Input
                        id="model-temperature"
                        type="number"
                        min="0"
                        max="2"
                        step="0.1"
                        value={modelForm.parameters.temperature}
                        onChange={(e) => setModelForm({
                          ...modelForm,
                          parameters: { ...modelForm.parameters, temperature: parseFloat(e.target.value) || 0.7 },
                        })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="model-maxTokens" className="text-xs text-muted-foreground">
                        最大输出 Tokens
                      </Label>
                      <Input
                        id="model-maxTokens"
                        type="number"
                        min="1"
                        value={modelForm.parameters.maxTokens}
                        onChange={(e) => setModelForm({
                          ...modelForm,
                          parameters: { ...modelForm.parameters, maxTokens: parseInt(e.target.value) || 4096 },
                        })}
                      />
                    </div>
                  </div>
                </div>

                {/* 模型能力配置 */}
                <div className="space-y-3 pt-2 border-t">
                  <Label>模型能力</Label>
                  
                  {/* 深度思考配置 */}
                  <div className="space-y-2 p-3 rounded-md bg-muted/50">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="thinking-supported" className="text-sm font-normal">
                        支持深度思考
                      </Label>
                      <Switch
                        id="thinking-supported"
                        checked={modelForm.capabilities.thinking.supported}
                        onCheckedChange={(checked) => setModelForm({
                          ...modelForm,
                          capabilities: {
                            ...modelForm.capabilities,
                            thinking: {
                              ...modelForm.capabilities.thinking,
                              supported: checked,
                            },
                          },
                        })}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      是否启用深度思考可在 AI 助手面板中动态切换
                    </p>
                    
                    {modelForm.capabilities.thinking.supported && (
                      <>
                        <div className="space-y-1">
                          <Label htmlFor="thinking-api-format" className="text-xs text-muted-foreground">
                            API 格式
                          </Label>
                          <Select
                            value={modelForm.capabilities.thinking.apiFormat}
                            onValueChange={(value: "standard" | "openai") => setModelForm({
                              ...modelForm,
                              capabilities: {
                                ...modelForm.capabilities,
                                thinking: { ...modelForm.capabilities.thinking, apiFormat: value },
                              },
                            })}
                          >
                            <SelectTrigger id="thinking-api-format">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="standard">标准格式 (智谱/DeepSeek 等)</SelectItem>
                              <SelectItem value="openai">OpenAI 格式 (o1/o3/gpt-5)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        
                        {modelForm.capabilities.thinking.apiFormat === "openai" && (
                          <div className="space-y-1">
                            <Label htmlFor="reasoning-summary" className="text-xs text-muted-foreground">
                              推理摘要
                            </Label>
                            <Select
                              value={modelForm.capabilities.thinking.reasoningSummary}
                              onValueChange={(value: "auto" | "detailed" | "concise" | "disabled") => setModelForm({
                                ...modelForm,
                                capabilities: {
                                  ...modelForm.capabilities,
                                  thinking: { ...modelForm.capabilities.thinking, reasoningSummary: value },
                                },
                              })}
                            >
                              <SelectTrigger id="reasoning-summary">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="auto">自动</SelectItem>
                                <SelectItem value="detailed">详细</SelectItem>
                                <SelectItem value="concise">简洁</SelectItem>
                                <SelectItem value="disabled">禁用</SelectItem>
                              </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground mt-1">
                              OpenAI 不返回原始思维链，仅提供推理摘要。推理努力程度可在 AI 助手面板中选择。
                            </p>
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  {/* 其他能力 */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex items-center justify-between p-2 rounded-md bg-muted/50">
                      <Label htmlFor="streaming-supported" className="text-sm font-normal">
                        流式输出
                      </Label>
                      <Switch
                        id="streaming-supported"
                        checked={modelForm.capabilities.streaming.supported && modelForm.capabilities.streaming.enabled}
                        onCheckedChange={(checked) => setModelForm({
                          ...modelForm,
                          capabilities: {
                            ...modelForm.capabilities,
                            streaming: { supported: checked, enabled: checked },
                          },
                        })}
                      />
                    </div>
                    <div className="flex items-center justify-between p-2 rounded-md bg-muted/50">
                      <Label htmlFor="function-calling-supported" className="text-sm font-normal">
                        工具调用
                      </Label>
                      <Switch
                        id="function-calling-supported"
                        checked={modelForm.capabilities.functionCalling.supported}
                        onCheckedChange={(checked) => setModelForm({
                          ...modelForm,
                          capabilities: {
                            ...modelForm.capabilities,
                            functionCalling: { supported: checked },
                          },
                        })}
                      />
                    </div>
                    <div className="flex items-center justify-between p-2 rounded-md bg-muted/50">
                      <Label htmlFor="vision-supported" className="text-sm font-normal">
                        视觉理解
                      </Label>
                      <Switch
                        id="vision-supported"
                        checked={modelForm.capabilities.vision.supported}
                        onCheckedChange={(checked) => setModelForm({
                          ...modelForm,
                          capabilities: {
                            ...modelForm.capabilities,
                            vision: { supported: checked },
                          },
                        })}
                      />
                    </div>
                  </div>

                  {/* 自动多步推理配置 */}
                  <div className="space-y-2 p-3 rounded-md bg-muted/50">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="ailoop-maxcount" className="text-sm font-normal">
                        自动多步推理次数上限
                      </Label>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      AI 在处理复杂任务时，可能需要多次调用工具并自动继续推理
                    </p>
                    <div className="flex items-center gap-2">
                      <Input
                        id="ailoop-maxcount"
                        type="number"
                        min="1"
                        max="100"
                        value={modelForm.capabilities.aiLoop.maxLoopCount}
                        onChange={(e) => {
                          const value = parseInt(e.target.value);
                          const clampedValue = isNaN(value) ? 20 : Math.min(100, Math.max(1, value));
                          setModelForm({
                            ...modelForm,
                            capabilities: {
                              ...modelForm.capabilities,
                              aiLoop: { ...modelForm.capabilities.aiLoop, maxLoopCount: clampedValue },
                            },
                          });
                        }}
                        className="w-24"
                        disabled={modelForm.capabilities.aiLoop.unlimitedLoop}
                      />
                      <span className="text-xs text-muted-foreground">
                        (1-100)
                      </span>
                    </div>
                    
                    {/* 不限制循环次数开关 */}
                    <div className="flex items-center justify-between pt-2 border-t border-dashed">
                      <div className="flex-1">
                        <Label htmlFor="unlimited-loop" className="text-sm font-normal text-destructive">
                          不限制推理次数
                        </Label>
                        <p className="text-xs text-muted-foreground mt-1">
                          允许 AI 无限次调用工具，直到任务完成
                        </p>
                      </div>
                      <Switch
                        id="unlimited-loop"
                        checked={modelForm.capabilities.aiLoop.unlimitedLoop}
                        onCheckedChange={(checked) => setModelForm({
                          ...modelForm,
                          capabilities: {
                            ...modelForm.capabilities,
                            aiLoop: { ...modelForm.capabilities.aiLoop, unlimitedLoop: checked },
                          },
                        })}
                      />
                    </div>
                    {modelForm.capabilities.aiLoop.unlimitedLoop && (
                      <div className="p-2 rounded-md bg-destructive/10 border border-destructive/20">
                        <p className="text-xs text-destructive font-medium">
                          警告：启用此选项存在风险
                        </p>
                        <ul className="text-xs text-destructive/80 mt-1 list-disc list-inside space-y-0.5">
                          <li>可能导致 AI 陷入无限循环</li>
                          <li>可能产生大量 API 调用费用</li>
                          <li>建议仅在受信任的任务中使用</li>
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button
                  onClick={handleSaveModel}
                  disabled={createModelMutation.isLoading || updateModelMutation.isLoading}
                >
                  {(createModelMutation.isLoading || updateModelMutation.isLoading) && (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  )}
                  {editingModel ? "保存" : "添加"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {models && models.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>模型名称</TableHead>
                <TableHead>供应商</TableHead>
                <TableHead>模型标识</TableHead>
                <TableHead>状态</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {models.map((model) => (
                <TableRow key={model.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      {model.displayName}
                      {model.isDefault && (
                        <Badge variant="outline" className="text-xs">默认</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {getProviderName(model.providerId)}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm font-mono">
                    {model.modelId}
                  </TableCell>
                  <TableCell>
                    {model.enabled ? (
                      <Badge variant="default" className="bg-green-500">启用</Badge>
                    ) : (
                      <Badge variant="secondary">禁用</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right space-x-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onTestModel(model)}
                      title="测试对话"
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEditModel(model)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteModel(model)}
                      disabled={deleteModelMutation.isLoading}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="text-center text-sm text-muted-foreground py-8">
            <Bot className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
            <p>暂未配置 AI 模型</p>
            <p className="text-xs mt-1">
              {providers && providers.length > 0
                ? "点击上方按钮添加模型配置"
                : "请先添加 AI 供应商"}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
