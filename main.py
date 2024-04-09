import config
from Lovelymem_ui import Ui_MainWindow
from PySide6.QtWidgets import QMainWindow, QFileDialog, QMessageBox, QApplication, QWidget, QTableWidgetItem, QHeaderView, QMenu, QTableWidget
from PySide6.QtCore import Qt, QThread, Signal,QRect
import sys
import os
import subprocess
from colorama import Fore, Back, Style
import csv
import shutil
from PySide6 import QtGui
import convert.netstat
import convert.loadcsv
import pandas as pd
from PySide6 import QtWidgets
import re,hexdump
import binascii
from PIL import Image


class CommandRunner(QThread):
    output_signal = Signal(str)
    error_signal = Signal(str)
    def __init__(self, cmd):
        super().__init__()
        self.cmd = cmd
    def run(self):
        try:
            output = subprocess.run(self.cmd, shell=True, capture_output=True, text=True, check=True).stdout
            self.output_signal.emit(Fore.GREEN + output + Style.RESET_ALL)
            print(Fore.GREEN + output + Style.RESET_ALL)

        except subprocess.CalledProcessError as e:
            self.error_signal.emit("Error: " + str(e))

class Lovelymem(QMainWindow, Ui_MainWindow):
    def __init__(self):
        super().__init__()
        self.setupUi(self)
        self.setAcceptDrops(True)
        self.setWindowIcon(QtGui.QIcon('res/logo.ico')) 
        self.actionOpenFile.triggered.connect(self.open_file_select)
        self.actionOpenFile.setShortcut('Ctrl+O')
        self.actionOpenFile.setStatusTip('打开文件')
        self.setContextMenuPolicy(Qt.CustomContextMenu)
        self.customContextMenuRequested.connect(self.contextMenuEvent)
        self.pushButton_loadMem.clicked.connect(self.use_memprocfs)
        self.pushButton_flush.clicked.connect(self.flush)
        self.pushButton_findstr.clicked.connect(self.findstr)
        self.pushButton_load_netstat.clicked.connect(self.load_netstat)
        self.pushButton_load_proc.clicked.connect(self.loadproc)
        self.pushButton_load_tasks.clicked.connect(self.loadtasks)
        self.pushButton_load_findevil.clicked.connect(self.loadfindevil)
        self.pushButton_load_netstat_timeline.clicked.connect(self.loadnetstat_timeline)
        self.pushButton_load_proc_timeline.clicked.connect(self.loadproc_timeline)
        self.pushButton_load_web_timeline.clicked.connect(self.loadweb_timeline)
        self.pushButton_findrow.clicked.connect(self.findrow)
        self.pushButton_unloadmem.clicked.connect(self.unloadmem)
        self.pushButton_withvol2find.clicked.connect(self.volfindscan)
        self.pushButton_ntfsfind.clicked.connect(self.ntfsfind)
        self.pushButton_procdump2gimp.clicked.connect(self.procdump2gimp)
        self.pushButton_withvol2dump.clicked.connect(self.withvol2dump)
        self.pushButton_vol2editbox.clicked.connect(self.withvol2editbox)
        self.pushButton_vol2clipboard.clicked.connect(self.withvol2clipboard)
        self.pushButton_services.clicked.connect(self.loadservices)
        self.pushButton_load_timeline_registry.clicked.connect(self.loadtimeline_registry)
        self.pushButton_loadallfile.clicked.connect(self.loadallfiles)
        # checkBox_cusHW 
        self.checkBox_cusHW.stateChanged.connect(self.cusHW)
        self.show()
    #动态调整tableWidget_find大小
    def resizeEvent(self, event):
        width = self.width() - 20
        self.tableWidget_find.setFixedWidth(width)
        super().resizeEvent(event)
#右键菜单------------------------------------------------------------------------------------------------------
    def contextMenuEvent(self, pos):
        context_menu = QtWidgets.QMenu(self)
        opendir = context_menu.addAction("打开文件所在目录")
        copy_str = context_menu.addAction("复制内容并发送至搜索框")
        quickly_view = context_menu.addAction("快速查看文本")
        quickly_view_img = context_menu.addAction("快速查看图片")
        delete_col = context_menu.addAction("删除所选列")
        delete_row = context_menu.addAction("删除所选行")
        action = context_menu.exec(self.mapToGlobal(pos))
        def get_truepath(selectstr):
            if selectstr.split('\\')[1] == '0' or selectstr.split('\\')[1] == '1' or selectstr.split('\\')[1] == '2':
                print(Fore.YELLOW + '[*] 识别为ntfs目录' + selectstr + Style.RESET_ALL)
                ntfsroot = r'M:\forensic\ntfs'
                truepath = ntfsroot + selectstr.replace('\\', '/')
                
            elif 'HarddiskVolume' in selectstr:
                print(Fore.YELLOW + '[*] 使用ntfs目录' + selectstr + Style.RESET_ALL)
                selectstr = '/'.join(selectstr.split('\\')[3:])
                ntfsroot = r'M:\forensic\ntfs'
                try:
                    truepath = ntfsroot+'\\0\\' + selectstr.replace('\\', '/')
                except:
                    truepath = ntfsroot+'\\1\\' + selectstr.replace('\\', '/')
                
            elif ':\\' in selectstr:
                print(Fore.YELLOW + '[*] 使用ntfs目录' + selectstr + Style.RESET_ALL)
                selectstr = '/'.join(selectstr.split('\\')[1:])
                ntfsroot = r'M:\forensic\ntfs'
                try:
                    truepath = ntfsroot+'\\0\\' + selectstr.replace('\\', '/')
                except:
                    truepath = ntfsroot+'\\1\\' + selectstr.replace('\\', '/')
                
            else:
                print(Fore.YELLOW + '[*] 使用正常目录' + selectstr + Style.RESET_ALL)
                memfilepath = r'M:/forensic/files/ROOT'
                truepath = memfilepath + selectstr.replace('\\', '/')
            #转换为windows路径
            truepath = truepath.replace('/', '\\')
            return truepath
        if action == opendir: #打开文件所在目录
            # Get the content of the selected cell
            local_pos = self.tableWidget_find.mapFromGlobal(self.mapToGlobal(pos))
            header_height = self.tableWidget_find.horizontalHeader().height()
            local_pos.setY(local_pos.y() - header_height)
            selected_item = self.tableWidget_find.itemAt(local_pos)
            if selected_item is not None:
                selectstr = selected_item.text().strip('"')
                #打印光标所在行数据
                print("所选单元格内容：", selectstr)
                
            # 判断 M:/forensic/files/ROOT/+selectstr是否存在，若存在就打开文件目录
            truepath = get_truepath(selectstr)
            #判断一下是不是文件夹,若是文件夹就打开文件夹,若是文件就打开文件所在目录
            if os.path.isdir(truepath):
                print(Fore.YELLOW + '[*] 正在打开目录：' + truepath + Style.RESET_ALL)
                os.system('explorer.exe ' + truepath)
            else:
                print(Fore.YELLOW + '[*] 正在打开目录：' + os.path.dirname(truepath) + Style.RESET_ALL)
                os.system('explorer.exe ' + os.path.dirname(truepath))                
        elif action == copy_str: #复制内容并发送至搜索框
            # Get the content of the selected cell
            local_pos = self.tableWidget_find.mapFromGlobal(self.mapToGlobal(pos))
            header_height = self.tableWidget_find.horizontalHeader().height()
            local_pos.setY(local_pos.y() - header_height)
            selected_item = self.tableWidget_find.itemAt(local_pos)
            if selected_item is not None:
                selectstr = selected_item.text()
                self.lineEdit_str.setText(selectstr)
                clipboard = QApplication.clipboard()
                clipboard.setText(selectstr)
                print(Fore.GREEN + f'[+] 发送成功！内容为：{selectstr}' + Style.RESET_ALL)
        elif action == quickly_view: #快速查看文本
            # Get the content of the selected cell
            local_pos = self.tableWidget_find.mapFromGlobal(self.mapToGlobal(pos))
            header_height = self.tableWidget_find.horizontalHeader().height()
            local_pos.setY(local_pos.y() - header_height)
            selected_item = self.tableWidget_find.itemAt(local_pos)
            if selected_item is not None:
                selectstr = selected_item.text().strip('"')
                #打印光标所在行数据
                print("所选单元格内容：", selectstr)
            truepath = get_truepath(selectstr)
            #先判断是不是文件夹
            if os.path.isdir(truepath):
                print(Fore.RED + '[Error] 该路径为文件夹！' + Style.RESET_ALL)
                return
            #用于显示文件内容,编码使用utf-8,仅读取前200字节
            try:
                self.quicklyview(truepath)
                self.textEdit.setText(open(truepath, 'r', encoding='utf-8').read(500))
                self.quicklyviewwindow.show()
            except:
                print(Fore.RED + '[Error] 该文件无法快速读取,即将使用hexdump打印至控制台' + Style.RESET_ALL)
                print(Fore.GREEN + '[*] 正在使用hexdump打印文件内容：' + truepath + Style.RESET_ALL)
                hexdump.hexdump(open(truepath, 'rb').read(500))
        elif action == quickly_view_img:
            #调用PIL库打开图片，如果不是图片就调用quickly_view
            # Get the content of the selected cell
            local_pos = self.tableWidget_find.mapFromGlobal(self.mapToGlobal(pos))
            header_height = self.tableWidget_find.horizontalHeader().height()
            local_pos.setY(local_pos.y() - header_height)
            selected_item = self.tableWidget_find.itemAt(local_pos)
            if selected_item is not None:
                selectstr = selected_item.text().strip('"')
                #打印光标所在行数据
                print("所选单元格内容：", selectstr)
            truepath = get_truepath(selectstr)
            try:
                Image.open(truepath).show()
            except:
                print(Fore.RED + '[Error] 该文件不是图片！' + Style.RESET_ALL)
                return
        elif action == delete_col:
            #删除当前列
            self.tableWidget_find.removeColumn(self.tableWidget_find.currentColumn())
            print(Fore.GREEN + '[+] 删除成功！' + Style.RESET_ALL)
        elif action == delete_row:
            #删除当前行
            self.tableWidget_find.removeRow(self.tableWidget_find.currentRow())
            print(Fore.GREEN + '[+] 删除成功！' + Style.RESET_ALL)

#功能区------------------------------------------------------------------------------------------------------
    def cusHW(self):
        #自定义列宽，若checkBox_cusHW勾选，则自定义列宽，否则就自适应
        if self.checkBox_cusHW.isChecked():
            self.tableWidget_find.horizontalHeader().setSectionResizeMode(QHeaderView.Interactive)
        else:
            self.tableWidget_find.horizontalHeader().setSectionResizeMode(QHeaderView.ResizeToContents)
    def dragEnterEvent(self, event):
        if event.mimeData().hasUrls():
            event.accept()
        else:
            event.ignore()

    def dropEvent(self, event):
        if event.mimeData().hasUrls():
            file_path = event.mimeData().urls()[0].toLocalFile()
            self.open_file(file_path)

    #打开文件
    def open_file_select(self):
        file_path, _ = QFileDialog.getOpenFileName(self, '打开文件', '', '所有文件 (*.*)')
        if file_path:
            self.open_file(file_path)       

    def open_file(self, file_path):
        self.file_name = file_path
        self.mem_path = self.get_mem_path(self.file_name)
        # title + path
        self.setWindowTitle('LovelyMem v0.3 - ' + self.mem_path)
        return self.mem_path
    #获取镜像完整路径
    def get_mem_path(self, file_name):
        return os.path.abspath(file_name)
    def use_memprocfs(self,path):
        try:
            path = self.mem_path
        except:
            print(Fore.RED + '[Error] 请先加载内存镜像文件！' + Style.RESET_ALL)
        # memprocfs.exe -device mempath -v -forensic 1
        cmd = f'{config.MemProcFsDir} -device "{path}" -v -forensic 1'
        try:
            subprocess.Popen(cmd, shell=True)
        except:
            print(Fore.RED + '[Error] MemProcFS路径错误！' + Style.RESET_ALL)
    def unloadmem(self):
        try:
            #卸载镜像 ，taskkill /F /IM MemProcFS.exe
            cmd = 'taskkill /F /IM MemProcFS.exe'
            subprocess.Popen(cmd, shell=True)
            print(Fore.GREEN + '[+] 卸载成功！' + Style.RESET_ALL)
        except:
            print(Fore.RED + '[Error] 卸载失败！' + Style.RESET_ALL)
    def flush(self):
        try:
            #M:\sys下
            memdisk = r'M:/'
            self.computername = open(memdisk + 'sys/computername.txt', 'r').read()
            self.architecture = open(memdisk + 'sys/architecture.txt', 'r').read()
            self.time_boot = open(memdisk + 'sys/time-boot.txt', 'r').read()
            self.time_current = open(memdisk + 'sys/time-current.txt', 'r').read()
            self.timezone = open(memdisk + 'sys/timezone.txt', 'r').read()
            self.unique_tag = open(memdisk + 'sys/unique-tag.txt', 'r').read()
            self.version = open(memdisk + 'sys/version.txt', 'r').read()
            self.version_build = open(memdisk + 'sys/version-build.txt', 'r').read()
            self.users = open(memdisk + 'sys/users/users.txt', 'r').read()
            print(Fore.GREEN + '[+] 读取成功！' + Style.RESET_ALL)
            #显示
            print('[*] 计算机名: ' + self.computername + '\n' 
                               + '[*] 架构: ' + self.architecture + '\n' 
                               + '[*] 最后一次开机时间: ' + self.time_boot 
                               + '[*] 镜像获取时间: ' + self.time_current 
                               + '[*] 时区: ' + self.timezone 
                               + '[*] 元标签: ' + self.unique_tag + '\n' 
                               + '[*] 版本号: ' + self.version + '\n' 
                               + '[*] 构建版本号: ' + self.version_build+'\n'
                               + '[*] 用户: ' + self.users)

        except Exception as e:
            print(Fore.RED + '[Error] ' + str(e) + Style.RESET_ALL)
    def loadcsv2table(self, path):
        self.tableWidget_find.clearSelection()
        self.tableWidget_find.clearContents()
        self.tableWidget_find.clear()
        try:
            columns, data = convert.loadcsv.load_csvfile(path)
            # 加载至tableWidget_find
            self.tableWidget_find.setRowCount(len(data))
            self.tableWidget_find.setColumnCount(len(columns))
            self.tableWidget_find.setHorizontalHeaderLabels(columns)
        except:
            #如果 process.csv存在
            if os.path.exists(path):
                print(Fore.RED + '[Error] 请先加载内存镜像文件！' + Style.RESET_ALL)
            else:
                print(Fore.RED + '[Error] 未找到文件！' + Style.RESET_ALL)
            return
        for i, row in enumerate(data):
            for j, value in enumerate(row):
                item = QTableWidgetItem(str(value))
                self.tableWidget_find.setItem(i, j, item)
            # 设置列宽根据字符串长度自适应
            self.tableWidget_find.horizontalHeader().setSectionResizeMode(QHeaderView.ResizeToContents)
            self.tableWidget_find.horizontalHeader().setStretchLastSection(True)
            # 设置最后一列填充空白部分
            if j == len(columns) - 1:
                item.setTextAlignment(Qt.AlignTop | Qt.AlignLeft)
                item.setFlags(item.flags() | Qt.ItemIsSelectable | Qt.ItemIsEditable)
                self.tableWidget_find.setRowHeight(i, 20)  # Decrease row height
            else:
                pass
            self.tableWidget_find.horizontalHeader().setSectionResizeMode(len(columns) - 1, QHeaderView.Stretch)
            
        
        # Enable column dragging
        self.tableWidget_find.horizontalHeader().setSectionsMovable(True)
        


        print(Fore.GREEN + '[+] 加载成功！' + Style.RESET_ALL)
    def findrow(self):
        str_to_find = self.lineEdit_str.text()
        found_rows = []
        for row in range(self.tableWidget_find.rowCount()):
            for column in range(self.tableWidget_find.columnCount()):
                item = self.tableWidget_find.item(row, column)
                if item and str_to_find.lower() in item.text().lower():
                    found_rows.append(row)
                    break

        if found_rows:
            self.tableWidget_find.clearSelection()
            for row in found_rows:
                for column in range(self.tableWidget_find.columnCount()):
                    item = self.tableWidget_find.item(row, column)
                    if item:
                        item.setSelected(True)
                        item.setBackground(Qt.red)  # Set the background color to red for cells containing the keyword
            self.tableWidget_find.setFocus()
            self.tableWidget_find.scrollToItem(self.tableWidget_find.item(found_rows[0], 0))  # Scroll to the first found item
            print(Fore.GREEN + '[+] 搜索成功！' + Style.RESET_ALL)
        else:
            print(Fore.YELLOW + '[-] 未找到匹配项！' + Style.RESET_ALL)       
    def loadproc(self):
        procpath = r'M:/forensic/csv/process.csv'
        return self.loadcsv2table(procpath)
    def loadtasks(self):
        taskspath = r'M:/forensic/csv/tasks.csv'
        return self.loadcsv2table(taskspath)
    def loadfindevil(self):
        findevilpath = r'M:/forensic/csv/findevil.csv'
        return self.loadcsv2table(findevilpath)
    def loadnetstat_timeline(self):
        netstat_timelinepath = r'M:/forensic/csv/timeline_net.csv'
        return self.loadcsv2table(netstat_timelinepath)
    def loadproc_timeline(self):
        proc_timelinepath = r'M:/forensic/csv/timeline_process.csv'
        return self.loadcsv2table(proc_timelinepath)
    def loadweb_timeline(self):
        web_timelinepath = r'M:/forensic/csv/timeline_web.csv'
        return self.loadcsv2table(web_timelinepath)
    def loadallfiles(self):
        allfilespath = r'M:/forensic/csv/files.csv'
        return self.loadcsv2table(allfilespath)
    def loadntfs_timeline(self):
        ntfs_timelinepath = r'M:/forensic/csv/timeline_ntfs.csv'
        return self.loadcsv2table(ntfs_timelinepath)    
    def ntfsfind(self):
        if self.lineEdit_str.text() == '':
            print(Fore.RED + '[Error] 请输入要搜索的内容！' + Style.RESET_ALL)
            return
        pattern = self.lineEdit_str.text()
        files = r'M:\forensic\csv\timeline_ntfs.csv'
        result = []
        with open(files, 'r', encoding='UTF-8') as file:
            for line in file:
                if re.search(pattern, line, re.IGNORECASE):
                    result.append(line)
        # pandas读result
        df = pd.DataFrame(result)
        df = df.values.tolist()
        # 每行分割
        for i in range(len(df)):
            df[i] = re.split(',', df[i][0])
            # 去掉最后一列
            df[i].pop()
        # 加载至tableWidget_find,不知几列
        self.tableWidget_find.setRowCount(len(df))
        self.tableWidget_find.setColumnCount(len(df[0]))
        # Time	Type	Action	PID	Value32	Value64	Text	Pad
        self.tableWidget_find.setHorizontalHeaderLabels(['Time', 'Type', 'Action', 'PID', 'Value32', 'Value64', 'Text'])
        for i in range(len(df)):
            for j in range(len(df[0])):
                self.tableWidget_find.setItem(i, j, QTableWidgetItem(df[i][j]))
                # 宽度自适应，根据内容调整列宽,最后一列填充空白部分
                self.tableWidget_find.horizontalHeader().setSectionResizeMode(QHeaderView.ResizeToContents)
                self.tableWidget_find.horizontalHeader().setSectionResizeMode(len(df[0]) - 1, QHeaderView.Stretch)
        print(Fore.GREEN + '[+] 搜索成功！' + Style.RESET_ALL)
    def volfindscan(self):
        if self.lineEdit_str.text() == '':
            print(Fore.RED + '[Error] 请输入要搜索的内容！' + Style.RESET_ALL)
            return
        str = self.lineEdit_str.text()
        profile = self.getprofile()
        #cmd = config.volatility2 + " -f " + self.mem_path + " --profile=" + profile + " filescan | findstr " + str
        cmd = f'{config.volatility2} -f "{self.mem_path}" --profile={profile} filescan | findstr {str}'
        #运行时 按钮变为不可用
        self.pushButton_withvol2find.setEnabled(False)
        #按钮名字改为搜索中...
        self.pushButton_withvol2find.setText('搜索中...')
        print(Fore.YELLOW + '[*] 正在调用vol2进行文件搜索：' + cmd + Style.RESET_ALL)
        self.command_runner = CommandRunner(cmd)
        self.command_runner.start()
        #线程结束后 按钮变为可用
        self.command_runner.finished.connect(lambda: self.pushButton_withvol2find.setEnabled(True))
        self.command_runner.finished.connect(lambda: self.pushButton_withvol2find.setText('vol2联合搜索'))
    def withvol2dump(self):
        if self.lineEdit_str.text() == '':
            print(Fore.RED + '[Error] 请输入要需要dumpfile的地址！' + Style.RESET_ALL)
            return
        str = self.lineEdit_str.text()
        #判断output文件夹是否存在，不存在就创建
        if not os.path.exists('output'):
            os.makedirs('output')

        cmd = f'{config.volatility2} -f "{self.mem_path}" --profile={self.profile} dumpfiles -Q {str} --dump-dir=output'
        #运行时 按钮变为不可用
        self.pushButton_withvol2dump.setEnabled(False)
        #按钮名字改为搜索中...
        self.pushButton_withvol2dump.setText('导出中...')
        print(Fore.YELLOW + '[*] 正在调用vol2进行文件导出，导出后文件位于/output文件夹下：' + cmd + Style.RESET_ALL)
        self.command_runner = CommandRunner(cmd)
        self.command_runner.start()
        #线程结束后 按钮变为可用
        self.command_runner.finished.connect(lambda: self.pushButton_withvol2dump.setEnabled(True))
        self.command_runner.finished.connect(lambda: self.pushButton_withvol2dump.setText('vol2导出文件'))
    def quicklyview(self,path):
        #创建一个新的窗口，里面有一个textEdit，用于显示文件内容,编码使用utf-8,仅读取前200字节
        self.quicklyviewwindow = QWidget()
        self.quicklyviewwindow.resize(800, 600)
        self.quicklyviewwindow.setWindowTitle(f'文件内容-路径:{path}')
        self.quicklyviewwindow.setWindowIcon(QtGui.QIcon('res/logo.ico'))
        self.textEdit = QtWidgets.QTextEdit(self.quicklyviewwindow)
        self.textEdit.setGeometry(QRect(0, 0, 800, 600))
        self.textEdit.setObjectName("textEdit")
        self.textEdit.setReadOnly(True)
        self.textEdit.setAcceptDrops(False)
    def procdump2gimp(self):
        str = self.lineEdit_str.text()
        #判断是否为数字
        if str.isdigit() == False:
            print(Fore.RED + '[Error] 请输入程序对应的pid！' + Style.RESET_ALL)
            return
        procmemfile = rf'M:/pid/{str}/minidump/minidump.dmp'
        #创建tmp文件夹
        if not os.path.exists('tmp'):
            os.makedirs('tmp')
        newpath = r'tmp/minidump.data'
        if os.path.exists(newpath):
            os.remove(newpath)
        shutil.copy(procmemfile, newpath)

        cmd2 = rf'"{config.gimp}" tmp/minidump.data'
        #正在执行命令
        print(Fore.YELLOW + '[*] 正在调用gimp执行命令：' + cmd2 + Style.RESET_ALL)
        subprocess.Popen(cmd2, shell=True)
        print(Fore.GREEN + '[+] 执行成功！' + Style.RESET_ALL)
    def withvol2editbox(self):
        profile = self.getprofile()
        cmd = f'{config.volatility2} -f "{self.mem_path}" --profile={profile} editbox'
        self.pushButton_vol2editbox.setEnabled(False)
        #按钮名字改为搜索中...
        self.pushButton_vol2editbox.setText('搜索中...')
        self.command_runner = CommandRunner(cmd)
        print(Fore.YELLOW + '[*] 正在调用vol2进行editbox：' + cmd + Style.RESET_ALL)
        self.command_runner.start()
        #线程结束后 按钮变为可用
        self.command_runner.finished.connect(lambda: self.pushButton_vol2editbox.setEnabled(True))
        self.command_runner.finished.connect(lambda: self.pushButton_vol2editbox.setText('vol2editbox'))
    def withvol2clipboard(self):
        profile = self.getprofile()
        cmd = f'{config.volatility2} -f "{self.mem_path}" --profile={profile} clipboard'
        self.pushButton_vol2clipboard.setEnabled(False)
        #按钮名字改为搜索中...
        self.pushButton_vol2clipboard.setText('搜索中...')
        self.command_runner = CommandRunner(cmd)
        print(Fore.YELLOW + '[*] 正在调用vol2进行clipboard：' + cmd + Style.RESET_ALL)
        self.command_runner.start()
        #线程结束后 按钮变为可用
        self.command_runner.finished.connect(lambda: self.pushButton_vol2clipboard.setEnabled(True))
        self.command_runner.finished.connect(lambda: self.pushButton_vol2clipboard.setText('vol2clipboard'))
    def getprofile(self):
        regpath = r"M:\registry\HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\BuildLabEx.txt"
        data = open(regpath, 'r', encoding='utf-8').readlines()
        newdata = data[2].split('.')
        str1 = newdata[3].split('_')[0]
        str1 = str1.replace('w', 'W').replace('sp', 'SP').replace('xp', 'XP')
        if '10' not in str1 and 'SP' not in str1:
            str1 = str1 + 'SP1'
        if '64' in newdata[2]:
            str2 = 'x64'
        else:
            str2 = 'x86'
        self.profile = str1 + str2
        
        print(Fore.GREEN + '[+] 获取profile成功！' + Style.RESET_ALL)
        return self.profile
    def findstr(self):
        if self.lineEdit_str.text() == '':
            print(Fore.RED + '[Error] 请输入要搜索的内容！' + Style.RESET_ALL)
            return
        str1 = self.lineEdit_str.text()
        file_path = r"M:\forensic\csv\files.csv"
        df = pd.read_csv(file_path)
        def correct_path(row):
            path_parts = row['Path'].rsplit('\\', 1)
            new_path = path_parts[0] + '\\' + row['Object'][2:] + '-' + row['File'] if len(path_parts) > 1 else row['Path']
            return new_path
        try:
            matching_rows = df[df['File'].str.contains(str1, case=False, na=False)].copy()
            matching_rows['Path'] = matching_rows.apply(correct_path, axis=1)
            matching_rows = matching_rows.astype(str)
            newline = matching_rows.values.tolist()

            # Ensure the number of columns matches the number of elements in newline
            num_columns = 5
            self.tableWidget_find.setRowCount(len(newline))
            self.tableWidget_find.setColumnCount(num_columns)
            self.tableWidget_find.setHorizontalHeaderLabels(['地址','类型','大小', '文件名', '实际路径'])
            for i in range(len(newline)):
                for j in range(num_columns):
                    self.tableWidget_find.setItem(i, j, QTableWidgetItem(newline[i][j]))
            self.tableWidget_find.horizontalHeader().setSectionResizeMode(QHeaderView.ResizeToContents)

            print(Fore.GREEN + '[+] 搜索成功！' + Style.RESET_ALL)
        except Exception as e:
            print(Fore.RED + '[Error] 搜索失败，未找到内容 ' + str(e) + Style.RESET_ALL)
    def loadservices(self):
        servicespath = r'M:/forensic/csv/services.csv'
        return self.loadcsv2table(servicespath)
    def loadtimeline_registry(self):
        registrypath = r'M:/forensic/csv/timeline_registry.csv'
        return self.loadcsv2table(registrypath)
        
    #右键tableWidget_find中的文件，选择打开文件所在目录
    def open_dir(self):
        memfilepath = r'M:/forensic/files/ROOT'
        row = self.tableWidget_find.currentRow()
        selectstr = self.tableWidget_find.item(row, 2).text()
        truepath = memfilepath + selectstr.replace('\\', '/')
        #转换为windows路径
        truepath = truepath.replace('/', '\\').split('\\')[:-1]
        truepath = '\\'.join(truepath)
        #黄色高亮显示
        print(Fore.YELLOW + '[*] 正在打开目录：' + truepath + Style.RESET_ALL)
        os.system('explorer.exe ' + truepath+'\\')    
    # 加载netstat-v.txt *转换文件在convert/netstat.py中*
    def load_netstat(self):
        netstatpath = r'M:/forensic/csv/net.csv'
        return self.loadcsv2table(netstatpath)
        
    def closeEvent(self, event):
        reply = QMessageBox.question(self, '退出', '确认退出吗？退出会结束MemProcFS进程', QMessageBox.Yes | QMessageBox.No, QMessageBox.No)
        if reply == QMessageBox.Yes:
            event.accept()
            # 结束MemProcFS进程，结束MemProcFS.exe
            #os.system('taskkill /F /IM MemProcFS.exe')

        else:
            event.ignore()
#----------------------------------------------------------------------------------------------------------

if __name__ == '__main__':
    app = QApplication(sys.argv)
    lovelymem = Lovelymem()
    sys.exit(app.exec())