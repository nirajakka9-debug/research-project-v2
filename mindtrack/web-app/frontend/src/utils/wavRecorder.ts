/**
 * Browser microphone recorder that encodes real 16-bit PCM WAV files directly
 * using the Web Audio API so Voice ai - Copy receives genuine uncompressed WAV audio.
 */

export interface WavRecordingSession {
  stop: () => Promise<File>;
  cancel: () => void;
}

function encodeWavFromFloat32(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i += 1) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeString(36, "data");
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i += 1) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }

  return new Blob([buffer], { type: "audio/wav" });
}

export async function startWavMicrophoneRecording(
  onLevel?: (rms: number) => void,
): Promise<WavRecordingSession> {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error("Microphone recording is not supported in this browser context.");
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
    },
  });

  const audioCtx = new AudioContext();
  const source = audioCtx.createMediaStreamSource(stream);
  const processor = audioCtx.createScriptProcessor(4096, 1, 1);
  const chunks: Float32Array[] = [];

  processor.onaudioprocess = (event) => {
    const input = event.inputBuffer.getChannelData(0);
    const copy = new Float32Array(input.length);
    copy.set(input);
    chunks.push(copy);

    if (onLevel) {
      let sumSq = 0;
      for (let i = 0; i < input.length; i += 1) {
        sumSq += input[i] * input[i];
      }
      onLevel(Math.sqrt(sumSq / Math.max(1, input.length)));
    }
  };

  source.connect(processor);
  processor.connect(audioCtx.destination);

  const cleanup = () => {
    processor.disconnect();
    source.disconnect();
    stream.getTracks().forEach((track) => track.stop());
    if (audioCtx.state !== "closed") {
      void audioCtx.close();
    }
  };

  return {
    stop: async () => {
      const sampleRate = audioCtx.sampleRate;
      cleanup();
      const totalLength = chunks.reduce((acc, c) => acc + c.length, 0);
      const merged = new Float32Array(totalLength);
      let pos = 0;
      for (const c of chunks) {
        merged.set(c, pos);
        pos += c.length;
      }
      const wavBlob = encodeWavFromFloat32(merged, sampleRate);
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      return new File([wavBlob], `mic_recording_${stamp}.wav`, { type: "audio/wav" });
    },
    cancel: () => {
      cleanup();
    },
  };
}
