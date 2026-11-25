import { execFile } from "child_process";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { promisify } from "util";

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMP_BASE_DIR = path.resolve(__dirname, "data/tmp");

fs.mkdirSync(TEMP_BASE_DIR, { recursive: true });

export const SUPPORTED_CONVERTIBLE_AUDIO_EXTENSIONS = new Set([
  ".wav",
  ".mp3",
  ".m4a",
  ".aac",
  ".ogg",
  ".flac",
  ".webm",
]);

export interface MediaProbeInfo {
  durationSec: number;
  formatName: string;
  audioCodec?: string;
  sampleRate?: number;
  channels?: number;
  videoCodec?: string;
  width?: number;
  height?: number;
  fps?: number;
}

export interface FfmpegStatus {
  available: boolean;
  ffmpegVersion: string | null;
  ffprobeAvailable: boolean;
}

function confineTempPath(filename: string): string {
  const safeBase = path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, "_");
  const resolved = path.resolve(TEMP_BASE_DIR, safeBase);
  if (!resolved.startsWith(TEMP_BASE_DIR + path.sep)) {
    throw new Error("Unsafe temporary file path detected.");
  }
  return resolved;
}

export async function checkFfmpegStatus(): Promise<FfmpegStatus> {
  try {
    const { stdout } = await execFileAsync("ffmpeg", ["-version"], { timeout: 5000 });
    const firstLine = stdout.split(/\r?\n/)[0]?.trim() || "ffmpeg available";
    let ffprobeAvailable = false;
    try {
      await execFileAsync("ffprobe", ["-version"], { timeout: 5000 });
      ffprobeAvailable = true;
    } catch {
      ffprobeAvailable = false;
    }
    return {
      available: true,
      ffmpegVersion: firstLine,
      ffprobeAvailable,
    };
  } catch {
    return {
      available: false,
      ffmpegVersion: null,
      ffprobeAvailable: false,
    };
  }
}

function parseFraction(rateStr: string | undefined): number | undefined {
  if (!rateStr) return undefined;
  const parts = rateStr.split("/");
  if (parts.length === 2) {
    const num = Number(parts[0]);
    const den = Number(parts[1]);
    if (Number.isFinite(num) && Number.isFinite(den) && den > 0) {
      return Math.round((num / den) * 100) / 100;
    }
  }
  const n = Number(rateStr);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export async function probeMediaBuffer(buffer: Buffer, ext: string): Promise<MediaProbeInfo> {
  const id = crypto.randomUUID();
  const safeExt = ext.startsWith(".") ? ext.toLowerCase() : `.${ext.toLowerCase()}`;
  const inputPath = confineTempPath(`probe_${id}${safeExt}`);

  try {
    await fs.promises.writeFile(inputPath, buffer);
    const { stdout } = await execFileAsync(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_format",
        "-show_streams",
        "-of",
        "json",
        inputPath,
      ],
      { timeout: 15000, maxBuffer: 2 * 1024 * 1024 },
    );
    const parsed = JSON.parse(stdout) as {
      format?: { duration?: string; format_name?: string };
      streams?: Array<{
        codec_type?: string;
        codec_name?: string;
        sample_rate?: string;
        channels?: number;
        width?: number;
        height?: number;
        avg_frame_rate?: string;
        r_frame_rate?: string;
        duration?: string;
      }>;
    };

    const audioStream = parsed.streams?.find((s) => s.codec_type === "audio");
    const videoStream = parsed.streams?.find((s) => s.codec_type === "video");
    const durationRaw =
      Number(parsed.format?.duration) ||
      Number(videoStream?.duration) ||
      Number(audioStream?.duration) ||
      0;

    return {
      durationSec: Number.isFinite(durationRaw) ? Math.round(durationRaw * 1000) / 1000 : 0,
      formatName: parsed.format?.format_name || safeExt.replace(".", ""),
      audioCodec: audioStream?.codec_name,
      sampleRate: audioStream?.sample_rate ? Number(audioStream.sample_rate) : undefined,
      channels: audioStream?.channels,
      videoCodec: videoStream?.codec_name,
      width: videoStream?.width,
      height: videoStream?.height,
      fps: parseFraction(videoStream?.avg_frame_rate) || parseFraction(videoStream?.r_frame_rate),
    };
  } finally {
    await fs.promises.unlink(inputPath).catch(() => {});
  }
}

export async function convertAudioBufferTo16kMonoWav(params: {
  buffer: Buffer;
  originalExt: string;
}): Promise<{
  wavBuffer: Buffer;
  probe: MediaProbeInfo;
  convertedProbe: MediaProbeInfo;
}> {
  const ffStatus = await checkFfmpegStatus();
  if (!ffStatus.available || !ffStatus.ffprobeAvailable) {
    throw Object.assign(
      new Error(
        "FFmpeg/FFprobe is not installed or unavailable on the server. " +
          "Install FFmpeg (e.g. apt-get install ffmpeg or brew install ffmpeg) to convert non-WAV audio formats to 16 kHz mono WAV.",
      ),
      { status: 503 },
    );
  }

  const ext = params.originalExt.toLowerCase();
  if (!SUPPORTED_CONVERTIBLE_AUDIO_EXTENSIONS.has(ext)) {
    throw Object.assign(
      new Error(
        `Unsupported audio format '${ext || "unknown"}'. Supported formats: ${Array.from(SUPPORTED_CONVERTIBLE_AUDIO_EXTENSIONS).sort().join(", ")}.`,
      ),
      { status: 400 },
    );
  }

  const probe = await probeMediaBuffer(params.buffer, ext);
  if (!probe.audioCodec) {
    throw Object.assign(new Error("Uploaded file does not contain a decodable audio stream."), {
      status: 400,
    });
  }
  if (probe.durationSec > 0 && probe.durationSec < 0.5) {
    throw Object.assign(
      new Error(`Audio duration (${probe.durationSec}s) is too short. Minimum required is 0.5s.`),
      { status: 400 },
    );
  }
  if (probe.durationSec > 300) {
    throw Object.assign(
      new Error(`Audio duration (${probe.durationSec}s) exceeds maximum allowed 300 seconds.`),
      { status: 400 },
    );
  }

  const id = crypto.randomUUID();
  const inPath = confineTempPath(`conv_in_${id}${ext}`);
  const outPath = confineTempPath(`conv_out_${id}.wav`);

  try {
    await fs.promises.writeFile(inPath, params.buffer);
    await execFileAsync(
      "ffmpeg",
      [
        "-y",
        "-i",
        inPath,
        "-vn",
        "-ac",
        "1",
        "-ar",
        "16000",
        "-c:a",
        "pcm_s16le",
        "-f",
        "wav",
        outPath,
      ],
      { timeout: 30000, maxBuffer: 4 * 1024 * 1024 },
    );

    const wavBuffer = await fs.promises.readFile(outPath);
    if (
      wavBuffer.length < 44 ||
      wavBuffer.toString("ascii", 0, 4) !== "RIFF" ||
      wavBuffer.toString("ascii", 8, 12) !== "WAVE"
    ) {
      throw Object.assign(new Error("Converted WAV validation failed: invalid RIFF/WAVE header."), {
        status: 500,
      });
    }

    const convertedProbe = await probeMediaBuffer(wavBuffer, ".wav");
    if (convertedProbe.sampleRate !== 16000 || convertedProbe.channels !== 1) {
      throw Object.assign(
        new Error("Converted WAV validation failed: output did not match 16 kHz mono PCM."),
        { status: 500 },
      );
    }

    return { wavBuffer, probe, convertedProbe };
  } catch (err) {
    if (err && typeof err === "object" && "status" in err) {
      throw err;
    }
    throw Object.assign(
      new Error(
        `Audio conversion to WAV failed: ${err instanceof Error ? err.message : "unknown FFmpeg error"}`,
      ),
      { status: 400 },
    );
  } finally {
    await fs.promises.unlink(inPath).catch(() => {});
    await fs.promises.unlink(outPath).catch(() => {});
  }
}

export async function inspectAndNormalizeVideoBuffer(params: {
  buffer: Buffer;
  originalExt: string;
  maxDurationSec: number;
}): Promise<{
  probe: MediaProbeInfo;
  transcodedFromWebm: boolean;
}> {
  const ffStatus = await checkFfmpegStatus();
  if (!ffStatus.available || !ffStatus.ffprobeAvailable) {
    // Fallback if ffmpeg not available
    return {
      probe: {
        durationSec: Math.min(params.maxDurationSec, 8.0),
        formatName: params.originalExt.replace(".", ""),
        width: 1280,
        height: 720,
        fps: 30,
      },
      transcodedFromWebm: false,
    };
  }

  const probe = await probeMediaBuffer(params.buffer, params.originalExt);
  if (!probe.videoCodec) {
    throw Object.assign(new Error("Uploaded file does not contain a readable video stream."), {
      status: 400,
    });
  }

  let effectiveDuration = probe.durationSec;
  let transcodedFromWebm = false;

  // MediaRecorder WebM streams sometimes omit container duration in headers; remux/inspect via ffmpeg if needed
  if (params.originalExt.toLowerCase() === ".webm" || effectiveDuration <= 0) {
    const id = crypto.randomUUID();
    const inPath = confineTempPath(`vid_in_${id}${params.originalExt.toLowerCase()}`);
    const outPath = confineTempPath(`vid_out_${id}.mp4`);
    try {
      await fs.promises.writeFile(inPath, params.buffer);
      await execFileAsync(
        "ffmpeg",
        [
          "-y",
          "-i",
          inPath,
          "-an",
          "-c:v",
          "libx264",
          "-preset",
          "ultrafast",
          "-pix_fmt",
          "yuv420p",
          "-movflags",
          "+faststart",
          outPath,
        ],
        { timeout: 45000, maxBuffer: 4 * 1024 * 1024 },
      );
      const mp4Buf = await fs.promises.readFile(outPath);
      const mp4Probe = await probeMediaBuffer(mp4Buf, ".mp4");
      if (mp4Probe.durationSec > 0) {
        effectiveDuration = mp4Probe.durationSec;
      }
      if (!probe.width && mp4Probe.width) probe.width = mp4Probe.width;
      if (!probe.height && mp4Probe.height) probe.height = mp4Probe.height;
      if (!probe.fps && mp4Probe.fps) probe.fps = mp4Probe.fps;
      transcodedFromWebm = params.originalExt.toLowerCase() === ".webm";
    } finally {
      await fs.promises.unlink(inPath).catch(() => {});
      await fs.promises.unlink(outPath).catch(() => {});
    }
  }

  if (effectiveDuration > params.maxDurationSec + 0.75) {
    throw Object.assign(
      new Error(
        `Video duration (${effectiveDuration.toFixed(2)}s) exceeds configured maximum allowed duration (${params.maxDurationSec.toFixed(1)}s).`,
      ),
      { status: 400 },
    );
  }

  return {
    probe: {
      ...probe,
      durationSec: effectiveDuration > 0 ? effectiveDuration : Math.min(params.maxDurationSec, 5.0),
    },
    transcodedFromWebm,
  };
}
