// AI 配置相关类型定义

// 供应商类型
export interface Provider {
  id: number;
  name: string;
  baseUrl: string;
  apiKey: string;
  apiType: "openai" | "zhipu";
  enabled: boolean;
}

// 模型能力配置
export interface ModelCapabilities {
  thinking: {
    supported: boolean;
    apiFormat: "standard" | "openai";
    reasoningSummary: "auto" | "detailed" | "concise" | "disabled";
  };
  streaming: {
    supported: boolean;
    enabled: boolean;
  };
  functionCalling: {
    supported: boolean;
  };
  vision: {
    supported: boolean;
  };
  aiLoop: {
    maxLoopCount: number;
    unlimitedLoop: boolean;
  };
}

// 模型类型
export interface Model {
  id: number;
  providerId: number;
  modelId: string;
  displayName: string;
  isDefault: boolean;
  enabled: boolean;
  contextLength?: number;
  parameters: {
    temperature: number;
    maxTokens: number;
  };
  capabilities: ModelCapabilities;
}

// 供应商表单数据
export interface ProviderFormData {
  name: string;
  baseUrl: string;
  apiKey: string;
  apiType: "openai" | "zhipu";
}

// 模型表单数据
export interface ModelFormData {
  modelId: string;
  displayName: string;
  isDefault: boolean;
  contextLength?: number;
  parameters: {
    temperature: number;
    maxTokens: number;
  };
  capabilities: ModelCapabilities;
}

// 测试结果
export interface TestResult {
  success: boolean;
  message: string;
  streamSupported?: boolean;
  hasReasoning?: boolean;
  response?: string | null;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  } | null;
  duration?: number;
}

// 默认能力配置
export const defaultCapabilities: ModelCapabilities = {
  thinking: {
    supported: false,
    apiFormat: "standard",
    reasoningSummary: "auto",
  },
  streaming: {
    supported: true,
    enabled: true,
  },
  functionCalling: {
    supported: true,
  },
  vision: {
    supported: false,
  },
  aiLoop: {
    maxLoopCount: 20,
    unlimitedLoop: false,
  },
};
