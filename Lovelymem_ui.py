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
    QHeaderView, QLabel, QLineEdit, QMainWindow,
    QMenu, QMenuBar, QPushButton, QSizePolicy,
    QStatusBar, QTabWidget, QTableWidget, QTableWidgetItem,
    QWidget)

class Ui_MainWindow(object):
    def setupUi(self, MainWindow):
        if not MainWindow.objectName():
            MainWindow.setObjectName(u"MainWindow")
        MainWindow.resize(955, 671)
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
        self.tableWidget_find.setGeometry(QRect(10, 120, 931, 511))
        self.tableWidget_find.setRowCount(0)
        self.tableWidget_find.setColumnCount(0)
        self.tableWidget_find.horizontalHeader().setMinimumSectionSize(15)
        self.tableWidget_find.horizontalHeader().setDefaultSectionSize(1000)
        self.tableWidget_find.verticalHeader().setMinimumSectionSize(10)
        self.tableWidget_find.verticalHeader().setDefaultSectionSize(18)
        self.lineEdit_str = QLineEdit(self.centralwidget)
        self.lineEdit_str.setObjectName(u"lineEdit_str")
        self.lineEdit_str.setGeometry(QRect(160, 1, 441, 21))
        self.tabWidget = QTabWidget(self.centralwidget)
        self.tabWidget.setObjectName(u"tabWidget")
        self.tabWidget.setGeometry(QRect(10, 3, 701, 121))
        self.tab = QWidget()
        self.tab.setObjectName(u"tab")
        self.gridLayoutWidget_3 = QWidget(self.tab)
        self.gridLayoutWidget_3.setObjectName(u"gridLayoutWidget_3")
        self.gridLayoutWidget_3.setGeometry(QRect(0, 0, 691, 91))
        self.gridLayout_3 = QGridLayout(self.gridLayoutWidget_3)
        self.gridLayout_3.setObjectName(u"gridLayout_3")
        self.gridLayout_3.setContentsMargins(0, 0, 0, 0)
        self.pushButton_load_proc_timeline = QPushButton(self.gridLayoutWidget_3)
        self.pushButton_load_proc_timeline.setObjectName(u"pushButton_load_proc_timeline")

        self.gridLayout_3.addWidget(self.pushButton_load_proc_timeline, 1, 2, 1, 1)

        self.pushButton_ntfsfind = QPushButton(self.gridLayoutWidget_3)
        self.pushButton_ntfsfind.setObjectName(u"pushButton_ntfsfind")

        self.gridLayout_3.addWidget(self.pushButton_ntfsfind, 2, 2, 1, 1)

        self.pushButton_load_netstat_timeline = QPushButton(self.gridLayoutWidget_3)
        self.pushButton_load_netstat_timeline.setObjectName(u"pushButton_load_netstat_timeline")

        self.gridLayout_3.addWidget(self.pushButton_load_netstat_timeline, 1, 1, 1, 1)

        self.pushButton_services = QPushButton(self.gridLayoutWidget_3)
        self.pushButton_services.setObjectName(u"pushButton_services")
        font = QFont()
        font.setPointSize(8)
        self.pushButton_services.setFont(font)

        self.gridLayout_3.addWidget(self.pushButton_services, 0, 4, 1, 1)

        self.pushButton_load_tasks = QPushButton(self.gridLayoutWidget_3)
        self.pushButton_load_tasks.setObjectName(u"pushButton_load_tasks")

        self.gridLayout_3.addWidget(self.pushButton_load_tasks, 0, 2, 1, 1)

        self.pushButton_findstr = QPushButton(self.gridLayoutWidget_3)
        self.pushButton_findstr.setObjectName(u"pushButton_findstr")

        self.gridLayout_3.addWidget(self.pushButton_findstr, 2, 1, 1, 1)

        self.pushButton_procdump2gimp = QPushButton(self.gridLayoutWidget_3)
        self.pushButton_procdump2gimp.setObjectName(u"pushButton_procdump2gimp")

        self.gridLayout_3.addWidget(self.pushButton_procdump2gimp, 2, 4, 1, 1)

        self.pushButton_load_netstat = QPushButton(self.gridLayoutWidget_3)
        self.pushButton_load_netstat.setObjectName(u"pushButton_load_netstat")

        self.gridLayout_3.addWidget(self.pushButton_load_netstat, 0, 1, 1, 1)

        self.pushButton_load_findevil = QPushButton(self.gridLayoutWidget_3)
        self.pushButton_load_findevil.setObjectName(u"pushButton_load_findevil")

        self.gridLayout_3.addWidget(self.pushButton_load_findevil, 0, 3, 1, 1)

        self.pushButton_load_ntfsfile_timeline = QPushButton(self.gridLayoutWidget_3)
        self.pushButton_load_ntfsfile_timeline.setObjectName(u"pushButton_load_ntfsfile_timeline")

        self.gridLayout_3.addWidget(self.pushButton_load_ntfsfile_timeline, 1, 0, 1, 1)

        self.pushButton_load_web_timeline = QPushButton(self.gridLayoutWidget_3)
        self.pushButton_load_web_timeline.setObjectName(u"pushButton_load_web_timeline")

        self.gridLayout_3.addWidget(self.pushButton_load_web_timeline, 1, 3, 1, 1)

        self.pushButton_loadallfile = QPushButton(self.gridLayoutWidget_3)
        self.pushButton_loadallfile.setObjectName(u"pushButton_loadallfile")

        self.gridLayout_3.addWidget(self.pushButton_loadallfile, 2, 0, 1, 1)

        self.pushButton_load_timeline_registry = QPushButton(self.gridLayoutWidget_3)
        self.pushButton_load_timeline_registry.setObjectName(u"pushButton_load_timeline_registry")
        self.pushButton_load_timeline_registry.setFont(font)

        self.gridLayout_3.addWidget(self.pushButton_load_timeline_registry, 1, 4, 1, 1)

        self.pushButton_load_proc = QPushButton(self.gridLayoutWidget_3)
        self.pushButton_load_proc.setObjectName(u"pushButton_load_proc")

        self.gridLayout_3.addWidget(self.pushButton_load_proc, 0, 0, 1, 1)

        self.pushButton_flush = QPushButton(self.gridLayoutWidget_3)
        self.pushButton_flush.setObjectName(u"pushButton_flush")

        self.gridLayout_3.addWidget(self.pushButton_flush, 2, 3, 1, 1)

        self.tabWidget.addTab(self.tab, "")
        self.tab_2 = QWidget()
        self.tab_2.setObjectName(u"tab_2")
        self.gridLayoutWidget_2 = QWidget(self.tab_2)
        self.gridLayoutWidget_2.setObjectName(u"gridLayoutWidget_2")
        self.gridLayoutWidget_2.setGeometry(QRect(0, 10, 691, 71))
        self.gridLayout_2 = QGridLayout(self.gridLayoutWidget_2)
        self.gridLayout_2.setObjectName(u"gridLayout_2")
        self.gridLayout_2.setContentsMargins(0, 0, 0, 0)
        self.pushButton_withvol2find = QPushButton(self.gridLayoutWidget_2)
        self.pushButton_withvol2find.setObjectName(u"pushButton_withvol2find")

        self.gridLayout_2.addWidget(self.pushButton_withvol2find, 0, 2, 1, 1)

        self.comboBox_profile = QComboBox(self.gridLayoutWidget_2)
        self.comboBox_profile.setObjectName(u"comboBox_profile")

        self.gridLayout_2.addWidget(self.comboBox_profile, 0, 1, 1, 1)

        self.pushButton_vol2 = QPushButton(self.gridLayoutWidget_2)
        self.pushButton_vol2.setObjectName(u"pushButton_vol2")

        self.gridLayout_2.addWidget(self.pushButton_vol2, 0, 0, 1, 1)

        self.pushButton_vol2clipboard = QPushButton(self.gridLayoutWidget_2)
        self.pushButton_vol2clipboard.setObjectName(u"pushButton_vol2clipboard")
        self.pushButton_vol2clipboard.setFont(font)

        self.gridLayout_2.addWidget(self.pushButton_vol2clipboard, 1, 0, 1, 1)

        self.pushButton_withvol2netscan = QPushButton(self.gridLayoutWidget_2)
        self.pushButton_withvol2netscan.setObjectName(u"pushButton_withvol2netscan")

        self.gridLayout_2.addWidget(self.pushButton_withvol2netscan, 1, 1, 1, 1)

        self.pushButton_withvol2dump = QPushButton(self.gridLayoutWidget_2)
        self.pushButton_withvol2dump.setObjectName(u"pushButton_withvol2dump")
        self.pushButton_withvol2dump.setEnabled(True)

        self.gridLayout_2.addWidget(self.pushButton_withvol2dump, 0, 3, 1, 1)

        self.pushButton_vol2editbox = QPushButton(self.gridLayoutWidget_2)
        self.pushButton_vol2editbox.setObjectName(u"pushButton_vol2editbox")

        self.gridLayout_2.addWidget(self.pushButton_vol2editbox, 1, 2, 1, 1)

        self.pushButton_cuscmd = QPushButton(self.gridLayoutWidget_2)
        self.pushButton_cuscmd.setObjectName(u"pushButton_cuscmd")

        self.gridLayout_2.addWidget(self.pushButton_cuscmd, 1, 3, 1, 1)

        self.tabWidget.addTab(self.tab_2, "")
        self.pushButton_findrow = QPushButton(self.centralwidget)
        self.pushButton_findrow.setObjectName(u"pushButton_findrow")
        self.pushButton_findrow.setGeometry(QRect(610, 2, 77, 23))
        self.checkBox_cusHW = QCheckBox(self.centralwidget)
        self.checkBox_cusHW.setObjectName(u"checkBox_cusHW")
        self.checkBox_cusHW.setGeometry(QRect(840, 100, 91, 19))
        self.label = QLabel(self.centralwidget)
        self.label.setObjectName(u"label")
        self.label.setGeometry(QRect(720, 10, 100, 100))
        self.label.setPixmap(QPixmap(u"res/logo_100.png"))
        MainWindow.setCentralWidget(self.centralwidget)
        self.tabWidget.raise_()
        self.tableWidget_find.raise_()
        self.lineEdit_str.raise_()
        self.checkBox_cusHW.raise_()
        self.pushButton_findrow.raise_()
        self.label.raise_()
        self.menubar = QMenuBar(MainWindow)
        self.menubar.setObjectName(u"menubar")
        self.menubar.setGeometry(QRect(0, 0, 955, 21))
        self.menu = QMenu(self.menubar)
        self.menu.setObjectName(u"menu")
        MainWindow.setMenuBar(self.menubar)
        self.statusbar = QStatusBar(MainWindow)
        self.statusbar.setObjectName(u"statusbar")
        MainWindow.setStatusBar(self.statusbar)

        self.menubar.addAction(self.menu.menuAction())
        self.menu.addAction(self.actionOpenFile)
        self.menu.addAction(self.action3)

        self.retranslateUi(MainWindow)

        self.tabWidget.setCurrentIndex(0)


        QMetaObject.connectSlotsByName(MainWindow)
    # setupUi

    def retranslateUi(self, MainWindow):
        MainWindow.setWindowTitle(QCoreApplication.translate("MainWindow", u"LovelyMem v0.5 - https://github.com/Tokeii0/LovelyMem", None))
        self.actionOpenFile.setText(QCoreApplication.translate("MainWindow", u"\u9009\u62e9\u5185\u5b58\u955c\u50cf", None))
        self.action2.setText(QCoreApplication.translate("MainWindow", u"\u52a0\u8f7d\u955c\u50cf", None))
        self.action3.setText(QCoreApplication.translate("MainWindow", u"\u5378\u8f7d\u955c\u50cf", None))
        self.lineEdit_str.setInputMask("")
        self.pushButton_load_proc_timeline.setText(QCoreApplication.translate("MainWindow", u"\u52a0\u8f7dproc_timeline", None))
        self.pushButton_ntfsfind.setText(QCoreApplication.translate("MainWindow", u"Ntfs\u641c\u7d22", None))
        self.pushButton_load_netstat_timeline.setText(QCoreApplication.translate("MainWindow", u"\u52a0\u8f7dnet_timeline", None))
        self.pushButton_services.setText(QCoreApplication.translate("MainWindow", u"\u52a0\u8f7dservices", None))
        self.pushButton_load_tasks.setText(QCoreApplication.translate("MainWindow", u"\u52a0\u8f7dtasks", None))
        self.pushButton_findstr.setText(QCoreApplication.translate("MainWindow", u"\u641c\u7d22\u6587\u4ef6", None))
        self.pushButton_procdump2gimp.setText(QCoreApplication.translate("MainWindow", u"proc2gimp", None))
        self.pushButton_load_netstat.setText(QCoreApplication.translate("MainWindow", u"\u52a0\u8f7dnetstat", None))
        self.pushButton_load_findevil.setText(QCoreApplication.translate("MainWindow", u"\u52a0\u8f7dfindevil", None))
        self.pushButton_load_ntfsfile_timeline.setText(QCoreApplication.translate("MainWindow", u"\u52a0\u8f7dNTFS_timeline", None))
        self.pushButton_load_web_timeline.setText(QCoreApplication.translate("MainWindow", u"\u52a0\u8f7dweb_timeline", None))
        self.pushButton_loadallfile.setText(QCoreApplication.translate("MainWindow", u"\u52a0\u8f7d\u5168\u90e8\u6587\u4ef6", None))
        self.pushButton_load_timeline_registry.setText(QCoreApplication.translate("MainWindow", u"\u52a0\u8f7dtimeline_reg", None))
        self.pushButton_load_proc.setText(QCoreApplication.translate("MainWindow", u"\u52a0\u8f7dproc", None))
        self.pushButton_flush.setText(QCoreApplication.translate("MainWindow", u"\u57fa\u672c\u4fe1\u606f", None))
        self.tabWidget.setTabText(self.tabWidget.indexOf(self.tab), QCoreApplication.translate("MainWindow", u"\u57fa\u7840\u529f\u80fd", None))
        self.pushButton_withvol2find.setText(QCoreApplication.translate("MainWindow", u"findscan", None))
        self.pushButton_vol2.setText(QCoreApplication.translate("MainWindow", u"\u6267\u884cVOL2", None))
        self.pushButton_vol2clipboard.setText(QCoreApplication.translate("MainWindow", u"clipboard", None))
        self.pushButton_withvol2netscan.setText(QCoreApplication.translate("MainWindow", u"netscan", None))
        self.pushButton_withvol2dump.setText(QCoreApplication.translate("MainWindow", u"dumpfile", None))
        self.pushButton_vol2editbox.setText(QCoreApplication.translate("MainWindow", u"editbox", None))
        self.pushButton_cuscmd.setText(QCoreApplication.translate("MainWindow", u"\u81ea\u5b9a\u4e49\u547d\u4ee4", None))
        self.tabWidget.setTabText(self.tabWidget.indexOf(self.tab_2), QCoreApplication.translate("MainWindow", u"Vol2\u9644\u52a0", None))
        self.pushButton_findrow.setText(QCoreApplication.translate("MainWindow", u"\u641c\u7d22\u5b57\u7b26\u4e32", None))
        self.checkBox_cusHW.setText(QCoreApplication.translate("MainWindow", u"\u81ea\u5b9a\u4e49\u5217\u5bbd", None))
        self.label.setText("")
        self.menu.setTitle(QCoreApplication.translate("MainWindow", u"\u6587\u4ef6", None))
    # retranslateUi

