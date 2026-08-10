# LovelyTheme Editor v2.0 - 模块化主题编辑器

## 🎨 概述

LovelyTheme Editor v2.0 是一个完全重构的模块化主题编辑器，提供了更好的用户体验、更强的可定制性和更易维护的代码架构。

## ✨ 主要特性

### 🏗️ 模块化架构
- **核心管理器** (`ThemeEditorCore`): 主题数据管理、状态管理和业务逻辑
- **预设管理器** (`ThemePresetManager`): 内置和用户自定义主题预设管理
- **UI组件管理器** (`UIComponentManager`): 模块化UI组件管理
- **配置管理器** (`ConfigManager`): 主题配置的导入导出、验证和转换

### 🎯 增强的用户体验
- **实时预览**: 主题变化即时预览
- **撤销重做**: 支持操作历史记录
- **快捷键支持**: 常用操作的键盘快捷键
- **颜色历史**: 记录最近使用的颜色
- **拖拽调色**: 直观的颜色选择体验
- **响应式设计**: 适配不同屏幕尺寸

### 🎨 丰富的自定义选项
- **颜色配置**: 主色调、状态颜色等
- **渐变背景**: 多种渐变效果
- **字体配置**: 字体族、字号、行高等
- **间距配置**: 内边距、外边距、间距
- **边框配置**: 边框颜色、圆角、阴影
- **动画配置**: 过渡动画、持续时间

### 📦 主题管理
- **预设主题**: 6个精美的内置主题
- **主题模板**: 基于模板快速创建主题
- **导入导出**: 支持JSON、CSS格式
- **主题分享**: 导出和分享自定义主题

## 📁 项目结构

```
src/theme-editor/
├── ThemeEditorApp.js          # 主应用入口
├── core/
│   └── ThemeEditorCore.js     # 核心管理器
├── presets/
│   └── ThemePresetManager.js  # 预设管理器
├── components/
│   ├── UIComponentManager.js  # UI组件管理器
│   ├── TitleBarComponent.js   # 标题栏组件
│   ├── SidebarComponent.js    # 侧边栏组件
│   ├── EditorAreaComponent.js # 编辑区域组件
│   ├── PreviewPanelComponent.js # 预览面板组件
│   ├── DialogManager.js       # 对话框管理器
│   ├── ToastManager.js        # 提示管理器
│   └── editors/               # 各种编辑器
│       ├── ColorEditor.js     # 颜色编辑器
│       ├── GradientEditor.js  # 渐变编辑器
│       ├── PresetEditor.js    # 预设编辑器
│       └── ...
├── config/
│   └── ConfigManager.js       # 配置管理器
├── utils/
│   ├── EventEmitter.js        # 事件发射器
│   └── ThemeValidator.js      # 主题验证器
├── themeEditor.css            # 样式文件
└── README.md                  # 说明文档
```

## 🚀 使用方法

### 基本使用

1. 打开主题编辑器窗口
2. 在侧边栏选择要编辑的配置分类
3. 在编辑区域修改主题变量
4. 在预览面板查看实时效果
5. 保存或应用主题

### 快捷键

- `Ctrl+S`: 保存主题
- `Ctrl+E`: 导出主题
- `Ctrl+I`: 导入主题
- `Ctrl+P`: 切换预览面板
- `Ctrl+Z`: 撤销
- `Ctrl+Y`: 重做
- `ESC`: 关闭对话框

### 主题预设

编辑器内置了6个精美的主题预设：

1. **Lovely** - 奢华优雅的默认主题
2. **Sakura Dream** - 樱花粉色梦幻主题
3. **Ocean Breeze** - 海洋微风清新主题
4. **Sunset Glow** - 日落余晖温暖主题
5. **Midnight Purple** - 午夜紫色神秘主题
6. **Forest Green** - 森林绿色自然主题

## 🔧 开发指南

### 添加新的编辑器

1. 在 `components/editors/` 目录下创建新的编辑器类
2. 继承 `EventEmitter` 类
3. 实现必要的方法：`show()`, `hide()`, `refresh()`, `update()`, `destroy()`
4. 在 `EditorAreaComponent.js` 中注册新编辑器

### 添加新的主题变量分类

1. 在 `ThemeEditorCore.js` 的 `initializeCategories()` 方法中添加新分类
2. 定义分类的变量列表和默认值
3. 创建对应的编辑器组件
4. 更新侧边栏导航

### 自定义主题验证

在 `ThemeValidator.js` 中添加新的验证规则：

```javascript
validateCustomVariable(key, value) {
    // 自定义验证逻辑
    return true;
}
```

## 🎯 API 参考

### ThemeEditorCore

主要方法：
- `setTheme(theme)`: 设置主题
- `updateThemeVariable(key, value)`: 更新主题变量
- `exportTheme()`: 导出主题
- `importTheme(themeData)`: 导入主题
- `undo()`: 撤销操作
- `redo()`: 重做操作

### ThemePresetManager

主要方法：
- `getAllPresets()`: 获取所有预设
- `getPreset(id)`: 获取指定预设
- `addUserPreset(preset)`: 添加用户预设
- `deleteUserPreset(id)`: 删除用户预设

### ConfigManager

主要方法：
- `importConfig(data, format)`: 导入配置
- `exportConfig(themeData, format)`: 导出配置
- `validateConfig(themeData)`: 验证配置

## 🔄 迁移指南

从旧版本迁移到v2.0：

1. 更新HTML文件引用新的入口文件
2. 主题数据格式保持兼容
3. 自定义扩展需要适配新的模块化架构

## 🐛 故障排除

### 常见问题

1. **主题不生效**: 检查CSS变量格式是否正确
2. **预设加载失败**: 确认预设数据格式符合规范
3. **导入失败**: 验证导入的主题数据格式

### 调试模式

在浏览器控制台中访问全局实例：

```javascript
// 获取应用实例
window.themeEditorApp

// 获取当前主题
window.themeEditorApp.core.getCurrentTheme()

// 获取应用状态
window.themeEditorApp.getState()
```

## 📝 更新日志

### v2.1.3
- 完全重构为模块化架构
- 新增实时预览功能
- 增强用户体验
- 添加更多自定义选项
- 支持主题模板和分享

## 🤝 贡献

欢迎提交Issue和Pull Request来改进主题编辑器！

## 📄 许可证

本模块是 Lovelymem V2 的一部分，采用 `AGPL-3.0-only`，详见仓库根目录的 `LICENSE` 文件。
