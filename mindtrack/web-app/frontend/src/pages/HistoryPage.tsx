import React, { useState } from "react";
import {
  Calendar,
  ChevronDown,
  ChevronUp,
  Clock,
  Download,
  FileText,
  History,
  Loader2,
  Mic,
  ScanFace,
  Trash2,
} from "lucide-react";
import { deleteCheckin, fetchCheckinReport } from "../services/api";
import type { CheckinComparisonReport, CheckinSession, NavPage } from "../types/mindtrack";
import { CheckinReportView } from "../components/CheckinReportView";
import { downloadJson, EmptyStateCard, ModalityBadge, NonDiagnosticBanner } from "../components/SharedUI";

interface HistoryPageProps {
  userId: string;
  checkins: CheckinSession[];
  onRefresh: () => void;
  onNavigate: (page: NavPage) => void;
  onNotify: (type: "success" | "error" | "info", text: string) => void;
}

export const HistoryPage: React.FC<HistoryPageProps> = ({
  userId,
  checkins,
  onRefresh,
  onNavigate,
  onNotify,
}) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [loadingReportId, setLoadingReportId] = useState<string | null>(null);
  const [activeReport, setActiveReport] = useState<CheckinComparisonReport | null>(null);

  const handleOpenReport = async (checkinId: string) => {
    setLoadingReportId(checkinId);
    try {
      const report = await fetchCheckinReport(checkinId);
      setActiveReport(report);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      onNotify("error", err instanceof Error ? err.message : "Failed to load comparison report.");
    } finally {
      setLoadingReportId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this check-in session? This action cannot be undone.")) return;
    setDeletingId(id);
    try {
      await deleteCheckin(id);
      if (activeReport?.checkinId === id) {
        setActiveReport(null);
      }
      onNotify("success", "Check-in deleted.");
      onRefresh();
    } catch (err) {
      onNotify("error", err instanceof Error ? err.message : "Failed to delete check-in.");
    } finally {
      setDeletingId(null);
    }
  };

  if (checkins.length === 0) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
          <History className="h-6 w-6 text-sky-600" /> Check-in History
        </h2>
        <NonDiagnosticBanner compact />
        <EmptyStateCard
          title="No Check-ins Recorded"
          description="Start your first wellness check-in. Each session can include a questionnaire, facial video, and/or voice recording."
          actionLabel="Start First Check-in"
          onAction={() => onNavigate("checkin")}
          icon={<Calendar className="h-6 w-6" />}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <History className="h-6 w-6 text-sky-600" /> Check-in History
          </h2>
          <p className="text-sm text-slate-500 mt-0.5">
            {checkins.length} session{checkins.length !== 1 ? "s" : ""} recorded for {userId}
          </p>
        </div>
      </div>

      <NonDiagnosticBanner compact />

      {activeReport && (
        <CheckinReportView report={activeReport} onClose={() => setActiveReport(null)} />
      )}

      <div className="space-y-3">
        {checkins.map((c) => {
          const expanded = expandedId === c.id;
          return (
            <div key={c.id} className="wellness-card overflow-hidden">
              {/* Header row */}
              <button
                type="button"
                onClick={() => setExpandedId(expanded ? null : c.id)}
                className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left hover:bg-slate-50/50 transition"
              >
                <div className="flex items-center gap-4 min-w-0">
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                    <Clock className="h-4 w-4 text-slate-400" />
                    {new Date(c.sessionTimestamp).toLocaleString()}
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {c.availableModalities.map((m) => (
                      <ModalityBadge key={m} modality={m} />
                    ))}
                    {c.missingModalities.map((m) => (
                      <ModalityBadge key={m} modality={m} missing />
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">{c.status}</span>
                  {expanded ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
                </div>
              </button>

              {/* Expanded detail */}
              {expanded && (
                <div className="border-t border-slate-100 px-5 py-4 space-y-4 bg-slate-50/40">
                  {/* Questionnaire section */}
                  {c.questionnaire && (
                    <div className="space-y-2">
                      <h4 className="text-xs font-semibold text-sky-700 uppercase tracking-wider">Questionnaire</h4>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                        <div className="rounded-lg bg-white border border-slate-200 p-2.5">
                          <div className="text-slate-500">Mood</div>
                          <div className="font-bold text-slate-900 text-lg">{c.questionnaire.dailyAffectMood}/5</div>
                        </div>
                        <div className="rounded-lg bg-white border border-slate-200 p-2.5">
                          <div className="text-slate-500">Energy</div>
                          <div className="font-bold text-slate-900 text-lg">{c.questionnaire.dailyAffectEnergy}/5</div>
                        </div>
                        <div className="rounded-lg bg-white border border-slate-200 p-2.5">
                          <div className="text-slate-500">Strain</div>
                          <div className="font-bold text-slate-900 text-lg">{c.questionnaire.dailyAffectStress}/5</div>
                        </div>
                        <div className="rounded-lg bg-white border border-slate-200 p-2.5">
                          <div className="text-slate-500">PHQ-2 / GAD-2</div>
                          <div className="font-bold text-slate-900 text-lg">
                            {c.questionnaire.phq2Total ?? "—"} / {c.questionnaire.gad2Total ?? "—"}
                          </div>
                        </div>
                      </div>
                      {c.questionnaire.reflectionNote && (
                        <p className="text-xs text-slate-600 italic bg-white border border-slate-200 rounded-lg p-2.5">
                          "{c.questionnaire.reflectionNote}"
                        </p>
                      )}
                    </div>
                  )}

                  {/* Face section */}
                  {c.face && (
                    <div className="space-y-2">
                      <h4 className="text-xs font-semibold text-teal-700 uppercase tracking-wider flex items-center gap-1.5">
                        <ScanFace className="h-3.5 w-3.5" /> Facial Analysis
                      </h4>
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
                        <div className="rounded-lg bg-white border border-slate-200 p-2.5">
                          <div className="text-slate-500">Quality</div>
                          <div className="font-bold text-slate-900">{c.face.qualityScore?.toFixed(1) ?? "—"}/100</div>
                        </div>
                        <div className="rounded-lg bg-white border border-slate-200 p-2.5">
                          <div className="text-slate-500">Blink Rate</div>
                          <div className="font-bold text-slate-900">{c.face.features.eyeBlinkRatePm?.toFixed(1) ?? "—"} bpm</div>
                        </div>
                        <div className="rounded-lg bg-white border border-slate-200 p-2.5">
                          <div className="text-slate-500">Movement</div>
                          <div className="font-bold text-slate-900">{c.face.features.facialMovementVelocity?.toFixed(3) ?? "—"}</div>
                        </div>
                        <div className="rounded-lg bg-white border border-slate-200 p-2.5">
                          <div className="text-slate-500">Smile</div>
                          <div className="font-bold text-slate-900">{c.face.features.smileIntensityProxy?.toFixed(3) ?? "—"}</div>
                        </div>
                        <div className="rounded-lg bg-white border border-slate-200 p-2.5">
                          <div className="text-slate-500">Mode</div>
                          <div className="font-bold text-slate-900 capitalize">{c.face.mode}</div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Voice section */}
                  {c.voice && (
                    <div className="space-y-2">
                      <h4 className="text-xs font-semibold text-violet-700 uppercase tracking-wider flex items-center gap-1.5">
                        <Mic className="h-3.5 w-3.5" /> Voice Analysis
                      </h4>
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
                        <div className="rounded-lg bg-white border border-slate-200 p-2.5">
                          <div className="text-slate-500">Quality</div>
                          <div className="font-bold text-slate-900">{c.voice.qualityScore?.toFixed(2) ?? "—"}</div>
                        </div>
                        <div className="rounded-lg bg-white border border-slate-200 p-2.5">
                          <div className="text-slate-500">Rate</div>
                          <div className="font-bold text-slate-900">{c.voice.features.speakingRateWpm} WPM</div>
                        </div>
                        <div className="rounded-lg bg-white border border-slate-200 p-2.5">
                          <div className="text-slate-500">Pitch F0</div>
                          <div className="font-bold text-slate-900">{c.voice.features.pitchMeanHz?.toFixed(1)} Hz</div>
                        </div>
                        <div className="rounded-lg bg-white border border-slate-200 p-2.5">
                          <div className="text-slate-500">Speech Ratio</div>
                          <div className="font-bold text-slate-900">{c.voice.features.speechRatio?.toFixed(2)}</div>
                        </div>
                        <div className="rounded-lg bg-white border border-slate-200 p-2.5">
                          <div className="text-slate-500">Mode</div>
                          <div className="font-bold text-slate-900 capitalize">{c.voice.mode}</div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Wellness summary */}
                  {c.wellnessSummary && (
                    <div className="rounded-lg bg-indigo-50/70 border border-indigo-200/80 p-3 text-xs">
                      <p className="font-semibold text-indigo-800 mb-1">Wellness Summary</p>
                      <p className="text-indigo-700">Model: {c.wellnessSummary.fusionModelStatus}</p>
                      {c.wellnessSummary.crossModalityObservations.length > 0 && (
                        <ul className="mt-1 space-y-0.5 text-indigo-700 list-disc list-inside">
                          {c.wellnessSummary.crossModalityObservations.map((obs, i) => (
                            <li key={i}>{obs}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex flex-wrap items-center gap-3 pt-1">
                    <button
                      type="button"
                      disabled={loadingReportId === c.id}
                      onClick={() => handleOpenReport(c.id)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
                    >
                      {loadingReportId === c.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <FileText className="h-3.5 w-3.5" />
                      )}
                      Baseline Comparison Report
                    </button>
                    <button
                      type="button"
                      onClick={() => downloadJson(`mindtrack-checkin-${c.id}.json`, c)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      <Download className="h-3.5 w-3.5" /> Export JSON
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(c.id)}
                      disabled={deletingId === c.id}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> {deletingId === c.id ? "Deleting…" : "Delete"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
