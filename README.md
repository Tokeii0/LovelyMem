

# 版本即将迎来 超大更新 敬请期待

<!-- markdownlint-disable MD033 MD041 -->
<p align="center">
  <a href="https://ctf.dog"><img src="https://github.com/Tokeii0/LovelyMem/blob/NewWorld/res/logo_200.png" width="250" height="250" alt="lovelymem"></a>
</p>
<div align="center">

# LovelyMem

<!-- prettier-ignore-start -->
<!-- markdownlint-disable-next-line MD036 -->
_✨ 基于*Memprocfs*和*Volatility*的可视化内存取证工具 ✨_
<!-- prettier-ignore-end -->

<a href="https://qm.qq.com/q/MuXmudpdKy"><img src="https://img.shields.io/badge/QQ%E7%BE%A4-668600249-orange?style=flat-square" alt="QQGroup"></a>
<a href="http://ctf.dog"><img src="https://img.shields.io/badge/CTF%E5%AF%BC%E8%88%AA%E7%AB%99-ctf.dog-5492ff?style=flat-square" alt="ctfnav"></a>
<a href=".."><img src="https://img.shields.io/badge/Python%20-%203.10.11-def1f2?style=flat-square" alt="python"></a>

</div>

---

一群已满 请加二群：668600249 

### 这是什么

一款基于 `MemProcFS`、`Volatility2`、`Volatility3` 的快捷内存取证工具。

区别于 [VolatilityPro](https://github.com/Tokeii0/VolatilityPro)，LovelyMem 提供了更快的取证速度和更便捷的功能。

**视频展示**：https://www.bilibili.com/video/BV1z912YpECB

**完整版下载**：https://pan.quark.cn/s/8343fccf1312

---

### 界面展示

![image](https://github.com/user-attachments/assets/6c5e5807-1a1a-4285-b189-c36a3269b3c1)

![image](https://github.com/user-attachments/assets/2e1c6084-88a9-4535-bba6-c5c917b37b06)

![image](https://github.com/user-attachments/assets/1084eabf-2951-41c8-93b8-531fcefe3eff)


---

### 具体准备

根据 `config` 文件夹下的 `base_config.yaml` 自助配置以下内容，或者直接在软件中通过 "高级功能" 下的 "设置" 按钮进行图形化配置。

```yaml
tools:
  memprocfs:
    path: "../Tools/MemProcFS/MemProcFS.exe"
  volatility2:
    path: "../Tools/volatility2/vol.exe"
  volatility2_python:
    path: "../Tools/volatility2_python/vol.py"
  volatility3:
    path: "../Tools/volatility3/vol.py"
  volatility3_symbols:
    path: "../Tools/volatility3/symbols"
  gimp:
    path: "../Tools/gimp/bin/gimp-console-2.10.exe"
  volatility2_plugin:
    path: "../Tools/volatility2_plugin"

base_tools:
  python310:
    path: "../Tools/python3/python.exe"
  python27:
    path: "../Tools/python27/python27.exe" 
  strings:
    path: "../Tools/other/strings.exe"

other_tools:
  RegistryExplorer:
    path: "../Tools/RegistryExplorer/RegistryExplorer.exe"
  EvtxECmd:
    path: "../Tools/EvtxECmd/EvtxECmd.exe"
```

---

### 功能特点

- **工具集成**：集成了 `MemProcFS`、`Volatility2`、`Volatility3` 等多种内存取证工具。
- **快速检查**：提供常用取证功能的快速访问。
- **任务编排**：可以创建和执行自定义的取证任务流程。
- **报告编辑器**：方便生成和编辑取证报告。
- **AI助手**：提供AI辅助分析功能。
- **配置设置**：通过图形界面轻松配置工具路径、LLM设置和代理设置。

---

### 运行

配置好相关内容后，运行：

```bash
python launcher.py
```

---

### 插件开发

下面是一个解压文件的插件示例，其他插件示例可参考 `extensions` 文件夹。

```python
import zipfile
import os

# 插件信息字典,包含插件的基本信息
plugin_info = {
    "title": "解压文件",  # 插件标题
    "description": "解压ZIP、RAR等压缩文件",  # 插件描述
    "usage": "选择一个压缩文件,然后点击此插件",  # 使用说明
    "category": "文件操作"  # 插件类别
}

def run(file_path):
    """
    插件的主要执行函数
    
    参数:
    file_path (str): 要处理的文件的路径
    
    返回:
    None
    """
    # 检查文件是否存在
    if not os.path.exists(file_path):
        print(f"错误: 文件 {file_path} 不存在")
        return

    # 获取文件扩展名
    _, file_extension = os.path.splitext(file_path)
    
    # 根据文件扩展名选择相应的解压方法
    if file_extension.lower() == '.zip':
        extract_zip(file_path)
    else:
        print(f"不支持的文件类型: {file_extension}")

def extract_zip(file_path):
    """
    解压ZIP文件
    
    参数:
    file_path (str): ZIP文件的路径，即文件槽内文件路径
    
    返回:
    None
    """
    try:
        # 创建输出目录
        output_dir = os.path.join('output', 'extracted_files')
        os.makedirs(output_dir, exist_ok=True)
        
        # 解压文件
        with zipfile.ZipFile(file_path, 'r') as zip_ref:
            zip_ref.extractall(output_dir)
        
        print(f"文件已成功解压到: {output_dir}")
        
        # 列出解压后的文件
        print("解压的文件列表:")
        for root, dirs, files in os.walk(output_dir):
            for file in files:
                print(os.path.join(root, file))
    
    except zipfile.BadZipFile:
        print("错误: 无效的ZIP文件")
    except Exception as e:
        print(f"解压过程中发生错误: {str(e)}")

# 注意: 如果需要支持其他类型的压缩文件(如RAR),
# 可以添加相应的解压函数并在run()中调用
```

---

### 适合什么题

- 没有套娃的取证题目
- *Windows* 内存取证

---

### 几个问题

**Q: 为什么一开始收费，现在突然开源了？**

A: 这个项目一开始收费时，我就给自己立了个flag：要么GitHub星标破1000，要么被人破解。结果显而易见，哈哈。我也不怪那位破解的大佬，毕竟技术无罪，大家一起努力嘛，共同进步！进一步开源的原因：与其等着破解满天飞不如直接开源~

**Q: 开源之后还会继续更新吗？**

A: 当然会更！这可是我第一个星标这么高的项目，只要我有时间，就会一直维护下去。也欢迎各位大佬多多参与，一起把项目做得更好～

---

### 其他

远离内卷，还CTF圈一个朗朗乾坤。

愿望是取证像喝水一样简单。

---


---

### Star History Chart

[![Star History Chart](https://api.star-history.com/svg?repos=Tokeii0/LovelyMem&type=Date)](https://star-history.com/#Tokeii0/LovelyMem&Date)
