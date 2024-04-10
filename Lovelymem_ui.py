# -*- coding: utf-8 -*-

################################################################################
## Form generated from reading UI file 'Lovelymem.ui'
##
## Created by: Qt User Interface Compiler version 6.5.0
##
## WARNING! All changes made in this file will be lost when recompiling UI file!
################################################################################

from PySide6.QtCore import (QCoreApplication, QDate, QDateTime, QLocale,
    QMetaObject, QObject, QPoint, QRect,
    QSize, QTime, QUrl, Qt)
from PySide6.QtGui import (QAction, QBrush, QColor, QConicalGradient,
    QCursor, QFont, QFontDatabase, QGradient,
    QIcon, QImage, QKeySequence, QLinearGradient,
    QPainter, QPalette, QPixmap, QRadialGradient,
    QTransform)
from PySide6.QtWidgets import (QApplication, QCheckBox, QComboBox, QGridLayout,
    QHeaderView, QLineEdit, QMainWindow, QMenu,
    QMenuBar, QPushButton, QSizePolicy, QStatusBar,
    QTableWidget, QTableWidgetItem, QWidget)

class Ui_MainWindow(object):
    def setupUi(self, MainWindow):
        if not MainWindow.objectName():
            MainWindow.setObjectName(u"MainWindow")
        MainWindow.resize(1076, 815)
        self.actionOpenFile = QAction(MainWindow)
        self.actionOpenFile.setObjectName(u"actionOpenFile")
        self.action2 = QAction(MainWindow)
        self.action2.setObjectName(u"action2")
        self.action3 = QAction(MainWindow)
        self.action3.setObjectName(u"action3")
        self.centralwidget = QWidget(MainWindow)
        self.centralwidget.setObjectName(u"centralwidget")
        self.tableWidget_find = QTableWidget(self.centralwidget)
        self.tableWidget_find.setObjectName(u"tableWidget_find")
        self.tableWidget_find.setGeometry(QRect(10, 100, 1051, 671))
        self.tableWidget_find.setRowCount(0)
        self.tableWidget_find.setColumnCount(0)
        self.tableWidget_find.horizontalHeader().setMinimumSectionSize(15)
        self.tableWidget_find.horizontalHeader().setDefaultSectionSize(1000)
        self.tableWidget_find.verticalHeader().setMinimumSectionSize(10)
        self.tableWidget_find.verticalHeader().setDefaultSectionSize(18)
        self.lineEdit_str = QLineEdit(self.centralwidget)
        self.lineEdit_str.setObjectName(u"lineEdit_str")
        self.lineEdit_str.setGeometry(QRect(20, 10, 371, 21))
        self.gridLayoutWidget = QWidget(self.centralwidget)
        self.gridLayoutWidget.setObjectName(u"gridLayoutWidget")
        self.gridLayoutWidget.setGeometry(QRect(520, 10, 541, 83))
        self.gridLayout = QGridLayout(self.gridLayoutWidget)
        self.gridLayout.setObjectName(u"gridLayout")
        self.gridLayout.setContentsMargins(0, 0, 0, 0)
        self.pushButton_load_proc_timeline = QPushButton(self.gridLayoutWidget)
        self.pushButton_load_proc_timeline.setObjectName(u"pushButton_load_proc_timeline")

        self.gridLayout.addWidget(self.pushButton_load_proc_timeline, 1, 2, 1, 1)

        self.pushButton_load_web_timeline = QPushButton(self.gridLayoutWidget)
        self.pushButton_load_web_timeline.setObjectName(u"pushButton_load_web_timeline")

        self.gridLayout.addWidget(self.pushButton_load_web_timeline, 1, 3, 1, 1)

        self.pushButton_load_timeline_registry = QPushButton(self.gridLayoutWidget)
        self.pushButton_load_timeline_registry.setObjectName(u"pushButton_load_timeline_registry")
        font = QFont()
        font.setPointSize(8)
        self.pushButton_load_timeline_registry.setFont(font)

        self.gridLayout.addWidget(self.pushButton_load_timeline_registry, 1, 4, 1, 1)

        self.pushButton_load_netstat_timeline = QPushButton(self.gridLayoutWidget)
        self.pushButton_load_netstat_timeline.setObjectName(u"pushButton_load_netstat_timeline")

        self.gridLayout.addWidget(self.pushButton_load_netstat_timeline, 1, 1, 1, 1)

        self.pushButton_loadallfile = QPushButton(self.gridLayoutWidget)
        self.pushButton_loadallfile.setObjectName(u"pushButton_loadallfile")

        self.gridLayout.addWidget(self.pushButton_loadallfile, 1, 0, 1, 1)

        self.pushButton_load_proc = QPushButton(self.gridLayoutWidget)
        self.pushButton_load_proc.setObjectName(u"pushButton_load_proc")

        self.gridLayout.addWidget(self.pushButton_load_proc, 0, 0, 1, 1)

        self.pushButton_procdump2gimp = QPushButton(self.gridLayoutWidget)
        self.pushButton_procdump2gimp.setObjectName(u"pushButton_procdump2gimp")

        self.gridLayout.addWidget(self.pushButton_procdump2gimp, 2, 0, 1, 1)

        self.pushButton_load_netstat = QPushButton(self.gridLayoutWidget)
        self.pushButton_load_netstat.setObjectName(u"pushButton_load_netstat")

        self.gridLayout.addWidget(self.pushButton_load_netstat, 0, 1, 1, 1)

        self.pushButton_load_tasks = QPushButton(self.gridLayoutWidget)
        self.pushButton_load_tasks.setObjectName(u"pushButton_load_tasks")

        self.gridLayout.addWidget(self.pushButton_load_tasks, 0, 2, 1, 1)

        self.pushButton_load_findevil = QPushButton(self.gridLayoutWidget)
        self.pushButton_load_findevil.setObjectName(u"pushButton_load_findevil")

        self.gridLayout.addWidget(self.pushButton_load_findevil, 0, 3, 1, 1)

        self.pushButton_services = QPushButton(self.gridLayoutWidget)
        self.pushButton_services.setObjectName(u"pushButton_services")
        self.pushButton_services.setFont(font)

        self.gridLayout.addWidget(self.pushButton_services, 0, 4, 1, 1)

        self.checkBox_cusHW = QCheckBox(self.gridLayoutWidget)
        self.checkBox_cusHW.setObjectName(u"checkBox_cusHW")

        self.gridLayout.addWidget(self.checkBox_cusHW, 2, 4, 1, 1)

        self.comboBox_profile = QComboBox(self.centralwidget)
        self.comboBox_profile.setObjectName(u"comboBox_profile")
        self.comboBox_profile.setGeometry(QRect(400, 10, 111, 22))
        self.widget = QWidget(self.centralwidget)
        self.widget.setObjectName(u"widget")
        self.widget.setGeometry(QRect(21, 41, 482, 51))
        self.gridLayout_2 = QGridLayout(self.widget)
        self.gridLayout_2.setObjectName(u"gridLayout_2")
        self.gridLayout_2.setContentsMargins(0, 0, 0, 0)
        self.pushButton_ntfsfind = QPushButton(self.widget)
        self.pushButton_ntfsfind.setObjectName(u"pushButton_ntfsfind")

        self.gridLayout_2.addWidget(self.pushButton_ntfsfind, 0, 3, 1, 1)

        self.pushButton_vol2clipboard = QPushButton(self.widget)
        self.pushButton_vol2clipboard.setObjectName(u"pushButton_vol2clipboard")
        self.pushButton_vol2clipboard.setFont(font)

        self.gridLayout_2.addWidget(self.pushButton_vol2clipboard, 2, 3, 1, 1)

        self.pushButton_withvol2dump = QPushButton(self.widget)
        self.pushButton_withvol2dump.setObjectName(u"pushButton_withvol2dump")
        self.pushButton_withvol2dump.setEnabled(True)

        self.gridLayout_2.addWidget(self.pushButton_withvol2dump, 2, 1, 1, 1)

        self.pushButton_flush = QPushButton(self.widget)
        self.pushButton_flush.setObjectName(u"pushButton_flush")

        self.gridLayout_2.addWidget(self.pushButton_flush, 0, 1, 1, 1)

        self.pushButton_vol2 = QPushButton(self.widget)
        self.pushButton_vol2.setObjectName(u"pushButton_vol2")

        self.gridLayout_2.addWidget(self.pushButton_vol2, 0, 0, 1, 1)

        self.pushButton_withvol2netscan = QPushButton(self.widget)
        self.pushButton_withvol2netscan.setObjectName(u"pushButton_withvol2netscan")

        self.gridLayout_2.addWidget(self.pushButton_withvol2netscan, 2, 4, 1, 1)

        self.pushButton_vol2editbox = QPushButton(self.widget)
        self.pushButton_vol2editbox.setObjectName(u"pushButton_vol2editbox")

        self.gridLayout_2.addWidget(self.pushButton_vol2editbox, 2, 2, 1, 1)

        self.pushButton_findrow = QPushButton(self.widget)
        self.pushButton_findrow.setObjectName(u"pushButton_findrow")

        self.gridLayout_2.addWidget(self.pushButton_findrow, 0, 2, 1, 1)

        self.pushButton_findstr = QPushButton(self.widget)
        self.pushButton_findstr.setObjectName(u"pushButton_findstr")

        self.gridLayout_2.addWidget(self.pushButton_findstr, 0, 4, 1, 1)

        self.pushButton_withvol2find = QPushButton(self.widget)
        self.pushButton_withvol2find.setObjectName(u"pushButton_withvol2find")

        self.gridLayout_2.addWidget(self.pushButton_withvol2find, 2, 0, 1, 1)

        self.pushButton_cuscmd = QPushButton(self.widget)
        self.pushButton_cuscmd.setObjectName(u"pushButton_cuscmd")

        self.gridLayout_2.addWidget(self.pushButton_cuscmd, 2, 5, 1, 1)

        MainWindow.setCentralWidget(self.centralwidget)
        self.menubar = QMenuBar(MainWindow)
        self.menubar.setObjectName(u"menubar")
        self.menubar.setGeometry(QRect(0, 0, 1076, 21))
        self.menu = QMenu(self.menubar)
        self.menu.setObjectName(u"menu")
        MainWindow.setMenuBar(self.menubar)
        self.statusbar = QStatusBar(MainWindow)
        self.statusbar.setObjectName(u"statusbar")
        MainWindow.setStatusBar(self.statusbar)

        self.menubar.addAction(self.menu.menuAction())
        self.menu.addAction(self.actionOpenFile)
        self.menu.addAction(self.action2)
        self.menu.addAction(self.action3)

        self.retranslateUi(MainWindow)

        QMetaObject.connectSlotsByName(MainWindow)
    # setupUi

    def retranslateUi(self, MainWindow):
        MainWindow.setWindowTitle(QCoreApplication.translate("MainWindow", u"LovelyMem v0.4 - https://github.com/Tokeii0/LovelyMem", None))
        self.actionOpenFile.setText(QCoreApplication.translate("MainWindow", u"\u6253\u5f00", None))
        self.action2.setText(QCoreApplication.translate("MainWindow", u"\u52a0\u8f7d\u955c\u50cf", None))
        self.action3.setText(QCoreApplication.translate("MainWindow", u"\u5378\u8f7d\u955c\u50cf", None))
        self.lineEdit_str.setInputMask("")
        self.pushButton_load_proc_timeline.setText(QCoreApplication.translate("MainWindow", u"\u52a0\u8f7dproc_timeline", None))
        self.pushButton_load_web_timeline.setText(QCoreApplication.translate("MainWindow", u"\u52a0\u8f7dweb_timeline", None))
        self.pushButton_load_timeline_registry.setText(QCoreApplication.translate("MainWindow", u"\u52a0\u8f7dtimeline_reg", None))
        self.pushButton_load_netstat_timeline.setText(QCoreApplication.translate("MainWindow", u"\u52a0\u8f7dnet_timeline", None))
        self.pushButton_loadallfile.setText(QCoreApplication.translate("MainWindow", u"\u52a0\u8f7d\u5168\u90e8\u6587\u4ef6", None))
        self.pushButton_load_proc.setText(QCoreApplication.translate("MainWindow", u"\u52a0\u8f7dproc", None))
        self.pushButton_procdump2gimp.setText(QCoreApplication.translate("MainWindow", u"procdump2gimp", None))
        self.pushButton_load_netstat.setText(QCoreApplication.translate("MainWindow", u"\u52a0\u8f7dnetstat", None))
        self.pushButton_load_tasks.setText(QCoreApplication.translate("MainWindow", u"\u52a0\u8f7dtasks", None))
        self.pushButton_load_findevil.setText(QCoreApplication.translate("MainWindow", u"\u52a0\u8f7dfindevil", None))
        self.pushButton_services.setText(QCoreApplication.translate("MainWindow", u"\u52a0\u8f7dservices", None))
        self.checkBox_cusHW.setText(QCoreApplication.translate("MainWindow", u"\u81ea\u5b9a\u4e49\u5217\u5bbd", None))
        self.pushButton_ntfsfind.setText(QCoreApplication.translate("MainWindow", u"Ntfs\u641c\u7d22", None))
        self.pushButton_vol2clipboard.setText(QCoreApplication.translate("MainWindow", u"clipboard", None))
        self.pushButton_withvol2dump.setText(QCoreApplication.translate("MainWindow", u"dumpfile", None))
        self.pushButton_flush.setText(QCoreApplication.translate("MainWindow", u"\u57fa\u672c\u4fe1\u606f", None))
        self.pushButton_vol2.setText(QCoreApplication.translate("MainWindow", u"\u6267\u884cVOL2", None))
        self.pushButton_withvol2netscan.setText(QCoreApplication.translate("MainWindow", u"netscan", None))
        self.pushButton_vol2editbox.setText(QCoreApplication.translate("MainWindow", u"editbox", None))
        self.pushButton_findrow.setText(QCoreApplication.translate("MainWindow", u"\u641c\u7d22\u5b57\u7b26\u4e32", None))
        self.pushButton_findstr.setText(QCoreApplication.translate("MainWindow", u"\u641c\u7d22\u6587\u4ef6", None))
        self.pushButton_withvol2find.setText(QCoreApplication.translate("MainWindow", u"findscan", None))
        self.pushButton_cuscmd.setText(QCoreApplication.translate("MainWindow", u"\u81ea\u5b9a\u4e49\u547d\u4ee4", None))
        self.menu.setTitle(QCoreApplication.translate("MainWindow", u"\u6587\u4ef6", None))
    # retranslateUi

