# AI Assistant V2 - 模块化架构

参考 [OpenCode](https://github.com/opencode/opencode) 设计的新版AI助手模块。

## 目录结构

```
ai-assistant-v2/
├── index.ts                 # 模块入口
├── types.ts                 # 类型定义
├── README.md                # 说明文档
│
├── agent/                   # Agent 模块
│   └── agent.ts             # 代理核心实现
│
├── tools/                   # Tools 模块
│   ├── registry.ts          # 工具注册表
│   └── builtin/             # 内置工具
│       ├── index.ts
│       ├── read-file.ts     # 读取文件
│       ├── list-files.ts    # 列出文件
│       ├── search.ts        # 搜索工具
│       └── bash.ts          # 命令执行
│
├── provider/                # Provider 模块
│   └── provider.ts          # AI模型提供商管理
│
├── session/                 # Session 模块
│   └── session.ts           # 会话管理
│
└── ui/                      # UI 模块
    └── AIChatV2Manager.ts   # 前端管理器
```

## 核心功能

### 1. Agent 模块 (`agent/`)

支持多种代理类型：
- **build**: 构建代理 - 编写和修改代码
- **plan**: 规划代理 - 分析需求、制定计划
- **explore**: 探索代理 - 快速搜索和分析代码库
- **general**: 通用代理 - 处理复杂任务

每个代理有独立的：
- 权限配置（允许/拒绝的工具）
- 最大迭代次数
- 温度参数
- 系统提示词

### 2. Tools 模块 (`tools/`)

可扩展的工具系统：
- `read_file`: 读取文件内容
- `list_files`: 列出目录文件
- `search_in_file`: 文件内搜索
- `grep_files`: 代码库搜索
- `bash`: 执行Shell命令

工具注册示例：
```typescript
import { defineTool, toolRegistry } from './tools/registry';

const myTool = defineTool('my_tool', {
    name: 'my_tool',
    description: '工具描述',
    parameters: [
        { name: 'param1', type: 'string', required: true, description: '参数1' }
    ],
    async execute(args, context) {
        // 执行逻辑
        return { output: '结果', success: true };
    }
});

toolRegistry.register(myTool);
```

### 3. Provider 模块 (`provider/`)

支持多种AI提供商：
- OpenAI (GPT-4o, GPT-4o-mini)
- Anthropic (Claude Sonnet 4, Claude 3.5)
- Google (Gemini 2.0, Gemini 1.5)
- DeepSeek
- Ollama (本地模型)
- Azure OpenAI
- Custom (自定义端点)

### 4. Session 模块 (`session/`)

会话管理功能：
- 消息历史管理
- 工具调用跟踪
- Agent步骤记录
- 会话导入/导出
- 本地存储持久化

### 5. UI 模块 (`ui/`)

前端管理器 `AIChatV2Manager`：
- 消息发送/接收
- 流式响应处理
- Agent步骤可视化
- 工具调用气泡（可折叠）
- 思考状态显示

## 使用示例

```typescript
import { AIChatV2Manager } from './ai-assistant-v2/ui/AIChatV2Manager';

// 初始化
const manager = new AIChatV2Manager();
await manager.initialize('chat-container');

// 设置Agent模式
manager.setAgentMode(true);

// 切换代理
manager.switchAgent('build');

// 发送消息（自动处理）
await manager.sendMessage();
```

## 后端集成

需要在 Rust 后端实现以下 Tauri 命令：
- `get_ai_settings`: 获取AI配置
- `call_ai_api_stream`: 流式API调用
- `call_ai_agent`: Agent模式调用

以及以下事件：
- `ai-stream-chunk`: 流式内容块
- `ai-stream-end`: 流式结束
- `ai-stream-error`: 流式错误
- `agent-step`: Agent步骤

## OpenCode 参考

本模块参考了 OpenCode 的设计理念：
- 模块化架构（Agent、Tools、Provider分离）
- 可扩展的工具系统
- 多代理协作
- 权限控制
- 流式响应处理
