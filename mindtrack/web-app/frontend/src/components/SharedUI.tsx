import React, { useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Code2,
  Download,
  Info,
  Mic,
  ScanFace,
  ShieldAlert,
  Sparkles,
  ClipboardList,
  X,
} from "lucide-react";
import type { Modality } from "../types/mindtrack";

export function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export const NonDiagnosticBanner: React.FC<{ compact?: boolean }> = ({ compact = false }) => (
  <div
    className={`rounded-2xl border border-sky-200/80 bg-gradient-to-r from-sky-50 via-teal-50/70 to-indigo-50/70 ${
      compact ? "px-4 py-2.5" : "px-5 py-3.5"
    } flex items-start gap-3 text-slate-700`}
  >
    <ShieldAlert className="h-5 w-5 shrink-0 text-sky-600 mt-0.5" />
    <div className="text-xs sm:text-sm leading-relaxed">
      <span className="font-semibold text-slate-900">Non-Diagnostic Wellness Research Tool:</span>{" "}
      MindTrack tracks self-reported check-ins, facial behaviour measurements, and voice acoustic features relative to
      your personal baseline. It does <strong>not</strong> detect, diagnose, or score stress, depression, anxiety, or
      any medical condition.
    </div>
  </div>
);

export const ModalityBadge: React.FC<{ modality: Modality; missing?: boolean }> = ({ modality, missing = false }) => {
  const map: Record<Modality, { label: string; icon: React.ReactNode; activeCls: string }> = {
    QUESTIONNAIRE: {
      label: "Questionnaire",
      icon: <ClipboardList className="h-3.5 w-3.5" />,
      activeCls: "bg-sky-50 text-sky-700 border border-sky-200",
    },
    FACE: {
      label: "Facial AI",
      icon: <ScanFace className="h-3.5 w-3.5" />,
      activeCls: "bg-teal-50 text-teal-700 border border-teal-200",
    },
    VOICE: {
      label: "Voice AI",
      icon: <Mic className="h-3.5 w-3.5" />,
      activeCls: "bg-violet-50 text-violet-700 border border-violet-200",
    },
  };
  const cfg = map[modality];
  if (missing) {
    return (
      <span className="wellness-pill bg-slate-100 text-slate-400 border border-dashed border-slate-300">
        {cfg.icon}
        {cfg.label}: Missing (null)
      </span>
    );
  }
  return (
    <span className={`wellness-pill ${cfg.activeCls}`}>
      {cfg.icon}
      {cfg.label}
    </span>
  );
};

export const EmptyStateCard: React.FC<{
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: React.ReactNode;
}> = ({ title, description, actionLabel, onAction, icon }) => (
  <div className="wellness-card p-8 text-center flex flex-col items-center justify-center bg-gradient-to-b from-white to-slate-50/70">
    <div className="h-12 w-12 rounded-2xl bg-sky-50 border border-sky-100 text-sky-600 flex items-center justify-center mb-4">
      {icon ?? <Sparkles className="h-6 w-6" />}
    </div>
    <h3 className="text-base font-semibold text-slate-900">{title}</h3>
    <p className="mt-1.5 max-w-md text-sm text-slate-500 leading-relaxed">{description}</p>
    {actionLabel && onAction && (
      <button
        type="button"
        onClick={onAction}
        className="mt-5 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-sky-600 to-teal-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:from-sky-700 hover:to-teal-700 transition"
      >
        {actionLabel}
      </button>
    )}
  </div>
);

export const JsonInspectorCard: React.FC<{
  title?: string;
  filename: string;
  data: unknown;
}> = ({ title = "Structured JSON Output", filename, data }) => {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700">
          <Code2 className="h-4 w-4 text-slate-500" />
          {title}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
          >
            {open ? "Hide JSON" : "Inspect JSON"}
          </button>
          <button
            type="button"
            onClick={() => downloadJson(filename, data)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-slate-800"
          >
            <Download className="h-3.5 w-3.5" />
            Export JSON
          </button>
        </div>
      </div>
      {open && (
        <pre className="mt-3 max-h-72 overflow-auto rounded-lg bg-slate-900 p-3 text-[11px] leading-relaxed text-emerald-200">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
};

export const ToastBanner: React.FC<{
  toast: { type: "success" | "error" | "info"; text: string } | null;
  onClose: () => void;
}> = ({ toast, onClose }) => {
  if (!toast) return null;
  const styles =
    toast.type === "success"
      ? "bg-emerald-50 border-emerald-200 text-emerald-900"
      : toast.type === "error"
        ? "bg-rose-50 border-rose-200 text-rose-900"
        : "bg-sky-50 border-sky-200 text-sky-900";
  const Icon = toast.type === "success" ? CheckCircle2 : toast.type === "error" ? AlertCircle : Info;

  return (
    <div className={`fixed bottom-5 right-5 z-50 max-w-md rounded-2xl border px-4 py-3 shadow-lg flex items-start gap-3 ${styles}`}>
      <Icon className="h-5 w-5 shrink-0 mt-0.5" />
      <p className="text-sm font-medium leading-snug flex-1">{toast.text}</p>
      <button type="button" onClick={onClose} aria-label="Dismiss notification" className="opacity-70 hover:opacity-100">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
};
