# Stegsolve 隐写分析工具

## 概述

Stegsolve隐写分析工具是Lovelymem V2中的一个专业图像隐写分析模块，提供类似于经典Stegsolve工具的功能，用于检测和分析图像中隐藏的信息。

## 功能特性

### 核心功能
- **图像通道分析**: 分别查看RGB、HSV、YUV等颜色空间的各个通道
- **位平面分析**: 查看图像每个颜色通道的各个位平面（0-7位）
- **颜色过滤**: 应用各种颜色过滤器来揭示隐藏信息
- **图像变换**: 提供多种图像变换算法
- **差分分析**: 比较两张图像的差异
- **数据提取**: 从图像的LSB中提取隐藏数据

### 支持格式
- PNG (推荐，无损压缩)
- JPG/JPEG
- BMP
- GIF
- TIFF
- WebP

### 分析模式
1. **Red通道分析** - 查看红色通道信息
2. **Green通道分析** - 查看绿色通道信息  
3. **Blue通道分析** - 查看蓝色通道信息
4. **Alpha通道分析** - 查看透明度通道信息
5. **灰度分析** - 转换为灰度图像分析
6. **位平面分析** - 查看各个位平面
7. **XOR分析** - XOR运算分析
8. **差分分析** - 图像差分对比

## 技术架构

### 模块结构
```
src/modules/stegsolve-analyzer/
├── README.md                    # 文档说明
├── ../../../pages/stegsolve-analyzer.html # 主界面 HTML
├── stegsolve-analyzer.js        # 主应用逻辑
├── components/                  # 组件目录
│   ├── ImageLoader.js          # 图像加载器
│   ├── ChannelAnalyzer.js      # 通道分析器
│   ├── BitPlaneAnalyzer.js     # 位平面分析器
│   ├── FilterProcessor.js      # 过滤器处理器
│   └── DataExtractor.js        # 数据提取器
├── styles/                     # 样式目录
│   └── stegsolve-analyzer.css  # 主样式文件
└── utils/                      # 工具目录
    ├── ImageUtils.js           # 图像处理工具
    ├── ColorSpaceUtils.js      # 颜色空间转换
    └── BitOperations.js        # 位操作工具
```

### 架构设计
- **模块化架构**: 采用ES6模块化设计，组件独立可复用
- **TypeScript支持**: 完整的类型定义和接口规范
- **Tauri集成**: 深度集成Tauri V2架构，支持原生功能调用
- **Canvas渲染**: 基于HTML5 Canvas的高性能图像处理
- **Web Workers**: 使用Web Workers进行复杂计算，避免UI阻塞

### 核心组件

#### StegsolveAnalyzer (主应用类)
- 应用初始化和生命周期管理
- 组件协调和状态管理
- 事件绑定和处理
- 错误处理和用户反馈

#### ImageLoader (图像加载器)
- 图像文件加载和验证
- 拖拽上传支持
- 图像格式检测
- 图像预处理

#### ChannelAnalyzer (通道分析器)
- RGB/HSV/YUV通道分离
- 通道可视化显示
- 通道数据统计
- 通道对比分析

#### BitPlaneAnalyzer (位平面分析器)
- 位平面提取和显示
- LSB分析
- 位平面统计
- 隐写检测

#### FilterProcessor (过滤器处理器)
- 颜色过滤器应用
- 图像变换处理
- 自定义过滤器
- 实时预览

#### DataExtractor (数据提取器)
- LSB数据提取
- 隐藏文本检测
- 二进制数据导出
- 数据格式识别

### 样式系统
- **CSS变量**: 使用CSS自定义属性实现主题切换
- **响应式设计**: 支持移动端和桌面端适配
- **动画效果**: 平滑的过渡动画和交互反馈
- **无障碍支持**: 符合Web无障碍标准

## 使用方法

### 启动隐写分析工具
1. 在Lovelymem V2主界面中，进入"小工具"区域
2. 点击"Stegsolve分析器"工具卡片
3. 系统将打开独立的隐写分析工具窗口

### 加载图像文件
1. **拖拽方式**: 直接将图像文件拖拽到加载区域
2. **浏览方式**: 点击"选择图像"按钮选择图像文件
3. **支持格式**: 系统会自动验证文件格式是否支持

### 进行隐写分析
1. 选择分析模式（通道分析、位平面分析等）
2. 调整分析参数
3. 查看分析结果
4. 导出分析数据

## 集成说明

### 主应用集成
Stegsolve分析器已完全集成到Lovelymem V2主应用中：

1. **功能注册**: 在`toolsArea.ts`中注册为小工具功能
2. **窗口管理**: 通过Tauri窗口管理器创建独立窗口
3. **事件处理**: 在`EventManager`中处理功能触发事件
4. **状态管理**: 集成到应用状态管理系统

### 后端支持
需要后端提供以下Tauri命令支持：

```rust
// 图像文件读取
#[tauri::command]
async fn read_image_file(file_path: String) -> Result<Vec<u8>, String>

// 图像信息获取
#[tauri::command]
async fn get_image_info(file_path: String) -> Result<ImageInfo, String>

// 数据导出
#[tauri::command]
async fn export_analysis_data(data: String, file_path: String) -> Result<(), String>
```

## 开发说明

### 开发环境
- Node.js 16+
- TypeScript 4.5+
- Tauri V2
- Canvas API
- Web Workers API

### 构建和部署
模块作为Lovelymem V2的一部分进行构建和部署，无需单独配置。

### 扩展开发
可以通过添加新的分析算法和过滤器来扩展功能：

1. 在`components/`目录下添加新的组件
2. 在`utils/`目录下添加新的工具函数
3. 更新主应用逻辑以集成新功能
4. 添加相应的UI控件和样式

## 许可证和版权

本模块是Lovelymem V2项目的一部分，遵循项目的许可证协议。
