# Lovelymem V2 脚本系统变量替换功能

## 概述

Lovelymem V2 脚本系统支持变量替换。您可以在脚本路径、命令行参数和脚本内容中使用预定义变量，这些变量会在执行时自动替换为实际值。

## 支持的变量类型

### 基础路径变量
- `{output_path}` - 输出目录路径
- `{current_image_path}` - 当前内存镜像文件路径
- `{scripts_path}` - 脚本目录路径

### 工具路径变量
- `{python2_path}` - Python 2 解释器路径
- `{python3_path}` - Python 3 解释器路径
- `{memprocfs_path}` - MemProcFS 工具路径
- `{volatility2_path}` - Volatility 2 工具路径
- `{volatility3_path}` - Volatility 3 工具路径
- `{volatility2_profile}` - Volatility 2 配置文件

### 系统变量
- `{timestamp}` - Unix 时间戳
- `{date}` - 当前日期 (YYYY-MM-DD)
- `{time}` - 当前时间 (HH:MM:SS)
- `{datetime}` - 日期时间 (YYYY-MM-DD HH:MM:SS)

### 镜像相关变量
- `{image_name}` - 镜像文件名（包含扩展名）
- `{image_directory}` - 镜像文件所在目录
- `{image_name_without_ext}` - 镜像文件名（不含扩展名）

### 自定义工具变量
- `{tool_工具ID}` - 自定义工具的完整命令

## 使用方法

### 1. 在脚本路径中使用变量

```
{scripts_path}/my_analysis.py
{python3_path}
```

### 2. 在命令行参数中使用变量

```
--output {output_path} --image {current_image_path} --profile {volatility2_profile}
```

### 3. 在内联脚本内容中使用变量

```python
import os

# 使用变量替换
output_dir = "{output_path}"
image_path = "{current_image_path}"

print(f"分析镜像: {image_path}")
print(f"输出目录: {output_dir}")

# 创建输出文件
output_file = os.path.join("{output_path}", "analysis_{date}_{time}.txt")
with open(output_file, 'w') as f:
    f.write("分析结果...")
```

## 脚本模式

### 文件模式
- 使用现有的 Python 脚本文件
- 支持在文件路径和参数中使用变量替换
- 适合复杂的、可重用的脚本

### 内联模式
- 直接在界面中编写脚本代码
- 支持在脚本内容中使用变量替换
- 适合简单的、一次性的脚本任务

## 环境变量

脚本执行时，系统还会设置以下环境变量供脚本使用：

- `SCRIPT_OUTPUT_PATH` - 输出路径
- `SCRIPT_IMAGE_PATH` - 镜像路径
- `SCRIPT_SCRIPTS_PATH` - 脚本路径
- `SCRIPT_PYTHON2_PATH` - Python 2 路径
- `SCRIPT_PYTHON3_PATH` - Python 3 路径
- `SCRIPT_MEMPROCFS_PATH` - MemProcFS 路径
- `SCRIPT_VOLATILITY2_PATH` - Volatility 2 路径
- `SCRIPT_VOLATILITY3_PATH` - Volatility 3 路径
- `SCRIPT_VOLATILITY2_PROFILE` - Volatility 2 配置文件
- `SCRIPT_TIMESTAMP` - 时间戳
- `SCRIPT_DATE` - 日期
- `SCRIPT_TIME` - 时间
- `SCRIPT_DATETIME` - 日期时间
- `SCRIPT_IMAGE_NAME` - 镜像文件名
- `SCRIPT_IMAGE_DIRECTORY` - 镜像目录
- `SCRIPT_IMAGE_NAME_WITHOUT_EXT` - 镜像名称（无扩展名）

## 示例脚本

查看 `example_variable_script.py` 了解如何在脚本中使用这些变量和环境变量。

## 最佳实践

1. **启用变量替换**: 在脚本配置中确保勾选"启用变量替换"选项
2. **使用环境变量**: 在 Python 脚本中使用 `os.environ.get()` 获取环境变量
3. **路径处理**: 使用 `os.path.join()` 构建跨平台兼容的路径
4. **错误处理**: 检查路径是否存在，处理可能的异常
5. **输出文件**: 使用时间戳创建唯一的输出文件名

## 注意事项

- 变量替换仅在启用"启用变量替换"选项时生效
- 未找到的变量会保持原样，不会被替换
- 内联脚本会创建临时文件执行，执行完成后自动清理
- 确保脚本有适当的权限访问相关路径和文件
