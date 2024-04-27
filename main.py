import config
from Lovelymem_ui import Ui_MainWindow
from PySide6.QtWidgets import QMainWindow, QFileDialog, QMessageBox, QApplication, QWidget, QTableWidgetItem, QHeaderView
from PySide6.QtCore import Qt, QThread, Signal,QRect
import sys
import os
import subprocess
from colorama import Fore, Back, Style
import shutil
from PySide6 import QtGui 
import convert.netstat
import convert.loadcsv
import pandas as pd
from PySide6 import QtWidgets
import re,hexdump
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
# 一个通用的class 用于创建一个新的窗口，里面有一个textEdit，用于显示文件内容,编码使用utf-8
class QuicklyView(QWidget):
    def __init__(self, title, size=(800, 600)):
        super().__init__()
        self.resize(*size)
        self.setWindowTitle(title)
        self.setWindowIcon(QtGui.QIcon('res/logo.ico')) 
        self.textEdit = QtWidgets.QTextEdit(self)
        self.textEdit.setGeometry(QRect(0, 30, 800, 570))
        self.textEdit.setObjectName("textEdit")
        self.textEdit.setReadOnly(True)
        self.textEdit.setTextInteractionFlags(Qt.TextSelectableByMouse)
        
        self.lineEdit = QtWidgets.QLineEdit(self)
        self.lineEdit.setGeometry(QRect(0, 0, 700, 30))
        self.lineEdit.setObjectName("lineEdit")
        
        self.pushButton = QtWidgets.QPushButton(self)
        self.pushButton.setGeometry(QRect(700, 0, 100, 30))
        self.pushButton.setObjectName("pushButton")
        self.pushButton.setText('搜索')
        self.pushButton.clicked.connect(self.findstr)
        
    def resizeEvent(self, event):
        width = self.width() 
        self.textEdit.setFixedWidth(width)
        height = self.height() - 30
        self.textEdit.setFixedHeight(height)
        super().resizeEvent(event)
    def findstr(self):
        search_text = self.lineEdit.text()
        if search_text:
            self.textEdit.find(search_text)
            self.textEdit.setFocus()
        else:
            self.textEdit.clearFocus()
            self.textEdit.moveCursor(QtGui.QTextCursor.Start)
            self.textEdit.ensureCursorVisible()


class Lovelymem(QMainWindow, Ui_MainWindow):
    def __init__(self):
        super().__init__()
        self.setupUi(self)
        self.setAcceptDrops(True)
        self.setWindowIcon(QtGui.QIcon('res/logo.ico')) 
        self.actionOpenFile.triggered.connect(self.open_file_select)
        self.actionOpenFile.setShortcut('Ctrl+O')
        self.actionOpenFile.setStatusTip('打开文件')
        self.action2.triggered.connect(self.use_memprocfs)
        self.action2.setShortcut('Ctrl+L')
        self.action2.setStatusTip('加载内存镜像')
        self.action3.triggered.connect(self.unloadmem)
        self.action3.setShortcut('Ctrl+U')
        self.action3.setStatusTip('卸载内存镜像')
        self.setContextMenuPolicy(Qt.CustomContextMenu)
        self.customContextMenuRequested.connect(self.contextMenuEvent)
        self.pushButton_flush.clicked.connect(self.flush)
        self.pushButton_flush.setToolTip('在新窗口加载镜像的基本信息')
        self.pushButton_findstr.clicked.connect(self.findstr)
        self.pushButton_findstr.setToolTip('搜索文件名包含关键字的文件')
        self.pushButton_load_netstat.clicked.connect(self.load_netstat)
        self.pushButton_load_netstat.setToolTip('加载网络连接信息，若目的地址无法显示请使用netscan')
        self.pushButton_load_proc.clicked.connect(self.loadproc)
        self.pushButton_load_proc.setToolTip('加载进程信息')
        self.pushButton_load_tasks.clicked.connect(self.loadtasks)
        self.pushButton_load_tasks.setToolTip('加载任务信息')
        self.pushButton_load_findevil.clicked.connect(self.loadfindevil)
        self.pushButton_load_findevil.setToolTip('加载恶意文件信息')
        self.pushButton_load_netstat_timeline.clicked.connect(self.loadnetstat_timeline)
        self.pushButton_load_netstat_timeline.setToolTip('加载网络连接时间线')
        self.pushButton_load_proc_timeline.clicked.connect(self.loadproc_timeline)
        self.pushButton_load_proc_timeline.setToolTip('加载进程时间线\nQ:进程时间线是什么？\nA:进程时间线是进程的创建、退出时间等信息')
        self.pushButton_load_web_timeline.clicked.connect(self.loadweb_timeline)
        self.pushButton_load_web_timeline.setToolTip('加载web网页访问时间线')
        self.pushButton_findrow.clicked.connect(self.findrow)
        self.pushButton_withvol2find.clicked.connect(self.volfindscan)
        self.pushButton_withvol2find.setToolTip('通过vol2搜索文件,输入框输入文件关键字')
        self.pushButton_ntfsfind.clicked.connect(self.ntfsfind)
        self.pushButton_procdump2gimp.clicked.connect(self.procdump2gimp)
        self.pushButton_procdump2gimp.setToolTip('使用gimp打开搜索框中pid对应进程的minidump文件\n 通过调整宽高位移来查看缓存在内存中的图片等信息')
        self.pushButton_withvol2dump.clicked.connect(self.withvol2dump)
        self.pushButton_withvol2dump.setToolTip('通过vol2导出文件,输入框输入文件物理地址0xXXXXXXX')
        self.pushButton_vol2editbox.clicked.connect(self.withvol2editbox)
        self.pushButton_vol2editbox.setToolTip('通过vol2搜索editbox\nQ：editbox是什么？\nA：editbox是windows中的文本框\nQ：为什么要搜索？\nA：因为文本框中可能有密码等敏感信息')
        self.pushButton_vol2clipboard.clicked.connect(self.withvol2clipboard)
        self.pushButton_vol2clipboard.setToolTip('通过vol2搜索clipboard\n Q：clipboard是什么？\nA：clipboard是windows中的剪贴板\nQ：为什么要搜索？\nA：因为剪贴板中可能有密码等敏感信息')
        self.pushButton_services.clicked.connect(self.loadservices)
        self.pushButton_services.setToolTip('加载服务信息')
        self.pushButton_load_timeline_registry.clicked.connect(self.loadtimeline_registry)
        self.pushButton_load_timeline_registry.setToolTip('加载注册表时间线')
        self.pushButton_loadallfile.clicked.connect(self.loadallfiles)
        self.pushButton_loadallfile.setToolTip('加载所有文件列表')
        self.pushButton_withvol2netscan.clicked.connect(self.withvol2netscan)
        self.pushButton_withvol2netscan.setToolTip('通过vol2搜索netscan\nTips:软件默认的memprocfs导出的网络连接缺少目的地址的显示\n所以这里调用vol2的可以使用netscan进行查看')
        self.checkBox_cusHW.stateChanged.connect(self.cusHW)
        self.comboBox_profile.currentIndexChanged.connect(self.getprofile)
        self.comboBox_profile.addItems(config.profile)
        self.comboBox_profile.setToolTip('这里默认选择Win7SP1x64\n左上文件-加载镜像无法正确加载，这里选择是为下面的vol2功能选择profile\n点击前面的vol2功能按钮前会自动匹配profile(Frrom volatilityPro)')
        self.pushButton_vol2.clicked.connect(self.runvol2pro)
        self.pushButton_vol2.setToolTip('一般来说仅支持windows7x64以下的系统\n通过vol2进行分析，若memprocfs正常加载，会自动匹配profile\n若无法加载的镜像（一般为xp,win7x86）则会自动进行imageinfo')
        self.lineEdit_str.setToolTip('该输入框为通用搜索、查询、导出等功能的限制关键词输入框，具体功能请查看按钮提示')
        # pushButton_cuscmd
        self.pushButton_cuscmd.clicked.connect(self.cuscmd)
        self.pushButton_cuscmd.setToolTip('这个按钮功能是vol2中profile后面命令的自定义执行\n输入框中输入需要执行的内容,例如：iehistory|findstr flag \n默认命令提示符输出')
        # pushButton_load_ntfsfile_timeline
        self.pushButton_load_ntfsfile_timeline.clicked.connect(self.loadntfs_timeline)
        self.show()
    #动态调整tableWidget_find大小
    def resizeEvent(self, event):
        width = self.width() - 20
        self.tableWidget_find.setFixedWidth(width)
        height = self.height() -147
        self.tableWidget_find.setFixedHeight(height)
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
            ntfsroot = r'M:\forensic\ntfs'
            memfilepath = r'M:/forensic/files/ROOT'
            truepath = ''
            if selectstr.split('\\')[1] in ['0', '1', '2']:
                print(Fore.YELLOW + '[*] 识别为ntfs目录' + selectstr + Style.RESET_ALL)
                truepath = ntfsroot + selectstr.replace('\\', '/')
            elif 'HarddiskVolume' in selectstr or ':\\' in selectstr:
                print(Fore.YELLOW + '[*] 使用ntfs目录' + selectstr + Style.RESET_ALL)
                selectstr = '/'.join(selectstr.split('\\')[3:]) if 'HarddiskVolume' in selectstr else '/'.join(selectstr.split('\\')[1:])
                try:
                    truepath = ntfsroot+'\\0\\' + selectstr.replace('\\', '/')
                except:
                    truepath = ntfsroot+'\\1\\' + selectstr.replace('\\', '/')
            else:
                print(Fore.YELLOW + '[*] 使用正常目录' + selectstr + Style.RESET_ALL)
                truepath = memfilepath + selectstr.replace('\\', '/')
            #转换为windows路径
            truepath = truepath.replace('/', '\\')
            return truepath
        def open_directory(self, pos):
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
                subprocess.run(["explorer", truepath])
            else:
                print(Fore.YELLOW + '[*] 正在打开目录：' + os.path.dirname(truepath) + Style.RESET_ALL)
                subprocess.run(["explorer", "/select,", truepath])
        if action == opendir:
            open_directory(self, pos)
        elif action == copy_str: # 复制内容并发送至搜索框
        # Get the content of the selected cell
            selected_items = self.tableWidget_find.selectedItems()
            if selected_items:
                selected_item = selected_items[0]
                selectstr = selected_item.text()
                self.lineEdit_str.setText(selectstr)
                clipboard = QApplication.clipboard()
                clipboard.setText(selectstr)
                print(Fore.GREEN + f'[+] 发送成功！内容为：{selectstr}' + Style.RESET_ALL)
        elif action == quickly_view: # 快速查看文本
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
                print(Fore.RED + '[×] 该路径为文件夹！' + Style.RESET_ALL)
                return
            try:
                ## 初始化 textEdit 属性
                self.quicklyviewwindow = QuicklyView(f'文件内容,文件路径：{truepath}',size=(800, 600))
                self.quicklyviewwindow.textEdit.setPlainText(open(truepath, 'r', encoding='utf-8').read(500))
                self.quicklyviewwindow.show()
            #打印报错
            except Exception as e:
                print(Fore.RED + '[×] ' + str(e) + Style.RESET_ALL)
                print(Fore.RED + '[×] 该文件无法快速读取,即将使用hexdump打印至控制台' + Style.RESET_ALL)
                print(Fore.GREEN + '[*] 正在使用hexdump打印文件内容：' + truepath + Style.RESET_ALL)
                hexdump.hexdump(open(truepath, 'rb').read(500))
                
        elif action == quickly_view_img: # 快速查看图片
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
                img = Image.open(truepath)
                img.show()
                
            except:
                print(Fore.RED + '[×] 该文件不是图片！' + Style.RESET_ALL)
                return
        elif action == delete_col: # 删除所选列
            #删除当前列
            self.tableWidget_find.removeColumn(self.tableWidget_find.currentColumn())
            print(Fore.GREEN + '[+] 删除成功！' + Style.RESET_ALL)
        elif action == delete_row: # 删除所选行
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
        self.setWindowTitle('LovelyMem v0.4 - ' + self.mem_path)
        return self.mem_path
    #获取镜像完整路径
    def get_mem_path(self, file_name):
        return os.path.abspath(file_name)
    def use_memprocfs(self,path):
        try:
            path = self.mem_path
        except:
            print(Fore.RED + '[×] 请先加载内存镜像文件！' + Style.RESET_ALL)
        # memprocfs.exe -device mempath -v -forensic 1
        cmd = f'{config.MemProcFsDir} -device "{path}" -v -forensic 1'
        try:
            subprocess.Popen(cmd, shell=True)
        except:
            print(Fore.RED + '[×] MemProcFS路径错误！' + Style.RESET_ALL)
    def unloadmem(self):
        try:
            #卸载镜像 ，taskkill /F /IM MemProcFS.exe
            cmd = 'taskkill /F /IM MemProcFS.exe'
            subprocess.Popen(cmd, shell=True)
            print(Fore.GREEN + '[+] 卸载成功！' + Style.RESET_ALL)
        except:
            print(Fore.RED + '[×] 卸载失败！' + Style.RESET_ALL)
    def flush(self):
        try:
            #M:\sys下
            memdisk = r'M:/'
            self.computername = open(memdisk + 'sys/computername.txt', 'r').read().replace('\n', '')
            self.architecture = open(memdisk + 'sys/architecture.txt', 'r').read().replace('\n', '')
            self.time_boot = open(memdisk + 'sys/time-boot.txt', 'r').read().replace('\n', '')
            self.time_current = open(memdisk + 'sys/time-current.txt', 'r').read().replace('\n', '')
            self.timezone = open(memdisk + 'sys/timezone.txt', 'r').read().replace('\n', '')
            self.unique_tag = open(memdisk + 'sys/unique-tag.txt', 'r').read().replace('\n', '')
            self.version = open(memdisk + 'sys/version.txt', 'r').read().replace('\n', '')
            self.version_build = open(memdisk + 'sys/version-build.txt', 'r').read().replace('\n', '')
            self.users = open(memdisk + 'sys/users/users.txt', 'r').read().replace('--', '')
            # "M:\py\regsecrets\all.txt" 获取密码相关
            self.secretsall = open(memdisk + 'py/regsecrets/all.txt', 'r').read()
            #判断M:\misc\bitlocker目录下是否有多个文件（>2）
            try:
                bitlocker = os.listdir(memdisk + 'misc/bitlocker')
                if len(bitlocker) > 2:
                    filelist = []
                    for file in bitlocker:
                        if file != 'readme.txt':
                            print(Fore.YELLOW + '[*] 发现bitlocker相关文件：' + file + Style.RESET_ALL)
                            filelist.append(file)
                self.bitlockerinfo = '\n'.join(filelist)
                print(Fore.GREEN + '[+] 读取成功！' + Style.RESET_ALL)
            except:
                self.bitlockerinfo = '未发现bitlocker相关文件'
                print(Fore.YELLOW + '[-] 未发现bitlocker相关文件' + Style.RESET_ALL)
            info_list = [
                ('计算机名', self.computername),
                ('架构', self.architecture),
                ('最后一次开机时间', self.time_boot),
                ('镜像获取时间', self.time_current),
                ('时区', self.timezone),
                ('元标签', self.unique_tag),
                ('版本号', self.version),
                ('构建版本号', self.version_build),
                ('用户', '\n'+self.users),
                ('系统密码相关', '\n'+self.secretsall),
                ('Bitlocker信息', '\n'+self.bitlockerinfo)
            ]
            
            self.quicklyviewwindow = QuicklyView('镜像信息',size=(800, 700))
            self.quicklyviewwindow.textEdit.setPlainText('\n'.join([f'{name}: {value}' for name, value in info_list]))
            self.quicklyviewwindow.show()
        except Exception as e:
            print(Fore.RED + '[×] ' + str(e) + Style.RESET_ALL)
    def runvol2pro(self):
        #读取镜像
        try:
            path = self.mem_path
        except:
            print(Fore.RED + '[×] 请先加载内存镜像文件！' + Style.RESET_ALL)
        
        if os.path.exists(self.regpath): 
            cmd = [config.pythonpath, 'volpro.py', path, self.profile]
            readcmd = ' '.join(cmd)
            print(Fore.YELLOW + '[*] 正在调用volpro进行分析，使用profile:{self.profile}：' + readcmd + Style.RESET_ALL)
        else :
            cmd = [config.pythonpath, 'volpro.py', path]
            readcmd = ' '.join(cmd)
            print(Fore.YELLOW + '[*] 正在调用volpro进行分析，使用profile:{self.profile}：' + readcmd + Style.RESET_ALL)
        try:
            print
            subprocess.Popen(cmd, shell=True)
        except:
            print(Fore.RED + '[×] volpro路径错误！' + Style.RESET_ALL)
    def cuscmd(self):
        #自定义执行命令
        if self.lineEdit_str.text() == '':
            print(Fore.RED + '[×] 请输入自定义指令即vol.exe -f mem --profile= xxx 后面的内容！' + Style.RESET_ALL)
            return
        str = self.lineEdit_str.text()
        profile = self.getprofile()
        cmd = f'{config.volatility2} -f "{self.mem_path}" --profile={profile} {str}'
        self.pushButton_cuscmd.setEnabled(False)
        self.pushButton_cuscmd.setText('执行中...')
        print(Fore.YELLOW + '[*] 正在调用vol2进行自定义命令执行：' + cmd + Style.RESET_ALL)
        self.command_runner = CommandRunner(cmd)
        self.command_runner.start()
        self.command_runner.finished.connect(lambda: self.pushButton_cuscmd.setEnabled(True))
        self.command_runner.finished.connect(lambda: self.pushButton_cuscmd.setText('自定义指令'))

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
                print(Fore.RED + '[×] 请先加载内存镜像文件！' + Style.RESET_ALL)
            else:
                print(Fore.RED + '[×] 未找到文件！' + Style.RESET_ALL)
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
    def loadntfs_timeline(self):
        ntfs_timelinepath = r'M:/forensic/csv/timeline_ntfs.csv'
        return self.loadcsv2table(ntfs_timelinepath)
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
            print(Fore.RED + '[×] 请输入要搜索的内容！' + Style.RESET_ALL)
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
            print(Fore.RED + '[×] 请输入要搜索的内容！' + Style.RESET_ALL)
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
        self.command_runner.finished.connect(lambda: self.pushButton_withvol2find.setText('filescan'))
    def withvol2dump(self):
        if self.lineEdit_str.text() == '':
            print(Fore.RED + '[×] 请输入要需要dumpfile的地址！' + Style.RESET_ALL)
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
        self.command_runner.finished.connect(lambda: self.pushButton_withvol2dump.setText('dumpfiles'))
    def withvol2netscan(self):
        if os.path.exists('output/netscan.txt'):
            #QuicklyView('文件内容+path',size=(1000, 600))
            self.quicklyviewwindow = QuicklyView('output/netscan.txt',size=(800, 600))
            self.quicklyviewwindow.textEdit.setPlainText(open('output/netscan.txt', 'r', encoding='utf-8').read())
            self.quicklyviewwindow.show()
        else:
            profile = self.getprofile()
            if self.lineEdit_str.text() != '':
                cmd = f'{config.volatility2} -f "{self.mem_path}" --profile={profile} netscan|findstr {self.lineEdit_str.text()}'
            else:
                cmd = f'{config.volatility2} -f "{self.mem_path}" --profile={profile} netscan'
            self.pushButton_withvol2netscan.setEnabled(False)
            #按钮名字改为搜索中...
            self.pushButton_withvol2netscan.setText('搜索中...')
            self.command_runner = CommandRunner(cmd)
            print(Fore.YELLOW + '[*] 正在调用vol2进行netscan：' + cmd + Style.RESET_ALL)
            self.command_runner.start()
            #线程结束后 按钮变为可用
            self.command_runner.finished.connect(lambda: self.pushButton_withvol2netscan.setEnabled(True))
            self.command_runner.finished.connect(lambda: self.pushButton_withvol2netscan.setText('netscan'))
    def procdump2gimp(self):
        str = self.lineEdit_str.text()
        #判断是否为数字
        if str.isdigit() == False:
            print(Fore.RED + '[×] 请输入程序对应的pid！' + Style.RESET_ALL)
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
        #判断output\editbox.txt是否存在,且文件大小不为0
        if os.path.exists('output/editbox.txt') and os.path.getsize('output/editbox.txt') > 0:
            #QuicklyView('文件内容+path',size=(800, 600))
            self.quicklyviewwindow = QuicklyView('output/editbox.txt',size=(800, 600))
            self.quicklyviewwindow.textEdit.setPlainText(open('output/editbox.txt', 'r', encoding='utf-8').read())
            self.quicklyviewwindow.show()
        else:
            print(Fore.RED + '[×] 未找到editbox.txt文件！或editbox文件为空正在尝试重新执行' + Style.RESET_ALL)
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
            self.command_runner.finished.connect(lambda: self.pushButton_vol2editbox.setText('editbox'))
    def withvol2clipboard(self):
        if os.path.exists('output/clipboard.txt') and os.path.getsize('output/clipboard.txt') > 0:
            #QuicklyView('文件内容+path',size=(800, 600))
            self.quicklyviewwindow = QuicklyView('output/clipboard.txt',size=(800, 600))
            self.quicklyviewwindow.textEdit.setPlainText(open('output/clipboard.txt', 'r', encoding='utf-8').read())
            self.quicklyviewwindow.show()
        else:
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
            self.command_runner.finished.connect(lambda: self.pushButton_vol2clipboard.setText('clipboard'))
    
    def getprofile(self):
        self.regpath = r"M:\registry\HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\BuildLabEx.txt"
        if os.path.exists(self.regpath):

            data = open(self.regpath, 'r', encoding='utf-8').readlines()
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
        else:
            self.profile = self.comboBox_profile.currentText()
            return self.profile
        
        
    def findstr(self):
        if self.lineEdit_str.text() == '':
            print(Fore.RED + '[×] 请输入要搜索的内容！' + Style.RESET_ALL)
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
            print(Fore.RED + '[×] 搜索失败，未找到内容 ' + str(e) + Style.RESET_ALL)
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
        pixmap = QtGui.QPixmap("res/qrcode.png")
        pixmap = pixmap.scaled(200, 200)
        msg = QMessageBox()
        msg.setIconPixmap(pixmap)
        msg.setTextInteractionFlags(Qt.TextSelectableByMouse)
        msg.setTextFormat(Qt.RichText)
        msg.setText("<center><h2>确认退出吗？</h2></center><center><h2>退出会结束MemProcFS进程</h2></center><center><h2>退出会清空output文件夹</h2></center>")
        msg.setWindowTitle("请我喝杯咖啡吧！")
        msg.setWindowIcon(QtGui.QIcon('res/logo.ico'))
        msg.setStandardButtons(QMessageBox.Yes | QMessageBox.No)
        reply = msg.exec()
        if reply == QMessageBox.Yes:
            event.accept()
            # 结束MemProcFS进程，结束MemProcFS.exe
            os.system('taskkill /F /IM MemProcFS.exe')
            # 清空 output 文件夹
            output_folder = 'output'
            if os.path.exists(output_folder):
                shutil.rmtree(output_folder)
            os.makedirs(output_folder)
        else:
            event.ignore()
#----------------------------------------------------------------------------------------------------------

if __name__ == '__main__':
    app = QApplication(sys.argv)
    lovelymem = Lovelymem()
    sys.exit(app.exec())