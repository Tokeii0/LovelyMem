# Lovelymem V2 主题系统

## 📁 文件结构

```
src/css/theme/
├── base.css          # 基础样式、通用变量、动画定义
├── light.css         # 浅色主题（默认）
├── dark.css          # 深色主题
├── sakura.css        # 樱花主题
└── README.md         # 本文件
```

## 🎨 主题文件说明

### base.css
包含不依赖主题的通用内容：
- CSS 重置和基础样式
- 通用 CSS 变量（阴影、圆角、过渡、字体等）
- 动画关键帧定义
- 滚动条样式
- 通用工具类

**注意：** base.css 必须在所有主题文件之前加载！

### light.css
浅色主题配色方案：
- 清新明亮的配色
- 适合日间使用
- 默认主题

### dark.css
深色主题配色方案：
- 优雅深邃的配色
- 适合夜间使用
- 护眼模式

### sakura.css
樱花主题配色方案：
- 温柔浪漫的樱花色系
- 粉色系配色
- 特色主题

## 🔧 使用方法

### 1. 在 HTML 中引入

```html
<!-- 必须先加载 base.css -->
<link rel="stylesheet" href="src/css/theme/base.css">

<!-- 然后加载默认主题 -->
<link rel="stylesheet" href="src/css/theme/light.css">
```

### 2. 在 TypeScript/JavaScript 中动态加载

```typescript
// 加载基础样式（只需加载一次）
const baseLink = document.createElement('link');
baseLink.rel = 'stylesheet';
baseLink.href = 'src/css/theme/base.css';
document.head.appendChild(baseLink);

// 动态切换主题
function loadTheme(themeName: 'light' | 'dark' | 'sakura') {
  // 移除旧的主题
  const oldTheme = document.getElementById('theme-stylesheet');
  if (oldTheme) {
    oldTheme.remove();
  }
  
  // 加载新主题
  const themeLink = document.createElement('link');
  themeLink.id = 'theme-stylesheet';
  themeLink.rel = 'stylesheet';
  themeLink.href = `src/css/theme/${themeName}.css`;
  document.head.appendChild(themeLink);
  
  // 设置 data-theme 属性
  document.body.setAttribute('data-theme', themeName);
}
```

### 3. 在 CSS 中使用主题变量

```css
.my-component {
  background: var(--bg-primary);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius);
  box-shadow: var(--shadow-md);
  transition: var(--transition);
}

.my-button {
  background: var(--primary-color);
  color: var(--text-white);
}
```

## 📋 可用的 CSS 变量

### 颜色变量

#### 主色调
- `--primary-color` - 主色
- `--secondary-color` - 次要色
- `--accent-color` - 强调色
- `--success-color` - 成功色
- `--warning-color` - 警告色
- `--error-color` - 错误色
- `--info-color` - 信息色

#### 背景色
- `--bg-primary` - 主背景色
- `--bg-secondary` - 次要背景色
- `--bg-tertiary` - 第三背景色
- `--bg-dark` - 深色背景
- `--bg-glass` - 玻璃效果背景

#### 文字颜色
- `--text-primary` - 主文字颜色
- `--text-secondary` - 次要文字颜色
- `--text-light` - 浅色文字
- `--text-white` - 白色文字
- `--text-muted` - 弱化文字

#### 边框颜色
- `--border-color` - 默认边框色
- `--border-light` - 浅色边框
- `--border-dark` - 深色边框

### 通用变量（base.css）

#### 阴影
- `--shadow-sm` - 小阴影
- `--shadow` - 默认阴影
- `--shadow-md` - 中等阴影
- `--shadow-lg` - 大阴影
- `--shadow-xl` - 超大阴影

#### 圆角
- `--radius-sm` - 小圆角 (0.375rem)
- `--radius` - 默认圆角 (0.5rem)
- `--radius-md` - 中等圆角 (0.75rem)
- `--radius-lg` - 大圆角 (1rem)
- `--radius-xl` - 超大圆角 (1.5rem)

#### 过渡动画
- `--transition` - 默认过渡
- `--transition-fast` - 快速过渡
- `--transition-slow` - 慢速过渡

### 樱花主题专有变量

仅在 `[data-theme="sakura"]` 时可用：
- `--sakura-pink` - 樱花粉
- `--sakura-light` - 浅樱花色
- `--sakura-medium` - 中樱花色
- `--sakura-dark` - 深樱花色
- `--sakura-deep` - 深粉色
- `--sakura-blossom` - 樱花花瓣色
- `--sakura-petal` - 花瓣色
- `--sakura-branch` - 树枝色
- `--sakura-soft` - 柔和粉色
- `--sakura-warm` - 温暖粉色

## 🎯 最佳实践

1. **始终使用 CSS 变量** - 不要硬编码颜色值
2. **保持一致性** - 使用统一的变量命名
3. **避免重复定义** - 主题变量只在主题文件中定义
4. **组件样式独立** - 组件样式文件不应包含主题变量定义
5. **测试所有主题** - 确保组件在所有主题下都正常显示

## 🔄 迁移指南

### 从旧系统迁移

如果你的组件 CSS 文件中有主题变量定义：

**❌ 旧方式（不推荐）：**
```css
/* my-component.css */
:root {
  --primary-color: #4299e1;
  --bg-primary: #ffffff;
}

[data-theme="dark"] {
  --bg-primary: #1e293b;
}
```

**✅ 新方式（推荐）：**
```css
/* my-component.css */
/* 直接使用主题变量，不要重复定义 */
.my-component {
  background: var(--bg-primary);
  color: var(--text-primary);
}
```

## 📝 维护说明

### 添加新主题

1. 在 `src/css/theme/` 目录下创建新的主题文件，如 `ocean.css`
2. 定义所有必需的 CSS 变量
3. 使用 `[data-theme="ocean"]` 选择器
4. 更新主题切换逻辑以支持新主题

### 修改主题颜色

1. 只在对应的主题文件中修改
2. 不要在组件 CSS 文件中修改
3. 修改后测试所有使用该变量的组件

## 🐛 故障排除

### 主题不生效
- 检查 base.css 是否已加载
- 检查主题文件加载顺序（base.css 必须最先加载）
- 检查 `data-theme` 属性是否正确设置

### 颜色显示不正确
- 检查是否使用了正确的 CSS 变量名
- 检查变量是否在当前主题中定义
- 使用浏览器开发工具检查计算后的样式值

### 主题切换不流畅
- 确保使用了 `--transition` 变量
- 检查是否有硬编码的过渡时间
- 考虑使用 CSS 变量的过渡效果

## 📚 相关文档

- [CSS 变量 (MDN)](https://developer.mozilla.org/zh-CN/docs/Web/CSS/Using_CSS_custom_properties)
- [主题切换最佳实践](https://web.dev/prefers-color-scheme/)
- [CSS 动画性能优化](https://web.dev/animations/)

