
import pandas as pd
import sys,os,re
import config
import subprocess

def volfindscan(str, mempath):
    regpath = r"M:\registry\HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\BuildLabEx.txt"
    data = open(regpath, 'r',encoding='utf-8').readlines()
    newdata = data[2].split('.')
    str1 = newdata[3].split('_')[0]
    str1 = str1.replace('w', 'W').replace('sp', 'SP').replace('xp', 'XP')
    if '64' in newdata[2]:
        str2 = 'x64'
    else:
        str2 = 'x86'
    profile = str1 + str2
    cmd = config.volatility2 + " -f " + mempath + " --profile=" + profile + " filescan | findstr " + str
    print(cmd)
    p = subprocess.Popen(cmd, shell=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    p.wait()
    out = p.stdout.readlines()
    return out[1:]


