"""
Author: longmo
Date: 2026-03-23 23:40:53
LastEditTime: 2026-03-23 23:40:58
FilePath: scripts/check_moov.py
Description:
"""
# check_moov.py
import sys

def is_moov_at_start(filename):
    with open(filename, 'rb') as f:
        header = f.read(1024)  # 读前 1KB
        # 查找 'moov' 是否出现在 'ftyp' 之后、'mdat' 之前
        ftyp_pos = header.find(b'ftyp')
        moov_pos = header.find(b'moov')
        mdat_pos = header.find(b'mdat')
        if moov_pos != -1 and (mdat_pos == -1 or moov_pos < mdat_pos):
            return True
        return False

if __name__ == "__main__":
    if is_moov_at_start(sys.argv[1]):
        print("moov 在开头（支持 faststart）")
    else:
        print("moov 在末尾（不支持 faststart）")
