from plugin.config import config
import subprocess
import os,yaml
import pandas as pd
import json
import traceback
from PySide6.QtCore import QThread, Signal, QObject

from plugin.NewtableWidget import NewtableWidget
from plugin.QuicklyView import QuicklyView
from lovelyform import show_csv_viewer

class WorkerThread(QThread):
    task_completed = Signal(bool, str)

    def __init__(self, cmd):
        super().__init__()
        self.cmd = cmd

    def run(self):
        try:
            process = subprocess.Popen(
                self.cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                universal_newlines=True,
                encoding='utf-8', 
                shell=False  # 设置为 False
            )
            stdout, stderr = process.communicate()

            if process.returncode == 0:
                print(stdout)
                self.task_completed.emit(True, "任务成功完成")
            else:
                error_msg = (
                    f"命令执行失败，返回代码 {process.returncode}。\n输出: {stdout}\n错误: {stderr}"
                )
                print(error_msg)
                self.task_completed.emit(False, error_msg)
        except Exception as e:
            error_msg = f"发生错误: {str(e)}\n{traceback.format_exc()}"
            print(error_msg)
            self.task_completed.emit(False, error_msg)


class Vol2:
    def __init__(self, mem_path, profile):
        self.mem_path = mem_path
        self.profile = profile
    def readconfig(self):
        with open('config/base_config.yaml', 'r', encoding='utf-8') as file:
            config = yaml.safe_load(file)
        python27 = config['base_tools']['python27']['path']
        python27 = os.path.abspath(python27)
        volatility2 = config['tools']['volatility2_python']['path']
        volatility2_plugin = config['tools']['volatility2_plugin']['path']
        volatility2 = os.path.abspath(volatility2)
        volatility2_plugin = os.path.abspath(volatility2_plugin)
        return python27,volatility2,volatility2_plugin

    def construct_command(self, plugin, output_type='json'):
        self.python27, self.volatility2, self.volatility2_plugin = self.readconfig()
        output_file = f'output/output_vol2_{plugin}.{output_type}'
        cmd = [
            self.python27,
            self.volatility2,
            f'--plugin={self.volatility2_plugin}',
            '-f',
            self.mem_path,
            f'--profile={self.profile}',
            plugin,
            f'--output={output_type}',
            f'--output-file={output_file}'
        ]
        return cmd, output_file
    
    # 可以额外加参数的construct_command, 比如说 插入一个 -v 参数
    def construct_command_with_args(self, plugin, output_type='json', **kwargs):
        cmd, output_file = self.construct_command(plugin, output_type)
        for key, value in kwargs.items():
            cmd.append(f'-{key}')
        return cmd, output_file


    def json_to_csv(self, json_file):
        try:
            with open(json_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
            if 'rows' in data and 'columns' in data:
                df = pd.DataFrame(data['rows'], columns=data['columns'])
                csv_file = json_file.replace('.json', '.csv')
                df.to_csv(csv_file, index=False)
                print(f"[+] 成功将 {json_file} 转换为 {csv_file}")
                #删除json文件
                os.remove(json_file)
            else:
                print(f"[!] {json_file} 不包含预期的数据，跳过转换")
        except Exception as e:
            print(f"[!] 转换 {json_file} 时出错: {str(e)}")


class Vol2Plugin(QObject):
    task_completed_signal = Signal(str)  # 添加任务完成信号
    
    def __init__(self, mem_path):
        super().__init__()
        self.mem_path = mem_path
        self.profile = None  # 初始化为 None
        self.workers = []  # 确保初始化 workers 属性
        self.open_windows = []
        self.python27, self.volatility2, self.volatility2_plugin = self.readconfig()
        self.default_profile = "无法获取profile"  # 添加默认 profile

    def readconfig(self):
        with open('config/base_config.yaml', 'r', encoding='utf-8') as file:
            config = yaml.safe_load(file)
        python27 = config['base_tools']['python27']['path']
        python27 = os.path.abspath(python27)
        volatility2 = config['tools']['volatility2_python']['path']
        volatility2_plugin = config['tools']['volatility2_plugin']['path']
        volatility2 = os.path.abspath(volatility2)
        volatility2_plugin = os.path.abspath(volatility2_plugin)
        return python27, volatility2, volatility2_plugin

    def get_profile(self, default_profile=None):
        try:
            if self.profile:
                print("[*] 检测到Profile参数,正在跳过imageinfo")
                return self.profile, [self.profile]
            else:
                print("[*] 未检测到Profile,正在执行 imageinfo")
                cmd = [self.python27, self.volatility2, '-f', self.mem_path, 'imageinfo']
                process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, universal_newlines=True)
                stdout, stderr = process.communicate()
                if process.returncode == 0:
                    lines = stdout.split("\n")
                    for line in lines:
                        if "Suggested Profile(s)" in line:
                            suggested_profiles = line.split(":")[1].strip()
                            profilelist = [p.strip() for p in suggested_profiles.split(",")]
                            return profilelist[0], profilelist
                else:
                    print(f"[-] 获取profile时出错: {stderr}")
                    return self.default_profile, [self.default_profile]
        except Exception as e:
            print(f"[-] 获取profile时出错: {str(e)}")
            return self.default_profile, [self.default_profile]

    def start_get_profile(self):
        self.get_profile_thread = GetProfileThread(self)
        self.get_profile_thread.profile_obtained.connect(self.on_profile_obtained)
        self.get_profile_thread.start()

    def on_profile_obtained(self, profile):
        self.profile = profile
        print(f"[+] 自动匹配的Profile: {profile}")
    
    def run_plugin(self, plugin_name, display_name, output_type='json', show_result=True):
        # 检查profile是否为None，如果是则提示用户先获取profile
        if self.profile is None:
            print(
                f"[!] {display_name} 执行失败: Profile未设置，请先获取内存镜像Profile"
            )
            return
        
        vol2 = Vol2(self.mem_path, self.profile)
        cmd, output_file = vol2.construct_command(plugin_name, output_type)
        output_exists = os.path.exists(output_file)

        if output_exists:
            self.display_output(display_name, output_file)
        else:
            worker = WorkerThread(cmd)
            worker.task_completed.connect(
                lambda success, message: self.on_task_completed(
                    success, message, display_name, output_file, output_type, show_result
                )
            )
            worker.finished.connect(worker.deleteLater)
            worker.start()
            self.workers.append(worker)
            print(f"[*] 正在执行：{' '.join(cmd)}")

    def on_task_completed(self, success, message, display_name, output_file, output_type, show_result):
        if success:
            print(f"[+] {display_name} 执行完成")
            if output_type == 'json':
                Vol2(self.mem_path, self.profile).json_to_csv(output_file)
                output_file = output_file.replace('.json', '.csv')
            if show_result:
                self.display_output(display_name, output_file)
            else:
                print(f"[!] 输出文件 {output_file} 不存在")
        else:
            print(f"[-] {display_name} 执行失败: {message}")
        
        # 发射任务完成信号
        self.task_completed_signal.emit(display_name)
        self.workers = [w for w in self.workers if w.isRunning()]

    def run_plugin_with_fallback(self, plugin_name, display_name, show_result=True):
        """运行插件，如果JSON格式失败则自动尝试text格式"""
        vol2 = Vol2(self.mem_path, self.profile)
        
        # 首先尝试JSON格式
        cmd, output_file = vol2.construct_command(plugin_name, 'json')
        csv_file = output_file.replace('.json', '.csv')
        
        # 检查CSV文件是否已存在
        if os.path.exists(csv_file) and os.path.getsize(csv_file) > 0:
            if show_result:
                self.display_output(display_name, csv_file)
            return
        
        # 如果CSV不存在，尝试JSON格式
        worker = WorkerThread(cmd)
        worker.task_completed.connect(
            lambda success, message: self.on_task_completed_with_fallback(
                success, message, display_name, output_file, plugin_name, show_result
            )
        )
        worker.finished.connect(worker.deleteLater)
        worker.start()
        self.workers.append(worker)
        print(f"[*] 正在执行：{' '.join(cmd)}")

    def on_task_completed_with_fallback(self, success, message, display_name, output_file, plugin_name, show_result):
        """处理带fallback的任务完成"""
        if success:
            print(f"[+] {display_name} 执行完成")
            Vol2(self.mem_path, self.profile).json_to_csv(output_file)
            csv_file = output_file.replace('.json', '.csv')
            if show_result:
                self.display_output(display_name, csv_file)
        else:
            # JSON格式失败，尝试text格式
            if "unified output format has not been implemented" in message:
                print(f"[!] {display_name} 不支持JSON格式，尝试使用text格式")
                vol2 = Vol2(self.mem_path, self.profile)
                cmd, text_output_file = vol2.construct_command(plugin_name, 'text')
                
                worker = WorkerThread(cmd)
                worker.task_completed.connect(
                    lambda success, message: self.on_text_task_completed(
                        success, message, display_name, text_output_file, show_result
                    )
                )
                worker.finished.connect(worker.deleteLater)
                worker.start()
                self.workers.append(worker)
                print(f"[*] 正在执行text格式：{' '.join(cmd)}")
            else:
                print(f"[-] {display_name} 执行失败: {message}")
        
        # 发射任务完成信号
        self.task_completed_signal.emit(display_name)
        self.workers = [w for w in self.workers if w.isRunning()]

    def on_text_task_completed(self, success, message, display_name, output_file, show_result):
        """处理text格式任务完成"""
        if success:
            print(f"[+] {display_name} (text格式) 执行完成")
            if show_result:
                self.display_output(display_name, output_file)
        else:
            print(f"[-] {display_name} (text格式) 执行失败: {message}")
        
        # 发射任务完成信号
        self.task_completed_signal.emit(display_name)
        self.workers = [w for w in self.workers if w.isRunning()]

    def display_output(self, title, file_path):
        if file_path.endswith('.text') or file_path.endswith('.txt'):
            self.show_text_result(title, file_path)
        elif file_path.endswith('.csv'):
            self.show_result(title, file_path)
        else:
            print(f"[!] 未知的文件类型: {file_path}")

    def show_result(self, title, csv_path):
        show_csv_viewer(csv_path)
        #self.open_windows.append(new_window)

    def show_text_result(self, title, txt_path):
        new_window = QuicklyView(title, size=(800, 600))
        new_window.load_file_content(txt_path)
        new_window.show()
        self.open_windows.append(new_window)

    def cleanup_threads(self):
        for worker in self.workers:
            worker.quit()
            worker.wait()
        self.workers.clear()

    def __del__(self):
        # 安全地关闭所有打开的窗口
        if hasattr(self, 'open_windows'):
            windows_to_close = self.open_windows.copy()  # 创建副本避免修改原列表
            for window in windows_to_close:
                try:
                    if window:
                        window.close()
                except:
                    pass  # 忽略任何错误
            self.open_windows.clear()

    # 以下为各插件方法
    def vol2_filescan(self):
        if os.path.exists('output/output_vol2_filescan.csv') and os.path.getsize('output/output_vol2_filescan.csv') > 0:
            
            self.show_result('文件扫描', 'output/output_vol2_filescan.csv')
        else:
            self.run_plugin_with_fallback('filescan', '文件扫描')

    def vol2_timeliner(self):
        if os.path.exists('output/output_vol2_timeliner.csv') and os.path.getsize('output/output_vol2_timeliner.csv') > 0:
            
            self.show_result('时间线', 'output/output_vol2_timeliner.csv')
        else:
            self.run_plugin_with_fallback('timeliner', '时间线')

    def vol2_netscan(self):
        if os.path.exists('output/output_vol2_netscan.csv') and os.path.getsize('output/output_vol2_netscan.csv') > 0:
            
            self.show_result('网络扫描', 'output/output_vol2_netscan.csv')
        else:
            self.run_plugin_with_fallback('netscan', '网络扫描')

    def vol2_iehistory(self):
        if os.path.exists('output/output_vol2_iehistory.text') and os.path.getsize('output/output_vol2_iehistory.text') > 0:
            
            self.show_text_result('IE历史记录', 'output/output_vol2_iehistory.text')
        else:    
            self.run_plugin('iehistory', 'IE历史记录', output_type='text')

    def vol2_editbox(self):
        if os.path.exists('output/output_vol2_editbox.text') and os.path.getsize('output/output_vol2_editbox.text') > 0:  
            self.show_text_result('剪贴板', 'output/output_vol2_editbox.text')
        else:
            self.run_plugin('editbox', '剪贴板', output_type='text')
    
    def vol2_clipboard(self):
        if os.path.exists('output/output_vol2_clipboard.text') and os.path.getsize('output/output_vol2_clipboard.text') > 0:
            
            self.show_text_result('剪贴板', 'output/output_vol2_clipboard.text')
        else:
            self.run_plugin('clipboard', '剪贴板', output_type='text')
        # 自定义命令执行
        cmd = [
            self.python27,
            self.volatility2,
            f'--plugin={self.volatility2_plugin}',
            '-f',
            self.mem_path,
            f'--profile={self.profile}',
            'clipboard',
            '-v',
            f'--output=text',
            f'--output-file=output/output_vol2_clipboard_v.text'
        ]
        print("正在执行-v参数剪贴板")
        self.run_dump_task(cmd, '剪贴板', 'output/output_vol2_clipboard_v.text', show_result=False)

    def vol2_cmdline(self):
        if os.path.exists('output/output_vol2_cmdline.csv') and os.path.getsize('output/output_vol2_cmdline.csv') > 0:
            
            self.show_result('命令行', 'output/output_vol2_cmdline.csv')
        else:
            self.run_plugin_with_fallback('cmdline', '命令行')

    def vol2_cmdscan(self):
        if os.path.exists('output/output_vol2_cmdscan.csv') and os.path.getsize('output/output_vol2_cmdscan.csv') > 0:
            
            self.show_result('命令扫描', 'output/output_vol2_cmdscan.csv')
        else:
            self.run_plugin_with_fallback('cmdscan', '命令扫描')

    def vol2_pslist(self):
        if os.path.exists('output/output_vol2_pslist.csv') and os.path.getsize('output/output_vol2_pslist.csv') > 0:
            
            self.show_result('进程列表', 'output/output_vol2_pslist.csv')
        else:
            self.run_plugin_with_fallback('pslist', '进程列表')

    def vol2_consoles(self):
        if os.path.exists('output/output_vol2_consoles.text') and os.path.getsize('output/output_vol2_consoles.text') > 0:
            
            self.show_text_result('控制台', 'output/output_vol2_consoles.text')
        else:
            self.run_plugin('consoles', '控制台', output_type='text')

    def vol2_imageinfo(self):
        print("请无视命令行中的--profile=Win7SP1x64，请根据下面结果中的 Suggested Profile(s) 修改旁边的profile")
        print("正在执行，请稍等...")
        if os.path.exists('output/output_vol2_imageinfo.text') and os.path.getsize('output/output_vol2_imageinfo.text') > 0:
            
            self.show_text_result('镜像信息', 'output/output_vol2_imageinfo.text')
        else:
            self.run_plugin('imageinfo', '镜像信息', output_type='text')
    # hivelist
    def vol2_hivelist(self):
        if os.path.exists('output/output_vol2_hivelist.csv') and os.path.getsize('output/output_vol2_hivelist.csv') > 0:
            
            self.show_result('注册表', 'output/output_vol2_hivelist.csv')
        else:
            self.run_plugin_with_fallback('hivelist', '注册表')
    def vol2_dumpregistry(self):
        #  E:\Tools\python27\python27.exe E:\Tools\volatility2_python\vol.py --plugin=E:\Tools\volatility2_plugin -f E:/data1.raw --profile=Win7SP1x64 dumpregistry -D output/
        cmd = [
            self.python27,
            self.volatility2,
            f'--plugin={self.volatility2_plugin}',
            '-f',
            self.mem_path,
            f'--profile={self.profile}',
            'dumpregistry',
            '-D', 'output/'
        ]
        self.run_dump_task(cmd, '导出全部注册表', 'output/', show_result=False)
    def vol2_svcscan(self):
        if os.path.exists('output/output_vol2_svcscan.csv') and os.path.getsize('output/output_vol2_svcscan.csv') > 0:
            
            self.show_result('服务扫描', 'output/output_vol2_svcscan.csv')
        else:
            self.run_plugin_with_fallback('svcscan', '服务扫描')

    def vol2_userassist(self):
        if os.path.exists('output/output_vol2_userassist.csv') and os.path.getsize('output/output_vol2_userassist.csv') > 0:
            
            self.show_result('记录行为', 'output/output_vol2_userassist.csv')
        else:
            self.run_plugin_with_fallback('userassist', '记录行为')

    def vol2_shutdowntime(self):
        if os.path.exists('output/output_vol2_shutdowntime.text') and os.path.getsize('output/output_vol2_shutdowntime.text') > 0:
            
            self.show_text_result('关机时间', 'output/output_vol2_shutdowntime.text')
        else:
            self.run_plugin('shutdowntime', '关机时间', output_type='text')
    def vol2_eventhooks(self):
        if os.path.exists('output/output_vol2_eventhooks.csv') and os.path.getsize('output/output_vol2_eventhooks.csv') > 0:
            
            self.show_result('事件钩子', 'output/output_vol2_eventhooks.csv')
        else:
            self.run_plugin_with_fallback('eventhooks', '事件钩子')
    def vol2_gditimers(self):
        if os.path.exists('output/output_vol2_gditimers.csv') and os.path.getsize('output/output_vol2_gditimers.csv') > 0:
            
            self.show_result('GDI定时器', 'output/output_vol2_gditimers.csv')
        else:
            self.run_plugin_with_fallback('gditimers', 'GDI定时器')
    def vol2_printkey(self):
        if os.path.exists('output/output_vol2_printkey.csv') and os.path.getsize('output/output_vol2_printkey.csv') > 0:
            
            self.show_result('注册表键值', 'output/output_vol2_printkey.csv')
        else:
            self.run_plugin_with_fallback('printkey', '注册表键值')
    def vol2_atomscan(self):
        if os.path.exists('output/output_vol2_atomscan.csv') and os.path.getsize('output/output_vol2_atomscan.csv') > 0:
            
            self.show_result('原子表扫描', 'output/output_vol2_atomscan.csv')
        else:
            self.run_plugin_with_fallback('atomscan', '原子表扫描')
    def vol2_deskscan(self):
        if os.path.exists('output/output_vol2_deskscan.csv') and os.path.getsize('output/output_vol2_deskscan.csv') > 0:
            
            self.show_result('桌面扫描', 'output/output_vol2_deskscan.csv')
        else:
            self.run_plugin_with_fallback('deskscan', '桌面扫描')

    def vol2_verinfo(self):
        if os.path.exists('output/output_vol2_verinfo.csv') and os.path.getsize('output/output_vol2_verinfo.csv') > 0:
            
            self.show_result('版本信息', 'output/output_vol2_verinfo.csv')
        else:
            self.run_plugin_with_fallback('verinfo', '版本信息')
    def vol2_userhandles(self):
        if os.path.exists('output/output_vol2_userhandles.csv') and os.path.getsize('output/output_vol2_userhandles.csv') > 0:
            
            self.show_result('用户句柄', 'output/output_vol2_userhandles.csv')
        else:
            self.run_plugin_with_fallback('userhandles', '用户句柄')
    def vol2_messagehooks(self):
        if os.path.exists('output/output_vol2_messagehooks.text') and os.path.getsize('output/output_vol2_messagehooks.text') > 0:
            
            self.show_text_result('消息钩子', 'output/output_vol2_messagehooks.text')
        else:
            self.run_plugin('messagehooks', '消息钩子', output_type='text')

    def vol2_hashdump(self):
        if os.path.exists('output/output_vol2_hashdump.text') and os.path.getsize('output/output_vol2_hashdump.text') > 0:
            
            self.show_text_result('哈希转储', 'output/output_vol2_hashdump.text')
        else:
            self.run_plugin('hashdump', '哈希转储', output_type='text')

    def vol2_auditpol(self):
        if os.path.exists('output/output_vol2_auditpol.csv') and os.path.getsize('output/output_vol2_auditpol.csv') > 0:
            self.show_result('审计策略', 'output/output_vol2_auditpol.csv')
        else:
            self.run_plugin_with_fallback('auditpol', '审计策略')

    def vol2_windows(self):
        if os.path.exists('output/output_vol2_windows.text') and os.path.getsize('output/output_vol2_windows.text') > 0:
            self.show_text_result('窗口信息', 'output/output_vol2_windows.text')
        else:
            self.run_plugin('windows', '窗口信息', output_type='text')

    def vol2_envars(self):
        if os.path.exists('output/output_vol2_envars.csv') and os.path.getsize('output/output_vol2_envars.csv') > 0:
            self.show_result('环境变量', 'output/output_vol2_envars.csv')
        else:
            self.run_plugin_with_fallback('envars', '环境变量')

    def vol2_driverscan(self):
        if os.path.exists('output/output_vol2_driverscan.csv') and os.path.getsize('output/output_vol2_driverscan.csv') > 0:
            self.show_result('驱动扫描', 'output/output_vol2_driverscan.csv')
        else:
            self.run_plugin_with_fallback('driverscan', '驱动扫描')

    def vol2_lsadump(self):
        if os.path.exists('output/output_vol2_lsadump.text') and os.path.getsize('output/output_vol2_lsadump.text') > 0:
            self.show_text_result('LSA转储', 'output/output_vol2_lsadump.text')
        else:
            self.run_plugin('lsadump', 'LSA转储', output_type='text')

    def vol2_truecryptsummary(self):
        if os.path.exists('output/output_vol2_truecryptsummary.text') and os.path.getsize('output/output_vol2_truecryptsummary.text') > 0:
            self.show_text_result('TrueCrypt摘要', 'output/output_vol2_truecryptsummary.text')
        else:
            self.run_plugin('truecryptsummary', 'TrueCrypt摘要', output_type='text')
    
    def vol2_mimikatz(self):
        if os.path.exists('output/output_vol2_mimikatz.text') and os.path.getsize('output/output_vol2_mimikatz.text') > 0:
            self.show_text_result('Mimikatz', 'output/output_vol2_mimikatz.text')
        else:
            self.run_plugin('mimikatz', 'Mimikatz', output_type='text')
    def vol2_dlllist(self):
        if os.path.exists('output/output_vol2_dlllist.text') and os.path.getsize('output/output_vol2_dlllist.text') > 0:
            self.show_text_result('DLL调用列表', 'output/output_vol2_dlllist.text')
        else:
            self.run_plugin('dlllist', 'DLL调用列表', output_type='text')
    def vol2_screenshot(self):
        cmd = [
            self.python27,
            self.volatility2,
            f'--plugin={self.volatility2_plugin}',
            '-f',
            self.mem_path,
            f'--profile={self.profile}',
            'screenshot',
            '--dump-dir=output'
        ]
        self.run_dump_task(cmd, '截图', 'output/screenshot.png', show_result=False)

    # 以下方法涉及到文件导出，需要特殊处理
    def vol2_dumpfiles(self, offset):
        mem_path, profile = self.get_image_info_file()
        offset_str = hex(int(offset))
        if len(offset_str) <= 11:
            offset_str = '0x' + hex(int(offset))[2:]
            cmd = [
            self.python27,
            self.volatility2,
            f'--plugin={self.volatility2_plugin}',
            '-f',
            mem_path,
            f'--profile={profile}',
            'dumpfiles',
            '-Q',
            offset_str,
            '--dump-dir=output'
            ]
            self.run_dump_task(cmd, '文件转储', 'output', show_result=False)
        else:
            offset_str = '0xffff' + hex(int(offset))[2:]
            offset_str2 = '0x0000' + hex(int(offset))[2:]
            cmd = [
                self.python27,
                self.volatility2,
                f'--plugin={self.volatility2_plugin}',
                '-f',
                mem_path,
                f'--profile={profile}',
                'dumpfiles',
                '-Q',
                offset_str,
                '--dump-dir=output'
            ]
            cmd2 = [
                self.python27,
                self.volatility2,
                f'--plugin={self.volatility2_plugin}',
                '-f',
                mem_path,
                f'--profile={profile}',
                'dumpfiles',
                '-Q',
                offset_str2, '--dump-dir=output'
            ]
            print("正在尝试导出")
            self.run_dump_task(cmd, '文件转储', 'output', show_result=False)
            self.run_dump_task(cmd2, '文件转储', 'output', show_result=False)

    def vol2_procdump(self, pid):
        mem_path, profile = self.get_image_info_file()
        cmd = [
            self.python27,
            self.volatility2,
            f'--plugin={self.volatility2_plugin}',
            '-f',
            mem_path,
            f'--profile={profile}',
            'procdump',
            '-p',
            pid,
            '--dump-dir=output'
        ]
        output_file = f'output/proc_{pid}.dmp'
        self.run_dump_task(cmd, '进程转储', output_file, show_result=False)

    def vol2_memdump(self, pid):
        mem_path, profile = self.get_image_info_file()
        cmd = [
            self.python27,
            self.volatility2,
            f'--plugin={self.volatility2_plugin}',
            '-f',
            mem_path,
            f'--profile={profile}',
            'memdump',
            '-p',
            pid,
            '--dump-dir=output'
        ]
        output_file = f'output/proc_{pid}.dmp'
        self.run_dump_task(cmd, '进程转储', output_file, show_result=False)
    def vol2_dump_all_zip(self):
        print("[*] 正在导出所有可能的压缩包，请稍等...(可能不全)")
        self.dump_files_by_extension(['zip', 'rar', '7z'])

    def vol2_dump_all_txt(self):
        print("[*] 正在导出所有可能的文本文件，请稍等...(可能不全)")
        self.dump_files_by_extension(['txt'])

    def vol2_dump_all_images(self):
        print("[*] 正在导出所有可能的图片文件，请稍等...(可能不全)")
        self.dump_files_by_extension(['jpg', 'png', 'bmp', 'gif'])

    def dump_files_by_extension(self, extensions):
        mem_path, profile = self.get_image_info_file()
        for ext in extensions:
            #output_dir = f'output/'
            cmd = [
                self.python27,
                self.volatility2,
                self.volatility2_plugin,
                '-f',
                mem_path,
                f'--profile={profile}',
                'dumpfiles',
                '-r',
                f'{ext}$',
                '-i',
                '--unsafe',
                f'--dump-dir=output'
            ]
            self.run_dump_task(cmd, f'导出全部{ext}文件', 'output', show_result=False)

    def get_image_info_file(self):
        #output/image.txt
        mem_path = open('output/image_info.txt', 'r',encoding='utf-8').read().split(',')[0]
        profile = open('output/image_info.txt', 'r',encoding='utf-8').read().split(',')[1]
        return mem_path, profile

    def display_output(self, title, file_path):
        # 这里可以添加显示输出的逻辑，比如打开文件或显示在GUI中
        print(f"[*] {title} 的输出已保存到: {file_path}")
    def run_dump_task(self, cmd, title, output_dir, show_result=True):
        worker = WorkerThread(cmd)
        # 执行即可，不走on_task_completed
        print(f"[*] 正在执行：{' '.join(cmd)}")
        worker.start()
        self.workers.append(worker)

    # 添加新的插件方法
    def vol2_apihooks(self):
        if os.path.exists('output/output_vol2_apihooks.csv') and os.path.getsize('output/output_vol2_apihooks.csv') > 0:
            self.show_result('API钩子检测', 'output/output_vol2_apihooks.csv')
        else:   
            self.run_plugin_with_fallback('apihooks', 'API钩子检测')

    def vol2_atoms(self):
        if os.path.exists('output/output_vol2_atoms.csv') and os.path.getsize('output/output_vol2_atoms.csv') > 0:
            self.show_result('原子表', 'output/output_vol2_atoms.csv')
        else:   
            self.run_plugin_with_fallback('atoms', '原子表')

    def vol2_callbacks(self):
        if os.path.exists('output/output_vol2_callbacks.csv') and os.path.getsize('output/output_vol2_callbacks.csv') > 0:
            self.show_result('系统回调', 'output/output_vol2_callbacks.csv')
        else:   
            self.run_plugin_with_fallback('callbacks', '系统回调')

    def vol2_driverirp(self):
        if os.path.exists('output/output_vol2_driverirp.csv') and os.path.getsize('output/output_vol2_driverirp.csv') > 0:
            self.show_result('驱动IRP钩子检测', 'output/output_vol2_driverirp.csv')
        else:   
            self.run_plugin_with_fallback('driverirp', '驱动IRP钩子检测')
    def vol2_bigpools(self):
        if os.path.exists('output/output_vol2_bigpools.csv') and os.path.getsize('output/output_vol2_bigpools.csv') > 0:
            self.show_result('大内存池', 'output/output_vol2_bigpools.csv')
        else:   
            self.run_plugin_with_fallback('bigpools', '大内存池')
    def vol2_session(self):
        if os.path.exists('output/output_vol2_sessions.csv') and os.path.getsize('output/output_vol2_sessions.csv') > 0:
            self.show_result('会话信息', 'output/output_vol2_sessions.csv')
        else:   
            self.run_plugin_with_fallback('sessions', '会话信息')
    def vol2_wndscan(self):
        if os.path.exists('output/output_vol2_wndscan.csv') and os.path.getsize('output/output_vol2_wndscan.csv') > 0:
            self.show_result('窗口扫描', 'output/output_vol2_wndscan.csv')
        else:   
            self.run_plugin_with_fallback('wndscan', '窗口扫描')
    def vol2_gditimers(self):
        if os.path.exists('output/output_vol2_gditimers.csv') and os.path.getsize('output/output_vol2_gditimers.csv') > 0:
            self.show_result('GDI定时器', 'output/output_vol2_gditimers.csv')
        else:   
            self.run_plugin_with_fallback('gditimers', 'GDI定时器')
    def vol2_getservicesids(self):
        if os.path.exists('output/output_vol2_getservicesids.csv') and os.path.getsize('output/output_vol2_getservicesids.csv') > 0:
            self.show_result('服务信息', 'output/output_vol2_getservicesids.csv')
        else:   
            self.run_plugin_with_fallback('getservicesids', '服务信息')
    def vol2_handles(self):
        if os.path.exists('output/output_vol2_handles.csv') and os.path.getsize('output/output_vol2_handles.csv') > 0:
            self.show_result('进程句柄', 'output/output_vol2_handles.csv')
        else:   
            self.run_plugin_with_fallback('handles', '进程句柄')

    def vol2_malfind(self):
        if os.path.exists('output/output_vol2_malfind.csv') and os.path.getsize('output/output_vol2_malfind.csv') > 0:
            self.show_result('恶意代码检测', 'output/output_vol2_malfind.csv')
        else:   
            self.run_plugin_with_fallback('malfind', '恶意代码检测')

    def vol2_modules(self):
        if os.path.exists('output/output_vol2_modules.csv') and os.path.getsize('output/output_vol2_modules.csv') > 0:
            self.show_result('加载模块', 'output/output_vol2_modules.csv')
        else:   
            self.run_plugin_with_fallback('modules', '加载模块')

    def vol2_mutantscan(self):
        if os.path.exists('output/output_vol2_mutantscan.csv') and os.path.getsize('output/output_vol2_mutantscan.csv') > 0:
            self.show_result('互斥对象扫描', 'output/output_vol2_mutantscan.csv')
        else:   
            self.run_plugin_with_fallback('mutantscan', '互斥对象扫描')

    def vol2_privs(self):
        if os.path.exists('output/output_vol2_privs.csv') and os.path.getsize('output/output_vol2_privs.csv') > 0:
            self.show_result('进程权限', 'output/output_vol2_privs.csv')
        else:   
            self.run_plugin_with_fallback('privs', '进程权限')

    def vol2_psxview(self):
        if os.path.exists('output/output_vol2_psxview.csv') and os.path.getsize('output/output_vol2_psxview.csv') > 0:
            self.show_result('隐藏进程检测', 'output/output_vol2_psxview.csv')
        else:   
            self.run_plugin_with_fallback('psxview', '隐藏进程检测')

    def vol2_shimcache(self):
        if os.path.exists('output/output_vol2_shimcache.csv') and os.path.getsize('output/output_vol2_shimcache.csv') > 0:
            self.show_result('应用程序兼容性缓存', 'output/output_vol2_shimcache.csv')
        else:   
            self.run_plugin_with_fallback('shimcache', '应用程序兼容性缓存')

    def vol2_ssdt(self):
        if os.path.exists('output/output_vol2_ssdt.csv') and os.path.getsize('output/output_vol2_ssdt.csv') > 0:
            self.show_result('SSDT表', 'output/output_vol2_ssdt.csv')
        else:   
            self.run_plugin_with_fallback('ssdt', 'SSDT表')

    def vol2_timers(self):
        if os.path.exists('output/output_vol2_timers.csv') and os.path.getsize('output/output_vol2_timers.csv') > 0:
            self.show_result('内核定时器', 'output/output_vol2_timers.csv')
        else:   
            self.run_plugin_with_fallback('timers', '内核定时器')
    def vol2_symlinkscan(self):
        if os.path.exists('output/output_vol2_symlinkscan.csv') and os.path.getsize('output/output_vol2_symlinkscan.csv') > 0:
            self.show_result('符号链接扫描', 'output/output_vol2_symlinkscan.csv')
        else:   
            self.run_plugin_with_fallback('symlinkscan', '符号链接扫描')
    def vol2_unloadedmodules(self):
        if os.path.exists('output/output_vol2_unloadedmodules.csv') and os.path.getsize('output/output_vol2_unloadedmodules.csv') > 0:
            self.show_result('已卸载模块', 'output/output_vol2_unloadedmodules.csv')
        else:   
            self.run_plugin_with_fallback('unloadedmodules', '已卸载模块')

    def vol2_vadinfo(self):
        if os.path.exists('output/output_vol2_vadinfo.csv') and os.path.getsize('output/output_vol2_vadinfo.csv') > 0:
            self.show_result('VAD信息', 'output/output_vol2_vadinfo.csv')
        else:   
            self.run_plugin_with_fallback('vadinfo', 'VAD信息')
    def vol2_chromehistory(self):
        if os.path.exists('output/output_vol2_chromehistory.text') and os.path.getsize('output/output_vol2_chromehistory.text') > 0:
            self.show_text_result('Chrome历史', 'output/output_vol2_chromehistory.text')
        else:   
            self.run_plugin('chromehistory', 'Chrome历史', output_type='text')

    def vol2_firefoxhistory(self):
        if os.path.exists('output/output_vol2_firefoxhistory.text') and os.path.getsize('output/output_vol2_firefoxhistory.text') > 0:
            self.show_text_result('Firefox历史', 'output/output_vol2_firefoxhistory.text')
        else:   
            self.run_plugin('firefoxhistory', 'Firefox历史', output_type='text')
    def vol2_trustrecords(self):
        if os.path.exists('output/output_vol2_trustrecords.text') and os.path.getsize('output/output_vol2_trustrecords.text') > 0:
            self.show_text_result('信任记录', 'output/output_vol2_trustrecords.text')
        else:   
            self.run_plugin('trustrecords', '信任记录', output_type='text')
    def vol2_uninstallinfo(self):
        if os.path.exists('output/output_vol2_uninstallinfo.text') and os.path.getsize('output/output_vol2_uninstallinfo.text') > 0:
            self.show_text_result('卸载信息', 'output/output_vol2_uninstallinfo.text')
        else:   
            self.run_plugin('uninstallinfo', '卸载信息', output_type='text')
    def vol2_bitlocker(self):
        if os.path.exists('output/output_vol2_bitlocker.text') and os.path.getsize('output/output_vol2_bitlocker.text') > 0:
            self.show_text_result('BitLocker信息', 'output/output_vol2_bitlocker.text')
        else:   
            self.run_plugin('bitlocker', 'BitLocker信息', output_type='text')
    def vol2_shellbags(self):
        if os.path.exists('output/output_vol2_shellbags.csv') and os.path.getsize('output/output_vol2_shellbags.csv') > 0:
            self.show_result('ShellBags信息', 'output/output_vol2_shellbags.csv')
        else:   
            self.run_plugin_with_fallback('shellbags', 'ShellBags信息')
    # mftparser
    def vol2_mftparser(self):
        if os.path.exists('output/output_vol2_mftparser.csv') and os.path.getsize('output/output_vol2_mftparser.csv') > 0:
            self.show_result('MFT解析', 'output/output_vol2_mftparser.csv')
        else:   
            self.run_plugin_with_fallback('mftparser', 'MFT解析')
    def vol2_wintree(self):
        if os.path.exists('output/output_vol2_wintree.csv') and os.path.getsize('output/output_vol2_wintree.csv') > 0:
            self.show_result('窗口结构', 'output/output_vol2_wintree.csv')
        else:   
            self.run_plugin_with_fallback('wintree', '窗口结构')
    # 对于一些特殊的插件,可能需要单独处理
    # getprocbyaclin txt
    def vol2_getprocbyaclin(self):
        if os.path.exists('output/output_vol2_getprocbyaclin.txt') and os.path.getsize('output/output_vol2_getprocbyaclin.txt') > 0:
            #self.show_text_result('getprocbyaclin', 'output/output_vol2_getprocbyaclin.txt')
            pass
        else:   
            #self.run_plugin('getprocbyaclin', 'getprocbyaclin', output_type='text')
            print("请右键选择参数执行")
    def vol2_yarascan(self, rules_file):
        cmd = self.construct_command('yarascan')
        cmd.extend(['-y', rules_file])
        self.run_plugin_with_custom_command(cmd, 'Yara扫描')

    def vol2_volshell(self):
        from ui.volshell_window import VolshellWindow
        if not self.profile:
            profile, _ = self.get_profile()
            self.profile = profile
        
        volshell_window = VolshellWindow(self.mem_path, self.profile)
        volshell_window.show()
        self.open_windows.append(volshell_window)  # 保持窗口引用，防止被垃圾回收

    # 辅助方法
    def run_plugin_with_custom_command(self, cmd, display_name):
        worker = WorkerThread(cmd)
        # 修改输出文件名
        name = display_name.replace("自定义命令(", "").replace(")", "")
        worker.task_completed.connect(
            lambda success, message: self.on_task_completed(
                success, message, display_name, f'output/output_vol2_custom_{name}.txt', 'text', True
            )
        )
        worker.start()
        self.workers.append(worker)
        print(f"[*] 正在执行：{' '.join(cmd)}")

class GetProfileThread(QThread):
    profile_obtained = Signal(str, list)  # 修改信号以包含profilelist

    def __init__(self, vol2_plugin):
        super().__init__()
        self.vol2_plugin = vol2_plugin

    def run(self):
        profile, profilelist = self.vol2_plugin.get_profile(self.vol2_plugin.default_profile)
        self.profile_obtained.emit(profile, profilelist)
        # 发射任务完成信号
        if hasattr(self.vol2_plugin, 'task_completed_signal'):
            self.vol2_plugin.task_completed_signal.emit("Volatility 2 - 获取内存镜像Profile")

# 添加这行来保持向后兼容性
vol2Plugin = Vol2Plugin
