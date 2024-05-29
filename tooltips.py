# tooltips.py

tooltips = {
    'actionOpenFile': '打开文件',
    'action3': '卸载内存镜像',
    'pushButton_flush': '在新窗口加载镜像的基本信息',
    'pushButton_findstr': '搜索文件名包含关键字的文件',
    'pushButton_load_netstat': '加载网络连接信息，若目的地址无法显示请使用netscan',
    'pushButton_load_proc': '加载进程信息',
    'pushButton_load_tasks': '加载任务信息',
    'pushButton_load_findevil': '加载恶意文件信息',
    'pushButton_load_netstat_timeline': '加载网络连接时间线',
    'pushButton_load_proc_timeline': '加载进程时间线\nQ:进程时间线是什么？\nA:进程时间线是进程的创建、退出时间等信息',
    'pushButton_load_web_timeline': '加载web网页访问时间线',
    'pushButton_findrow': '搜索行',
    'pushButton_withvol2find': '通过vol2搜索文件,输入框输入文件关键字',
    'pushButton_ntfsfind': '搜索NTFS文件',
    'pushButton_procdump2gimp': '使用gimp打开搜索框中pid对应进程的minidump文件\n通过调整宽高位移来查看缓存在内存中的图片等信息',
    'pushButton_withvol2dump': '通过vol2导出文件,输入框输入文件物理地址0xXXXXXXX',
    'pushButton_vol2editbox': '通过vol2搜索editbox\nQ：editbox是什么？\nA：editbox是windows中的文本框\nQ：为什么要搜索？\nA：因为文本框中可能有密码等敏感信息',
    'pushButton_vol2clipboard': '通过vol2搜索clipboard\nQ：clipboard是什么？\nA：clipboard是windows中的剪贴板\nQ：为什么要搜索？\nA：因为剪贴板中可能有密码等敏感信息',
    'pushButton_services': '加载服务信息',
    'pushButton_load_timeline_registry': '加载注册表时间线',
    'pushButton_loadallfile': '加载所有文件列表',
    'pushButton_withvol2netscan': '通过vol2搜索netscan\nTips:软件默认的memprocfs导出的网络连接缺少目的地址的显示\n所以这里调用vol2的可以使用netscan进行查看',
    'lineEdit_str': '该输入框为通用搜索、查询、导出等功能的限制关键词输入框，具体功能请查看按钮提示',
    'pushButton_cuscmd': '这个按钮功能是vol2中profile后面命令的自定义执行\n输入框中输入需要执行的内容,例如：iehistory|findstr flag \n默认命令提示符输出',
    'pushButton_load_ntfsfile_timeline': '加载NTFS文件时间线'
    # 添加更多控件的工具提示...
}
