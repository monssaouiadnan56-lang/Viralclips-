import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import path from 'path';

// Usar require() en runtime para que Next.js NO incruste la ruta durante el build.
// Con import estático, Next.js serializa el string de ruta apuntando a .next/vendor-chunks/
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ffmpegBinaryPath: string = require('ffmpeg-static');

if (!ffmpegBinaryPath) {
  throw new Error('ffmpeg-static: no se encontró el binario de FFmpeg');
}
ffmpeg.setFfmpegPath(ffmpegBinaryPath);
console.log('🔧 Using FFmpeg at:', ffmpegBinaryPath);

// Extracts audio as mp3 at 64kbps — a 12-min video becomes ~5MB, well under Whisper's 25MB limit.
export async function extractAudio(videoPath: string, audioPath: string): Promise<void> {
  if (!fs.existsSync(videoPath)) {
    throw new Error(`Video no encontrado para extraer audio: ${videoPath}`);
  }
  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .noVideo()
      .audioCodec('libmp3lame')
      .audioBitrate('64k')
      .output(audioPath)
      .on('end', () => {
        const mb = (fs.statSync(audioPath).size / (1024 * 1024)).toFixed(1);
        console.log(`🎵 Audio extraído: ${audioPath} (${mb} MB)`);
        resolve();
      })
      .on('error', (err: Error) => {
        console.error('❌ FFmpeg error extrayendo audio:', err.message);
        reject(err);
      })
      .run();
  });
}

export interface ClipSegment {
  startTime: number;
  endTime: number;
  title: string;
  subtitlePath?: string;
}

export async function createVideoClip(
  inputPath: string,
  outputPath: string,
  segment: ClipSegment
): Promise<string> {
  if (!fs.existsSync(inputPath)) {
    throw new Error(`Archivo de entrada no encontrado: ${inputPath}`);
  }

  return new Promise((resolve, reject) => {
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const duration = segment.endTime - segment.startTime;

    console.log(`🎬 Creando clip: "${segment.title}"`);
    console.log(`   Input:    ${inputPath}`);
    console.log(`   Output:   ${outputPath}`);
    console.log(`   Rango:    ${segment.startTime}s → ${segment.endTime}s (${duration}s)`);

    const cmd = ffmpeg(inputPath)
      .setStartTime(segment.startTime)
      .setDuration(duration)
      .outputOptions(['-metadata', `title=${segment.title}`]);

    if (segment.subtitlePath) {
      // Hardcode subtitles into the video using the "light" style:
      // white text, thin black outline, no background box, bottom-center.
      const escaped = escapeSubtitlePath(segment.subtitlePath);
      const style = [
        'FontSize=18',
        'FontName=Arial',
        'PrimaryColour=&H00FFFFFF&',
        'OutlineColour=&H00000000&',
        'Outline=1',
        'Shadow=0',
        'BorderStyle=1',
        'Alignment=2',
        'MarginV=40',
      ].join(',');
      cmd.videoFilters(`subtitles='${escaped}':force_style='${style}'`);
      console.log(`   📝 Subtítulos: ${segment.subtitlePath}`);
    }

    cmd
      .output(outputPath)
      .on('end', () => {
        console.log(`✅ Clip creado: ${outputPath}`);
        resolve(outputPath);
      })
      .on('error', (err: Error) => {
        console.error(`❌ FFmpeg error para "${segment.title}":`, err.message);
        reject(err);
      })
      .run();
  });
}

// FFmpeg's subtitles filter requires special escaping on Windows:
// backslashes → forward slashes, colons in drive letters → escaped.
function escapeSubtitlePath(filePath: string): string {
  return filePath
    .replace(/\\/g, '/')
    .replace(/:/g, '\\:');
}
