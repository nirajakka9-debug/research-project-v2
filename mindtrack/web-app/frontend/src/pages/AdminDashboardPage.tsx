import React, { useCallback, useEffect, useState } from "react";
import {
  Activity,
  CheckCircle2,
  Database,
  Loader2,
  RefreshCw,
  Server,
  Shield,
  Users,
  XCircle,
} from "lucide-react";
import { fetchAdminOverview } from "../services/api";
import type { AdminOverviewResponse, NavPage } from "../types/mindtrack";
import { NonDiagnosticBanner } from "../components/SharedUI";

interface AdminDashboardPageProps {
  onNavigate: (page: NavPage) => void;
  onNotify: (type: "success" | "error" | "info", text: string) => void;
}

export const AdminDashboardPage: React.FC<AdminDashboardPageProps> = ({
  onNavigate,
  onNotify,
}) => {
  const [overview, setOverview] = useState<AdminOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchAdminOverview();
      setOverview(data);
    } catch (err) {
      onNotify("error", err instanceof Error ? err.message : "Failed to load admin overview.");
    } finally {
      setLoading(false);
    }
  }, [onNotify]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Shield className="h-6 w-6 text-sky-600" />
            Administrator Dashboard
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            System-level service health, media conversion readiness, and aggregate platform usage
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onNavigate("admin-users")}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
          >
            <Users className="h-4 w-4" /> Manage Users
          </button>
          <button
            type="button"
            onClick={loadOverview}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Refresh
          </button>
        </div>
      </div>

      <NonDiagnosticBanner compact />

      {overview ? (
        <>
          {/* System Service Health */}
          <div className="wellness-card p-5 space-y-4">
            <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <Server className="h-4 w-4 text-sky-600" /> System &amp; Media Pipeline Health
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              <HealthTile
                label="Backend API"
                ok={overview.systemHealth.serviceStatus === "UP"}
                value={overview.systemHealth.serviceStatus}
                sub={overview.systemHealth.runtime}
              />
              <HealthTile
                label="Facial AI Adapter"
                ok={overview.systemHealth.faceAiAvailable}
                value={overview.systemHealth.faceAiAvailable ? "Ready" : "Unavailable"}
                sub="5 behavioural metrics + quality"
              />
              <HealthTile
                label="Voice AI DSP Pipeline"
                ok={overview.systemHealth.voiceAiAvailable}
                value={overview.systemHealth.voiceAiAvailable ? "Ready" : "Unavailable"}
                sub="12 acoustic metrics (16 kHz mono WAV)"
              />
              <HealthTile
                label="FFmpeg / FFprobe"
                ok={overview.systemHealth.ffmpegAvailable && overview.systemHealth.ffprobeAvailable}
                value={
                  overview.systemHealth.ffmpegAvailable
                    ? "Installed & Verified"
                    : "Not Installed"
                }
                sub={overview.systemHealth.ffmpegVersion || "Audio conversion unavailable"}
              />
            </div>
          </div>

          {/* Aggregate Usage Statistics */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <StatCard
              icon={<Users className="h-5 w-5 text-sky-600" />}
              label="Registered Accounts"
              value={String(overview.usageStats.totalUsers)}
              detail={`${overview.usageStats.activeUsers} active • ${overview.usageStats.inactiveUsers} inactive • ${overview.usageStats.adminCount} admin`}
            />
            <StatCard
              icon={<Activity className="h-5 w-5 text-teal-600" />}
              label="Total Check-in Sessions"
              value={String(overview.usageStats.totalCheckins)}
              detail={`Q: ${overview.usageStats.modalityCounts.QUESTIONNAIRE} • Face: ${overview.usageStats.modalityCounts.FACE} • Voice: ${overview.usageStats.modalityCounts.VOICE}`}
            />
            <StatCard
              icon={<Database className="h-5 w-5 text-violet-600" />}
              label="AI Analysis Runs"
              value={String(overview.usageStats.totalAnalysisRuns)}
              detail={`Face runs: ${overview.usageStats.faceAnalysisRuns} • Voice runs: ${overview.usageStats.voiceAnalysisRuns}`}
            />
            <StatCard
              icon={<CheckCircle2 className="h-5 w-5 text-emerald-600" />}
              label="Established Baselines"
              value={String(
                overview.usageStats.establishedFaceBaselines +
                  overview.usageStats.establishedVoiceBaselines,
              )}
              detail={`Face: ${overview.usageStats.establishedFaceBaselines} • Voice: ${overview.usageStats.establishedVoiceBaselines} • Cached WAVs: ${overview.usageStats.cachedAudioConversions}`}
            />
          </div>
        </>
      ) : (
        <div className="wellness-card p-8 text-center text-sm text-slate-500">
          {loading ? "Loading system metrics..." : "No overview metrics available."}
        </div>
      )}
    </div>
  );
};

const HealthTile: React.FC<{ label: string; ok: boolean; value: string; sub?: string }> = ({
  label,
  ok,
  value,
  sub,
}) => (
  <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 space-y-1">
    <div className="text-slate-500 font-medium">{label}</div>
    <div className="flex items-center gap-1.5 font-bold text-slate-900">
      {ok ? (
        <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
      ) : (
        <XCircle className="h-4 w-4 text-rose-600 shrink-0" />
      )}
      <span>{value}</span>
    </div>
    {sub && <div className="text-[11px] text-slate-400 truncate" title={sub}>{sub}</div>}
  </div>
);

const StatCard: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string;
  detail: string;
}> = ({ icon, label, value, detail }) => (
  <div className="wellness-card p-5 space-y-2">
    <div className="flex items-center justify-between">
      <span className="h-10 w-10 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center">
        {icon}
      </span>
      <span className="text-2xl font-bold text-slate-900">{value}</span>
    </div>
    <div className="text-sm font-semibold text-slate-800">{label}</div>
    <div className="text-xs text-slate-500">{detail}</div>
  </div>
);
