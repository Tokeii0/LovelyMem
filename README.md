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
![image](https://github.com/Tokeii0/LovelyMem/assets/111427585/e60e3adb-8966-419b-a3e3-a57efdccdc1c)


### 功能展示
https://www.bilibili.com/video/BV1TK411b78J/

https://www.bilibili.com/video/BV1Hb4y1G77m/

https://www.bilibili.com/video/BV1Px4y1H7DB/
### 适合什么题
  - 没有套娃的取证题目
    
### 使用方法
  -下载压缩包

  -运行[-] 获取授权码 .bat 记录授权码
  
  -加入QQ群 555741990 联系群主**免费**添加指定在线授权(将授权码私发给群主)。
  
  -复制设备密钥给群主添加授权
  
  -运行[0] 点我启动.bat
### 更新
  - 运行 整合包下面的 [-] 更新.bat 即可
### 其他方面
  - 关于dokan安装失败的问题可以参考 https://github.com/dokan-dev/dokany/issues/1200 解决
  
### 你都更新了点啥

#### v0.7
  1. 界面换新，现在所有执行的内容都回在新窗口中打开
  2. 按钮改为圆角，改变配色
  3. 移出vol2的dumpfile功能至新窗口右键菜单
  4. proc2gimp也转移至新窗口右键菜单
  5. 新窗口的搜索功能现在会在新窗口显示所有的结果以及对应的行，双击会转调至对应行
  6. 新窗口的列从新版本起可以进行排序
  7. vol2 新增一些我自己觉得可能用的到的功能
  8. vol2 页签下新增一个自定义执行命令 只需要输入profile后面的命令，具体命令参考vol主页
  9. 修复了一大堆bug，并新增了一堆bug
  10. 头像以及授权表示暂时移动至一键功能区
#### v0.6c
  1. 修复部分vol3对中文不支持的问题
  2. 资源文件分离
  3. 基本功能改名memprocfs功能
  4. memprocfs功能区部分按钮位置进行修改
  5. 部分按钮名字进行修改避免歧义
  6. 新增一个捐赠菜单
#### v0.6b
  1. 对tabwidget功能右键功能进行优化修改，不同的tab拥有不同的功能
  2. 打开文件所在目录功能已经在vol2/vol3中可以正常使用了，部分文件
  3. vol2 tab下，执行filescan 文件后,右键offset 列内容可选择导出该文件
#### v0.6

1. **源代码混淆及发布变更**
    
    - 从本版本开始，对源代码进行混淆，源代码将不再公布于 GitHub。
2. **在线验证机制**
    
    - 用户需加入QQ群 856729462 联系群主**免费**添加指定授权。
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
8. **一键更新**

    - 增加更新的方法，后续如无大变动将不会进行新的整合包发布
  

### 其他
远离内卷，还CTF圈一个朗朗乾坤

愿望是取证像喝水一样简单

