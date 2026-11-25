import React, { useState } from "react";
import { CheckCircle2, ClipboardList, Loader2, Save } from "lucide-react";
import { QuestionnaireForm } from "../components/QuestionnaireForm";
import { EmptyStateCard, NonDiagnosticBanner } from "../components/SharedUI";
import { createCheckin } from "../services/api";
import type { CheckinSession, QuestionnairePayload } from "../types/mindtrack";

interface QuestionnairePageProps {
  userId: string;
  checkins: CheckinSession[];
  onSaved: () => void;
  onNotify: (type: "success" | "error" | "info", text: string) => void;
}

export const QuestionnairePage: React.FC<QuestionnairePageProps> = ({ userId, checkins, onSaved, onNotify }) => {
  const [form, setForm] = useState<QuestionnairePayload>({
    phq2Anhedonia: 0,
    phq2DepressedMood: 0,
    gad2Nervousness: 0,
    gad2Worrying: 0,
    dailyAffectMood: 3,
    dailyAffectEnergy: 3,
    dailyAffectStress: 2,
    sleepQuality: null,
    reflectionNote: "",
  });
  const [includeScreening, setIncludeScreening] = useState(true);
  const [saving, setSaving] = useState(false);

  const qHistory = checkins.filter((c) => c.questionnaire !== null);

  const handleSave = async () => {
    setSaving(true);
    try {
      await createCheckin({
        userId,
        questionnaire: { ...form, userId },
      });
      onSaved();
      onNotify("success", "Questionnaire check-in saved successfully.");
    } catch (err) {
      onNotify("error", err instanceof Error ? err.message : "Failed to save questionnaire.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2.5">
            <ClipboardList className="h-6 w-6 text-sky-600" />
            Self-Report Questionnaire
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Submit a standalone questionnaire check-in for profile <strong>{userId}</strong>.
          </p>
        </div>
        <button
          type="button"
          disabled={saving}
          onClick={handleSave}
          className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-sky-600 to-teal-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:from-sky-700 hover:to-teal-700 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save Questionnaire Check-in
        </button>
      </div>

      <NonDiagnosticBanner compact />

      <div className="wellness-card p-5 sm:p-6">
        <QuestionnaireForm
          value={form}
          onChange={setForm}
          includeScreening={includeScreening}
          onToggleScreening={setIncludeScreening}
        />
      </div>

      <div className="wellness-card p-5 sm:p-6 space-y-4">
        <h2 className="text-base font-bold text-slate-900">Saved Questionnaire Responses ({qHistory.length})</h2>
        {qHistory.length === 0 ? (
          <EmptyStateCard
            title="No Questionnaire History Yet"
            description="Submit the form above to record your first self-report wellness entry."
            icon={<CheckCircle2 className="h-6 w-6" />}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2 pr-3 font-semibold">Timestamp</th>
                  <th className="py-2 pr-3 font-semibold">Mood</th>
                  <th className="py-2 pr-3 font-semibold">Energy</th>
                  <th className="py-2 pr-3 font-semibold">Strain</th>
                  <th className="py-2 pr-3 font-semibold">PHQ-2</th>
                  <th className="py-2 pr-3 font-semibold">GAD-2</th>
                  <th className="py-2 font-semibold">Note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {qHistory.map((item) => (
                  <tr key={item.id}>
                    <td className="py-2.5 pr-3 font-medium text-slate-800">
                      {new Date(item.sessionTimestamp).toLocaleString()}
                    </td>
                    <td className="py-2.5 pr-3">{item.questionnaire?.dailyAffectMood}/5</td>
                    <td className="py-2.5 pr-3">{item.questionnaire?.dailyAffectEnergy}/5</td>
                    <td className="py-2.5 pr-3">{item.questionnaire?.dailyAffectStress}/5</td>
                    <td className="py-2.5 pr-3">{item.questionnaire?.phq2Total ?? "—"}</td>
                    <td className="py-2.5 pr-3">{item.questionnaire?.gad2Total ?? "—"}</td>
                    <td className="py-2.5 text-slate-500 max-w-xs truncate">
                      {item.questionnaire?.reflectionNote || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
