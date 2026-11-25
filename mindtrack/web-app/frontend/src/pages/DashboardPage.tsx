import React from "react";
import {
  Activity,
  ArrowRight,
  CalendarCheck,
  ClipboardList,
  Clock,
  Mic,
  PlusCircle,
  ScanFace,
  TrendingUp,
} from "lucide-react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DashboardResponse, NavPage } from "../types/mindtrack";
import { EmptyStateCard, ModalityBadge, NonDiagnosticBanner } from "../components/SharedUI";

export type { NavPage };

interface DashboardPageProps {
  dashboard: DashboardResponse | null;
  loading: boolean;
  onNavigate: (page: NavPage) => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({ dashboard, loading, onNavigate }) => {
  if (loading && !dashboard) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-32 rounded-3xl bg-slate-200/70" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-36 rounded-2xl bg-slate-200/70" />
          ))}
        </div>
      </div>
    );
  }

  const today = dashboard?.todayStatus;
  const latestQ = dashboard?.latestQuestionnaire;
  const latestFace = dashboard?.latestFace;
  const latestVoice = dashboard?.latestVoice;
  const faceBase = dashboard?.baselines.face;
  const voiceBase = dashboard?.baselines.voice;
  const trends = dashboard?.trends ?? [];

  return (
    <div className="space-y-6">
      {/* Welcome Hero Card */}
      <div className="rounded-3xl border border-sky-100 bg-gradient-to-br from-white via-sky-50/70 to-teal-50/80 p-6 sm:p-7 shadow-card">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/90 border border-sky-200 px-3 py-1 text-xs font-semibold text-sky-700">
              <CalendarCheck className="h-3.5 w-3.5" />
              {today?.checkedInToday ? "Today's check-in recorded" : "No check-in recorded yet today"}
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
              Welcome back, {dashboard?.user.fullName || "Participant"}
            </h1>
            <p className="text-sm text-slate-600 max-w-2xl leading-relaxed">
              Track longitudinal self-reports, facial behaviour measurements, and voice acoustics against your own
              empirical baseline. Missing modalities are always preserved cleanly without imputation.
            </p>
          </div>

          <div className="flex flex-wrap gap-3 shrink-0">
            <button
              type="button"
              onClick={() => onNavigate("checkin")}
              className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-sky-600 to-teal-600 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:from-sky-700 hover:to-teal-700 transition"
            >
              <PlusCircle className="h-4 w-4" />
              Start New Check-in
            </button>
            <button
              type="button"
              onClick={() => onNavigate("baselines")}
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition"
            >
              <TrendingUp className="h-4 w-4 text-teal-600" />
              Baseline &amp; Trends
            </button>
          </div>
        </div>
      </div>

      <NonDiagnosticBanner compact />

      {/* 4 Modality & Baseline Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* Questionnaire Card */}
        <div className="wellness-card p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="h-10 w-10 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center">
                <ClipboardList className="h-5 w-5" />
              </span>
              <span className="text-xs font-medium text-slate-400">Self-Report</span>
            </div>
            <h3 className="mt-3 text-sm font-semibold text-slate-900">Latest Questionnaire</h3>
            {latestQ ? (
              <div className="mt-2 space-y-1 text-xs text-slate-600">
                <div className="flex justify-between">
                  <span>Mood / Energy / Stress</span>
                  <span className="font-bold text-slate-900">
                    {latestQ.dailyAffectMood} / {latestQ.dailyAffectEnergy} / {latestQ.dailyAffectStress}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>PHQ-2 / GAD-2 items</span>
                  <span className="font-semibold text-slate-700">
                    {latestQ.phq2Total ?? "—"} / {latestQ.gad2Total ?? "—"}
                  </span>
                </div>
              </div>
            ) : (
              <p className="mt-2 text-xs text-slate-400">No questionnaire check-ins saved yet.</p>
            )}
          </div>
          <button
            type="button"
            onClick={() => onNavigate("questionnaire")}
            className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-sky-700 hover:text-sky-800"
          >
            Open Questionnaire <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Facial AI Card */}
        <div className="wellness-card p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="h-10 w-10 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center">
                <ScanFace className="h-5 w-5" />
              </span>
              <span className="text-xs font-medium text-slate-400">Face AI</span>
            </div>
            <h3 className="mt-3 text-sm font-semibold text-slate-900">Facial Analysis Status</h3>
            {latestFace ? (
              <div className="mt-2 space-y-1 text-xs text-slate-600">
                <div className="flex justify-between">
                  <span>Tracking Quality</span>
                  <span className="font-bold text-slate-900">{latestFace.qualityScore?.toFixed(1) ?? "—"} / 100</span>
                </div>
                <div className="flex justify-between">
                  <span>Blink Rate / Velocity</span>
                  <span className="font-semibold text-slate-700">
                    {latestFace.features.eyeBlinkRatePm?.toFixed(1) ?? "N/A"} bpm •{" "}
                    {latestFace.features.facialMovementVelocity?.toFixed(2) ?? "N/A"}
                  </span>
                </div>
              </div>
            ) : (
              <p className="mt-2 text-xs text-slate-400">No facial video check-ins analyzed yet.</p>
            )}
          </div>
          <button
            type="button"
            onClick={() => onNavigate("face")}
            className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-teal-700 hover:text-teal-800"
          >
            Open Facial AI <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Voice AI Card */}
        <div className="wellness-card p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="h-10 w-10 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center">
                <Mic className="h-5 w-5" />
              </span>
              <span className="text-xs font-medium text-slate-400">Voice AI</span>
            </div>
            <h3 className="mt-3 text-sm font-semibold text-slate-900">Voice Analysis Status</h3>
            {latestVoice ? (
              <div className="mt-2 space-y-1 text-xs text-slate-600">
                <div className="flex justify-between">
                  <span>Signal Quality</span>
                  <span className="font-bold text-slate-900">{latestVoice.qualityScore?.toFixed(2) ?? "—"} / 1.00</span>
                </div>
                <div className="flex justify-between">
                  <span>Rate / Pitch F0</span>
                  <span className="font-semibold text-slate-700">
                    {latestVoice.features.speakingRateWpm} WPM • {latestVoice.features.pitchMeanHz} Hz
                  </span>
                </div>
              </div>
            ) : (
              <p className="mt-2 text-xs text-slate-400">No WAV voice recordings analyzed yet.</p>
            )}
          </div>
          <button
            type="button"
            onClick={() => onNavigate("voice")}
            className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-violet-700 hover:text-violet-800"
          >
            Open Voice AI <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Personal Baseline Status Card */}
        <div className="wellness-card p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="h-10 w-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <Activity className="h-5 w-5" />
              </span>
              <span className="text-xs font-medium text-slate-400">Total: {today?.totalCheckins ?? 0}</span>
            </div>
            <h3 className="mt-3 text-sm font-semibold text-slate-900">Personal Baseline Status</h3>
            <div className="mt-2 space-y-1.5 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>Facial Baseline</span>
                <span className={`font-semibold ${faceBase?.isCalibrated ? "text-emerald-700" : "text-amber-700"}`}>
                  {faceBase?.totalRecorded ?? 0} / {faceBase?.minRequired ?? 5}{" "}
                  {faceBase?.isCalibrated ? "(Ready)" : "(Calibrating)"}
                </span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Voice Baseline</span>
                <span className={`font-semibold ${voiceBase?.isEstablished ? "text-emerald-700" : "text-amber-700"}`}>
                  {voiceBase?.observationCount ?? 0} / {voiceBase?.minRequired ?? 3}{" "}
                  {voiceBase?.isEstablished ? "(Ready)" : "(Calibrating)"}
                </span>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onNavigate("baselines")}
            className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800"
          >
            View Baseline Details <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Longitudinal Trend Chart & Recent Activity */}
      {trends.length === 0 ? (
        <EmptyStateCard
          title="Begin Your Longitudinal Wellness Record"
          description="No check-ins are stored for this profile yet. Start with a quick self-report questionnaire, and optionally add a facial video or WAV voice recording whenever available."
          actionLabel="Begin First Check-in"
          onAction={() => onNavigate("checkin")}
        />
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
          <div className="xl:col-span-7 wellness-card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-slate-900">Longitudinal Self-Report &amp; Modality Trends</h3>
                <p className="text-xs text-slate-500">Real saved check-ins only — omitted modalities stay disconnected (null)</p>
              </div>
              <button
                type="button"
                onClick={() => onNavigate("baselines")}
                className="text-xs font-semibold text-sky-700 hover:underline"
              >
                Full Trend View
              </button>
            </div>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trends} margin={{ top: 8, right: 16, left: -12, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748b" }} />
                  <YAxis domain={[0, 5]} tick={{ fontSize: 11, fill: "#64748b" }} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: "12px" }} />
                  <Line type="monotone" dataKey="mood" name="Mood (1–5)" stroke="#0284c7" strokeWidth={2.5} dot={{ r: 4 }} connectNulls={false} />
                  <Line type="monotone" dataKey="energy" name="Energy (1–5)" stroke="#0d9488" strokeWidth={2.5} dot={{ r: 4 }} connectNulls={false} />
                  <Line type="monotone" dataKey="stress" name="Strain (1–5)" stroke="#7c3aed" strokeWidth={2.5} dot={{ r: 4 }} connectNulls={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="xl:col-span-5 wellness-card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900">Recent Check-in History</h3>
              <button
                type="button"
                onClick={() => onNavigate("history")}
                className="text-xs font-semibold text-sky-700 hover:underline"
              >
                View All
              </button>
            </div>

            <div className="space-y-3">
              {dashboard?.recentCheckins.map((c) => (
                <div key={c.id} className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-3.5 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="inline-flex items-center gap-1.5 font-semibold text-slate-800">
                      <Clock className="h-3.5 w-3.5 text-slate-400" />
                      {new Date(c.sessionTimestamp).toLocaleString()}
                    </span>
                    <span className="text-[11px] font-medium text-emerald-700">{c.status}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {c.availableModalities.map((m) => (
                      <ModalityBadge key={m} modality={m} />
                    ))}
                    {c.missingModalities.map((m) => (
                      <ModalityBadge key={m} modality={m} missing />
                    ))}
                  </div>
                  {c.questionnaire && (
                    <div className="text-xs text-slate-600">
                      Mood {c.questionnaire.dailyAffectMood}/5 • Energy {c.questionnaire.dailyAffectEnergy}/5 • Strain{" "}
                      {c.questionnaire.dailyAffectStress}/5
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
