import React, { useState } from "react";
import {
  CheckCircle2,
  ClipboardList,
  Loader2,
  Mic,
  Save,
  ScanFace,
  Sparkles,
} from "lucide-react";
import { FaceAnalysisPanel } from "../components/FaceAnalysisPanel";
import { QuestionnaireForm } from "../components/QuestionnaireForm";
import { JsonInspectorCard, ModalityBadge, NonDiagnosticBanner } from "../components/SharedUI";
import { VoiceAnalysisPanel } from "../components/VoiceAnalysisPanel";
import { createCheckin } from "../services/api";
import type {
  AnalysisRunResponse,
  BaselinesResponse,
  CheckinSession,
  FaceAnalysisResult,
  Modality,
  QuestionnairePayload,
  VoiceAnalysisResult,
} from "../types/mindtrack";
import type { NavPage } from "./DashboardPage";

interface NewCheckinPageProps {
  userId: string;
  baselines: BaselinesResponse | null;
  onCheckinSaved: () => void;
  onNavigate: (page: NavPage) => void;
  onNotify: (type: "success" | "error" | "info", text: string) => void;
}

const DEFAULT_QUESTIONNAIRE: QuestionnairePayload = {
  phq2Anhedonia: 0,
  phq2DepressedMood: 0,
  gad2Nervousness: 0,
  gad2Worrying: 0,
  dailyAffectMood: 3,
  dailyAffectEnergy: 3,
  dailyAffectStress: 2,
  sleepQuality: null,
  reflectionNote: "",
};

export const NewCheckinPage: React.FC<NewCheckinPageProps> = ({
  userId,
  baselines,
  onCheckinSaved,
  onNavigate,
  onNotify,
}) => {
  const [includeQuestionnaire, setIncludeQuestionnaire] = useState(true);
  const [includeScreening, setIncludeScreening] = useState(true);
  const [questionnaire, setQuestionnaire] = useState<QuestionnairePayload>(DEFAULT_QUESTIONNAIRE);
  const [faceRun, setFaceRun] = useState<AnalysisRunResponse<FaceAnalysisResult> | null>(null);
  const [voiceRun, setVoiceRun] = useState<AnalysisRunResponse<VoiceAnalysisResult> | null>(null);
  const [sessionNotes, setSessionNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedSession, setSavedSession] = useState<CheckinSession | null>(null);

  const selectedModalities: Modality[] = [];
  if (includeQuestionnaire) selectedModalities.push("QUESTIONNAIRE");
  if (faceRun) selectedModalities.push("FACE");
  if (voiceRun) selectedModalities.push("VOICE");
  const missingModalities: Modality[] = (["QUESTIONNAIRE", "FACE", "VOICE"] as Modality[]).filter(
    (m) => !selectedModalities.includes(m),
  );

  const handleSubmitCheckin = async () => {
    if (selectedModalities.length === 0) {
      onNotify("error", "Complete at least one modality (Questionnaire, Facial AI, or Voice AI) before saving.");
      return;
    }

    setSaving(true);
    try {
      const saved = await createCheckin({
        userId,
        questionnaire: includeQuestionnaire ? { ...questionnaire, userId } : null,
        faceAnalysisRunId: faceRun?.runId ?? null,
        voiceAnalysisRunId: voiceRun?.runId ?? null,
        notes: sessionNotes || null,
      });
      setSavedSession(saved);
      onCheckinSaved();
      onNotify("success", `Check-in saved with ${saved.availableModalities.join(", ")}.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save check-in.";
      onNotify("error", msg);
    } finally {
      setSaving(false);
    }
  };

  if (savedSession) {
    return (
      <div className="space-y-6">
        <div className="wellness-card p-6 sm:p-8 border-emerald-200 bg-gradient-to-br from-emerald-50/70 via-white to-sky-50/60 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-900">Wellness Check-in Saved</h2>
                <p className="text-xs text-slate-500">
                  Session ID: {savedSession.id} • {new Date(savedSession.sessionTimestamp).toLocaleString()}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {savedSession.availableModalities.map((m) => (
                <ModalityBadge key={m} modality={m} />
              ))}
              {savedSession.missingModalities.map((m) => (
                <ModalityBadge key={m} modality={m} missing />
              ))}
            </div>
          </div>

          {savedSession.wellnessSummary && (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-900">Transparent Multimodal Summary</h3>
                <span className="wellness-pill bg-amber-50 text-amber-800 border border-amber-200">
                  {savedSession.wellnessSummary.fusionModelStatus}
                </span>
              </div>
              <p className="text-xs text-slate-600">{savedSession.wellnessSummary.fusionModelNotice}</p>
              <ul className="space-y-1.5 text-xs text-slate-700">
                {savedSession.wellnessSummary.crossModalityObservations.map((obs, i) => (
                  <li key={i}>• {obs}</li>
                ))}
              </ul>
            </div>
          )}

          <JsonInspectorCard
            title="Unified Check-in JSON Record"
            filename={`checkin_${savedSession.id.slice(0, 8)}.json`}
            data={savedSession}
          />

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => {
                setSavedSession(null);
                setFaceRun(null);
                setVoiceRun(null);
                setSessionNotes("");
              }}
              className="rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-700"
            >
              Start Another Check-in
            </button>
            <button
              type="button"
              onClick={() => onNavigate("dashboard")}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Return to Dashboard
            </button>
            <button
              type="button"
              onClick={() => onNavigate("history")}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              View Check-in History
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">New Multimodal Wellness Check-in</h1>
        <p className="text-sm text-slate-600 mt-1">
          Complete the self-report questionnaire and optionally analyze a facial video and/or WAV voice sample. Partial
          check-ins are fully supported.
        </p>
      </div>

      <NonDiagnosticBanner compact />

      {/* Section A: Questionnaire */}
      <section className="wellness-card p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="h-9 w-9 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center font-bold text-sm">
              A
            </span>
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <ClipboardList className="h-4 w-4 text-sky-600" />
                Questionnaire Self-Report
              </h2>
              <p className="text-xs text-slate-500">Quick daily affect rating and optional two-week frequency items</p>
            </div>
          </div>
          <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={includeQuestionnaire}
              onChange={(e) => setIncludeQuestionnaire(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-sky-600"
            />
            Include in check-in
          </label>
        </div>

        {includeQuestionnaire ? (
          <QuestionnaireForm
            value={questionnaire}
            onChange={setQuestionnaire}
            includeScreening={includeScreening}
            onToggleScreening={setIncludeScreening}
          />
        ) : (
          <p className="text-xs text-slate-400 italic">Questionnaire skipped for this session.</p>
        )}
      </section>

      {/* Section B: Facial Behaviour Analysis */}
      <section className="wellness-card p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="h-9 w-9 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center font-bold text-sm">
              B
            </span>
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <ScanFace className="h-4 w-4 text-teal-600" />
                Facial Behaviour Analysis (Optional)
              </h2>
              <p className="text-xs text-slate-500">
                Upload a video clip (up to 30s) to run the real MediaPipe facial behaviour analyzer
              </p>
            </div>
          </div>
          {faceRun && (
            <div className="flex items-center gap-2">
              <span className="wellness-pill bg-emerald-50 text-emerald-700 border border-emerald-200">
                Attached: {faceRun.filename}
              </span>
              <button
                type="button"
                onClick={() => setFaceRun(null)}
                className="text-xs font-medium text-slate-500 hover:text-rose-600"
              >
                Clear
              </button>
            </div>
          )}
        </div>

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
          currentRun={faceRun}
          onAnalysisComplete={(run) => setFaceRun(run)}
          onNotify={onNotify}
        />
      </section>

      {/* Section C: Voice Acoustic Analysis */}
      <section className="wellness-card p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="h-9 w-9 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center font-bold text-sm">
              C
            </span>
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Mic className="h-4 w-4 text-violet-600" />
                Voice Acoustic Analysis (Optional)
              </h2>
              <p className="text-xs text-slate-500">
                Upload a WAV audio file or record directly via microphone to extract acoustic speech metrics
              </p>
            </div>
          </div>
          {voiceRun && (
            <div className="flex items-center gap-2">
              <span className="wellness-pill bg-emerald-50 text-emerald-700 border border-emerald-200">
                Attached: {voiceRun.filename}
              </span>
              <button
                type="button"
                onClick={() => setVoiceRun(null)}
                className="text-xs font-medium text-slate-500 hover:text-rose-600"
              >
                Clear
              </button>
            </div>
          )}
        </div>

        <VoiceAnalysisPanel
          userId={userId}
          baselineProgress={
            baselines
              ? {
                  observationCount: baselines.voice.observation_count,
                  minRequired: baselines.voice.min_observations,
                  isEstablished: baselines.voice.is_established,
                }
              : undefined
          }
          currentRun={voiceRun}
          onAnalysisComplete={(run) => setVoiceRun(run)}
          onNotify={onNotify}
        />
      </section>

      {/* Section D: Unified Check-in Submission */}
      <section className="wellness-card p-5 sm:p-6 bg-gradient-to-r from-white via-sky-50/40 to-teal-50/40 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="space-y-2">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-sky-600" />
              Ready to Persist Check-in for Profile: {userId}
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {selectedModalities.map((m) => (
                <ModalityBadge key={m} modality={m} />
              ))}
              {missingModalities.map((m) => (
                <ModalityBadge key={m} modality={m} missing />
              ))}
            </div>
          </div>

          <button
            type="button"
            disabled={saving || selectedModalities.length === 0}
            onClick={handleSubmitCheckin}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-sky-600 to-teal-600 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:from-sky-700 hover:to-teal-700 disabled:opacity-50 transition"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving Check-in...
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                Submit Wellness Check-in
              </>
            )}
          </button>
        </div>

        <div>
          <label htmlFor="session-notes" className="block text-xs font-semibold text-slate-700 mb-1">
            Overall Check-in Notes (optional)
          </label>
          <input
            id="session-notes"
            type="text"
            maxLength={500}
            value={sessionNotes}
            onChange={(e) => setSessionNotes(e.target.value)}
            placeholder="Optional label for this check-in (e.g., Morning baseline #2)"
            className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-sky-400 focus:outline-none"
          />
        </div>
      </section>
    </div>
  );
};
