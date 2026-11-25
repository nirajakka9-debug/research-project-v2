import React from "react";
import {
  AlertTriangle,
  Clock,
  Download,
  FileText,
  Mic,
  ScanFace,
  ShieldCheck,
  X,
} from "lucide-react";
import type { CheckinComparisonReport, FeatureComparisonRow } from "../types/mindtrack";
import { downloadCheckinReportPdf } from "../utils/pdfReport";
import { downloadJson, ModalityBadge, NonDiagnosticBanner } from "./SharedUI";

interface CheckinReportViewProps {
  report: CheckinComparisonReport;
  onClose?: () => void;
}

function statusPill(status: FeatureComparisonRow["status"]) {
  switch (status) {
    case "within_baseline":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "higher_than_baseline":
      return "bg-amber-50 text-amber-800 border-amber-200";
    case "lower_than_baseline":
      return "bg-sky-50 text-sky-800 border-sky-200";
    case "zero_variance":
      return "bg-indigo-50 text-indigo-700 border-indigo-200";
    case "insufficient_baseline":
      return "bg-slate-100 text-slate-600 border-slate-200";
    case "feature_unavailable":
      return "bg-rose-50 text-rose-700 border-rose-200";
  }
}

export const CheckinReportView: React.FC<CheckinReportViewProps> = ({ report, onClose }) => {
  return (
    <div className="wellness-card p-5 sm:p-6 space-y-5 border-sky-200">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <div className="inline-flex items-center gap-2 text-xs font-semibold text-sky-700 mb-1">
            <FileText className="h-4 w-4" />
            Individual Check-in Baseline Comparison Report
          </div>
          <h3 className="text-lg font-bold text-slate-900">
            Session {new Date(report.sessionTimestamp).toLocaleString()}
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Check-in ID: {report.checkinId} • Participant: {report.userId}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => downloadJson(`mindtrack-report-${report.checkinId.slice(0, 8)}.json`, report)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Download className="h-3.5 w-3.5" /> Export JSON
          </button>
          <button
            type="button"
            onClick={() => downloadCheckinReportPdf(report)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800"
          >
            <FileText className="h-3.5 w-3.5" /> Export PDF
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              aria-label="Close report"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <NonDiagnosticBanner compact />

      {/* Context & Modalities */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
        <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 space-y-2">
          <div className="font-semibold text-slate-800">Modalities Included vs Missing</div>
          <div className="flex flex-wrap gap-1.5">
            {report.availableModalities.map((m) => (
              <ModalityBadge key={m} modality={m} />
            ))}
            {report.missingModalities.map((m) => (
              <ModalityBadge key={m} modality={m} missing />
            ))}
          </div>
          {report.missingModalities.length > 0 && (
            <p className="text-[11px] text-slate-500">
              Missing modalities ({report.missingModalities.join(", ")}) are preserved as null, never imputed.
            </p>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 space-y-1.5">
          <div className="font-semibold text-slate-800 flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-slate-500" /> Historical Context
          </div>
          <p className="text-slate-600">
            Prior check-ins: <strong>{report.historicalContext.priorCheckinCount}</strong> (Total:{" "}
            {report.historicalContext.totalCheckinCount})
          </p>
          <p className="text-slate-600">
            Days since previous check-in:{" "}
            <strong>
              {report.historicalContext.daysSincePreviousCheckin !== null
                ? `${report.historicalContext.daysSincePreviousCheckin}d`
                : "First session"}
            </strong>
          </p>
          <p className="text-slate-500 text-[11px]">
            Face calibrated: {report.historicalContext.faceBaselineCalibrated ? "Yes" : "No"} • Voice established:{" "}
            {report.historicalContext.voiceBaselineEstablished ? "Yes" : "No"}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 space-y-1.5">
          <div className="font-semibold text-slate-800 flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-teal-600" /> Recording Quality
          </div>
          <p className="text-slate-600 flex items-center gap-1.5">
            <ScanFace className="h-3.5 w-3.5 text-teal-600" />
            Face:{" "}
            {report.recordingQuality.face
              ? `${report.recordingQuality.face.qualityScore?.toFixed(1) ?? "—"}/100 (${
                  report.recordingQuality.face.isReliable ? "Reliable" : "Low Reliability"
                })`
              : "Missing"}
          </p>
          <p className="text-slate-600 flex items-center gap-1.5">
            <Mic className="h-3.5 w-3.5 text-violet-600" />
            Voice:{" "}
            {report.recordingQuality.voice
              ? `${report.recordingQuality.voice.qualityScore?.toFixed(2) ?? "—"}/1.00 (${
                  report.recordingQuality.voice.durationSec ?? "—"
                }s)`
              : "Missing"}
          </p>
        </div>
      </div>

      {/* Feature Comparison Table */}
      <div className="space-y-2">
        <h4 className="text-sm font-semibold text-slate-900">Feature-by-Feature Baseline Comparison</h4>
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
              <tr>
                <th className="py-2.5 px-3 font-semibold">Modality &amp; Feature</th>
                <th className="py-2.5 px-3 font-semibold text-right">Current</th>
                <th className="py-2.5 px-3 font-semibold text-right">Baseline (μ ± σ)</th>
                <th className="py-2.5 px-3 font-semibold text-right">Diff / %</th>
                <th className="py-2.5 px-3 font-semibold text-right">Z-Score</th>
                <th className="py-2.5 px-3 font-semibold">Descriptive Note</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {report.comparisons.map((row) => (
                <tr key={`${row.modality}-${row.featureKey}`}>
                  <td className="py-2.5 px-3">
                    <div className="font-semibold text-slate-800">{row.label}</div>
                    <div className="text-[10px] text-slate-400">
                      {row.modality} • {row.units}
                    </div>
                  </td>
                  <td className="py-2.5 px-3 text-right font-semibold text-slate-900">
                    {row.currentValue !== null ? row.currentValue.toFixed(3) : "Unavailable"}
                  </td>
                  <td className="py-2.5 px-3 text-right text-slate-600">
                    {row.baselineMean !== null ? (
                      <>
                        {row.baselineMean.toFixed(3)} ± {(row.baselineStd ?? 0).toFixed(3)}
                        <span className="text-[10px] text-slate-400 block">n={row.baselineCount}</span>
                      </>
                    ) : (
                      "N/A"
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-right text-slate-600">
                    {row.absoluteDifference !== null ? (
                      <>
                        {row.absoluteDifference >= 0 ? "+" : ""}
                        {row.absoluteDifference.toFixed(3)}
                        {row.relativeChangePct !== null && (
                          <span className="text-[10px] text-slate-400 block">
                            ({row.relativeChangePct >= 0 ? "+" : ""}
                            {row.relativeChangePct.toFixed(1)}%)
                          </span>
                        )}
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-right font-semibold">
                    {row.standardizedZ !== null ? (
                      <span
                        className={`inline-block rounded-full border px-2 py-0.5 text-[11px] ${statusPill(row.status)}`}
                      >
                        {row.standardizedZ >= 0 ? "+" : ""}
                        {row.standardizedZ.toFixed(2)}
                      </span>
                    ) : (
                      <span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] ${statusPill(row.status)}`}>
                        {row.status === "zero_variance"
                          ? "Zero SD"
                          : row.status === "feature_unavailable"
                            ? "Missing"
                            : "N/A"}
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-slate-600 max-w-xs">{row.interpretation}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Limitations */}
      <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3.5 text-xs text-amber-900 flex items-start gap-2.5">
        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
        <div className="space-y-1">
          <p className="font-semibold">Methodological Limitations &amp; Non-Diagnostic Scope</p>
          <ul className="list-disc list-inside space-y-0.5">
            {report.limitations.map((lim, i) => (
              <li key={i}>{lim}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};
