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
from PySide6.QtWidgets import (QApplication, QHeaderView, QLineEdit, QMainWindow,
    QMenu, QMenuBar, QPushButton, QSizePolicy,
    QStatusBar, QTableWidget, QTableWidgetItem, QWidget)

class Ui_MainWindow(object):
    def setupUi(self, MainWindow):
        if not MainWindow.objectName():
            MainWindow.setObjectName(u"MainWindow")
        MainWindow.resize(1610, 767)
        self.actionOpenFile = QAction(MainWindow)
        self.actionOpenFile.setObjectName(u"actionOpenFile")
        self.centralwidget = QWidget(MainWindow)
        self.centralwidget.setObjectName(u"centralwidget")
        self.pushButton_loadMem = QPushButton(self.centralwidget)
        self.pushButton_loadMem.setObjectName(u"pushButton_loadMem")
        self.pushButton_loadMem.setGeometry(QRect(10, 10, 111, 23))
        self.pushButton_flush = QPushButton(self.centralwidget)
        self.pushButton_flush.setObjectName(u"pushButton_flush")
        self.pushButton_flush.setGeometry(QRect(130, 10, 75, 23))
        self.tableWidget_find = QTableWidget(self.centralwidget)
        self.tableWidget_find.setObjectName(u"tableWidget_find")
        self.tableWidget_find.setGeometry(QRect(10, 70, 1591, 661))
        self.pushButton_findstr = QPushButton(self.centralwidget)
        self.pushButton_findstr.setObjectName(u"pushButton_findstr")
        self.pushButton_findstr.setGeometry(QRect(500, 10, 75, 23))
        self.lineEdit_str = QLineEdit(self.centralwidget)
        self.lineEdit_str.setObjectName(u"lineEdit_str")
        self.lineEdit_str.setGeometry(QRect(210, 10, 281, 21))
        self.pushButton_load_netstat = QPushButton(self.centralwidget)
        self.pushButton_load_netstat.setObjectName(u"pushButton_load_netstat")
        self.pushButton_load_netstat.setGeometry(QRect(670, 10, 75, 23))
        self.pushButton_load_netstat_timeline = QPushButton(self.centralwidget)
        self.pushButton_load_netstat_timeline.setObjectName(u"pushButton_load_netstat_timeline")
        self.pushButton_load_netstat_timeline.setGeometry(QRect(670, 40, 111, 23))
        self.pushButton_load_proc_timeline = QPushButton(self.centralwidget)
        self.pushButton_load_proc_timeline.setObjectName(u"pushButton_load_proc_timeline")
        self.pushButton_load_proc_timeline.setGeometry(QRect(780, 40, 111, 23))
        self.pushButton_load_proc = QPushButton(self.centralwidget)
        self.pushButton_load_proc.setObjectName(u"pushButton_load_proc")
        self.pushButton_load_proc.setGeometry(QRect(750, 10, 75, 23))
        self.pushButton_load_tasks = QPushButton(self.centralwidget)
        self.pushButton_load_tasks.setObjectName(u"pushButton_load_tasks")
        self.pushButton_load_tasks.setGeometry(QRect(830, 10, 75, 23))
        self.pushButton_load_findevil = QPushButton(self.centralwidget)
        self.pushButton_load_findevil.setObjectName(u"pushButton_load_findevil")
        self.pushButton_load_findevil.setGeometry(QRect(910, 10, 75, 23))
        self.pushButton_load_web_timeline = QPushButton(self.centralwidget)
        self.pushButton_load_web_timeline.setObjectName(u"pushButton_load_web_timeline")
        self.pushButton_load_web_timeline.setGeometry(QRect(890, 40, 111, 23))
        self.pushButton_findrow = QPushButton(self.centralwidget)
        self.pushButton_findrow.setObjectName(u"pushButton_findrow")
        self.pushButton_findrow.setGeometry(QRect(210, 40, 75, 23))
        self.pushButton_unloadmem = QPushButton(self.centralwidget)
        self.pushButton_unloadmem.setObjectName(u"pushButton_unloadmem")
        self.pushButton_unloadmem.setGeometry(QRect(10, 40, 111, 23))
        self.pushButton_withvol2find = QPushButton(self.centralwidget)
        self.pushButton_withvol2find.setObjectName(u"pushButton_withvol2find")
        self.pushButton_withvol2find.setGeometry(QRect(580, 10, 91, 23))
        self.pushButton_withvol2dump = QPushButton(self.centralwidget)
        self.pushButton_withvol2dump.setObjectName(u"pushButton_withvol2dump")
        self.pushButton_withvol2dump.setEnabled(False)
        self.pushButton_withvol2dump.setGeometry(QRect(580, 40, 91, 23))
        self.pushButton_ntfsfind = QPushButton(self.centralwidget)
        self.pushButton_ntfsfind.setObjectName(u"pushButton_ntfsfind")
        self.pushButton_ntfsfind.setGeometry(QRect(500, 40, 75, 23))
        self.pushButton_procdump2gimp = QPushButton(self.centralwidget)
        self.pushButton_procdump2gimp.setObjectName(u"pushButton_procdump2gimp")
        self.pushButton_procdump2gimp.setGeometry(QRect(290, 40, 111, 23))
        MainWindow.setCentralWidget(self.centralwidget)
        self.menubar = QMenuBar(MainWindow)
        self.menubar.setObjectName(u"menubar")
        self.menubar.setGeometry(QRect(0, 0, 1610, 21))
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
        MainWindow.setWindowTitle(QCoreApplication.translate("MainWindow", u"LovelyMem v0.2", None))
        self.actionOpenFile.setText(QCoreApplication.translate("MainWindow", u"\u6253\u5f00", None))
        self.pushButton_loadMem.setText(QCoreApplication.translate("MainWindow", u"\u52a0\u8f7d\u5185\u5b58\u81f3\u78c1\u76d8", None))
        self.pushButton_flush.setText(QCoreApplication.translate("MainWindow", u"\u5237\u65b0\u7ed3\u679c", None))
        self.pushButton_findstr.setText(QCoreApplication.translate("MainWindow", u"\u641c\u7d22\u6587\u4ef6", None))
        self.pushButton_load_netstat.setText(QCoreApplication.translate("MainWindow", u"\u52a0\u8f7dnetstat", None))
        self.pushButton_load_netstat_timeline.setText(QCoreApplication.translate("MainWindow", u"\u52a0\u8f7dnet_timeline", None))
        self.pushButton_load_proc_timeline.setText(QCoreApplication.translate("MainWindow", u"\u52a0\u8f7dproc_timeline", None))
        self.pushButton_load_proc.setText(QCoreApplication.translate("MainWindow", u"\u52a0\u8f7dproc", None))
        self.pushButton_load_tasks.setText(QCoreApplication.translate("MainWindow", u"\u52a0\u8f7dtasks", None))
        self.pushButton_load_findevil.setText(QCoreApplication.translate("MainWindow", u"\u52a0\u8f7dfindevil", None))
        self.pushButton_load_web_timeline.setText(QCoreApplication.translate("MainWindow", u"\u52a0\u8f7dweb_timeline", None))
        self.pushButton_findrow.setText(QCoreApplication.translate("MainWindow", u"\u641c\u7d22\u5b57\u7b26\u4e32", None))
        self.pushButton_unloadmem.setText(QCoreApplication.translate("MainWindow", u"\u5378\u8f7d\u5185\u5b58\u955c\u50cf", None))
        self.pushButton_withvol2find.setText(QCoreApplication.translate("MainWindow", u"vol2\u8054\u5408\u641c\u7d22", None))
        self.pushButton_withvol2dump.setText(QCoreApplication.translate("MainWindow", u"vol2\u5bfc\u51fa\u6587\u4ef6", None))
        self.pushButton_ntfsfind.setText(QCoreApplication.translate("MainWindow", u"Ntfs\u641c\u7d22", None))
        self.pushButton_procdump2gimp.setText(QCoreApplication.translate("MainWindow", u"procdump2gimp", None))
        self.menu.setTitle(QCoreApplication.translate("MainWindow", u"\u6587\u4ef6", None))
    # retranslateUi

