import React from "react";
import { ClipboardList, Info } from "lucide-react";
import type { QuestionnairePayload } from "../types/mindtrack";

interface QuestionnaireFormProps {
  value: QuestionnairePayload;
  onChange: (next: QuestionnairePayload) => void;
  includeScreening: boolean;
  onToggleScreening: (next: boolean) => void;
}

const FREQUENCY_OPTIONS = [
  { value: 0, label: "Not at all (0)" },
  { value: 1, label: "Several days (1)" },
  { value: 2, label: "More than half the days (2)" },
  { value: 3, label: "Nearly every day (3)" },
];

const AFFECT_SCALE = [1, 2, 3, 4, 5];

export const QuestionnaireForm: React.FC<QuestionnaireFormProps> = ({
  value,
  onChange,
  includeScreening,
  onToggleScreening,
}) => {
  const updateField = <K extends keyof QuestionnairePayload>(key: K, fieldVal: QuestionnairePayload[K]) => {
    onChange({ ...value, [key]: fieldVal });
  };

  return (
    <div className="space-y-6">
      {/* Daily Affect Custom Self-Report */}
      <div className="rounded-2xl border border-sky-100 bg-sky-50/40 p-5 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-semibold text-slate-900 flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-sky-600" />
              Daily Wellness Self-Report (1–5 Scale)
            </h3>
            <p className="text-xs text-slate-600 mt-0.5">
              Custom personal wellness rating scale for tracking day-to-day mood, energy, and perceived strain.
            </p>
          </div>
          <span className="wellness-pill bg-white border border-sky-200 text-sky-700">Custom Self-Report</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <ScaleSelector
            label="Current Mood"
            lowHint="1 = Very low"
            highHint="5 = Very positive"
            value={value.dailyAffectMood}
            onSelect={(v) => updateField("dailyAffectMood", v)}
            accent="sky"
          />
          <ScaleSelector
            label="Energy Level"
            lowHint="1 = Exhausted"
            highHint="5 = Energized"
            value={value.dailyAffectEnergy}
            onSelect={(v) => updateField("dailyAffectEnergy", v)}
            accent="teal"
          />
          <ScaleSelector
            label="Perceived Strain / Tension"
            lowHint="1 = Very calm"
            highHint="5 = Very strained"
            value={value.dailyAffectStress}
            onSelect={(v) => updateField("dailyAffectStress", v)}
            accent="lavender"
          />
          <ScaleSelector
            label="Sleep Quality (Optional)"
            lowHint="1 = Restless"
            highHint="5 = Restorative"
            value={value.sleepQuality ?? null}
            onSelect={(v) => updateField("sleepQuality", value.sleepQuality === v ? null : v)}
            accent="mint"
            optional
          />
        </div>

        <div>
          <label htmlFor="reflection-note" className="block text-xs font-semibold text-slate-700 mb-1.5">
            Session Context Note (optional — sleep, caffeine, exercise, environment)
          </label>
          <textarea
            id="reflection-note"
            rows={2}
            maxLength={1000}
            value={value.reflectionNote ?? ""}
            onChange={(e) => updateField("reflectionNote", e.target.value)}
            placeholder="e.g., Slept 7 hours, morning coffee before check-in..."
            className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100"
          />
        </div>
      </div>

      {/* Brief PHQ-2 / GAD-2 Self-Monitoring Items */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              Brief Two-Week Frequency Check-in (PHQ-2 &amp; GAD-2 Items)
            </h3>
            <p className="text-xs text-slate-500 mt-1 flex items-center gap-1.5">
              <Info className="h-3.5 w-3.5 text-sky-600 shrink-0" />
              Tracked solely for longitudinal personal reflection. Not scored as a medical or psychiatric diagnosis.
            </p>
          </div>
          <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={includeScreening}
              onChange={(e) => {
                onToggleScreening(e.target.checked);
                if (!e.target.checked) {
                  onChange({
                    ...value,
                    phq2Anhedonia: null,
                    phq2DepressedMood: null,
                    gad2Nervousness: null,
                    gad2Worrying: null,
                  });
                } else {
                  onChange({
                    ...value,
                    phq2Anhedonia: value.phq2Anhedonia ?? 0,
                    phq2DepressedMood: value.phq2DepressedMood ?? 0,
                    gad2Nervousness: value.gad2Nervousness ?? 0,
                    gad2Worrying: value.gad2Worrying ?? 0,
                  });
                }
              }}
              className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
            />
            Include 4 frequency items
          </label>
        </div>

        {includeScreening ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-1">
            <FrequencyItem
              question="1. Little interest or pleasure in doing things"
              value={value.phq2Anhedonia ?? 0}
              onChange={(v) => updateField("phq2Anhedonia", v)}
            />
            <FrequencyItem
              question="2. Feeling down, depressed, or hopeless"
              value={value.phq2DepressedMood ?? 0}
              onChange={(v) => updateField("phq2DepressedMood", v)}
            />
            <FrequencyItem
              question="3. Feeling nervous, anxious, or on edge"
              value={value.gad2Nervousness ?? 0}
              onChange={(v) => updateField("gad2Nervousness", v)}
            />
            <FrequencyItem
              question="4. Not being able to stop or control worrying"
              value={value.gad2Worrying ?? 0}
              onChange={(v) => updateField("gad2Worrying", v)}
            />
          </div>
        ) : (
          <p className="text-xs text-slate-400 italic">
            Optional frequency items skipped — they will be stored as null rather than zero.
          </p>
        )}
      </div>
    </div>
  );
};

const ScaleSelector: React.FC<{
  label: string;
  lowHint: string;
  highHint: string;
  value: number | null;
  onSelect: (val: number) => void;
  accent: "sky" | "teal" | "lavender" | "mint";
  optional?: boolean;
}> = ({ label, lowHint, highHint, value, onSelect, accent, optional }) => {
  const activeStyle: Record<typeof accent, string> = {
    sky: "bg-sky-600 text-white border-sky-600 shadow-sm",
    teal: "bg-teal-600 text-white border-teal-600 shadow-sm",
    lavender: "bg-violet-600 text-white border-violet-600 shadow-sm",
    mint: "bg-emerald-600 text-white border-emerald-600 shadow-sm",
  };

  return (
    <div className="rounded-xl border border-slate-200/80 bg-white p-3.5">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-slate-800">{label}</span>
        <span className="text-xs font-semibold text-slate-500">
          {value !== null ? `${value} / 5` : optional ? "Skipped" : "Select"}
        </span>
      </div>
      <div className="grid grid-cols-5 gap-1.5">
        {AFFECT_SCALE.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onSelect(n)}
            className={`rounded-lg border py-2 text-sm font-semibold transition ${
              value === n
                ? activeStyle[accent]
                : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
            }`}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="flex justify-between text-[11px] text-slate-400 mt-1.5">
        <span>{lowHint}</span>
        <span>{highHint}</span>
      </div>
    </div>
  );
};

const FrequencyItem: React.FC<{
  question: string;
  value: number;
  onChange: (val: number) => void;
}> = ({ question, value, onChange }) => (
  <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5">
    <p className="text-xs font-semibold text-slate-800 mb-2.5">{question}</p>
    <div className="grid grid-cols-2 gap-1.5">
      {FREQUENCY_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`rounded-lg border px-2.5 py-2 text-left text-xs font-medium transition ${
            value === opt.value
              ? "border-sky-600 bg-sky-600 text-white shadow-sm"
              : "border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  </div>
);
