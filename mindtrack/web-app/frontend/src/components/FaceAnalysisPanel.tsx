import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Camera,
  Check,
  CheckCircle2,
  FileVideo,
  Info,
  Loader2,
  PlayCircle,
  RotateCcw,
  ScanFace,
  ShieldCheck,
  Square,
  Upload,
  Video,
} from "lucide-react";
import { analyzeFaceVideo } from "../services/api";
import type { AnalysisRunResponse, FaceAnalysisResult, OperationalMode } from "../types/mindtrack";
import { JsonInspectorCard } from "./SharedUI";

const ALLOWED_VIDEO_EXTS = [".mp4", ".avi", ".mov", ".mkv", ".webm"];

type InputSourceMode = "record" | "upload";
type RecordingStage = "idle" | "previewing" | "recording" | "reviewing";

interface FaceAnalysisPanelProps {
  userId: string;
  baselineProgress?: { recorded: number; minRequired: number; isCalibrated: boolean };
  currentRun: AnalysisRunResponse<FaceAnalysisResult> | null;
  onAnalysisComplete: (run: AnalysisRunResponse<FaceAnalysisResult>) => void;
  onNotify?: (type: "success" | "error" | "info", text: string) => void;
}

function selectSupportedVideoMimeType(): { mimeType: string; ext: string } {
  if (typeof MediaRecorder === "undefined") {
    return { mimeType: "", ext: ".webm" };
  }
  const candidates = [
    { mimeType: "video/webm;codecs=vp9", ext: ".webm" },
    { mimeType: "video/webm;codecs=vp8", ext: ".webm" },
    { mimeType: "video/webm", ext: ".webm" },
    { mimeType: "video/mp4", ext: ".mp4" },
  ];
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c.mimeType)) {
      return c;
    }
  }
  return { mimeType: "", ext: ".webm" };
}

export const FaceAnalysisPanel: React.FC<FaceAnalysisPanelProps> = ({
  userId,
  baselineProgress,
  currentRun,
  onAnalysisComplete,
  onNotify,
}) => {
  const [sourceMode, setSourceMode] = useState<InputSourceMode>("record");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [videoDurationSec, setVideoDurationSec] = useState<number | null>(null);
  const [maxDuration, setMaxDuration] = useState<number>(30);
  const [mode, setMode] = useState<OperationalMode>("single");
  const [updateBaseline, setUpdateBaseline] = useState<boolean>(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);

  // Camera / MediaRecorder state (permission requested only on explicit user action)
  const [recStage, setRecStage] = useState<RecordingStage>("idle");
  const [countdownSec, setCountdownSec] = useState<number>(30);
  const [recordedDraftFile, setRecordedDraftFile] = useState<File | null>(null);
  const [recordedDraftUrl, setRecordedDraftUrl] = useState<string | null>(null);
  const [recordingConfirmed, setRecordingConfirmed] = useState(false);

  const liveVideoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const stopCameraTracks = useCallback(() => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (liveVideoRef.current) {
      liveVideoRef.current.srcObject = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      stopCameraTracks();
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      if (recordedDraftUrl) URL.revokeObjectURL(recordedDraftUrl);
    };
  }, [previewUrl, recordedDraftUrl, stopCameraTracks]);

  const attachStreamToVideo = (stream: MediaStream) => {
    if (liveVideoRef.current) {
      liveVideoRef.current.srcObject = stream;
      void liveVideoRef.current.play().catch(() => {});
    }
  };

  const startRecordingSession = async () => {
    setValidationError(null);
    setApiError(null);
    setRecordingConfirmed(false);

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setValidationError("Camera recording is not supported in this browser. Switch to 'Upload Video' instead.");
      return;
    }
    if (typeof MediaRecorder === "undefined") {
      setValidationError("MediaRecorder API is unavailable in this browser. Switch to 'Upload Video' instead.");
      return;
    }

    try {
      stopCameraTracks();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user", // Desktop webcam + Android front-facing camera
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30, max: 30 },
        },
        audio: false,
      });
      streamRef.current = stream;
      setRecStage("recording");

      // Defer attaching until React renders video element
      window.setTimeout(() => attachStreamToVideo(stream), 40);

      const { mimeType, ext } = selectSupportedVideoMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      recorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (evt) => {
        if (evt.data && evt.data.size > 0) {
          chunksRef.current.push(evt.data);
        }
      };

      recorder.onstop = () => {
        stopCameraTracks();
        const blobType = recorder.mimeType || mimeType || "video/webm";
        const blob = new Blob(chunksRef.current, { type: blobType });
        chunksRef.current = [];
        if (blob.size === 0) {
          setValidationError("Recorded video clip was empty. Please try recording again.");
          setRecStage("idle");
          return;
        }
        const stamp = new Date().toISOString().replace(/[:.]/g, "-");
        const finalExt = blobType.includes("mp4") ? ".mp4" : ext;
        const draftFile = new File([blob], `webcam_checkin_${stamp}${finalExt}`, { type: blobType });
        if (recordedDraftUrl) URL.revokeObjectURL(recordedDraftUrl);
        const draftUrl = URL.createObjectURL(draftFile);
        setRecordedDraftFile(draftFile);
        setRecordedDraftUrl(draftUrl);
        setRecStage("reviewing");
      };

      const limit = Math.max(5, Math.min(30, maxDuration));
      setCountdownSec(limit);
      recorder.start(250);

      let remaining = limit;
      timerRef.current = window.setInterval(() => {
        remaining -= 1;
        setCountdownSec(Math.max(0, remaining));
        if (remaining <= 0 && recorder.state === "recording") {
          recorder.stop();
        }
      }, 1000);
    } catch (err) {
      stopCameraTracks();
      setRecStage("idle");
      const name = err instanceof DOMException ? err.name : "";
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        setValidationError(
          "Camera permission was denied. Enable camera access in your browser settings to record directly, or switch to 'Upload Video'.",
        );
      } else if (name === "NotFoundError" || name === "DevicesNotFoundError") {
        setValidationError("No camera device was detected on this device. Use 'Upload Video' instead.");
      } else {
        setValidationError(
          err instanceof Error ? err.message : "Could not start camera recording.",
        );
      }
    }
  };

  const stopRecordingEarly = () => {
    if (recorderRef.current && recorderRef.current.state === "recording") {
      recorderRef.current.stop();
    } else {
      stopCameraTracks();
      setRecStage("idle");
    }
  };

  const handleRetake = () => {
    if (recordedDraftUrl) URL.revokeObjectURL(recordedDraftUrl);
    setRecordedDraftFile(null);
    setRecordedDraftUrl(null);
    setRecordingConfirmed(false);
    setSelectedFile(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setVideoDurationSec(null);
    setRecStage("idle");
  };

  const handleUseRecordedVideo = () => {
    if (!recordedDraftFile) return;
    if (recordedDraftFile.size > 150 * 1024 * 1024) {
      setValidationError("Recorded video exceeds the 150 MB limit.");
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSelectedFile(recordedDraftFile);
    setPreviewUrl(URL.createObjectURL(recordedDraftFile));
    setRecordingConfirmed(true);
    setValidationError(null);
    onNotify?.("info", "Recorded clip confirmed and ready for Facial AI analysis.");
  };

  const handleFilePicked = (file: File | null) => {
    setValidationError(null);
    setApiError(null);
    setVideoDurationSec(null);
    if (!file) return;

    const lower = file.name.toLowerCase();
    const validExt = ALLOWED_VIDEO_EXTS.some((ext) => lower.endsWith(ext));
    if (!validExt) {
      setValidationError(`Unsupported video format. Allowed extensions: ${ALLOWED_VIDEO_EXTS.join(", ")}.`);
      return;
    }
    if (file.size === 0) {
      setValidationError("Selected video file is empty (0 bytes).");
      return;
    }
    if (file.size > 150 * 1024 * 1024) {
      setValidationError("Video file exceeds the 150 MB limit.");
      return;
    }

    if (previewUrl) URL.revokeObjectURL(previewUrl);
    const nextUrl = URL.createObjectURL(file);
    setSelectedFile(file);
    setPreviewUrl(nextUrl);
    setRecordingConfirmed(true);
  };

  const handleAnalyze = async () => {
    if (!selectedFile || (sourceMode === "record" && !recordingConfirmed)) {
      setValidationError(
        sourceMode === "record"
          ? "Record a video and click 'Use Recording' before analyzing."
          : "Please upload a video file before running facial analysis.",
      );
      return;
    }
    if (videoDurationSec !== null && Number.isFinite(videoDurationSec) && videoDurationSec > maxDuration + 0.5) {
      setValidationError(
        `Video duration (${videoDurationSec.toFixed(1)}s) exceeds configured limit (${maxDuration}s).`,
      );
      return;
    }

    setAnalyzing(true);
    setProgress(5);
    setApiError(null);
    try {
      const run = await analyzeFaceVideo({
        file: selectedFile,
        userId,
        mode,
        maxDuration,
        updateBaseline: mode === "assess" && updateBaseline,
        onProgress: setProgress,
      });
      onAnalysisComplete(run);
      if (run.result.calibration_status?.error) {
        onNotify?.("info", `Facial analysis finished, but calibration skipped: ${run.result.calibration_status.error}`);
      } else {
        onNotify?.("success", `Facial analysis completed (${run.result.quality.usable_frames} tracked frames).`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Facial analysis failed.";
      setApiError(msg);
      onNotify?.("error", msg);
    } finally {
      setAnalyzing(false);
    }
  };

  const res = currentRun?.result;

  return (
    <div className="space-y-5">
      {/* Input Method Switcher */}
      <div className="inline-flex rounded-xl bg-slate-100 p-1 text-xs font-semibold">
        <button
          type="button"
          onClick={() => {
            setSourceMode("record");
            setValidationError(null);
          }}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 transition ${
            sourceMode === "record" ? "bg-white text-teal-700 shadow-sm" : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <Camera className="h-4 w-4" /> A. Record Video Directly
        </button>
        <button
          type="button"
          onClick={() => {
            stopCameraTracks();
            setRecStage("idle");
            setSourceMode("upload");
            setValidationError(null);
          }}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 transition ${
            sourceMode === "upload" ? "bg-white text-teal-700 shadow-sm" : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <Upload className="h-4 w-4" /> B. Upload Existing Video
        </button>
      </div>

      {/* Configuration & Recording/Upload Row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-7 space-y-4">
          {sourceMode === "record" ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-4">
              {recStage === "idle" && (
                <div className="rounded-xl border-2 border-dashed border-teal-200 bg-teal-50/30 p-6 text-center space-y-3">
                  <div className="mx-auto h-12 w-12 rounded-2xl bg-teal-100 text-teal-700 flex items-center justify-center">
                    <Video className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      Direct Webcam / Front Camera Recording
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      Camera permission is requested only when you click Start Recording. Automatically stops at {maxDuration}s. Nothing is uploaded until you confirm.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={startRecordingSession}
                    className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-700 transition"
                  >
                    <Camera className="h-4 w-4" /> Start Recording ({maxDuration}s Countdown)
                  </button>
                </div>
              )}

              {recStage === "recording" && (
                <div className="space-y-3">
                  <div className="relative rounded-2xl bg-slate-950 overflow-hidden">
                    <video
                      ref={liveVideoRef}
                      muted
                      playsInline
                      autoPlay
                      className="w-full max-h-72 object-cover -scale-x-100"
                    />
                    <div className="absolute top-3 left-3 inline-flex items-center gap-2 rounded-full bg-rose-600/95 px-3 py-1 text-xs font-bold text-white shadow">
                      <span className="h-2 w-2 rounded-full bg-white animate-pulse" />
                      REC • {countdownSec}s remaining
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500">
                      Recording from front-facing camera. Auto-stops at 0s.
                    </span>
                    <button
                      type="button"
                      onClick={stopRecordingEarly}
                      className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-700"
                    >
                      <Square className="h-3.5 w-3.5 fill-current" /> Stop Recording
                    </button>
                  </div>
                </div>
              )}

              {recStage === "reviewing" && recordedDraftUrl && recordedDraftFile && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-800 flex items-center gap-1.5">
                      <FileVideo className="h-4 w-4 text-teal-600" />
                      Preview Recorded Video ({(recordedDraftFile.size / (1024 * 1024)).toFixed(2)} MB)
                    </span>
                    {recordingConfirmed && (
                      <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Confirmed for Analysis
                      </span>
                    )}
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-950 overflow-hidden">
                    <video
                      src={recordedDraftUrl}
                      controls
                      playsInline
                      onLoadedMetadata={(e) => {
                        const dur = e.currentTarget.duration;
                        if (Number.isFinite(dur)) setVideoDurationSec(dur);
                      }}
                      className="w-full max-h-64 object-contain"
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-2.5">
                    <button
                      type="button"
                      onClick={handleRetake}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      <RotateCcw className="h-3.5 w-3.5" /> Retake
                    </button>
                    {!recordingConfirmed && (
                      <button
                        type="button"
                        onClick={handleUseRecordedVideo}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
                      >
                        <Check className="h-3.5 w-3.5" /> Use Recording
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <>
              <div
                onClick={() => inputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  handleFilePicked(e.dataTransfer.files?.[0] ?? null);
                }}
                className="cursor-pointer rounded-2xl border-2 border-dashed border-teal-200 bg-teal-50/30 hover:bg-teal-50/60 p-6 text-center transition"
              >
                <input
                  ref={inputRef}
                  type="file"
                  accept=".mp4,.avi,.mov,.mkv,.webm,video/*"
                  className="hidden"
                  onChange={(e) => handleFilePicked(e.target.files?.[0] ?? null)}
                />
                <div className="mx-auto mb-3 h-11 w-11 rounded-xl bg-teal-100 text-teal-700 flex items-center justify-center">
                  <Upload className="h-5 w-5" />
                </div>
                <p className="text-sm font-semibold text-slate-900">
                  {selectedFile ? selectedFile.name : "Drop or select a facial check-in video"}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Supports MP4, AVI, MOV, MKV, WEBM • Up to {maxDuration}s duration • Max 150 MB
                </p>
                {selectedFile && (
                  <div className="mt-3 inline-flex flex-wrap items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-medium text-teal-800 border border-teal-200">
                    <FileVideo className="h-3.5 w-3.5" />
                    {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
                    {videoDurationSec !== null && Number.isFinite(videoDurationSec) && ` • ${videoDurationSec.toFixed(1)}s`}
                  </div>
                )}
              </div>

              {previewUrl && (
                <div className="rounded-2xl border border-slate-200 bg-slate-950 overflow-hidden">
                  <video
                    src={previewUrl}
                    controls
                    onLoadedMetadata={(e) => {
                      const dur = e.currentTarget.duration;
                      if (Number.isFinite(dur)) {
                        setVideoDurationSec(dur);
                        if (dur > maxDuration) {
                          setValidationError(
                            `Video duration (${dur.toFixed(1)}s) exceeds the ${maxDuration}s analyzer limit.`,
                          );
                        }
                      }
                    }}
                    className="w-full max-h-64 object-contain"
                  />
                </div>
              )}
            </>
          )}
        </div>

        <div className="lg:col-span-5 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <ScanFace className="h-4 w-4 text-teal-600" />
              Face AI Analyzer Settings
            </h4>
            {baselineProgress && (
              <span
                className={`wellness-pill text-[11px] ${
                  baselineProgress.isCalibrated
                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                    : "bg-amber-50 text-amber-700 border border-amber-200"
                }`}
              >
                Baseline: {baselineProgress.recorded}/{baselineProgress.minRequired}
              </span>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">Operational Mode</label>
            <div className="grid grid-cols-3 gap-1.5">
              {(
                [
                  { id: "single", label: "Single", desc: "Features only" },
                  { id: "calibrate", label: "Calibrate", desc: "Add to baseline" },
                  { id: "assess", label: "Assess", desc: "Compare baseline" },
                ] as const
              ).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMode(m.id)}
                  className={`rounded-xl border px-2.5 py-2 text-left transition ${
                    mode === m.id
                      ? "border-teal-600 bg-teal-600 text-white shadow-sm"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  <div className="text-xs font-semibold">{m.label}</div>
                  <div className={`text-[10px] ${mode === m.id ? "text-teal-100" : "text-slate-400"}`}>{m.desc}</div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="flex justify-between text-xs font-semibold text-slate-700 mb-1">
              <span>Max Video Duration Limit</span>
              <span>{maxDuration}s (max 30s)</span>
            </div>
            <input
              type="range"
              min={5}
              max={30}
              step={1}
              value={maxDuration}
              onChange={(e) => {
                const next = Number(e.target.value);
                setMaxDuration(next);
                if (videoDurationSec !== null && videoDurationSec <= next) {
                  setValidationError(null);
                }
              }}
              className="w-full accent-teal-600"
            />
          </div>

          {mode === "assess" && (
            <label className="flex items-start gap-2.5 rounded-xl border border-slate-200 bg-white p-3 cursor-pointer text-xs text-slate-700">
              <input
                type="checkbox"
                checked={updateBaseline}
                onChange={(e) => setUpdateBaseline(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-teal-600"
              />
              <span>
                <strong>Update baseline after assessment</strong> (only applied if quality passes suitability threshold)
              </span>
            </label>
          )}

          <div className="rounded-xl bg-white border border-slate-200 p-3 text-xs text-slate-600 space-y-1">
            <div className="font-semibold text-slate-800">Active Profile: {userId}</div>
            <p>WebM and uploaded clips are verified via FFprobe/FFmpeg and discarded immediately after extraction.</p>
          </div>

          <button
            type="button"
            disabled={
              analyzing ||
              !selectedFile ||
              (sourceMode === "record" && !recordingConfirmed) ||
              Boolean(validationError)
            }
            onClick={handleAnalyze}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-teal-600 to-sky-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:from-teal-700 hover:to-sky-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {analyzing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Analyzing Facial Video...
              </>
            ) : (
              <>
                <PlayCircle className="h-4 w-4" />
                Analyze Facial Video
              </>
            )}
          </button>

          {analyzing && (
            <div className="space-y-1">
              <div className="h-2 w-full rounded-full bg-slate-200 overflow-hidden">
                <div
                  className="h-full bg-teal-600 transition-all duration-300"
                  style={{ width: `${Math.max(15, progress)}%` }}
                />
              </div>
              <p className="text-[11px] text-slate-500 text-center">
                {progress < 90 ? `Uploading video (${progress}%)...` : "Validating & extracting facial behaviour metrics..."}
              </p>
            </div>
          )}
        </div>
      </div>

      {(validationError || apiError) && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 flex items-start gap-2.5">
          <AlertTriangle className="h-5 w-5 shrink-0 text-rose-600 mt-0.5" />
          <span>{validationError || apiError}</span>
        </div>
      )}

      {/* Results Display */}
      {res && (
        <div className="space-y-4 pt-2 border-t border-slate-200">
          {res.calibration_status?.error && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900 flex items-start gap-2.5">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
              <div>
                <strong>Calibration Skipped:</strong> {res.calibration_status.error}
              </div>
            </div>
          )}

          {res.calibration_status && !res.calibration_status.error && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-900 flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 font-medium">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                Calibration session recorded for <strong>{res.calibration_status.user_id}</strong>:{" "}
                {res.calibration_status.total_checkins} / {res.calibration_status.min_required} required sessions
              </span>
              <span className="font-semibold">
                {res.calibration_status.is_calibrated ? "Baseline Established" : "In Progress"}
              </span>
            </div>
          )}

          {/* Quality Assessment */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-teal-600" />
                Tracking Quality Assessment
              </h4>
              <div className="flex flex-wrap gap-2">
                <span
                  className={`wellness-pill ${
                    res.quality.is_reliable
                      ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                      : "bg-amber-50 text-amber-800 border border-amber-200"
                  }`}
                >
                  {res.quality.is_reliable ? "Reliable Tracking" : "Low Reliability"}
                </span>
                <span
                  className={`wellness-pill ${
                    res.quality.is_suitable_for_baseline
                      ? "bg-sky-50 text-sky-700 border border-sky-200"
                      : "bg-slate-100 text-slate-600 border border-slate-200"
                  }`}
                >
                  {res.quality.is_suitable_for_baseline ? "Baseline Suitable" : "Not Baseline Suitable"}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <MetricMini label="Quality Score" value={`${res.quality.quality_score.toFixed(1)} / 100`} />
              <MetricMini
                label="Detection Coverage"
                value={`${(res.quality.detection_coverage * 100).toFixed(1)}%`}
                sub={`${res.quality.usable_frames}/${res.quality.total_frames} frames`}
              />
              <MetricMini
                label="Duration & FPS"
                value={`${res.video_metadata.duration_sec.toFixed(2)}s`}
                sub={`${res.video_metadata.fps.toFixed(1)} FPS • ${res.video_metadata.resolution}`}
              />
              <MetricMini
                label="Lighting & Scale"
                value={`Lum ${res.quality.avg_luminance.toFixed(0)}`}
                sub={`Face area ${(res.quality.avg_face_scale * 100).toFixed(1)}%`}
              />
            </div>

            {res.quality.warnings.length > 0 && (
              <ul className="space-y-1 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3">
                {res.quality.warnings.map((w, idx) => (
                  <li key={idx}>• {w}</li>
                ))}
              </ul>
            )}
          </div>

          {/* Five Facial Features */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-slate-900">Five Extracted Facial Behavioural Features</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
              {(
                [
                  {
                    key: "facialMovementVelocity",
                    label: "Facial Movement Velocity",
                    unit: "face-units / s",
                    extra: "Mean landmark displacement",
                  },
                  {
                    key: "eyeBlinkRatePm",
                    label: "Eye-Blink Rate",
                    unit: "blinks / min",
                    extra: `${res.features.auxiliary_metrics?.total_blinks_detected ?? 0} blinks detected`,
                  },
                  {
                    key: "headPoseJitterStd",
                    label: "Head-Pose Variability",
                    unit: "degrees",
                    extra: `Yaw SD ${res.features.auxiliary_metrics?.yaw_std_deg ?? "N/A"}°`,
                  },
                  {
                    key: "smileIntensityProxy",
                    label: "Smile-Intensity Proxy",
                    unit: "ratio",
                    extra: `Peak ${res.features.auxiliary_metrics?.smile_peak_ratio ?? "N/A"}`,
                  },
                  {
                    key: "browFurrowProxy",
                    label: "Brow-Furrow Proxy",
                    unit: "ratio",
                    extra: `Min ${res.features.auxiliary_metrics?.brow_min_ratio ?? "N/A"} (lower = stronger)`,
                  },
                ] as const
              ).map((item) => {
                const rawVal = res.features[item.key];
                const defText = res.features.feature_definitions?.[item.key];
                return (
                  <div key={item.key} className="rounded-xl border border-slate-200 bg-white p-3.5 flex flex-col justify-between">
                    <div>
                      <div className="text-xs font-semibold text-slate-700 flex items-start justify-between gap-1">
                        <span>{item.label}</span>
                        {defText && (
                          <span title={defText} className="text-slate-400 cursor-help shrink-0">
                            <Info className="h-3.5 w-3.5" />
                          </span>
                        )}
                      </div>
                      <div className="mt-2 text-lg font-bold text-slate-900">
                        {rawVal !== null && rawVal !== undefined ? rawVal.toFixed(3) : "Unavailable"}
                      </div>
                      <div className="text-[11px] text-slate-500">{item.unit}</div>
                    </div>
                    <div className="mt-2 pt-2 border-t border-slate-100 text-[11px] text-slate-500">{item.extra}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Baseline Comparison Table (Assess Mode) */}
          {res.baseline_comparison && (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-sm font-semibold text-slate-900">Personal Baseline Comparison</h4>
                <span className="wellness-pill bg-sky-50 text-sky-700 border border-sky-200">
                  {res.baseline_comparison.is_calibrated
                    ? `Calibrated (${res.baseline_comparison.total_calibration_checkins} sessions)`
                    : `Preliminary (${res.baseline_comparison.total_calibration_checkins}/${res.baseline_comparison.min_checkins_required})`}
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500">
                      <th className="py-2 pr-3 font-semibold">Feature</th>
                      <th className="py-2 pr-3 font-semibold">Observed</th>
                      <th className="py-2 pr-3 font-semibold">Base Mean ± SD</th>
                      <th className="py-2 pr-3 font-semibold">z-score</th>
                      <th className="py-2 font-semibold">Interpretation</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {Object.values(res.baseline_comparison.comparisons).map((c) => (
                      <tr key={c.feature_name}>
                        <td className="py-2 pr-3 font-medium text-slate-800">{c.feature_name}</td>
                        <td className="py-2 pr-3">{c.current_value !== null ? c.current_value.toFixed(3) : "N/A"}</td>
                        <td className="py-2 pr-3 text-slate-600">
                          {c.baseline_mean !== null
                            ? `${c.baseline_mean.toFixed(3)} ± ${(c.baseline_std ?? 0).toFixed(3)}`
                            : "N/A"}
                        </td>
                        <td className="py-2 pr-3 font-semibold">
                          {c.standardized_z !== null ? `${c.standardized_z >= 0 ? "+" : ""}${c.standardized_z.toFixed(2)}` : "N/A"}
                        </td>
                        <td className="py-2 text-slate-600">{c.interpretation}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-xs text-slate-600">
            <strong>Limitations:</strong> {res.disclaimer}
          </div>

          <JsonInspectorCard
            title="Facial AI JSON Output"
            filename={`face_analysis_${currentRun?.runId.slice(0, 8)}.json`}
            data={res}
          />
        </div>
      )}
    </div>
  );
};

const MetricMini: React.FC<{ label: string; value: string; sub?: string }> = ({ label, value, sub }) => (
  <div className="rounded-xl border border-slate-200 bg-white p-3">
    <div className="text-[11px] font-medium text-slate-500">{label}</div>
    <div className="text-sm font-bold text-slate-900 mt-0.5">{value}</div>
    {sub && <div className="text-[11px] text-slate-400 mt-0.5">{sub}</div>}
  </div>
);
