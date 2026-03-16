#!/usr/bin/env node

import { promises as fs } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import mediaInfoFactory from 'mediainfo.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 支持的视频格式扩展名
const VIDEO_EXTENSIONS = new Set([
  '.mp4', '.avi', '.mov', '.mkv', '.flv', '.wmv', '.webm',
  '.m4v', '.3gp', '.ts', '.mts', '.m2ts', '.vob', '.ogv',
  '.asf', '.rm', '.rmvb', '.divx', '.xvid', '.f4v'
]);

/**
 * 检查文件是否是视频文件
 */
function isVideoFile(filename) {
  const ext = filename.toLowerCase().slice(filename.lastIndexOf('.'));
  return VIDEO_EXTENSIONS.has(ext);
}

/**
 * 递归获取目录中的所有视频文件
 */
async function getVideoFiles(dirPath) {
  const videoFiles = [];

  async function traverse(currentPath) {
    const entries = await fs.readdir(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(currentPath, entry.name);

      if (entry.isDirectory()) {
        await traverse(fullPath);
      } else if (entry.isFile() && isVideoFile(entry.name)) {
        videoFiles.push(fullPath);
      }
    }
  }

  await traverse(dirPath);
  return videoFiles;
}

/**
 * 格式化时长为 HH:MM:SS 格式
 */
function formatDuration(durationMs) {
  const totalSeconds = Math.floor(durationMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/**
 * 提取视频信息
 */
async function analyzeVideoFile(filePath, mediainfo) {
  const readChunk = async (size, offset) => {
    const buffer = new Uint8Array(size);
    const fileHandle = await fs.open(filePath, 'r');
    try {
      await fileHandle.read(buffer, 0, size, offset);
    } finally {
      await fileHandle.close();
    }
    return buffer;
  };

  const stat = await fs.stat(filePath);
  const fileSize = stat.size;

  const result = await mediainfo.analyzeData(() => fileSize, readChunk);

  if (!result || !result.media || !result.media.track) {
    throw new Error(`无法解析视频文件: ${filePath}`);
  }

  const tracks = result.media.track;
  const generalTrack = tracks.find((t) => t['@type'] === 'General');
  const videoTrack = tracks.find((t) => t['@type'] === 'Video');
  const audioTrack = tracks.find((t) => t['@type'] === 'Audio');

  // 获取时长（毫秒）
  let duration = 0;
  if (generalTrack) {
    const durationStr = generalTrack.Duration || generalTrack.Duration_String3 || generalTrack.Duration_String2 || generalTrack.Duration_String1;

    if (typeof durationStr === 'string') {
      // 尝试解析时长字符串
      const parts = durationStr.split(/[:.]/).map(Number);
      if (parts.length >= 3) {
        duration = (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;
      } else if (parts.length === 2) {
        duration = (parts[0] * 60 + parts[1]) * 1000;
      }
    } else if (typeof durationStr === 'number') {
      duration = durationStr * 1000;
    }
  }

  // 如果没有找到时长，尝试从视频轨道获取
  if (duration === 0 && videoTrack) {
    const videoDurationStr = videoTrack.Duration || videoTrack.Duration_String3 || videoTrack.Duration_String2 || videoTrack.Duration_String1;

    if (typeof videoDurationStr === 'string') {
      const parts = videoDurationStr.split(/[:.]/).map(Number);
      if (parts.length >= 3) {
        duration = (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;
      } else if (parts.length === 2) {
        duration = (parts[0] * 60 + parts[1]) * 1000;
      }
    } else if (typeof videoDurationStr === 'number') {
      duration = videoDurationStr * 1000;
    }
  }

  // 如果还是没有找到时长，尝试从音频轨道获取
  if (duration === 0 && audioTrack) {
    const audioDurationStr = audioTrack.Duration || audioTrack.Duration_String3 || audioTrack.Duration_String2 || audioTrack.Duration_String1;

    if (typeof audioDurationStr === 'string') {
      const parts = audioDurationStr.split(/[:.]/).map(Number);
      if (parts.length >= 3) {
        duration = (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;
      } else if (parts.length === 2) {
        duration = (parts[0] * 60 + parts[1]) * 1000;
      }
    } else if (typeof audioDurationStr === 'number') {
      duration = audioDurationStr * 1000;
    }
  }

  // 如果还是没有找到时长，尝试从General Track的extra字段获取
  // 注意：mediainfo.js 对某些格式的时长解析支持不完整，extra.duration 可能不准确
  // 如果 extra.duration 存在，我们还是不使用它，因为可能不准确
  // 保持 duration = 0，这样文件名会显示 00_00

  // 如果没有找到时长，尝试从视频轨道获取
  if (duration === 0 && videoTrack) {
    const durationStr = videoTrack.Duration || videoTrack.Duration_String3;
    if (typeof durationStr === 'number') {
      duration = durationStr * 1000;
    }
  }

  // 获取格式
  const format = generalTrack?.Format || generalTrack?.FileExtension || 'Unknown';

  // 获取视频编码
  const videoCodec = videoTrack?.Format || videoTrack?.CodecID || 'Unknown';

  // 获取音频编码
  const audioCodec = audioTrack?.Format || audioTrack?.CodecID;

  // 获取分辨率
  const width = videoTrack?.Width;
  const height = videoTrack?.Height;

  // 获取比特率
  const bitrate = generalTrack?.OverallBitRate || generalTrack?.BitRate;

  return {
    duration,
    durationFormatted: formatDuration(duration),
    format,
    videoCodec,
    audioCodec,
    width,
    height,
    bitrate,
    fileSize
  };
}

/**
 * 生成输出文件名
 */
function generateOutputFileName(videoPath, info) {
  const videoName = videoPath.split(/[\\/]/).pop() || 'video';
  const baseName = videoName.slice(0, videoName.lastIndexOf('.'));

  // 清理特殊字符，包括冒号
  const cleanBaseName = baseName.replace(/[<>:"/\\|?*:]/g, '_');
  const cleanFormat = info.format.replace(/[<>:"/\\|?*:]/g, '_');
  const cleanCodec = info.videoCodec.replace(/[<>:"/\\|?*:]/g, '_');
  const cleanDuration = info.durationFormatted.replace(/:/g, '_');

  return `${cleanBaseName}_mediainfo_${cleanDuration}_${cleanFormat}__${cleanCodec}.txt`;
}

/**
 * 处理视频文件
 */
async function processVideoFile(videoPath, outputDir, mediainfo) {
  try {
    console.log(`正在分析: ${videoPath}`);

    // 获取视频信息
    const videoInfo = await analyzeVideoFile(videoPath, mediainfo);

    // 生成输出文件名
    const outputFileName = generateOutputFileName(videoPath, videoInfo);
    const outputPath = join(outputDir, outputFileName);

    // 使用 text 格式获取完整信息
    const textMediainfo = await mediaInfoFactory({ format: 'text' });
    const readChunk = async (size, offset) => {
      const buffer = new Uint8Array(size);
      const fileHandle = await fs.open(videoPath, 'r');
      try {
        await fileHandle.read(buffer, 0, size, offset);
      } finally {
        await fileHandle.close();
      }
      return buffer;
    };

    const fileInfo = await fs.stat(videoPath);
    const fullInfo = await textMediainfo.analyzeData(() => fileInfo.size, readChunk);

    // 写入文件
    await fs.writeFile(outputPath, fullInfo, 'utf-8');
    textMediainfo.close();

    return {
      success: true,
      message: `成功生成: ${outputFileName}`,
      outputFile: outputPath,
      videoInfo: videoInfo
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      message: `处理失败 ${videoPath}: ${errorMessage}`
    };
  }
}

/**
 * 主函数
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error('用法: node process-videos.js <视频目录路径> [输出目录路径]');
    console.error('示例: node process-videos.js /path/to/videos /path/to/output');
    process.exit(1);
  }

  const inputDir = args[0];
  const outputDir = args[1] || inputDir; // 默认输出到同一目录

  // 检查输入目录是否存在
  if (!existsSync(inputDir)) {
    console.error(`错误: 输入目录不存在: ${inputDir}`);
    process.exit(1);
  }

  // 创建输出目录（如果不存在）
  try {
    await fs.mkdir(outputDir, { recursive: true });
  } catch (error) {
    console.error(`错误: 无法创建输出目录 ${outputDir}:`, error);
    process.exit(1);
  }

  console.log(`开始扫描目录: ${inputDir}`);

  // 获取所有视频文件
  const videoFiles = await getVideoFiles(inputDir);

  if (videoFiles.length === 0) {
    console.log('未找到任何视频文件');
    return;
  }

  console.log(`找到 ${videoFiles.length} 个视频文件`);
  console.log('开始分析视频...\n');

  // 创建 MediaInfo 实例
  let mediainfo = null;
  try {
    mediainfo = await mediaInfoFactory({ format: 'object' });
  } catch (error) {
    console.error('错误: 无法初始化 MediaInfo:', error);
    process.exit(1);
  }

  // 处理每个视频文件
  let successCount = 0;
  let failCount = 0;
  const noDurationVideos = []; // 记录无法获取时长的视频

  for (const videoFile of videoFiles) {
    const result = await processVideoFile(videoFile, outputDir, mediainfo);
    console.log(result.message);

    if (result.success) {
      successCount++;
      // 检查是否无法获取时长
      if (result.videoInfo && result.videoInfo.duration === 0) {
        noDurationVideos.push({
          fileName: videoFile.split(/[\\/]/).pop(),
          fullPath: videoFile,
          format: result.videoInfo.format,
          videoCodec: result.videoInfo.videoCodec
        });
      }
    } else {
      failCount++;
    }
  }

  // 清理
  if (mediainfo) {
    mediainfo.close();
  }

  // 如果有无法获取时长的视频,记录到文件
  if (noDurationVideos.length > 0) {
    const noDurationLogPath = join(outputDir, 'no_duration_videos_by_mediainfo.log');
    const logContent = noDurationVideos.map((video, index) => {
      return `${index + 1}. ${video.fileName}
   路径: ${video.fullPath}
   格式: ${video.format}
   编码: ${video.videoCodec}`;
    }).join('\n\n');

    const header = `无法获取播放时长的视频文件列表\n`;
    const footer = `\n总计: ${noDurationVideos.length} 个文件\n生成时间: ${new Date().toLocaleString('zh-CN')}`;

    await fs.writeFile(noDurationLogPath, header + logContent + footer, 'utf-8');
    console.log(`\n⚠️  发现 ${noDurationVideos.length} 个无法获取时长的视频,已记录到: ${noDurationLogPath}`);
  }

  // 输出统计信息
  console.log('\n处理完成:');
  console.log(`  成功: ${successCount}`);
  console.log(`  失败: ${failCount}`);
  console.log(`  总计: ${videoFiles.length}`);

  if (noDurationVideos.length > 0) {
    console.log(`  ⚠️  无法获取时长: ${noDurationVideos.length}`);
  }
}

// 运行主函数
main().catch((error) => {
  console.error('发生错误:', error);
  process.exit(1);
});
