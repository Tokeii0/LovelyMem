# Lovelymem V2 模块化重构

## 重构概述

将原来的 `main.ts` (2643行) 重构为模块化架构，提高代码的可维护性和可扩展性。

## 模块化目录结构

```
src/
├── modules/
│   ├── core/                 # 核心模块
│   │   ├── app.ts           # 主应用类 (LovelymemApp)
│   │   └── index.ts         # 导出核心模块
│   ├── ui/                  # UI相关模块
│   │   ├── events.ts        # 事件处理管理器
│   │   ├── window.ts        # 窗口管理器
│   │   ├── theme.ts         # 主题管理器
│   │   └── index.ts         # 导出UI模块
│   ├── features/            # 功能模块
│   │   ├── csv.ts           # CSV功能管理器
│   │   ├── text.ts          # 文本查看器管理器
│   │   ├── memprocfs.ts     # MemProcFS功能管理器
│   │   ├── image.ts         # 镜像处理管理器
│   │   └── index.ts         # 导出功能模块
│   ├── file/                # 文件管理模块
│   │   ├── manager.ts       # 文件管理器
│   │   └── index.ts         # 导出文件模块
│   ├── settings/            # 设置模块
│   │   ├── manager.ts       # 设置管理器
│   │   └── index.ts         # 导出设置模块
│   ├── utils/               # 工具模块
│   │   ├── message.ts       # 消息提示工具
│   │   ├── progress.ts      # 进度指示器工具
│   │   ├── helpers.ts       # 通用辅助函数
│   │   └── index.ts         # 导出工具模块
│   ├── stateManager.ts      # 状态管理器 (已存在)
│   ├── modernUIRenderer.ts  # UI渲染器 (已存在)
│   ├── csvExample.ts        # CSV示例 (已存在)
│   └── types.ts             # 类型定义 (已存在)
├── main.ts                  # 原始主文件 (保留)
└── main_refactored.ts       # 重构后的主入口文件 (演示版)
```

## 模块功能说明

### 1. 核心模块 (`core/`)
- **app.ts**: 重构后的主应用类，整合所有功能管理器
- 负责应用初始化、渲染和生命周期管理

### 2. 功能模块 (`features/`)
- **image.ts**: 镜像文件加载、卸载和MemProcFS操作
- **csv.ts**: CSV文件查看和处理功能
- **text.ts**: 文本文件查看器功能
- **memprocfs.ts**: 所有MemProcFS相关功能 (进程、网络、驱动等)

### 3. UI模块 (`ui/`)
- **events.ts**: 统一的事件处理管理
- **window.ts**: 窗口控制和管理
- **theme.ts**: 主题切换和管理

### 4. 工具模块 (`utils/`)
- **message.ts**: 统一的消息提示系统
- **progress.ts**: 进度指示器管理
- **helpers.ts**: 通用辅助函数集合

### 5. 设置模块 (`settings/`)
- **manager.ts**: 应用设置的加载、保存和管理

### 6. 文件模块 (`file/`)
- **manager.ts**: 文件管理器功能

## 重构优势

### 1. 代码组织
- **单一职责**: 每个模块只负责特定功能
- **清晰分离**: 不同类型的功能分布在不同目录
- **易于维护**: 修改某个功能只需关注对应模块

### 2. 可扩展性
- **模块化添加**: 新功能可以独立模块添加
- **接口标准化**: 统一的管理器接口设计
- **依赖注入**: 通过构造函数注入依赖

### 3. 代码复用
- **工具函数**: 通用功能提取到utils模块
- **状态管理**: 统一的状态管理器
- **UI渲染**: 分离的UI渲染逻辑

### 4. 测试友好
- **单元测试**: 每个模块可独立测试
- **模拟依赖**: 易于mock外部依赖
- **功能隔离**: 测试范围明确

## 使用示例

```typescript
// 在重构后的应用中使用
import { LovelymemApp } from './modules/core';
import { MessageManager } from './modules/utils';

// 初始化应用
const app = new LovelymemApp();
await app.init();

// 使用工具模块
MessageManager.showSuccess('应用初始化完成');
```

## 迁移指南

### 原有代码迁移
1. **功能提取**: 将原main.ts中的功能方法提取到对应管理器
2. **状态管理**: 使用统一的StateManager进行状态管理
3. **事件处理**: 迁移到EventManager统一管理
4. **UI更新**: 通过ModernUIRenderer进行界面渲染

### 新功能开发
1. **确定模块**: 根据功能类型选择合适的模块目录
2. **创建管理器**: 实现对应的功能管理器类
3. **注册到核心**: 在核心应用类中注册新管理器
4. **导出模块**: 在index.ts中导出新功能

## 文件说明

### 已完成的模块
- ✅ `utils/message.ts` - 消息提示工具
- ✅ `utils/progress.ts` - 进度指示器工具  
- ✅ `utils/helpers.ts` - 通用辅助函数
- ✅ `features/image.ts` - 镜像处理功能
- ✅ `features/csv.ts` - CSV功能
- ✅ `features/text.ts` - 文本查看器功能
- ✅ `features/memprocfs.ts` - MemProcFS功能
- ✅ `settings/manager.ts` - 设置管理器
- ✅ `main_refactored.ts` - 重构演示版本

### 待完善的模块
- 🔲 `ui/events.ts` - 事件处理管理器
- 🔲 `ui/window.ts` - 窗口管理器
- 🔲 `ui/theme.ts` - 主题管理器
- 🔲 `file/manager.ts` - 文件管理器
- 🔲 完整的 `core/app.ts` - 主应用类

## 注意事项

1. **向后兼容**: 原始 `main.ts` 文件保持不变，确保现有功能正常
2. **渐进迁移**: 可以逐步将功能从原文件迁移到新模块
3. **依赖管理**: 注意模块间的依赖关系，避免循环引用
4. **类型安全**: 使用TypeScript确保类型安全

## 下一步计划

1. 完善剩余的UI模块和文件管理模块
2. 将原main.ts中的所有功能完全迁移到新架构
3. 编写单元测试覆盖各个模块
4. 优化模块间的接口设计
5. 添加详细的API文档

---

这个重构为Lovelymem V2项目提供了更好的代码组织结构，使得代码更易维护、扩展和测试。
