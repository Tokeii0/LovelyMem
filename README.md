<!-- markdownlint-disable MD033 MD041 -->
<p align="center">
  <a href="https://ctf.mzy0.com"><img src="https://github.com/Tokeii0/LovelyMem/blob/main/res/logo.png" width="250" height="250" alt="lovelymem"></a>
</p>
<div align="center">

# LovelyMem

<!-- prettier-ignore-start -->
<!-- markdownlint-disable-next-line MD036 -->
_✨ 基于*Memprocfs*和*Volatility*的可视化内存取证工具 ✨_
<!-- prettier-ignore-end -->
<a href="https://jq.qq.com/?_wv=1027&k=DzOtbzU4"><img src="https://img.shields.io/badge/QQ%E7%BE%A4-555741990-orange?style=flat-square" alt="QQGroup"></a>
  <a href="http://ctf.dog"><img src="https://img.shields.io/badge/CTF%E5%AF%BC%E8%88%AA%E7%AB%99-ctf.dog-5492ff?style=flat-square" alt="ctfnav"></a>
  <a href="https://afdian.net/@Tokeii"><img src="https://img.shields.io/badge/爱发电-afdian.net-66ccff?style=flat-square" alt="aifadian"></a>
  <a href=".."><img src="https://img.shields.io/badge/Python%20-%203.10.11-def1f2?style=flat-square" alt="python"></a>
</div>

### 这是什么
一款基于memprocfs、Volatility2、Volatility3的快捷内存取证工具

区别于VolatilityPro：https://github.com/Tokeii0/VolatilityPro

有着更快的取证速度以及更便捷的功能
### 界面展示

![image](https://github.com/Tokeii0/LovelyMem/assets/111427585/51593041-9c91-441a-acfe-fca04a748434)

### 功能展示
https://www.bilibili.com/video/BV1TK411b78J/

https://www.bilibili.com/video/BV1Hb4y1G77m/

https://www.bilibili.com/video/BV1Px4y1H7DB/
### 适合什么题
  - 没有套娃的取证题目
    
### 使用方法
  -下载压缩包
  
  -加入QQ群 555741990 联系群主**免费**添加指定在线授权。
  
  -复制设备密钥给群主添加授权
  
  -运行[0] 点我启动.bat
  
### 你都更新了点啥
#### v0.6

1. **源代码混淆及发布变更**
    
    - 从本版本开始，对源代码进行混淆，源代码将不再公布于 GitHub。
2. **在线验证机制**
    
    - 用户需加入QQ群 555741990 联系群主**免费**添加指定授权。
    - **离线授权**请移步爱发电进行**捐赠**。
3. **功能调整与新增**
    
    - 移除对 VolPro 的合并，重构 Vol2 各种命令的快速导出功能。
    - 支持 Volatility3，并新增部分 Windows 方法。
    - 增加一键功能区，目前仅有一键获取 Windows 密码功能。
4. **性能优化**
    
    - 重构 TableView 读取 CSV 文件的方法，速度显著提升。
5. **界面与操作改进**
    
    - 按钮实体名称重新命名，统一为 Vol2 和 Vol3。
    - 新增授权头像及头像框。
    - 新增导出结果打包功能，正常退出软件后会自动打包并存储在 Archive 文件夹下。
6. **运行环境整合**
    
    - 整合运行环境，实现点击即可运行的便捷操作。
7. **工具扩展**
    
    - 增加 Hashcat 工具，目前尚未完全集成。
#### v0.5 2024.5.29
  - *从下个版本开始不再开源，可能会进行爱发电对接，具体内容再看*
  - 更新版本至0.5
  - 修改按钮位置，现在开始更加简洁
  - 增加分页，vol与memprocfs功能分开
  - 删除以前的假的profile获取方式现在是列表
  - 新增启动logo窗口
  - 从这个版本开始删除加载镜像，现在手动选择镜像或者拖入镜像后会自动加载
  - tips内容独立于main.py
#### v0.4a 2024.4.15
  - 新增了NTFS文件时间线
  - 修改几个按钮位置
#### v0.4 2024.4.10
  - 新增联动volpro进行执行
  - 在快速查看文本的新窗口中新增了搜索框与搜索按钮
  - editbox、clipboard、netstat默认优先从volpro中取值，若文件大小空白或文件不存在则会重新进行执行命令
  - 基本信息中能显示的内容扩大至5000
  - 新增自定义命令（执行，可以对一些列出的命令进行执行具体参考软件中按钮tips）
  - 对大部分控件添加了tips内容方便快速了解使用方法
  - 通过判断文件镜像注册表的内容来自动判断vol2所需的profile
  - 新增profile下拉框，如果是windows7X64以上的版本一般来说是用不上的但是不能没有，列表添加可以在config.py中添加
  - 右键选择打开文件现在会默认选择到你所选的文件上
  - 优化tips内容
  - 版本号更新至v0.4
#### v0.3 2024.4.9
  - 修改加载卸载布局，现在都归入文件菜单中
  - 基本信息中新增对系统密码的展示并通过新窗口打印，而不是通过cmd打印
  - 修改vol2常用命令按钮名称，删除了vol2字符串
  - 新增netscan命令，在cmd展出，并支持指定字符串搜索
  - 对按钮进行了简单的tips展示
  - 在对表格项目进行操作时新增右键菜单删除行删除列
  - 内部的tableWidget的宽高现在会跟随者窗口宽高变化
  - 新增了一个开关用于在自适应以及自定义列宽中切换
  - 新增一个加载全部文件的按钮
  - title新增github项目地址
  - 对右侧的按钮进行layout整理
  - 版本号更新至v0.3
  - 采用全新logo
  - 退出时新增收款码
  - 新增一个下拉框，准备在里面放vol2的profile，明天再说
#### v0.2d 2024.1.4
  - 修了个bug
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
### BUG 
  - 部分windows7内存镜像在解析netstat -v时无法显示对端（DST）ip和端口，解决方案是在界面内加入了vol2netscan进行搜索

### 其他
远离内卷，还CTF圈一个朗朗乾坤

愿望是取证像喝水一样简单

