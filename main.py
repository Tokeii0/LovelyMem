import config
from Lovelymem_ui import Ui_MainWindow
from PySide6.QtWidgets import QMainWindow, QFileDialog, QMessageBox, QApplication, QWidget, QTableWidgetItem, QHeaderView, QMenu, QTableWidget
from PySide6.QtCore import Qt, QThread, Signal
import sys
import os
import subprocess
from colorama import Fore, Back, Style
import csv
import re
import shutil
from PySide6 import QtGui
import convert.netstat
import convert.loadcsv
import vol2find
import pandas as pd
from PySide6 import QtWidgets


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
        #icon 设置为'res\ico.jpg'
        self.setAcceptDrops(True)
        self.setWindowIcon(QtGui.QIcon('res/ico.jpg'))
        #长宽不允许修改
        self.setFixedSize(self.width(), self.height())
        self.actionOpenFile.triggered.connect(self.open_file)
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
        self.show()
#右键菜单------------------------------------------------------------------------------------------------------
    def contextMenuEvent(self, pos):
        context_menu = QtWidgets.QMenu(self)
        opendir = context_menu.addAction("打开文件所在目录")
        copy_str = context_menu.addAction("复制内容并发送至搜索框")
        action = context_menu.exec(self.mapToGlobal(pos))

        if action == opendir:
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
            if selectstr.split('\\')[1] == '0':
                print(Fore.YELLOW + '[*] 识别为ntfs目录' + selectstr + Style.RESET_ALL)
                ntfsroot = r'M:\forensic\ntfs'
                truepath = ntfsroot + selectstr.replace('\\', '/')
                # 转换为windows路径
                truepath = truepath.replace('/', '\\').split('\\')[:-1]
                truepath = '\\'.join(truepath)
                # 黄色高亮显示
                print(Fore.YELLOW + '[*] 正在打开目录：' + truepath + Style.RESET_ALL)
                os.system('explorer.exe ' + truepath + '\\')
            elif 'HarddiskVolume' in selectstr:
                print(Fore.YELLOW + '[*] 使用ntfs目录' + selectstr + Style.RESET_ALL)
                selectstr = '/'.join(selectstr.split('\\')[3:])
                ntfsroot = r'M:\forensic\ntfs'
                truepath = ntfsroot+'\\0\\' + selectstr.replace('\\', '/')
                # 转换为windows路径
                truepath = truepath.replace('/', '\\').split('\\')[:-1]
                truepath = '\\'.join(truepath)
                # 黄色高亮显示
                print(Fore.YELLOW + '[*] 正在打开目录：' + truepath + Style.RESET_ALL)
                os.system('explorer.exe ' + truepath + '\\')
            elif ':\\' in selectstr:
                print(Fore.YELLOW + '[*] 使用ntfs目录' + selectstr + Style.RESET_ALL)
                selectstr = '/'.join(selectstr.split('\\')[1:])
                ntfsroot = r'M:\forensic\ntfs'
                truepath = ntfsroot + '\\0\\' + selectstr.replace('\\', '/')
                # 转换为windows路径
                truepath = truepath.replace('/', '\\').split('\\')[:-1]
                truepath = '\\'.join(truepath)
                # 黄色高亮显示
                print(Fore.YELLOW + '[*] 正在打开目录：' + truepath + Style.RESET_ALL)
                os.system('explorer.exe ' + truepath + '\\')
            else:
                print(Fore.YELLOW + '[*] 使用正常目录' + selectstr + Style.RESET_ALL)
                memfilepath = r'M:/forensic/files/ROOT'
                truepath = memfilepath + selectstr.replace('\\', '/')
                # 转换为windows路径
                truepath = truepath.replace('/', '\\').split('\\')[:-1]
                truepath = '\\'.join(truepath)
                # 黄色高亮显示
                print(Fore.YELLOW + '[*] 正在打开目录：' + truepath + Style.RESET_ALL)
                os.system('explorer.exe ' + truepath + '\\')
        elif action == copy_str:
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

#功能区------------------------------------------------------------------------------------------------------
    def dragEnterEvent(self, event):
        if event.mimeData().hasUrls():
            event.accept()
        else:
            event.ignore()

    def dropEvent(self, event):
        if event.mimeData().hasUrls():
            file_path = event.mimeData().urls()[0].toLocalFile()
            self.open_file(file_path)

    def open_file(self, file_path):
        self.file_name = file_path
        self.mem_path = self.get_mem_path(self.file_name)
        # title + path
        self.setWindowTitle('LovelyMem v0.2 - ' + self.mem_path)
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
        cmd = config.MemProcFsDir + ' -device ' + path + ' -v -forensic 1'
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
            print(Fore.RED + '[Error] 请先加载内存镜像文件！并等待加载完毕' + Style.RESET_ALL)
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
                    self.tableWidget_find.setRowHeight(i, 50)  # Increase row height
                else:
                    pass
            self.tableWidget_find.horizontalHeader().setSectionResizeMode(len(columns) - 1, QHeaderView.Stretch)

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
    def loadntfs_timeline(self):
        ntfs_timelinepath = r'M:/forensic/csv/timeline_ntfs.csv'
        return self.loadcsv2table(ntfs_timelinepath)    
    def ntfsfind(self):
        if self.lineEdit_str.text() == '':
            print(Fore.RED + '[Error] 请输入要搜索的内容！' + Style.RESET_ALL)
            return
        str1 = self.lineEdit_str.text()
        files = r'M:\forensic\csv\timeline_ntfs.csv'
        result = []
        with open(files, 'r',encoding='UTF-8') as file:
            for line in file:
                if str1 in line:
                    result.append(line)
        #pandas读result
        df = pd.DataFrame(result)
        df = df.values.tolist()
        #每行分割
        for i in range(len(df)):
            df[i] = re.split(',', df[i][0])
            #去掉最后一列
            df[i].pop()
        # 加载至tableWidget_find,不知几列
        self.tableWidget_find.setRowCount(len(df))
        self.tableWidget_find.setColumnCount(len(df[0]))
        # Time	Type	Action	PID	Value32	Value64	Text	Pad
        self.tableWidget_find.setHorizontalHeaderLabels(['Time','Type','Action','PID','Value32','Value64','Text'])
        for i in range(len(df)):
            for j in range(len(df[0])):
                self.tableWidget_find.setItem(i, j, QTableWidgetItem(df[i][j]))
                #宽度自适应，根据内容调整列宽,最后一列填充空白部分
                self.tableWidget_find.horizontalHeader().setSectionResizeMode(QHeaderView.ResizeToContents)
                self.tableWidget_find.horizontalHeader().setSectionResizeMode(len(df[0])-1, QHeaderView.Stretch)
        print(Fore.GREEN + '[+] 搜索成功！' + Style.RESET_ALL)
    def volfindscan(self):
        if self.lineEdit_str.text() == '':
            print(Fore.RED + '[Error] 请输入要搜索的内容！' + Style.RESET_ALL)
            return
        str = self.lineEdit_str.text()
        regpath = r"M:\registry\HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\BuildLabEx.txt"
        data = open(regpath, 'r', encoding='utf-8').readlines()
        newdata = data[2].split('.')
        str1 = newdata[3].split('_')[0]
        str1 = str1.replace('w', 'W').replace('sp', 'SP').replace('xp', 'XP')
        if '64' in newdata[2]:
            str2 = 'x64'
        else:
            str2 = 'x86'
        profile = str1 + str2
        cmd = config.volatility2 + " -f " + self.mem_path + " --profile=" + profile + " filescan | findstr " + str
        self.command_runner = CommandRunner(cmd)
        self.command_runner.start()
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

    def findstr(self):
        if self.lineEdit_str.text() == '':
            print(Fore.RED + '[Error] 请输入要搜索的内容！' + Style.RESET_ALL)
            return
        memdisk = r'M:/'
        files = open(memdisk + 'forensic/files/files.txt', 'r', encoding='utf-8').readlines()
        str = self.lineEdit_str.text()
        newline = []
        for line in files:
            if re.search(str, line, re.I):
                line = line.split(' ')
                while '' in line:
                    line.remove('')
                line = [x.replace('\n', '') for x in line]
                newline.append(line[3:6])
        # newline 加载至tableWidget_find，表头为大小,文件名，路径
        self.tableWidget_find.setRowCount(len(newline))
        self.tableWidget_find.setColumnCount(3)
        self.tableWidget_find.setHorizontalHeaderLabels(['大小', '文件名', '路径'])
        for i in range(len(newline)):
            for j in range(3):
                self.tableWidget_find.setItem(i, j, QTableWidgetItem(newline[i][j]))
                #宽度自适应，根据内容调整列宽,最后一列填充空白部分
                self.tableWidget_find.horizontalHeader().setSectionResizeMode(QHeaderView.ResizeToContents)
                self.tableWidget_find.horizontalHeader().setSectionResizeMode(2, QHeaderView.Stretch)
        print(Fore.GREEN + '[+] 搜索成功！' + Style.RESET_ALL)
        
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
        # 转换为列表
        columns, data = convert.netstat.main()
        # 加载至tableWidget_netstat
        self.tableWidget_find.setRowCount(len(data))
        self.tableWidget_find.setColumnCount(len(columns))
        self.tableWidget_find.setHorizontalHeaderLabels(columns)
        for i in data:
            for j in columns:
                self.tableWidget_find.setItem(data.index(i), columns.index(j), QTableWidgetItem(i[columns.index(j)]))
                #宽度自适应，根据内容调整列宽,最后一列填充空白部分
                self.tableWidget_find.horizontalHeader().setSectionResizeMode(QHeaderView.ResizeToContents)
                self.tableWidget_find.horizontalHeader().setSectionResizeMode(len(columns)-1, QHeaderView.Stretch)
                
        print(Fore.GREEN + '[+] 加载成功！' + Style.RESET_ALL)
        
    def closeEvent(self, event):
        reply = QMessageBox.question(self, '退出', '确认退出吗？退出会结束MemProcFS进程', QMessageBox.Yes | QMessageBox.No, QMessageBox.No)
        if reply == QMessageBox.Yes:
            event.accept()
            # 结束MemProcFS进程，模拟ctrl+c结束MemProcFS.exe
            os.system('taskkill /F /IM MemProcFS.exe')

        else:
            event.ignore()
#----------------------------------------------------------------------------------------------------------

if __name__ == '__main__':
    app = QApplication(sys.argv)
    lovelymem = Lovelymem()
    sys.exit(app.exec())
