import path from "path";
import {
  MAX_AUDIO_SIZE_BYTES,
  SUPPORTED_AUDIO_EXTENSIONS,
  validateSafeUserId,
} from "./config";
import type { OperationalMode, VoiceBaselineProfile, VoiceFeatureStat } from "./types";

export class VoiceAnalysisError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

const REFERENCE_MEANS: Record<string, number> = {
  speakingRateWpm: 150.0,
  totalPauseCount: 5.0,
  meanPauseDurationMs: 400.0,
  longestPauseDurationMs: 800.0,
  speechRatio: 0.7,
  speechDurationSec: 5.0,
  silenceDurationSec: 2.0,
  pitchMeanHz: 180.0,
  pitchStdDevHz: 25.0,
  pitchRangeHz: 100.0,
  energyMeanRms: 0.05,
  energyStdDev: 0.02,
};

const REFERENCE_STDS: Record<string, number> = {
  speakingRateWpm: 30.0,
  totalPauseCount: 3.0,
  meanPauseDurationMs: 150.0,
  longestPauseDurationMs: 350.0,
  speechRatio: 0.15,
  speechDurationSec: 2.5,
  silenceDurationSec: 1.5,
  pitchMeanHz: 40.0,
  pitchStdDevHz: 12.0,
  pitchRangeHz: 40.0,
  energyMeanRms: 0.03,
  energyStdDev: 0.015,
};

const FEATURE_MIN_STDS: Record<string, number> = {
  speakingRateWpm: 5.0,
  totalPauseCount: 1.0,
  meanPauseDurationMs: 50.0,
  longestPauseDurationMs: 50.0,
  speechRatio: 0.05,
  speechDurationSec: 0.5,
  silenceDurationSec: 0.5,
  pitchMeanHz: 5.0,
  pitchStdDevHz: 2.0,
  pitchRangeHz: 5.0,
  energyMeanRms: 0.005,
  energyStdDev: 0.002,
};

function roundTo(val: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(val * factor) / factor;
}

function percentile(sortedOrRaw: number[], pct: number): number {
  if (sortedOrRaw.length === 0) return 0;
  const sorted = [...sortedOrRaw].sort((a, b) => a - b);
  const idx = (pct / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  const frac = idx - lo;
  return sorted[lo] * (1 - frac) + sorted[hi] * frac;
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

interface DecodedWav {
  samples: Float32Array;
  sampleRate: number;
  channels: number;
}

function decodeWavBuffer(buf: Buffer): DecodedWav {
  if (buf.length < 44) {
    throw new VoiceAnalysisError("Invalid WAV file: file header is too small.", 400);
  }
  if (buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") {
    throw new VoiceAnalysisError("Invalid WAV file: missing RIFF/WAVE header.", 400);
  }

  let offset = 12;
  let audioFormat = 1;
  let numChannels = 1;
  let sampleRate = 16000;
  let bitsPerSample = 16;
  let dataStart = -1;
  let dataSize = 0;

  while (offset + 8 <= buf.length) {
    const chunkId = buf.toString("ascii", offset, offset + 4);
    const chunkSize = buf.readUInt32LE(offset + 4);
    const bodyStart = offset + 8;
    if (chunkId === "fmt ") {
      if (bodyStart + 16 <= buf.length) {
        audioFormat = buf.readUInt16LE(bodyStart);
        numChannels = buf.readUInt16LE(bodyStart + 2);
        sampleRate = buf.readUInt32LE(bodyStart + 4);
        bitsPerSample = buf.readUInt16LE(bodyStart + 14);
      }
    } else if (chunkId === "data") {
      dataStart = bodyStart;
      dataSize = Math.min(chunkSize, buf.length - bodyStart);
      break;
    }
    offset = bodyStart + chunkSize + (chunkSize % 2);
  }

  if (dataStart < 0 || dataSize <= 0) {
    throw new VoiceAnalysisError("Invalid WAV file: missing PCM data chunk.", 400);
  }
  if (audioFormat !== 1 && audioFormat !== 3) {
    throw new VoiceAnalysisError(
      `Unsupported WAV encoding (format code ${audioFormat}). Only uncompressed PCM or IEEE Float WAV files are supported.`,
      400,
    );
  }
  if (numChannels < 1 || sampleRate < 4000) {
    throw new VoiceAnalysisError("Invalid WAV audio metadata (channels or sample rate).", 400);
  }

  const bytesPerSample = bitsPerSample / 8;
  const frameBytes = bytesPerSample * numChannels;
  const totalFrames = Math.floor(dataSize / frameBytes);
  if (totalFrames === 0) {
    throw new VoiceAnalysisError("WAV file contains 0 audio frames.", 400);
  }

  const mono = new Float32Array(totalFrames);
  for (let i = 0; i < totalFrames; i++) {
    let chSum = 0;
    for (let c = 0; c < numChannels; c++) {
      const pos = dataStart + i * frameBytes + c * bytesPerSample;
      let val = 0;
      if (audioFormat === 3 && bitsPerSample === 32) {
        val = buf.readFloatLE(pos);
      } else if (bitsPerSample === 16) {
        val = buf.readInt16LE(pos) / 32768.0;
      } else if (bitsPerSample === 8) {
        val = (buf.readUInt8(pos) - 128) / 128.0;
      } else if (bitsPerSample === 24) {
        const b0 = buf.readUInt8(pos);
        const b1 = buf.readUInt8(pos + 1);
        const b2 = buf.readInt8(pos + 2);
        const raw = (b2 << 16) | (b1 << 8) | b0;
        val = raw / 8388608.0;
      } else if (bitsPerSample === 32) {
        val = buf.readInt32LE(pos) / 2147483648.0;
      } else {
        throw new VoiceAnalysisError(`Unsupported WAV bit depth: ${bitsPerSample}-bit.`, 400);
      }
      chSum += Number.isFinite(val) ? val : 0;
    }
    mono[i] = chSum / numChannels;
  }

  // Resample to 16 kHz if sampleRate differs significantly for consistent DSP timing
  const targetSr = 16000;
  if (sampleRate === targetSr) {
    return { samples: mono, sampleRate: targetSr, channels: numChannels };
  }
  const targetLen = Math.max(1, Math.round((mono.length * targetSr) / sampleRate));
  const resampled = new Float32Array(targetLen);
  const ratio = (mono.length - 1) / Math.max(1, targetLen - 1);
  for (let i = 0; i < targetLen; i++) {
    const pos = i * ratio;
    const lo = Math.floor(pos);
    const hi = Math.min(mono.length - 1, lo + 1);
    const frac = pos - lo;
    resampled[i] = mono[lo] * (1 - frac) + mono[hi] * frac;
  }
  return { samples: resampled, sampleRate: targetSr, channels: numChannels };
}

interface Segment {
  startSec: number;
  endSec: number;
}

function runVad(samples: Float32Array, sampleRate: number) {
  const winLen = Math.min(samples.length, Math.max(1, Math.floor(0.025 * sampleRate)));
  const hopLen = Math.min(samples.length, Math.max(1, Math.floor(0.01 * sampleRate)));
  const numFrames = Math.max(1, 1 + Math.floor((samples.length - winLen) / hopLen));

  const energies: number[] = new Array(numFrames);
  const zcrs: number[] = new Array(numFrames);
  const frameTimes: number[] = new Array(numFrames);

  for (let i = 0; i < numFrames; i++) {
    const startIdx = i * hopLen;
    const endIdx = Math.min(startIdx + winLen, samples.length);
    const len = endIdx - startIdx;
    let sumSq = 0;
    let zc = 0;
    let prevSign = samples[startIdx] < 0;
    for (let j = startIdx; j < endIdx; j++) {
      const s = samples[j];
      sumSq += s * s;
      if (j > startIdx) {
        const sign = s < 0;
        if (sign !== prevSign) zc++;
        prevSign = sign;
      }
    }
    energies[i] = len > 0 ? Math.sqrt(sumSq / len) : 0;
    zcrs[i] = len > 1 ? zc / len : 0;
    frameTimes[i] = (startIdx + len / 2) / sampleRate;
  }

  const noiseFloor = percentile(energies, 10.0);
  const speechPeak = percentile(energies, 90.0);
  const minEnergyFloor = 0.0005;

  let thresh: number;
  if (speechPeak < 1e-5) {
    thresh = minEnergyFloor;
  } else {
    const snrRatio = speechPeak / Math.max(noiseFloor, 1e-5);
    if (snrRatio < 3.0) {
      thresh = Math.max(minEnergyFloor, 0.05 * speechPeak);
    } else {
      thresh = Math.max(noiseFloor + 0.035 * (speechPeak - noiseFloor), minEnergyFloor);
    }
  }

  const smoothed = new Array<boolean>(numFrames);
  for (let i = 0; i < numFrames; i++) {
    const definiteSpeech = energies[i] >= thresh;
    const unvoicedSpeech = energies[i] >= 0.4 * thresh && zcrs[i] >= 0.15;
    smoothed[i] = definiteSpeech || unvoicedSpeech;
  }

  const stepSec = hopLen / sampleRate;
  const minSpeechFrames = Math.max(1, Math.floor(0.1 / stepSec));
  const minPauseFrames = Math.max(1, Math.floor(0.2 / stepSec));

  let silenceCount = 0;
  for (let i = 0; i < smoothed.length; i++) {
    if (!smoothed[i]) {
      silenceCount++;
    } else {
      if (silenceCount > 0 && silenceCount < minPauseFrames && i - silenceCount > 0) {
        for (let k = i - silenceCount; k < i; k++) smoothed[k] = true;
      }
      silenceCount = 0;
    }
  }

  let speechCount = 0;
  for (let i = 0; i < smoothed.length; i++) {
    if (smoothed[i]) {
      speechCount++;
    } else {
      if (speechCount > 0 && speechCount < minSpeechFrames && i - speechCount >= 0) {
        for (let k = i - speechCount; k < i; k++) smoothed[k] = false;
      }
      speechCount = 0;
    }
  }

  const speechSegments: Segment[] = [];
  const pauseSegments: Segment[] = [];
  const totalDuration = samples.length / sampleRate;

  let inSpeech = smoothed.length > 0 ? smoothed[0] : false;
  let segStart = 0.0;

  for (let i = 1; i < smoothed.length; i++) {
    const t = frameTimes[i];
    if (smoothed[i] && !inSpeech) {
      if (t - segStart >= 0.2) pauseSegments.push({ startSec: segStart, endSec: t });
      inSpeech = true;
      segStart = t;
    } else if (!smoothed[i] && inSpeech) {
      speechSegments.push({ startSec: segStart, endSec: t });
      inSpeech = false;
      segStart = t;
    }
  }
  if (inSpeech) {
    speechSegments.push({ startSec: segStart, endSec: totalDuration });
  } else if (totalDuration - segStart >= 0.2) {
    pauseSegments.push({ startSec: segStart, endSec: totalDuration });
  }

  const speechDurationSec = speechSegments.reduce((acc, s) => acc + (s.endSec - s.startSec), 0);
  const silenceDurationSec = Math.max(0, totalDuration - speechDurationSec);
  const speechRatio = totalDuration > 0 ? speechDurationSec / totalDuration : 0;
  const pauseDurationsMs = pauseSegments.map((p) => (p.endSec - p.startSec) * 1000);
  const totalPauseCount = pauseSegments.length;
  const meanPauseDurationMs =
    totalPauseCount > 0 ? pauseDurationsMs.reduce((a, b) => a + b, 0) / totalPauseCount : 0;
  const longestPauseDurationMs = totalPauseCount > 0 ? Math.max(...pauseDurationsMs) : 0;

  return {
    speechSegments,
    pauseSegments,
    speechDurationSec: roundTo(speechDurationSec, 3),
    silenceDurationSec: roundTo(silenceDurationSec, 3),
    speechRatio: roundTo(speechRatio, 3),
    totalPauseCount,
    meanPauseDurationMs: roundTo(meanPauseDurationMs, 1),
    longestPauseDurationMs: roundTo(longestPauseDurationMs, 1),
  };
}

function estimatePitch(samples: Float32Array, sampleRate: number, speechSegments: Segment[]) {
  const minF0 = 75.0;
  const maxF0 = 400.0;
  const minLag = Math.floor(sampleRate / maxF0);
  const maxLag = Math.floor(sampleRate / minF0);
  const winLen = Math.floor(0.04 * sampleRate);
  const hopLen = Math.floor(0.01 * sampleRate);
  const voicingThreshold = 0.35;
  const octaveCost = 0.03;

  // Hanning window and its autocorrelation for Boersma unbiased normalization
  const w = new Float64Array(winLen);
  for (let i = 0; i < winLen; i++) {
    w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (winLen - 1)));
  }
  const acW = new Float64Array(maxLag + 2);
  for (let lag = 0; lag <= maxLag + 1; lag++) {
    let s = 0;
    for (let j = 0; j < winLen - lag; j++) {
      s += w[j] * w[j + lag];
    }
    acW[lag] = Math.max(s, 1e-6);
  }

  const numFrames = Math.max(1, 1 + Math.floor((samples.length - winLen) / hopLen));
  const rawF0: number[] = [];
  let totalSpeechFrames = 0;

  const windowed = new Float64Array(winLen);
  const normAc = new Float64Array(maxLag + 2);

  for (let i = 0; i < numFrames; i++) {
    const startIdx = i * hopLen;
    const endIdx = Math.min(startIdx + winLen, samples.length);
    if (endIdx - startIdx < winLen) continue;

    const frameCenterSec = (startIdx + winLen / 2) / sampleRate;
    const isSpeech = speechSegments.some(
      (seg) => frameCenterSec >= seg.startSec && frameCenterSec <= seg.endSec,
    );
    if (!isSpeech) continue;

    totalSpeechFrames++;

    let mean = 0;
    for (let j = 0; j < winLen; j++) mean += samples[startIdx + j];
    mean /= winLen;

    let energy0 = 0;
    for (let j = 0; j < winLen; j++) {
      const val = (samples[startIdx + j] - mean) * w[j];
      windowed[j] = val;
      energy0 += val * val;
    }
    const unbiased0 = energy0 / acW[0];
    if (unbiased0 <= 1e-12) continue;

    for (let lag = minLag - 1; lag <= maxLag + 1; lag++) {
      if (lag < 0 || lag >= winLen) continue;
      let s = 0;
      for (let j = 0; j < winLen - lag; j++) {
        s += windowed[j] * windowed[j + lag];
      }
      normAc[lag] = s / acW[lag] / unbiased0;
    }

    let bestLag = -1;
    let bestScore = -Infinity;
    for (let lag = minLag; lag <= maxLag; lag++) {
      const h = normAc[lag];
      if (h >= voicingThreshold && h > normAc[lag - 1] && h >= normAc[lag + 1]) {
        const score = h - octaveCost * Math.log2(lag / minLag);
        if (score > bestScore) {
          bestScore = score;
          bestLag = lag;
        }
      }
    }
    if (bestLag < 0) continue;

    // Parabolic interpolation
    let refinedLag = bestLag;
    const y1 = normAc[bestLag - 1];
    const y2 = normAc[bestLag];
    const y3 = normAc[bestLag + 1];
    const denom = 2 * (2 * y2 - y1 - y3);
    if (Math.abs(denom) > 1e-6) {
      refinedLag += (y1 - y3) / denom;
    }

    const f0 = sampleRate / refinedLag;
    if (f0 >= minF0 && f0 <= maxF0) {
      rawF0.push(roundTo(f0, 2));
    }
  }

  // 5-tap running median filter
  let filteredF0 = rawF0;
  if (rawF0.length >= 5) {
    filteredF0 = rawF0.map((_, idx) => {
      const lo = Math.max(0, idx - 2);
      const hi = Math.min(rawF0.length, idx + 3);
      return roundTo(median(rawF0.slice(lo, hi)), 2);
    });
  }

  const voicedCount = filteredF0.length;
  const voicedRatio = totalSpeechFrames > 0 ? voicedCount / totalSpeechFrames : 0;

  if (voicedCount === 0) {
    return {
      pitchMeanHz: 0,
      pitchStdDevHz: 0,
      pitchRangeHz: 0,
      voicedRatio: 0,
    };
  }

  const meanHz = filteredF0.reduce((a, b) => a + b, 0) / voicedCount;
  const varHz = filteredF0.reduce((acc, v) => acc + (v - meanHz) ** 2, 0) / voicedCount;
  const stdHz = Math.sqrt(Math.max(0, varHz));
  const rangeHz = Math.max(...filteredF0) - Math.min(...filteredF0);

  return {
    pitchMeanHz: roundTo(meanHz, 2),
    pitchStdDevHz: roundTo(stdHz, 2),
    pitchRangeHz: roundTo(rangeHz, 2),
    voicedRatio: roundTo(voicedRatio, 3),
  };
}

function estimateSpeakingRate(
  samples: Float32Array,
  sampleRate: number,
  speechSegments: Segment[],
  speechDurationSec: number,
): number {
  if (speechDurationSec <= 0.1) return 0.0;

  // 2nd-order Butterworth lowpass at 10 Hz
  const fc = 10.0;
  const omega = (2 * Math.PI * fc) / sampleRate;
  const k = Math.tan(omega / 2);
  const k2 = k * k;
  const sqrt2k = Math.SQRT2 * k;
  const norm = 1 / (1 + sqrt2k + k2);
  const b0 = k2 * norm;
  const b1 = 2 * b0;
  const b2 = b0;
  const a1 = 2 * (k2 - 1) * norm;
  const a2 = (1 - sqrt2k + k2) * norm;

  const minDistSamples = Math.floor(0.12 * sampleRate);
  let totalSyllables = 0;

  for (const seg of speechSegments) {
    const startIdx = Math.floor(seg.startSec * sampleRate);
    const endIdx = Math.min(Math.floor(seg.endSec * sampleRate), samples.length);
    const len = endIdx - startIdx;
    if (len < minDistSamples) continue;

    // Forward pass on rectified signal
    const env = new Float64Array(len);
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < len; i++) {
      const x0 = Math.abs(samples[startIdx + i]);
      const y0 = b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
      env[i] = y0;
      x2 = x1; x1 = x0; y2 = y1; y1 = y0;
    }
    // Backward pass (filtfilt)
    x1 = 0; x2 = 0; y1 = 0; y2 = 0;
    for (let i = len - 1; i >= 0; i--) {
      const x0 = env[i];
      const y0 = b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
      env[i] = y0;
      x2 = x1; x1 = x0; y2 = y1; y1 = y0;
    }

    let sum = 0;
    for (let i = 0; i < len; i++) sum += env[i];
    const mean = sum / len;
    let sumSq = 0;
    for (let i = 0; i < len; i++) sumSq += (env[i] - mean) ** 2;
    const std = Math.sqrt(sumSq / len);
    const peakThresh = Math.max(mean + 0.15 * std, 1e-4);

    let lastPeak = -minDistSamples;
    for (let i = 1; i < len - 1; i++) {
      if (
        env[i] >= peakThresh &&
        env[i] > env[i - 1] &&
        env[i] >= env[i + 1] &&
        i - lastPeak >= minDistSamples
      ) {
        totalSyllables++;
        lastPeak = i;
      }
    }
  }

  const syllablesPerSec = totalSyllables / speechDurationSec;
  return roundTo((syllablesPerSec * 60.0) / 1.5, 1);
}

function estimateSpeechEnergy(samples: Float32Array, sampleRate: number, speechSegments: Segment[]) {
  const frameRms: number[] = [];
  const winLen = Math.floor(0.025 * sampleRate);
  const hopLen = Math.floor(0.01 * sampleRate);

  for (const seg of speechSegments) {
    const startIdx = Math.floor(seg.startSec * sampleRate);
    const endIdx = Math.min(Math.floor(seg.endSec * sampleRate), samples.length);
    for (let i = startIdx; i + winLen <= endIdx; i += hopLen) {
      let sumSq = 0;
      for (let j = 0; j < winLen; j++) {
        const s = samples[i + j];
        sumSq += s * s;
      }
      frameRms.push(Math.sqrt(sumSq / winLen));
    }
  }

  if (frameRms.length === 0) {
    return { energyMeanRms: 0, energyStdDev: 0 };
  }
  const mean = frameRms.reduce((a, b) => a + b, 0) / frameRms.length;
  const variance = frameRms.reduce((acc, v) => acc + (v - mean) ** 2, 0) / frameRms.length;
  return {
    energyMeanRms: roundTo(mean, 5),
    energyStdDev: roundTo(Math.sqrt(Math.max(0, variance)), 5),
  };
}

function recomputeVoiceStats(profile: VoiceBaselineProfile): void {
  if (profile.history.length === 0) {
    profile.stats = {};
    profile.observation_count = 0;
    profile.is_established = false;
    return;
  }

  const keys = Object.keys(profile.history[0].features);
  const stats: Record<string, VoiceFeatureStat> = {};
  for (const key of keys) {
    const values = profile.history
      .map((h) => h.features[key])
      .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
    if (values.length === 0) continue;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const std =
      values.length >= 2
        ? Math.sqrt(
            Math.max(
              0,
              values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / (values.length - 1),
            ),
          )
        : 0;
    stats[key] = {
      mean: roundTo(mean, 4),
      std: roundTo(std, 4),
      min: roundTo(Math.min(...values), 4),
      max: roundTo(Math.max(...values), 4),
      count: values.length,
    };
  }
  profile.stats = stats;
  profile.observation_count = profile.history.length;
  profile.is_established = profile.observation_count >= profile.min_observations;
}

export function createEmptyVoiceBaseline(userId: string): VoiceBaselineProfile {
  return {
    user_id: userId,
    min_observations: 3,
    min_std_floor: 0.001,
    observation_count: 0,
    is_established: false,
    stats: {},
    history: [],
  };
}

export function analyzeVoiceWavBuffer(params: {
  buffer: Buffer;
  originalFilename: string;
  userId: string;
  mode: OperationalMode;
  updateBaseline?: boolean;
  existingProfile: VoiceBaselineProfile | null;
}): {
  result: Record<string, unknown>;
  updatedProfile: VoiceBaselineProfile | null;
} {
  const {
    buffer,
    originalFilename,
    userId,
    mode,
    updateBaseline = false,
    existingProfile,
  } = params;

  const cleanUserId = validateSafeUserId(userId);
  const ext = path.extname(originalFilename || "recording.wav").toLowerCase();
  if (!SUPPORTED_AUDIO_EXTENSIONS.has(ext)) {
    throw new VoiceAnalysisError(
      `Unsupported audio format '${ext || "unknown"}'. Voice AI natively supports WAV (.wav) recordings.`,
      400,
    );
  }
  if (!buffer || buffer.length === 0) {
    throw new VoiceAnalysisError("Uploaded audio file is empty (0 bytes).", 400);
  }
  if (buffer.length > MAX_AUDIO_SIZE_BYTES) {
    throw new VoiceAnalysisError(
      `Audio file exceeds maximum allowed size (${Math.floor(MAX_AUDIO_SIZE_BYTES / (1024 * 1024))} MB).`,
      413,
    );
  }
  if (!["single", "calibrate", "assess"].includes(mode)) {
    throw new VoiceAnalysisError(
      `Invalid voice operational mode '${mode}'. Choose from: assess, calibrate, single.`,
      400,
    );
  }

  const decoded = decodeWavBuffer(buffer);
  const durationSec = roundTo(decoded.samples.length / decoded.sampleRate, 3);
  if (durationSec < 0.5) {
    throw new VoiceAnalysisError(
      `Audio duration (${durationSec}s) is too short. Minimum required duration is 0.5s.`,
      400,
    );
  }

  // Raw signal metrics before normalization
  let peak = 0;
  let sumSq = 0;
  let clippedCount = 0;
  for (let i = 0; i < decoded.samples.length; i++) {
    const absVal = Math.abs(decoded.samples[i]);
    if (absVal > peak) peak = absVal;
    sumSq += absVal * absVal;
    if (absVal >= 0.99) clippedCount++;
  }
  const signalLevelRms = roundTo(Math.sqrt(sumSq / decoded.samples.length), 5);
  const clippingRatio = roundTo(clippedCount / decoded.samples.length, 5);

  const normSamples = new Float32Array(decoded.samples.length);
  const gain = peak > 0 ? 0.95 / peak : 1.0;
  for (let i = 0; i < decoded.samples.length; i++) {
    normSamples[i] = decoded.samples[i] * gain;
  }

  const vad = runVad(normSamples, decoded.sampleRate);
  const pitch = estimatePitch(normSamples, decoded.sampleRate, vad.speechSegments);
  const speakingRateWpm = estimateSpeakingRate(
    normSamples,
    decoded.sampleRate,
    vad.speechSegments,
    vad.speechDurationSec,
  );
  const energy = estimateSpeechEnergy(normSamples, decoded.sampleRate, vad.speechSegments);

  // Quality scoring (exact Voice ai - Copy/features/quality.py weights)
  let clippingScore = 1.0;
  if (clippingRatio > 0.001 && clippingRatio <= 0.02) {
    clippingScore = 1.0 - (clippingRatio / 0.02) * 0.5;
  } else if (clippingRatio > 0.02) {
    clippingScore = Math.max(0, 0.5 - (clippingRatio - 0.02) * 5.0);
  }

  let speechScore = 1.0;
  if (vad.speechRatio < 0.4) {
    speechScore = Math.max(0, vad.speechRatio / 0.4);
  } else if (vad.speechRatio > 0.9) {
    speechScore = Math.max(0.2, 1.0 - (vad.speechRatio - 0.9) / 0.1);
  }

  const voicedScore = Math.min(1.0, Math.max(0.0, pitch.voicedRatio));
  let signalScore = 1.0;
  if (signalLevelRms < 0.01) {
    signalScore = Math.max(0.1, signalLevelRms / 0.01);
  } else if (signalLevelRms > 0.5) {
    signalScore = Math.max(0.5, 1.0 - (signalLevelRms - 0.5));
  }

  const qualityScore = roundTo(
    Math.min(1.0, Math.max(0.0, 0.3 * clippingScore + 0.3 * speechScore + 0.2 * voicedScore + 0.2 * signalScore)),
    2,
  );

  const features: Record<string, number> = {
    speakingRateWpm,
    totalPauseCount: vad.totalPauseCount,
    meanPauseDurationMs: vad.meanPauseDurationMs,
    longestPauseDurationMs: vad.longestPauseDurationMs,
    speechRatio: vad.speechRatio,
    speechDurationSec: vad.speechDurationSec,
    silenceDurationSec: vad.silenceDurationSec,
    pitchMeanHz: pitch.pitchMeanHz,
    pitchStdDevHz: pitch.pitchStdDevHz,
    pitchRangeHz: pitch.pitchRangeHz,
    energyMeanRms: energy.energyMeanRms,
    energyStdDev: energy.energyStdDev,
  };

  const qualityWarnings: string[] = [];
  if (qualityScore < 0.55) {
    qualityWarnings.push(
      `Low acoustic signal quality (${qualityScore.toFixed(2)}/1.00). Check microphone distance or background noise.`,
    );
  }
  if (clippingRatio > 0.02) {
    qualityWarnings.push(`Audio clipping detected (${(clippingRatio * 100).toFixed(1)}% of samples).`);
  }
  if (vad.speechDurationSec < 0.5) {
    qualityWarnings.push("Very little active speech detected by VAD.");
  }

  const timestamp = new Date().toISOString();
  let updatedProfile: VoiceBaselineProfile | null = existingProfile
    ? structuredClone(existingProfile)
    : null;
  let voicePattern: Record<string, unknown>;
  let calibrationStatus: Record<string, unknown> | undefined;

  if (mode === "calibrate" || mode === "assess") {
    const profile = updatedProfile ?? createEmptyVoiceBaseline(cleanUserId);
    updatedProfile = profile;

    if (!profile.is_established) {
      const featureDevs: Record<string, null> = {};
      for (const k of Object.keys(features)) featureDevs[k] = null;
      voicePattern = {
        baselineType: "personal_longitudinal",
        isBaselineEstablished: false,
        observationCount: profile.observation_count,
        minObservationsRequired: profile.min_observations,
        technicalDeviationScore: null,
        featureDeviations: featureDevs,
        significantDeviations: [],
        status: `insufficient_history: ${profile.observation_count}/${profile.min_observations} sessions completed for personal baseline`,
      };
    } else {
      const zScores: Record<string, number | null> = {};
      const significantDevs: string[] = [];
      const validZ: number[] = [];

      for (const [key, val] of Object.entries(features)) {
        const stat = profile.stats[key];
        if (!stat) {
          zScores[key] = null;
          continue;
        }
        const minStd = FEATURE_MIN_STDS[key] ?? profile.min_std_floor;
        const std = Math.max(stat.std, minStd);
        const z = (val - stat.mean) / std;
        const zRounded = roundTo(z, 2);
        zScores[key] = zRounded;
        validZ.push(z);
        if (Math.abs(z) >= 1.5) {
          const dir = z > 0 ? "higher" : "lower";
          significantDevs.push(
            `${key} is ${dir} than personal baseline (Z = ${z >= 0 ? "+" : ""}${z.toFixed(2)}, current = ${val.toFixed(2)}, baseline = ${stat.mean.toFixed(2)} ± ${std.toFixed(2)})`,
          );
        }
      }

      const rmsZ =
        validZ.length > 0
          ? Math.sqrt(validZ.reduce((acc, z) => acc + z * z, 0) / validZ.length)
          : 0;
      const devScore = roundTo(1.0 - 1.0 / (1.0 + (rmsZ / 2.0) ** 2), 2);

      voicePattern = {
        baselineType: "personal_longitudinal",
        isBaselineEstablished: true,
        observationCount: profile.observation_count,
        minObservationsRequired: profile.min_observations,
        technicalDeviationScore: devScore,
        featureDeviations: zScores,
        significantDeviations: significantDevs,
        status: "baseline_established",
      };
    }

    if (mode === "calibrate" || (mode === "assess" && updateBaseline)) {
      profile.history.push({ timestamp, features: { ...features } });
      recomputeVoiceStats(profile);
      calibrationStatus = {
        user_id: cleanUserId,
        observation_count: profile.observation_count,
        min_observations_required: profile.min_observations,
        is_established: profile.is_established,
      };
    }
  } else {
    // Single mode: reference engineering distribution fallback
    const zScores: Record<string, number> = {};
    const significantDevs: string[] = [];
    for (const [key, val] of Object.entries(features)) {
      const mean = REFERENCE_MEANS[key] ?? val;
      const std = Math.max(REFERENCE_STDS[key] ?? 1.0, 1e-6);
      const z = (val - mean) / std;
      zScores[key] = roundTo(z, 2);
      if (Math.abs(z) >= 1.5) {
        const dir = z > 0 ? "higher" : "lower";
        significantDevs.push(`${key} is ${dir} than baseline (Z = ${z.toFixed(2)})`);
      }
    }
    const zVals = Object.values(zScores);
    const rmsZ =
      zVals.length > 0
        ? Math.sqrt(zVals.reduce((acc, z) => acc + z * z, 0) / zVals.length)
        : 0;
    const devScore = roundTo(1.0 - 1.0 / (1.0 + (rmsZ / 2.0) ** 2), 2);
    voicePattern = {
      baselineType: "reference_engineering_distribution",
      technicalDeviationScore: devScore,
      featureDeviations: zScores,
      significantDeviations: significantDevs,
    };
  }

  const result: Record<string, unknown> = {
    timestamp,
    status: "success",
    audio: {
      durationSec,
      sampleRate: decoded.sampleRate,
      channels: 1,
      signalLevelRms,
      clippingRatio,
    },
    qualityScore,
    features,
    voicePattern,
    operational_mode: mode,
    user_id: cleanUserId,
    qualityWarnings,
    limitations:
      "NON-DIAGNOSTIC ACOUSTIC MEASUREMENT: Voice AI computes rule-based DSP acoustic features (speaking rate, pauses, pitch, RMS energy) and statistical deviations. It does NOT detect emotion, stress levels, or mental illness.",
    ...(calibrationStatus ? { calibrationStatus } : {}),
  };

  return { result, updatedProfile };
}
