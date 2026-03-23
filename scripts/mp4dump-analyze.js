#!/usr/bin/env node

import { promises as fs } from 'node:fs';
import { join, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { exec, spawn } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 支持的视频格式扩展名
const VIDEO_EXTENSIONS = new Set([
  '.mp4', '.m4v', '.mov', '.3gp'
]);

/**
 * 检查文件是否是 MP4 相关视频文件
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
 * 使用 spawn 调用 mp4dump（支持中文路径）
 */
async function runMp4dump(videoPath) {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';

    // 使用 spawn 而不是 exec，避免 shell 解析问题
    const mp4dump = spawn('rtk', ['mp4dump.exe', videoPath], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    mp4dump.stdout.on('data', (data) => {
      stdout += data.toString('utf-8');
    });

    mp4dump.stderr.on('data', (data) => {
      stderr += data.toString('utf-8');
    });

    mp4dump.on('close', (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(`mp4dump exited with code ${code}: ${stderr}`));
      }
    });

    mp4dump.on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * 使用 mp4dump 分析视频并保存输出
 */
async function mp4dumpVideo(videoPath, outputDir) {
  try {
    const videoName = basename(videoPath);
    const baseName = videoName.slice(0, videoName.lastIndexOf('.'));
    const cleanBaseName = baseName.replace(/[<>:"/\\|?*:]/g, '_');

    // 使用 spawn 调用 mp4dump（支持中文路径）
    const stdout = await runMp4dump(videoPath);

    // 解析 mp4dump 输出，判断 moov 位置
    const moovPosition = detectMoovPosition(stdout);

    // 生成输出文件名
    const outputFileName = `${cleanBaseName}_${moovPosition}.txt`;
    const outputPath = join(outputDir, outputFileName);

    // 写入 mp4dump 的完整输出
    await fs.writeFile(outputPath, stdout, 'utf-8');

    return {
      success: true,
      message: `成功生成: ${outputFileName}`,
      outputFile: outputPath,
      moovPosition
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
 * 从 mp4dump 输出中检测 moov 位置
 * @param {string} mp4dumpOutput - mp4dump 的输出内容
 * @returns {'moovfront' | 'moovback'}
 */
function detectMoovPosition(mp4dumpOutput) {
  const lines = mp4dumpOutput.split('\n');
  let moovFound = false;
  let mdatFound = false;
  let moovIndex = -1;
  let mdatIndex = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // 查找 moov 原子
    if (line.includes('moov') && !line.includes('moov') === false) {
      // 检查是否是原子类型行（通常格式类似 "[moov] size=..." 或 "type=moov"）
      if (/^\[?moov\]?|^type\s*=\s*moov/i.test(line) || /\[moov\]/.test(line)) {
        moovFound = true;
        moovIndex = i;
      }
    }

    // 查找 mdat 原子
    if (/^\[?mdat\]?|^type\s*=\s*mdat/i.test(line) || /\[mdat\]/.test(line)) {
      mdatFound = true;
      mdatIndex = i;
    }
  }

  // 如果找到了 moov 和 mdat，比较它们的位置
  if (moovFound && mdatFound && moovIndex !== -1 && mdatIndex !== -1) {
    return moovIndex < mdatIndex ? 'moovfront' : 'moovback';
  }

  // 如果只找到 mdat，说明 moov 可能在后面
  if (mdatFound && !moovFound) {
    return 'moovback';
  }

  // 默认认为是 moovfront（比较安全的选择）
  return 'moovfront';
}

/**
 * 主函数
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error('用法: node mp4dump-analyze.js <视频目录路径> [输出目录路径]');
    console.error('示例: node mp4dump-analyze.js /path/to/videos /path/to/output');
    console.error('  如果未指定输出目录，默认输出到输入目录');
    process.exit(1);
  }

  const inputDir = args[0];
  const outputDir = args[1] || inputDir;

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
  console.log('开始使用 mp4dump 分析视频...\n');

  // 处理每个视频文件
  let successCount = 0;
  let failCount = 0;
  let moovFrontCount = 0;
  let moovBackCount = 0;
  const failedVideos = []; // 记录失败的视频文件

  for (const videoFile of videoFiles) {
    const result = await mp4dumpVideo(videoFile, outputDir);
    console.log(result.message);

    if (result.success) {
      successCount++;
      if (result.moovPosition === 'moovfront') {
        moovFrontCount++;
      } else {
        moovBackCount++;
      }
    } else {
      failCount++;
      // 记录失败文件
      failedVideos.push({
        fileName: basename(videoFile),
        fullPath: videoFile,
        error: result.message
      });
    }
  }

  // 如果有失败文件，记录到日志
  if (failedVideos.length > 0) {
    const failedLogPath = join(outputDir, 'failed_videos.log');
    const logContent = failedVideos.map((video, index) => {
      return `${index + 1}. ${video.fileName}
   路径: ${video.fullPath}
   错误信息: ${video.error}`;
    }).join('\n\n');

    const header = `处理失败的视频文件列表\n`;
    const footer = `\n总计: ${failedVideos.length} 个文件\n生成时间: ${new Date().toLocaleString('zh-CN')}`;

    await fs.writeFile(failedLogPath, header + logContent + footer, 'utf-8');
    console.log(`\n⚠️  发现 ${failedVideos.length} 个处理失败的视频,已记录到: ${failedLogPath}`);
  }

  // 输出统计信息
  console.log('\n处理完成:');
  console.log(`  成功: ${successCount}`);
  console.log(`  失败: ${failCount}`);
  console.log(`  总计: ${videoFiles.length}`);
  console.log(`  moovfront: ${moovFrontCount}`);
  console.log(`  moovback: ${moovBackCount}`);
}

// 运行主函数
main().catch((error) => {
  console.error('发生错误:', error);
  process.exit(1);
});
