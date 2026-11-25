import React, { useState } from "react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Mic,
  RefreshCw,
  RotateCcw,
  ScanFace,
  ShieldAlert,
  TrendingUp,
} from "lucide-react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { resetBaseline } from "../services/api";
import type { BaselinesResponse, CheckinSession } from "../types/mindtrack";
import { EmptyStateCard, NonDiagnosticBanner } from "../components/SharedUI";

interface BaselinesPageProps {
  userId: string;
  baselines: BaselinesResponse | null;
  checkins: CheckinSession[];
  onRefresh: () => void;
  onNotify: (type: "success" | "error" | "info", text: string) => void;
}

const FACE_FEATURE_LABELS: Record<string, string> = {
  facialMovementVelocity: "Facial Movement Velocity",
  eyeBlinkRatePm: "Eye Blink Rate (blinks/min)",
  headPoseJitterStd: "Head Pose Jitter Std (deg)",
  smileIntensityProxy: "Smile Intensity Proxy",
  browFurrowProxy: "Brow Furrow Proxy",
};

const VOICE_FEATURE_LABELS: Record<string, string> = {
  speakingRateWpm: "Speaking Rate (WPM)",
  pitchMeanHz: "Pitch Mean (Hz)",
  pitchStdDevHz: "Pitch Std Dev (Hz)",
  meanPauseDurationMs: "Mean Pause Duration (ms)",
  speechRatio: "Speech Ratio",
  energyMeanRms: "Energy Mean (RMS)",
  totalPauseCount: "Total Pause Count",
  longestPauseDurationMs: "Longest Pause (ms)",
  speechDurationSec: "Speech Duration (s)",
  silenceDurationSec: "Silence Duration (s)",
  pitchRangeHz: "Pitch Range (Hz)",
  energyStdDev: "Energy Std Dev",
};

export const BaselinesPage: React.FC<BaselinesPageProps> = ({
  userId,
  baselines,
  checkins,
  onRefresh,
  onNotify,
}) => {
  const [resetting, setResetting] = useState<string | null>(null);

  const handleReset = async (modality: "face" | "voice") => {
    if (!confirm(`Reset your ${modality} baseline? This will require re-calibration.`)) return;
    setResetting(modality);
    try {
      await resetBaseline(userId, modality);
      onNotify("success", `${modality === "face" ? "Facial" : "Voice"} baseline reset. Re-calibrate by running new sessions in "calibrate" mode.`);
      onRefresh();
    } catch (err) {
      onNotify("error", err instanceof Error ? err.message : "Failed to reset baseline.");
    } finally {
      setResetting(null);
    }
  };

  const fb = baselines?.face;
  const vb = baselines?.voice;
  const qb = baselines?.questionnaire;
  const summary = baselines?.summary;
  const qMoodBaseMean = qb?.stats?.dailyAffectMood?.mean ?? undefined;
  const faceBlinkBaseMean = fb?.feature_stats?.eyeBlinkRatePm?.mean ?? undefined;
  const faceVelBaseMean = fb?.feature_stats?.facialMovementVelocity?.mean ?? undefined;
  const voiceWpmBaseMean = vb?.stats?.speakingRateWpm?.mean ?? undefined;
  const voicePitchBaseMean = vb?.stats?.pitchMeanHz?.mean ?? undefined;

  /* Build chronological trend series preserving missing modalities as null */
  const chronological = [...checkins].reverse();

  const qTrendData = chronological.map((c) => ({
    label: new Date(c.sessionTimestamp).toLocaleDateString(),
    mood: c.questionnaire?.dailyAffectMood ?? null,
    energy: c.questionnaire?.dailyAffectEnergy ?? null,
    stress: c.questionnaire?.dailyAffectStress ?? null,
  }));

  const faceBlinkTrend = chronological.map((c) => ({
    label: new Date(c.sessionTimestamp).toLocaleDateString(),
    eyeBlinkRatePm: c.face?.features.eyeBlinkRatePm ?? null,
  }));

  const faceVelocityTrend = chronological.map((c) => ({
    label: new Date(c.sessionTimestamp).toLocaleDateString(),
    facialMovementVelocity: c.face?.features.facialMovementVelocity ?? null,
  }));

  const voiceWpmTrend = chronological.map((c) => ({
    label: new Date(c.sessionTimestamp).toLocaleDateString(),
    speakingRateWpm: c.voice?.features.speakingRateWpm ?? null,
  }));

  const voicePitchTrend = chronological.map((c) => ({
    label: new Date(c.sessionTimestamp).toLocaleDateString(),
    pitchMeanHz: c.voice?.features.pitchMeanHz ?? null,
  }));

  const hasAnyQ = qTrendData.some((d) => d.mood !== null);
  const hasAnyFace = faceBlinkTrend.some((d) => d.eyeBlinkRatePm !== null) || faceVelocityTrend.some((d) => d.facialMovementVelocity !== null);
  const hasAnyVoice = voiceWpmTrend.some((d) => d.speakingRateWpm !== null);

  if (!baselines) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-10 w-64 rounded-xl bg-slate-200/70" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <div key={i} className="h-48 rounded-2xl bg-slate-200/70" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-sky-600" />
            Personal Baselines &amp; Longitudinal Trends
          </h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Personal baseline summary cards, feature statistics, and check-in trend comparison for {userId}
          </p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition"
        >
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </div>

      <NonDiagnosticBanner compact />

      {/* Feature 4A: Overall Personal Baseline Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Face baseline summary card */}
        <div className="wellness-card p-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900">
              <ScanFace className="h-5 w-5 text-teal-600" /> Facial Baseline Summary
            </span>
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${fb?.is_calibrated ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
              {summary?.faceSummary.status ?? (fb?.is_calibrated ? "CALIBRATED" : "CALIBRATING")}
            </span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-2.5">
            <div
              className="h-2.5 rounded-full bg-gradient-to-r from-teal-400 to-teal-600 transition-all"
              style={{ width: `${Math.min(100, ((fb?.total_checkins_recorded ?? 0) / (fb?.min_calibration_checkins ?? 5)) * 100)}%` }}
            />
          </div>
          <div className="space-y-1 text-xs text-slate-600">
            <div className="flex justify-between">
              <span>Calibration Sessions</span>
              <strong>{fb?.total_checkins_recorded ?? 0} / {fb?.min_calibration_checkins ?? 5}</strong>
            </div>
            <div className="flex justify-between">
              <span>Valid Observations</span>
              <strong>{summary?.faceSummary.validObservations ?? fb?.history.length ?? 0}</strong>
            </div>
            <div className="flex justify-between">
              <span>Avg Quality / Coverage</span>
              <strong>
                {summary?.faceSummary.avgQualityScore !== null && summary?.faceSummary.avgQualityScore !== undefined
                  ? `${summary.faceSummary.avgQualityScore}/100`
                  : "—"}{" "}
                •{" "}
                {summary?.faceSummary.avgDetectionCoverage !== null && summary?.faceSummary.avgDetectionCoverage !== undefined
                  ? `${(summary.faceSummary.avgDetectionCoverage * 100).toFixed(0)}%`
                  : "—"}
              </strong>
            </div>
            <div className="flex justify-between text-[11px] text-slate-400">
              <span>Available / Missing Features</span>
              <span>
                {summary?.faceSummary.availableFeatures.length ?? 0} / {summary?.faceSummary.missingFeatures.length ?? 5}
              </span>
            </div>
            <div className="text-[11px] text-slate-400">
              Updated: {summary?.faceSummary.updatedAt ? new Date(summary.faceSummary.updatedAt).toLocaleDateString() : "Not created"}
            </div>
          </div>
          {(fb?.exists || (fb?.total_checkins_recorded ?? 0) > 0) && (
            <button
              type="button"
              onClick={() => handleReset("face")}
              disabled={resetting === "face"}
              className="mt-1 inline-flex items-center gap-1.5 text-xs font-semibold text-rose-600 hover:text-rose-700 disabled:opacity-50"
            >
              <RotateCcw className="h-3.5 w-3.5" /> {resetting === "face" ? "Resetting…" : "Reset Baseline"}
            </button>
          )}
        </div>

        {/* Voice baseline summary card */}
        <div className="wellness-card p-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Mic className="h-5 w-5 text-violet-600" /> Voice Baseline Summary
            </span>
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${vb?.is_established ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
              {summary?.voiceSummary.status ?? (vb?.is_established ? "ESTABLISHED" : "CALIBRATING")}
            </span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-2.5">
            <div
              className="h-2.5 rounded-full bg-gradient-to-r from-violet-400 to-violet-600 transition-all"
              style={{ width: `${Math.min(100, ((vb?.observation_count ?? 0) / (vb?.min_observations ?? 3)) * 100)}%` }}
            />
          </div>
          <div className="space-y-1 text-xs text-slate-600">
            <div className="flex justify-between">
              <span>Calibration Observations</span>
              <strong>{vb?.observation_count ?? 0} / {vb?.min_observations ?? 3}</strong>
            </div>
            <div className="flex justify-between">
              <span>Valid Observations</span>
              <strong>{summary?.voiceSummary.validObservations ?? vb?.history.length ?? 0}</strong>
            </div>
            <div className="flex justify-between">
              <span>Avg Signal Quality</span>
              <strong>
                {summary?.voiceSummary.avgQualityScore !== null && summary?.voiceSummary.avgQualityScore !== undefined
                  ? `${summary.voiceSummary.avgQualityScore.toFixed(2)} / 1.00`
                  : "—"}
              </strong>
            </div>
            <div className="flex justify-between text-[11px] text-slate-400">
              <span>Available / Missing Features</span>
              <span>
                {summary?.voiceSummary.availableFeatures.length ?? 0} / {summary?.voiceSummary.missingFeatures.length ?? 12}
              </span>
            </div>
            <div className="text-[11px] text-slate-400">
              Updated: {summary?.voiceSummary.updatedAt ? new Date(summary.voiceSummary.updatedAt).toLocaleDateString() : "Not created"}
            </div>
          </div>
          {(vb?.exists || (vb?.observation_count ?? 0) > 0) && (
            <button
              type="button"
              onClick={() => handleReset("voice")}
              disabled={resetting === "voice"}
              className="mt-1 inline-flex items-center gap-1.5 text-xs font-semibold text-rose-600 hover:text-rose-700 disabled:opacity-50"
            >
              <RotateCcw className="h-3.5 w-3.5" /> {resetting === "voice" ? "Resetting…" : "Reset Baseline"}
            </button>
          )}
        </div>

        {/* Questionnaire summary card */}
        <div className="wellness-card p-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Activity className="h-5 w-5 text-sky-600" /> Questionnaire Summary
            </span>
            <span className="text-xs font-bold text-sky-700 bg-sky-50 px-2 py-0.5 rounded-full">
              {qb?.sessionCount ?? 0} sessions
            </span>
          </div>
          {qb && Object.keys(qb.stats).length > 0 ? (
            <div className="space-y-1.5">
              {Object.entries(qb.stats).map(([key, stat]) => (
                <div key={key} className="flex justify-between text-xs">
                  <span className="text-slate-600 capitalize">{key.replace(/([A-Z])/g, " $1").trim()}</span>
                  <span className="font-semibold text-slate-800">
                    μ={stat.mean?.toFixed(2) ?? "—"} σ={stat.std?.toFixed(2) ?? "—"} (n={stat.count})
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-400">No questionnaire data recorded yet.</p>
          )}
          <div className="text-[11px] text-slate-400 pt-1">
            Updated: {summary?.questionnaireSummary.updatedAt ? new Date(summary.questionnaireSummary.updatedAt).toLocaleDateString() : "—"}
          </div>
        </div>
      </div>

      {/* Feature 4E: Overall Longitudinal Wellness Summary */}
      {summary?.overallWellnessSummary && (
        <div className="wellness-card p-5 space-y-4 border-indigo-200/70">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-indigo-600" />
                Overall Longitudinal Wellness Summary
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">{summary.overallWellnessSummary.notice}</p>
            </div>
            <span className="wellness-pill bg-indigo-50 text-indigo-800 border border-indigo-200">
              {summary.overallWellnessSummary.experimentalStatus} • Stress Score: N/A
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3 space-y-1.5">
              <div className="font-semibold text-amber-900">Changed vs Personal Baseline</div>
              {summary.overallWellnessSummary.changedFeatures.length > 0 ? (
                <ul className="space-y-1 text-amber-800">
                  {summary.overallWellnessSummary.changedFeatures.slice(0, 5).map((item, idx) => (
                    <li key={idx}>• [{item.modality}] {item.feature} ({item.direction})</li>
                  ))}
                </ul>
              ) : (
                <p className="text-slate-500">No notable baseline shifts on latest check-in.</p>
              )}
            </div>

            <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3 space-y-1.5">
              <div className="font-semibold text-emerald-900 flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Stable Within Baseline
              </div>
              {summary.overallWellnessSummary.stableFeatures.length > 0 ? (
                <ul className="space-y-1 text-emerald-800">
                  {summary.overallWellnessSummary.stableFeatures.slice(0, 6).map((item, idx) => (
                    <li key={idx}>• [{item.modality}] {item.feature}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-slate-500">Awaiting multi-session baseline range.</p>
              )}
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-1.5">
              <div className="font-semibold text-slate-800">Unavailable (Quality / Missing)</div>
              {summary.overallWellnessSummary.unavailableDueToQualityOrMissing.length > 0 ? (
                <ul className="space-y-1 text-slate-600">
                  {summary.overallWellnessSummary.unavailableDueToQualityOrMissing.map((item, idx) => (
                    <li key={idx}>• {item.reason}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-slate-500">All modalities present with acceptable quality.</p>
              )}
            </div>

            <div className="rounded-xl border border-sky-200 bg-sky-50/50 p-3 space-y-1.5">
              <div className="font-semibold text-sky-900">Needs More Observations</div>
              {summary.overallWellnessSummary.needingMoreObservations.length > 0 ? (
                <ul className="space-y-1 text-sky-800">
                  {summary.overallWellnessSummary.needingMoreObservations.map((item, idx) => (
                    <li key={idx}>• {item.detail}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-slate-500">All modality calibration minimums satisfied.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Face & Voice Feature Statistics Tables */}
      {fb && Object.keys(fb.feature_stats).length > 0 && (
        <div className="wellness-card p-5 space-y-3">
          <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
            <ScanFace className="h-4 w-4 text-teal-600" /> Facial Feature Baseline Statistics
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500">
                  <th className="pb-2 pr-4 font-medium">Feature</th>
                  <th className="pb-2 pr-4 font-medium text-right">Count</th>
                  <th className="pb-2 pr-4 font-medium text-right">Mean</th>
                  <th className="pb-2 pr-4 font-medium text-right">Std Dev</th>
                  <th className="pb-2 pr-4 font-medium text-right">Min</th>
                  <th className="pb-2 font-medium text-right">Max</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(fb.feature_stats).map(([key, stat]) => (
                  <tr key={key} className="border-b border-slate-100">
                    <td className="py-2 pr-4 font-medium text-slate-700">{FACE_FEATURE_LABELS[key] ?? key}</td>
                    <td className="py-2 pr-4 text-right text-slate-600">{stat.count}</td>
                    <td className="py-2 pr-4 text-right font-semibold text-slate-800">{stat.mean?.toFixed(4) ?? "—"}</td>
                    <td className="py-2 pr-4 text-right text-slate-600">{stat.std?.toFixed(4) ?? "—"}</td>
                    <td className="py-2 pr-4 text-right text-slate-600">{stat.min?.toFixed(4) ?? "—"}</td>
                    <td className="py-2 text-right text-slate-600">{stat.max?.toFixed(4) ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {vb && Object.keys(vb.stats).length > 0 && (
        <div className="wellness-card p-5 space-y-3">
          <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
            <Mic className="h-4 w-4 text-violet-600" /> Voice Feature Baseline Statistics
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500">
                  <th className="pb-2 pr-4 font-medium">Feature</th>
                  <th className="pb-2 pr-4 font-medium text-right">Count</th>
                  <th className="pb-2 pr-4 font-medium text-right">Mean</th>
                  <th className="pb-2 pr-4 font-medium text-right">Std Dev</th>
                  <th className="pb-2 pr-4 font-medium text-right">Min</th>
                  <th className="pb-2 font-medium text-right">Max</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(vb.stats).map(([key, stat]) => (
                  <tr key={key} className="border-b border-slate-100">
                    <td className="py-2 pr-4 font-medium text-slate-700">{VOICE_FEATURE_LABELS[key] ?? key}</td>
                    <td className="py-2 pr-4 text-right text-slate-600">{stat.count}</td>
                    <td className="py-2 pr-4 text-right font-semibold text-slate-800">{stat.mean?.toFixed(4) ?? "—"}</td>
                    <td className="py-2 pr-4 text-right text-slate-600">{stat.std?.toFixed(4) ?? "—"}</td>
                    <td className="py-2 pr-4 text-right text-slate-600">{stat.min?.toFixed(4) ?? "—"}</td>
                    <td className="py-2 text-right text-slate-600">{stat.max?.toFixed(4) ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Feature 4D: Trend Charts with Compatible Scales, Baseline ReferenceLines & Null Gaps */}
      {hasAnyQ && (
        <div className="wellness-card p-5 space-y-4">
          <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-sky-600" /> Self-Report Trends (1–5 Scale)
          </h3>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={qTrendData} margin={{ top: 8, right: 16, left: -12, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748b" }} />
                <YAxis domain={[0, 5]} tick={{ fontSize: 11, fill: "#64748b" }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: "12px" }} />
                {qMoodBaseMean !== undefined && (
                  <ReferenceLine
                    y={qMoodBaseMean}
                    stroke="#0284c7"
                    strokeDasharray="4 4"
                    label={{ value: "Mood Base", fontSize: 10, fill: "#0284c7" }}
                  />
                )}
                <Line type="monotone" dataKey="mood" name="Mood (1–5)" stroke="#0284c7" strokeWidth={2.5} dot={{ r: 4 }} connectNulls={false} />
                <Line type="monotone" dataKey="energy" name="Energy (1–5)" stroke="#0d9488" strokeWidth={2.5} dot={{ r: 4 }} connectNulls={false} />
                <Line type="monotone" dataKey="stress" name="Strain (1–5)" stroke="#7c3aed" strokeWidth={2.5} dot={{ r: 4 }} connectNulls={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {hasAnyFace && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="wellness-card p-5 space-y-3">
            <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <ScanFace className="h-4 w-4 text-teal-600" /> Facial Blink Rate (blinks/min)
            </h3>
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={faceBlinkTrend} margin={{ top: 8, right: 16, left: -12, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748b" }} />
                  <YAxis tick={{ fontSize: 11, fill: "#64748b" }} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: "12px" }} />
                  {faceBlinkBaseMean !== undefined && (
                    <ReferenceLine
                      y={faceBlinkBaseMean}
                      stroke="#0f766e"
                      strokeDasharray="4 4"
                      label={{ value: "Baseline Mean", fontSize: 10, fill: "#0f766e" }}
                    />
                  )}
                  <Line type="monotone" dataKey="eyeBlinkRatePm" name="Blink Rate (bpm)" stroke="#0284c7" strokeWidth={2.5} dot={{ r: 4 }} connectNulls={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="wellness-card p-5 space-y-3">
            <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <ScanFace className="h-4 w-4 text-teal-600" /> Facial Movement Velocity (face-units/s)
            </h3>
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={faceVelocityTrend} margin={{ top: 8, right: 16, left: -12, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748b" }} />
                  <YAxis tick={{ fontSize: 11, fill: "#64748b" }} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: "12px" }} />
                  {faceVelBaseMean !== undefined && (
                    <ReferenceLine
                      y={faceVelBaseMean}
                      stroke="#0f766e"
                      strokeDasharray="4 4"
                      label={{ value: "Baseline Mean", fontSize: 10, fill: "#0f766e" }}
                    />
                  )}
                  <Line type="monotone" dataKey="facialMovementVelocity" name="Movement Velocity" stroke="#0d9488" strokeWidth={2.5} dot={{ r: 4 }} connectNulls={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {hasAnyVoice && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="wellness-card p-5 space-y-3">
            <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <Mic className="h-4 w-4 text-violet-600" /> Voice Speaking Rate (WPM)
            </h3>
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={voiceWpmTrend} margin={{ top: 8, right: 16, left: -12, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748b" }} />
                  <YAxis tick={{ fontSize: 11, fill: "#64748b" }} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: "12px" }} />
                  {voiceWpmBaseMean !== undefined && (
                    <ReferenceLine
                      y={voiceWpmBaseMean}
                      stroke="#6d28d9"
                      strokeDasharray="4 4"
                      label={{ value: "Baseline Mean", fontSize: 10, fill: "#6d28d9" }}
                    />
                  )}
                  <Line type="monotone" dataKey="speakingRateWpm" name="Speaking Rate (WPM)" stroke="#7c3aed" strokeWidth={2.5} dot={{ r: 4 }} connectNulls={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="wellness-card p-5 space-y-3">
            <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <Mic className="h-4 w-4 text-violet-600" /> Voice Pitch Mean F0 (Hz)
            </h3>
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={voicePitchTrend} margin={{ top: 8, right: 16, left: -12, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748b" }} />
                  <YAxis tick={{ fontSize: 11, fill: "#64748b" }} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: "12px" }} />
                  {voicePitchBaseMean !== undefined && (
                    <ReferenceLine
                      y={voicePitchBaseMean}
                      stroke="#6d28d9"
                      strokeDasharray="4 4"
                      label={{ value: "Baseline Mean", fontSize: 10, fill: "#6d28d9" }}
                    />
                  )}
                  <Line type="monotone" dataKey="pitchMeanHz" name="Pitch Mean (Hz)" stroke="#0284c7" strokeWidth={2.5} dot={{ r: 4 }} connectNulls={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {!hasAnyQ && !hasAnyFace && !hasAnyVoice && (
        <EmptyStateCard
          title="No Trend Data Available"
          description="Complete check-ins to build longitudinal trend data. Each modality (questionnaire, facial video, voice recording) tracks independently."
          icon={<TrendingUp className="h-6 w-6" />}
        />
      )}

      <div className="rounded-xl border border-amber-200/80 bg-amber-50/70 p-4 flex items-start gap-3 text-xs text-amber-800">
        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-amber-600" />
        <div>
          <p className="font-semibold">About Personal Baselines</p>
          <p className="mt-0.5 leading-relaxed">
            Baselines are computed from your personal calibration sessions. Resetting a baseline deletes the saved
            profile and requires re-calibration. Face requires {fb?.min_calibration_checkins ?? 5} sessions and voice
            requires {vb?.min_observations ?? 3} observations to establish a stable baseline.
          </p>
        </div>
      </div>
    </div>
  );
};
