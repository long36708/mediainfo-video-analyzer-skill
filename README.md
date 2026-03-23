# Mediainfo Video Skill

这个 skill 提供了使用 mediainfo.js 批量分析视频文件并生成详细信息报告的功能。

## 功能特性

- 批量分析目录中的视频文件
- 递归扫描子目录
- 自动识别多种视频格式 (MP4, AVI, MOV, MKV, FLV, WMV, WebM 等)
- 提取视频技术参数 (时长、格式、编码格式、分辨率、比特率等)
- 生成标准化的 .txt 信息报告文件
- 文件命名规则: `{视频名称}_mediainfo_{时长}_{封装格式}__{视频编码格式}.txt`

## 前置要求

确保已安装 mediainfo.js:

```bash
pnpm install mediainfo.js 
```

## 使用方法

### 基本用法

处理指定目录下的视频文件,在原目录生成信息报告:

```bash
node scripts/process-videos.js /path/to/videos
```

### 指定输出目录

处理视频并将信息报告输出到指定目录:

```bash
node scripts/process-videos.js /path/to/videos /path/to/output
```

### Windows 示例

```bash
node scripts/process-videos.js C:/Videos C:/VideoInfo
```

## 输出示例

生成的 .txt 文件命名示例:

- `myvideo_mediainfo_00_05_30_mp4__h264.txt`
- `movie_clip_mediainfo_01_23_45_mkv__hevc.txt`
- `recording_mediainfo_02_10_00_mp4__avc.txt`

文件名格式说明:
- `{视频名称}_mediainfo_{时分秒}_{封装格式}__{视频编码格式}.txt`
- 时长格式: HH_MM_SS 或 MM_SS (小时:分钟:秒 或 分钟:秒)
- 特殊字符(包括冒号)会被自动替换为下划线,确保文件名合法
- 封装格式和视频编码格式之间使用双下划线分隔

每个 .txt 文件包含完整的视频信息,包括:
- 通用信息 (文件大小、时长、格式、比特率)
- 视频轨道 (编码格式、分辨率、帧率、宽高比)
- 音频轨道 (编码格式、采样率、声道数)
- 元数据标签 (如果存在)

## 支持的视频格式

脚本会自动识别以下格式的视频文件:

- MP4, AVI, MOV, MKV, FLV, WMV, WebM
- M4V, 3GP, TS, MTS, M2TS, VOB, OGV
- ASF, RM, RMVB, DIVX, XVID, F4V

## 错误处理

脚本包含完善的错误处理机制:
- 验证输入目录是否存在
- 自动创建输出目录
- 对每个失败的文件提供详细的错误信息
- 完成后显示处理统计信息 (成功/失败数量)
- 自动记录无法获取播放时长的视频文件到 `no_duration_videos_by_mediainfo.log`

## 注意事项

- 需要的 Node.js 版本: 18+
- 脚本需要读取视频文件的完整内容进行分析
- 大文件处理可能需要较长时间
- 输出文件名中的特殊字符(包括冒号)会被自动替换为下划线,确保跨平台兼容性
- 时长字段从视频的 General 轨道的 `Duration` 字段获取(单位:秒)
- mediainfo.js 对某些视频格式(如 FLV)的时长解析支持不完整,这些文件会被记录到 `no_duration_videos.log` 中

## Skill 包

此 skill 已打包为 `mediainfo-video.zip`,可以直接安装使用。

## 技术实现

脚本使用 mediainfo.js WebAssembly 库:
- 首先使用 object 格式提取元数据 (时长、格式、编码)
- 然后使用 text 格式生成详细的技术信息报告
- 支持分块读取大文件
- 自动清理资源
