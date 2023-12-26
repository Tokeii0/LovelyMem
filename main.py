import config
from Lovelymem_ui import Ui_MainWindow
from PySide6.QtWidgets import QMainWindow, QFileDialog, QMessageBox, QApplication, QWidget, QTableWidgetItem, QHeaderView, QMenu,QTableWidget
from PySide6.QtCore import Qt
import sys,os,subprocess,re
from colorama import Fore, Back, Style
import os,csv
import re
from PySide6 import QtGui
import convert.netstat,convert.loadcsv

class Lovelymem(QMainWindow, Ui_MainWindow):
    def __init__(self):
        super().__init__()
        self.setupUi(self)
        #icon 设置为'res\ico.jpg'
        self.setWindowIcon(QtGui.QIcon('res/ico.jpg'))
        #长宽不允许修改
        self.setFixedSize(self.width(), self.height())

                
        self.actionOpenFile.triggered.connect(self.open_file)
        self.actionOpenFile.setShortcut('Ctrl+O')
        self.actionOpenFile.setStatusTip('打开文件')

        self.pushButton_loadMem.clicked.connect(self.use_memprocfs)
        self.tableWidget_find.setContextMenuPolicy(Qt.CustomContextMenu)
        self.tableWidget_find.customContextMenuRequested.connect(self.open_dir)

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
        self.show()


#功能区------------------------------------------------------------------------------------------------------
    def open_file(self):
        self.file_name, _ = QFileDialog.getOpenFileName(self, '打开文件', './', '内存镜像文件(*.*)')
        if self.file_name:
            self.mem_path = self.get_mem_path(self.file_name)
            #title + path
            self.setWindowTitle('LovelyMem v0.1 - ' + self.mem_path)
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
        # 转换为列表
        #清除表格,以及所有高亮内容，隐藏内容
        self.tableWidget_find.clearSelection()
        self.tableWidget_find.clearContents()
        self.tableWidget_find.clear()
        columns, data = convert.loadcsv.load_csvfile(path)
        # 加载至tableWidget_find
        self.tableWidget_find.setRowCount(len(data))
        self.tableWidget_find.setColumnCount(len(columns))
        self.tableWidget_find.setHorizontalHeaderLabels(columns)
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
                    item.setTextAlignment(Qt.AlignCenter)
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
    
    
    def findstr(self):
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
        originpath = self.tableWidget_find.item(row, 2).text()
        truepath = memfilepath + originpath.replace('\\', '/')
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