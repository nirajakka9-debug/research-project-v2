import React, { useState } from "react";
import { PlusCircle, ScanFace } from "lucide-react";
import { FaceAnalysisPanel } from "../components/FaceAnalysisPanel";
import { NonDiagnosticBanner } from "../components/SharedUI";
import { createCheckin } from "../services/api";
import type { AnalysisRunResponse, BaselinesResponse, FaceAnalysisResult } from "../types/mindtrack";

interface FaceAiPageProps {
  userId: string;
  baselines: BaselinesResponse | null;
  recentRuns: Array<AnalysisRunResponse<FaceAnalysisResult>>;
  onRefresh: () => void;
  onNotify: (type: "success" | "error" | "info", text: string) => void;
}

export const FaceAiPage: React.FC<FaceAiPageProps> = ({
  userId,
  baselines,
  recentRuns,
  onRefresh,
  onNotify,
}) => {
  const [activeRun, setActiveRun] = useState<AnalysisRunResponse<FaceAnalysisResult> | null>(recentRuns[0] ?? null);
  const [attaching, setAttaching] = useState(false);

  const handleSaveAsCheckin = async () => {
    if (!activeRun) return;
    setAttaching(true);
    try {
      await createCheckin({
        userId,
        faceAnalysisRunId: activeRun.runId,
        notes: `Facial AI (${activeRun.mode}) check-in`,
      });
      onRefresh();
      onNotify("success", "Saved Facial AI analysis as a check-in session.");
    } catch (err) {
      onNotify("error", err instanceof Error ? err.message : "Failed to save check-in.");
    } finally {
      setAttaching(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2.5">
            <ScanFace className="h-6 w-6 text-teal-600" />
            Facial Behaviour Analysis Studio
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Record directly via webcam or upload video clips (MP4, WebM, MOV, AVI, MKV) with quality assessment and personal baseline comparison.
          </p>
        </div>
        {activeRun && (
          <button
            type="button"
            disabled={attaching}
            onClick={handleSaveAsCheckin}
            className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
          >
            <PlusCircle className="h-4 w-4" />
            {attaching ? "Saving..." : "Save Latest Run as Check-in"}
          </button>
        )}
      </div>

      <NonDiagnosticBanner compact />

      <div className="wellness-card p-5 sm:p-6">
        <FaceAnalysisPanel
          userId={userId}
          baselineProgress={
            baselines
              ? {
                  recorded: baselines.face.total_checkins_recorded,
                  minRequired: baselines.face.min_calibration_checkins,
                  isCalibrated: baselines.face.is_calibrated,
                }
              : undefined
          }
          currentRun={activeRun}
          onAnalysisComplete={(run) => {
            setActiveRun(run);
            onRefresh();
          }}
          onNotify={onNotify}
        />
      </div>

      {recentRuns.length > 0 && (
        <div className="wellness-card p-5 space-y-3">
          <h3 className="text-sm font-bold text-slate-900">Recent Standalone Facial Runs ({recentRuns.length})</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {recentRuns.map((run) => (
              <button
                key={run.runId}
                type="button"
                onClick={() => setActiveRun(run)}
                className={`rounded-xl border p-3.5 text-left transition ${
                  activeRun?.runId === run.runId
                    ? "border-teal-500 bg-teal-50/50"
                    : "border-slate-200 bg-white hover:bg-slate-50"
                }`}
              >
                <div className="flex justify-between text-xs font-semibold text-slate-900">
                  <span className="truncate">{run.filename}</span>
                  <span className="uppercase text-[10px] text-teal-700">{run.mode}</span>
                </div>
                <div className="mt-1 text-[11px] text-slate-500">
                  Quality {run.qualityScore?.toFixed(1) ?? "—"} / 100 • {new Date(run.createdAt).toLocaleString()}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
