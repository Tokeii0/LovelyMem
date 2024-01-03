<!-- markdownlint-disable MD033 MD041 -->

<div align="center">

# LovelyMem

<!-- prettier-ignore-start -->
<!-- markdownlint-disable-next-line MD036 -->
_✨ 基于Memprocfs的可视化内存取证工具 ✨_
<!-- prettier-ignore-end -->
<a href="https://jq.qq.com/?_wv=1027&k=DzOtbzU4"><img src="https://img.shields.io/badge/QQ%E7%BE%A4-555741990-orange?style=flat-square" alt="QQGroup"></a>
  <a href="http://ctf.dog"><img src="https://img.shields.io/badge/CTF%E5%AF%BC%E8%88%AA%E7%AB%99-ctf.dog-5492ff?style=flat-square" alt="ctfnav"></a>
  <a href="https://afdian.net/@Tokeii"><img src="https://img.shields.io/badge/爱发电-afdian.net-66ccff?style=flat-square" alt="aifadian"></a>
  <a href=".."><img src="https://img.shields.io/badge/Python%20-%203.8+-def1f2?style=flat-square" alt="python"></a>
</div>

### 这是什么
一款基于memprocfs的快捷内存取证工具

区别于VolatilityPro：https://github.com/Tokeii0/VolatilityPro

有着更快的取证速度以及更便捷的功能

### 功能展示
https://www.bilibili.com/video/BV1TK411b78J/
https://www.bilibili.com/video/BV1Hb4y1G77m/

### 适合什么题
  - 没有套娃的取证题目
    
### 使用方法

因为不自带memprocfs，请先到memprocfs作者github页面下载相对应的版本

https://github.com/ufrisk/MemProcFS/releases/tag/v5.8

放在*Tools/memprocfs*目录下

挂载文件系统需要*安装Dokany文件系统库*

请下载并安装最新版本的 Dokany 版本 2：https://github.com/dokan-dev/dokany/releases/latest

安装gimp https://www.gimp.org/download/

目录下运行命令

` python main.py `
### 你都更新了点啥
#### v0.2c 2024.1.2
  - 重整按钮位置
  - 修改了几个按钮的位置，现在搜索都在搜索框下方
  - 新增了vol2editbox，volclipboard
  - 新增查看services,注册表timeline
  - 最初写的netstat重写方法
  - 修改缩小了绘制表格打印行高
#### v0.2b 2024.1.1
  - 新增快速查看文本内容
  - 新增快速查看图片
  - 修改没有找到内容时控制台报错
  - 大改搜索文件规则，现在显示的为实际路径
  - ntfs搜索下已支持快速打开全部目录
#### v0.2a 2023.12.30
  - 新增vol2文件导出
  - 修改vol2联合搜索与vol2文件导出导出时按钮变为"搜索中..."以防多次点击
  - 修改了宽高，列表内文字大小
#### v0.2 2023.12.27
  - 新建右键菜单，修改右键逻辑，现在大伙可以按右键选择直接跳转到文件所在目录（前提是这是一个文件路径）
  - 右键新增功能，复制内容并发送至搜索框
  - 因为有部分过小文件无法搜索到，新增vol2联合搜索，打印至控制台，dumpfile放下个版本写
  - 新增ntfs搜索，基于timeline_ntfs文件，可以快速定位某时间什么目录生成什么文件
  - 新增卸载内存镜像
  - 输入框支持输入pid并点击procdump2gimp可直接用gimp载入原始数据
  - 支持拖拽镜像文件至窗口内
  - 版本号更改为v0.2
  - config.py文件用于存放第三方工具gimp以及vol2所在目录仅供参考
#### v0.1 2023.12.26
  - 新建项目


### 其他
远离内卷，还CTF圈一个朗朗乾坤

愿望是取证像喝水一样简单

