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
from PySide6.QtWidgets import (QApplication, QCheckBox, QGridLayout, QHeaderView,
    QLineEdit, QMainWindow, QMenu, QMenuBar,
    QPushButton, QSizePolicy, QStatusBar, QTableWidget,
    QTableWidgetItem, QWidget)

class Ui_MainWindow(object):
    def setupUi(self, MainWindow):
        if not MainWindow.objectName():
            MainWindow.setObjectName(u"MainWindow")
        MainWindow.resize(1077, 807)
        self.actionOpenFile = QAction(MainWindow)
        self.actionOpenFile.setObjectName(u"actionOpenFile")
        self.centralwidget = QWidget(MainWindow)
        self.centralwidget.setObjectName(u"centralwidget")
        self.pushButton_loadMem = QPushButton(self.centralwidget)
        self.pushButton_loadMem.setObjectName(u"pushButton_loadMem")
        self.pushButton_loadMem.setGeometry(QRect(10, 10, 111, 23))
        self.pushButton_flush = QPushButton(self.centralwidget)
        self.pushButton_flush.setObjectName(u"pushButton_flush")
        self.pushButton_flush.setGeometry(QRect(10, 40, 111, 23))
        self.tableWidget_find = QTableWidget(self.centralwidget)
        self.tableWidget_find.setObjectName(u"tableWidget_find")
        self.tableWidget_find.setGeometry(QRect(10, 120, 1051, 641))
        self.tableWidget_find.setRowCount(0)
        self.tableWidget_find.setColumnCount(0)
        self.tableWidget_find.horizontalHeader().setMinimumSectionSize(15)
        self.tableWidget_find.horizontalHeader().setDefaultSectionSize(1000)
        self.tableWidget_find.verticalHeader().setMinimumSectionSize(10)
        self.tableWidget_find.verticalHeader().setDefaultSectionSize(18)
        self.pushButton_findstr = QPushButton(self.centralwidget)
        self.pushButton_findstr.setObjectName(u"pushButton_findstr")
        self.pushButton_findstr.setGeometry(QRect(280, 40, 75, 23))
        self.lineEdit_str = QLineEdit(self.centralwidget)
        self.lineEdit_str.setObjectName(u"lineEdit_str")
        self.lineEdit_str.setGeometry(QRect(130, 10, 341, 21))
        self.pushButton_findrow = QPushButton(self.centralwidget)
        self.pushButton_findrow.setObjectName(u"pushButton_findrow")
        self.pushButton_findrow.setGeometry(QRect(130, 40, 75, 23))
        self.pushButton_unloadmem = QPushButton(self.centralwidget)
        self.pushButton_unloadmem.setObjectName(u"pushButton_unloadmem")
        self.pushButton_unloadmem.setGeometry(QRect(10, 70, 111, 23))
        self.pushButton_withvol2find = QPushButton(self.centralwidget)
        self.pushButton_withvol2find.setObjectName(u"pushButton_withvol2find")
        self.pushButton_withvol2find.setGeometry(QRect(130, 70, 91, 23))
        self.pushButton_withvol2dump = QPushButton(self.centralwidget)
        self.pushButton_withvol2dump.setObjectName(u"pushButton_withvol2dump")
        self.pushButton_withvol2dump.setEnabled(True)
        self.pushButton_withvol2dump.setGeometry(QRect(220, 70, 91, 23))
        self.pushButton_ntfsfind = QPushButton(self.centralwidget)
        self.pushButton_ntfsfind.setObjectName(u"pushButton_ntfsfind")
        self.pushButton_ntfsfind.setGeometry(QRect(205, 40, 75, 23))
        self.pushButton_vol2editbox = QPushButton(self.centralwidget)
        self.pushButton_vol2editbox.setObjectName(u"pushButton_vol2editbox")
        self.pushButton_vol2editbox.setGeometry(QRect(310, 70, 81, 23))
        self.pushButton_vol2clipboard = QPushButton(self.centralwidget)
        self.pushButton_vol2clipboard.setObjectName(u"pushButton_vol2clipboard")
        self.pushButton_vol2clipboard.setGeometry(QRect(390, 70, 81, 23))
        font = QFont()
        font.setPointSize(8)
        self.pushButton_vol2clipboard.setFont(font)
        self.gridLayoutWidget = QWidget(self.centralwidget)
        self.gridLayoutWidget.setObjectName(u"gridLayoutWidget")
        self.gridLayoutWidget.setGeometry(QRect(490, 10, 571, 83))
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

        self.checkBox_cusHW = QCheckBox(self.centralwidget)
        self.checkBox_cusHW.setObjectName(u"checkBox_cusHW")
        self.checkBox_cusHW.setGeometry(QRect(20, 95, 101, 19))
        MainWindow.setCentralWidget(self.centralwidget)
        self.menubar = QMenuBar(MainWindow)
        self.menubar.setObjectName(u"menubar")
        self.menubar.setGeometry(QRect(0, 0, 1077, 21))
        self.menu = QMenu(self.menubar)
        self.menu.setObjectName(u"menu")
        MainWindow.setMenuBar(self.menubar)
        self.statusbar = QStatusBar(MainWindow)
        self.statusbar.setObjectName(u"statusbar")
        MainWindow.setStatusBar(self.statusbar)

        self.menubar.addAction(self.menu.menuAction())
        self.menu.addAction(self.actionOpenFile)

        self.retranslateUi(MainWindow)

        QMetaObject.connectSlotsByName(MainWindow)
    # setupUi

    def retranslateUi(self, MainWindow):
        MainWindow.setWindowTitle(QCoreApplication.translate("MainWindow", u"LovelyMem v0.3 - https://github.com/Tokeii0/LovelyMem", None))
        self.actionOpenFile.setText(QCoreApplication.translate("MainWindow", u"\u6253\u5f00", None))
        self.pushButton_loadMem.setText(QCoreApplication.translate("MainWindow", u"\u52a0\u8f7d\u5185\u5b58\u81f3\u78c1\u76d8", None))
        self.pushButton_flush.setText(QCoreApplication.translate("MainWindow", u"\u955c\u50cf\u57fa\u672c\u4fe1\u606f", None))
        self.pushButton_findstr.setText(QCoreApplication.translate("MainWindow", u"\u641c\u7d22\u6587\u4ef6", None))
        self.lineEdit_str.setInputMask("")
        self.pushButton_findrow.setText(QCoreApplication.translate("MainWindow", u"\u641c\u7d22\u5b57\u7b26\u4e32", None))
        self.pushButton_unloadmem.setText(QCoreApplication.translate("MainWindow", u"\u5378\u8f7d\u5185\u5b58\u955c\u50cf", None))
        self.pushButton_withvol2find.setText(QCoreApplication.translate("MainWindow", u"vol2findscan", None))
        self.pushButton_withvol2dump.setText(QCoreApplication.translate("MainWindow", u"vol2dumpfile", None))
        self.pushButton_ntfsfind.setText(QCoreApplication.translate("MainWindow", u"Ntfs\u641c\u7d22", None))
        self.pushButton_vol2editbox.setText(QCoreApplication.translate("MainWindow", u"vol2editbox", None))
        self.pushButton_vol2clipboard.setText(QCoreApplication.translate("MainWindow", u"vol2clipboard", None))
        self.pushButton_load_proc_timeline.setText(QCoreApplication.translate("MainWindow", u"\u52a0\u8f7dproc_timeline", None))
        self.pushButton_load_web_timeline.setText(QCoreApplication.translate("MainWindow", u"\u52a0\u8f7dweb_timeline", None))
        self.pushButton_load_timeline_registry.setText(QCoreApplication.translate("MainWindow", u"\u52a0\u8f7dtimeline_registry", None))
        self.pushButton_load_netstat_timeline.setText(QCoreApplication.translate("MainWindow", u"\u52a0\u8f7dnet_timeline", None))
        self.pushButton_loadallfile.setText(QCoreApplication.translate("MainWindow", u"\u52a0\u8f7d\u5168\u90e8\u6587\u4ef6", None))
        self.pushButton_load_proc.setText(QCoreApplication.translate("MainWindow", u"\u52a0\u8f7dproc", None))
        self.pushButton_procdump2gimp.setText(QCoreApplication.translate("MainWindow", u"procdump2gimp", None))
        self.pushButton_load_netstat.setText(QCoreApplication.translate("MainWindow", u"\u52a0\u8f7dnetstat", None))
        self.pushButton_load_tasks.setText(QCoreApplication.translate("MainWindow", u"\u52a0\u8f7dtasks", None))
        self.pushButton_load_findevil.setText(QCoreApplication.translate("MainWindow", u"\u52a0\u8f7dfindevil", None))
        self.pushButton_services.setText(QCoreApplication.translate("MainWindow", u"\u52a0\u8f7dservices", None))
        self.checkBox_cusHW.setText(QCoreApplication.translate("MainWindow", u"\u81ea\u5b9a\u4e49\u5217\u5bbd", None))
        self.menu.setTitle(QCoreApplication.translate("MainWindow", u"\u6587\u4ef6", None))
    # retranslateUi

