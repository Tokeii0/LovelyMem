MemProcFsDir = r'Tools\MemProcFS\MemProcFS.exe'
volatility2 = r'Tools\volatility2\vol.exe'
volatility3 = r'Tools\volatility3\vol.py'
gimp = r'Tools\gimp\bin\gimp-console-2.10.exe'
profile  = ['Win7SP1x64', 'Win7SP1x86', 'WinXPSP3x86', 'WinXPSP2x86', 'WinXPSP2x64']
pythonpath = r'python\python.exe' # python路径
pypykatz = r'python\Scripts\pypykatz.exe'



#-------------------------未来功能----------------------------
# 应该为空的目录
suspicious_directories = [
    r"\Users\Public\Music"
]


# 排除规则可以是完整的文件路径或者是正则表达式
excluded_patterns = [
    r"\\Windows\\Fonts\\.*\.ttf$",  # 排除Windows\Fonts目录下的所有.ttf文件
]

# 添加重点关注列表,file_name为文件名，excluded_directories为文件应该出现的目录，比如说explorer.exe应该在Windows目录下
watchlist_items = [
    {
        'file_name': r"cmd.exe",
        'excluded_directories': [
            r"\\Windows\\System32\\",
            r"\\Windows\\SysWOW64\\"
        ]
    },
    {
        'file_name': r"f.exe",
        'excluded_directories': [
            r"\\Windows\\System32\\",
            r"\\Windows\\SysWOW64\\"
        ]
    }
]

# 排除动作
action_items = [
    {
        'action': r"CRE",
        'excluded_directories': [
            r"\\Windows\\System32\\",
            r"\\Windows\\SysWOW64\\"
        ]
    }
]