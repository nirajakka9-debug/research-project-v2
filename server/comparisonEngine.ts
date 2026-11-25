import { NON_DIAGNOSTIC_NOTICE } from "./config";
import type {
  FaceBaselineProfile,
  Modality,
  StoredCheckinSession,
  VoiceBaselineProfile,
} from "./types";
import { computeQuestionnaireBaselineStats } from "./wellnessEngine";

export type ComparisonStatus =
  | "within_baseline"
  | "higher_than_baseline"
  | "lower_than_baseline"
  | "insufficient_baseline"
  | "zero_variance"
  | "feature_unavailable";

export interface FeatureComparisonRow {
  modality: "FACE" | "VOICE" | "QUESTIONNAIRE";
  featureKey: string;
  label: string;
  units: string;
  currentValue: number | null;
  baselineMean: number | null;
  baselineStd: number | null;
  baselineCount: number;
  absoluteDifference: number | null;
  relativeChangePct: number | null;
  standardizedZ: number | null;
  status: ComparisonStatus;
  interpretation: string;
}

const FACE_FEATURES_META: Array<{ key: string; label: string; units: string }> = [
  { key: "facialMovementVelocity", label: "Facial Movement Velocity", units: "face-units/s" },
  { key: "eyeBlinkRatePm", label: "Eye Blink Rate", units: "blinks/min" },
  { key: "headPoseJitterStd", label: "Head-Pose Variability", units: "degrees" },
  { key: "smileIntensityProxy", label: "Smile-Intensity Proxy", units: "ratio" },
  { key: "browFurrowProxy", label: "Brow-Furrow Proxy", units: "ratio" },
];

const VOICE_FEATURES_META: Array<{ key: string; label: string; units: string }> = [
  { key: "speakingRateWpm", label: "Speaking Rate", units: "WPM" },
  { key: "totalPauseCount", label: "Total Pause Count", units: "pauses" },
  { key: "meanPauseDurationMs", label: "Mean Pause Duration", units: "ms" },
  { key: "longestPauseDurationMs", label: "Longest Pause Duration", units: "ms" },
  { key: "speechRatio", label: "Speech Ratio", units: "ratio" },
  { key: "speechDurationSec", label: "Speech Duration", units: "s" },
  { key: "silenceDurationSec", label: "Silence Duration", units: "s" },
  { key: "pitchMeanHz", label: "Pitch Mean (F0)", units: "Hz" },
  { key: "pitchStdDevHz", label: "Pitch Std Dev", units: "Hz" },
  { key: "pitchRangeHz", label: "Pitch Range", units: "Hz" },
  { key: "energyMeanRms", label: "Energy Mean (RMS)", units: "RMS" },
  { key: "energyStdDev", label: "Energy Std Dev", units: "RMS" },
];

const QUESTIONNAIRE_META: Array<{ key: string; label: string; units: string }> = [
  { key: "dailyAffectMood", label: "Daily Mood Rating", units: "1–5 scale" },
  { key: "dailyAffectEnergy", label: "Daily Energy Rating", units: "1–5 scale" },
  { key: "dailyAffectStress", label: "Perceived Strain Rating", units: "1–5 scale" },
  { key: "phq2Total", label: "PHQ-2 Items Sum", units: "0–6" },
  { key: "gad2Total", label: "GAD-2 Items Sum", units: "0–6" },
];

function roundTo(val: number, decimals = 4): number {
  const factor = 10 ** decimals;
  return Math.round(val * factor) / factor;
}

function compareFeature(params: {
  modality: "FACE" | "VOICE" | "QUESTIONNAIRE";
  featureKey: string;
  label: string;
  units: string;
  currentValue: number | null | undefined;
  baselineMean: number | null | undefined;
  baselineStd: number | null | undefined;
  baselineCount: number;
  zThreshold: number;
  minStdFloor: number;
}): FeatureComparisonRow {
  const {
    modality,
    featureKey,
    label,
    units,
    currentValue,
    baselineMean,
    baselineStd,
    baselineCount,
    zThreshold,
    minStdFloor,
  } = params;

  if (currentValue === null || currentValue === undefined || !Number.isFinite(currentValue)) {
    return {
      modality,
      featureKey,
      label,
      units,
      currentValue: null,
      baselineMean: baselineMean ?? null,
      baselineStd: baselineStd ?? null,
      baselineCount,
      absoluteDifference: null,
      relativeChangePct: null,
      standardizedZ: null,
      status: "feature_unavailable",
      interpretation: "Feature unavailable or missing in this check-in (not imputed as zero).",
    };
  }

  if (baselineCount < 1 || baselineMean === null || baselineMean === undefined) {
    return {
      modality,
      featureKey,
      label,
      units,
      currentValue: roundTo(currentValue, 4),
      baselineMean: null,
      baselineStd: null,
      baselineCount,
      absoluteDifference: null,
      relativeChangePct: null,
      standardizedZ: null,
      status: "insufficient_baseline",
      interpretation: "No personal baseline observations recorded yet for this feature.",
    };
  }

  const absDiff = currentValue - baselineMean;
  const relChange = Math.abs(baselineMean) > 1e-4 ? (absDiff / baselineMean) * 100 : null;
  const stdVal = baselineStd ?? 0;

  if (baselineCount < 2) {
    return {
      modality,
      featureKey,
      label,
      units,
      currentValue: roundTo(currentValue, 4),
      baselineMean: roundTo(baselineMean, 4),
      baselineStd: baselineStd !== null && baselineStd !== undefined ? roundTo(baselineStd, 4) : null,
      baselineCount,
      absoluteDifference: roundTo(absDiff, 4),
      relativeChangePct: relChange !== null ? roundTo(relChange, 2) : null,
      standardizedZ: null,
      status: "insufficient_baseline",
      interpretation: `Single personal baseline observation (n=1). Needs >=2 observations to compute variability (Z-score).`,
    };
  }

  if (stdVal <= minStdFloor) {
    const dir =
      Math.abs(absDiff) <= 1e-4
        ? "Matches invariant personal baseline (zero baseline variance; Z-score omitted)."
        : absDiff > 0
          ? `Higher than invariant personal baseline (+${roundTo(absDiff, 3)} ${units}; zero baseline variance so Z-score is omitted).`
          : `Lower than invariant personal baseline (${roundTo(absDiff, 3)} ${units}; zero baseline variance so Z-score is omitted).`;
    return {
      modality,
      featureKey,
      label,
      units,
      currentValue: roundTo(currentValue, 4),
      baselineMean: roundTo(baselineMean, 4),
      baselineStd: roundTo(stdVal, 4),
      baselineCount,
      absoluteDifference: roundTo(absDiff, 4),
      relativeChangePct: relChange !== null ? roundTo(relChange, 2) : null,
      standardizedZ: null,
      status: "zero_variance",
      interpretation: dir,
    };
  }

  const z = absDiff / stdVal;
  let status: ComparisonStatus = "within_baseline";
  let interpretation = `Within personal baseline range (${roundTo(baselineMean, 3)} ± ${roundTo(stdVal, 3)} ${units}).`;

  if (z > zThreshold) {
    status = "higher_than_baseline";
    interpretation = `Notable elevation above personal baseline (+${roundTo(absDiff, 3)} ${units}, z = +${roundTo(z, 2)}).`;
  } else if (z < -zThreshold) {
    status = "lower_than_baseline";
    interpretation = `Notable reduction below personal baseline (${roundTo(absDiff, 3)} ${units}, z = ${roundTo(z, 2)}).`;
  }

  return {
    modality,
    featureKey,
    label,
    units,
    currentValue: roundTo(currentValue, 4),
    baselineMean: roundTo(baselineMean, 4),
    baselineStd: roundTo(stdVal, 4),
    baselineCount,
    absoluteDifference: roundTo(absDiff, 4),
    relativeChangePct: relChange !== null ? roundTo(relChange, 2) : null,
    standardizedZ: roundTo(z, 2),
    status,
    interpretation,
  };
}

export function buildBaselineSummary(params: {
  userId: string;
  faceBaseline: FaceBaselineProfile | null;
  voiceBaseline: VoiceBaselineProfile | null;
  checkins: StoredCheckinSession[];
}) {
  const { userId, faceBaseline, voiceBaseline, checkins } = params;
  const chronological = [...checkins].sort(
    (a, b) => new Date(a.sessionTimestamp).getTime() - new Date(b.sessionTimestamp).getTime(),
  );

  // Face Summary
  const faceAvailableFeatures: string[] = [];
  const faceMissingFeatures: string[] = [];
  for (const meta of FACE_FEATURES_META) {
    const stat = faceBaseline?.feature_stats?.[meta.key];
    if (stat && stat.count > 0 && stat.mean !== null) {
      faceAvailableFeatures.push(meta.key);
    } else {
      faceMissingFeatures.push(meta.key);
    }
  }
  const faceQualities = (faceBaseline?.history ?? [])
    .map((h) => h.quality_score)
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  const faceCoverages = (faceBaseline?.history ?? [])
    .map((h) => h.coverage)
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v));

  const faceSummary = {
    status: !faceBaseline || faceBaseline.total_checkins_recorded === 0
      ? "NOT_STARTED"
      : faceBaseline.is_calibrated
        ? "CALIBRATED"
        : "CALIBRATING",
    calibrationCount: faceBaseline?.total_checkins_recorded ?? 0,
    minRequired: faceBaseline?.min_calibration_checkins ?? 5,
    validObservations: faceBaseline?.history?.length ?? 0,
    availableFeatures: faceAvailableFeatures,
    missingFeatures: faceMissingFeatures,
    createdAt: faceBaseline?.created_at ?? null,
    updatedAt: faceBaseline?.updated_at ?? null,
    avgQualityScore:
      faceQualities.length > 0
        ? roundTo(faceQualities.reduce((a, b) => a + b, 0) / faceQualities.length, 1)
        : null,
    avgDetectionCoverage:
      faceCoverages.length > 0
        ? roundTo(faceCoverages.reduce((a, b) => a + b, 0) / faceCoverages.length, 4)
        : null,
  };

  // Voice Summary
  const voiceAvailableFeatures: string[] = [];
  const voiceMissingFeatures: string[] = [];
  for (const meta of VOICE_FEATURES_META) {
    const stat = voiceBaseline?.stats?.[meta.key];
    if (stat && stat.count > 0 && Number.isFinite(stat.mean)) {
      voiceAvailableFeatures.push(meta.key);
    } else {
      voiceMissingFeatures.push(meta.key);
    }
  }
  const voiceHistory = voiceBaseline?.history ?? [];
  const voiceSessionQualities = chronological
    .map((c) => c.voiceFeatures?.qualityScore)
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v));

  const voiceSummary = {
    status: !voiceBaseline || voiceBaseline.observation_count === 0
      ? "NOT_STARTED"
      : voiceBaseline.is_established
        ? "ESTABLISHED"
        : "CALIBRATING",
    observationCount: voiceBaseline?.observation_count ?? 0,
    minRequired: voiceBaseline?.min_observations ?? 3,
    validObservations: voiceHistory.length,
    availableFeatures: voiceAvailableFeatures,
    missingFeatures: voiceMissingFeatures,
    createdAt: voiceHistory.length > 0 ? voiceHistory[0].timestamp : null,
    updatedAt: voiceHistory.length > 0 ? voiceHistory[voiceHistory.length - 1].timestamp : null,
    avgQualityScore:
      voiceSessionQualities.length > 0
        ? roundTo(voiceSessionQualities.reduce((a, b) => a + b, 0) / voiceSessionQualities.length, 2)
        : null,
  };

  // Questionnaire Summary
  const qStats = computeQuestionnaireBaselineStats(chronological);
  const qCheckins = chronological.filter((c) => c.questionnaire !== null);
  const qAvailable: string[] = [];
  const qMissing: string[] = [];
  for (const meta of QUESTIONNAIRE_META) {
    const st = qStats[meta.key];
    if (st && st.count > 0 && st.mean !== null) qAvailable.push(meta.key);
    else qMissing.push(meta.key);
  }
  const questionnaireSummary = {
    sessionCount: qCheckins.length,
    validObservations: qCheckins.length,
    availableMetrics: qAvailable,
    missingMetrics: qMissing,
    createdAt: qCheckins.length > 0 ? qCheckins[0].sessionTimestamp : null,
    updatedAt: qCheckins.length > 0 ? qCheckins[qCheckins.length - 1].sessionTimestamp : null,
    stats: qStats,
  };

  // Overall Longitudinal Wellness Summary (Feature 4E)
  const latest = chronological.length > 0 ? chronological[chronological.length - 1] : null;
  const changedFeatures: Array<{ modality: string; feature: string; direction: string; detail: string }> = [];
  const stableFeatures: Array<{ modality: string; feature: string }> = [];
  const unavailableDueToQualityOrMissing: Array<{ modality: string; reason: string }> = [];
  const needingMoreObservations: Array<{ modality: string; detail: string }> = [];

  if (!latest) {
    unavailableDueToQualityOrMissing.push({
      modality: "ALL",
      reason: "No check-in sessions recorded yet.",
    });
  } else {
    const report = buildCheckinComparisonReport({
      checkin: latest,
      allUserCheckins: chronological,
      faceBaseline,
      voiceBaseline,
    });

    for (const row of report.comparisons) {
      if (row.status === "higher_than_baseline" || row.status === "lower_than_baseline") {
        changedFeatures.push({
          modality: row.modality,
          feature: row.label,
          direction: row.status === "higher_than_baseline" ? "higher" : "lower",
          detail: row.interpretation,
        });
      } else if (row.status === "within_baseline") {
        stableFeatures.push({ modality: row.modality, feature: row.label });
      }
    }

    const allMods: Modality[] = ["QUESTIONNAIRE", "FACE", "VOICE"];
    for (const m of allMods) {
      if (!latest.availableModalities.includes(m)) {
        unavailableDueToQualityOrMissing.push({
          modality: m,
          reason: `${m} was not included in the latest check-in (stored as missing/null).`,
        });
      }
    }
    if (latest.faceFeatures && latest.faceFeatures.isReliable === false) {
      unavailableDueToQualityOrMissing.push({
        modality: "FACE",
        reason: `Latest facial recording quality was marked unreliable (${latest.faceFeatures.qualityScore ?? "N/A"}/100).`,
      });
    }
    if (latest.voiceFeatures && (latest.voiceFeatures.qualityScore ?? 0) < 0.55) {
      unavailableDueToQualityOrMissing.push({
        modality: "VOICE",
        reason: `Latest voice recording quality score (${latest.voiceFeatures.qualityScore?.toFixed(2) ?? "N/A"}) was below recommended threshold (0.55).`,
      });
    }
  }

  if (faceSummary.calibrationCount < faceSummary.minRequired) {
    needingMoreObservations.push({
      modality: "FACE",
      detail: `${faceSummary.calibrationCount} of ${faceSummary.minRequired} facial calibration sessions completed.`,
    });
  }
  if (voiceSummary.observationCount < voiceSummary.minRequired) {
    needingMoreObservations.push({
      modality: "VOICE",
      detail: `${voiceSummary.observationCount} of ${voiceSummary.minRequired} voice calibration observations completed.`,
    });
  }
  if (questionnaireSummary.sessionCount < 3) {
    needingMoreObservations.push({
      modality: "QUESTIONNAIRE",
      detail: `${questionnaireSummary.sessionCount} of 3 recommended self-report sessions recorded for empirical baseline context.`,
    });
  }

  return {
    userId,
    generatedAt: new Date().toISOString(),
    faceSummary,
    voiceSummary,
    questionnaireSummary,
    overallWellnessSummary: {
      experimentalStatus: "EXPERIMENTAL_NON_DIAGNOSTIC",
      stressScore: null,
      latestCheckinId: latest?.id ?? null,
      latestCheckinTimestamp: latest?.sessionTimestamp ?? null,
      changedFeatures,
      stableFeatures,
      unavailableDueToQualityOrMissing,
      needingMoreObservations,
      notice:
        "This longitudinal summary reflects experimental non-diagnostic personal-baseline comparisons. " +
        "No clinical diagnosis, disease classification, or composite stress score is calculated.",
    },
    disclaimer: NON_DIAGNOSTIC_NOTICE,
  };
}

export function buildCheckinComparisonReport(params: {
  checkin: StoredCheckinSession;
  allUserCheckins: StoredCheckinSession[];
  faceBaseline: FaceBaselineProfile | null;
  voiceBaseline: VoiceBaselineProfile | null;
}) {
  const { checkin, allUserCheckins, faceBaseline, voiceBaseline } = params;
  const chronological = [...allUserCheckins].sort(
    (a, b) => new Date(a.sessionTimestamp).getTime() - new Date(b.sessionTimestamp).getTime(),
  );
  const currentTs = new Date(checkin.sessionTimestamp).getTime();
  const priorCheckins = chronological.filter(
    (s) => s.id !== checkin.id && new Date(s.sessionTimestamp).getTime() <= currentTs,
  );
  const previousCheckin = priorCheckins.length > 0 ? priorCheckins[priorCheckins.length - 1] : null;
  const daysSincePrevious = previousCheckin
    ? roundTo((currentTs - new Date(previousCheckin.sessionTimestamp).getTime()) / (1000 * 60 * 60 * 24), 2)
    : null;

  const qStats = computeQuestionnaireBaselineStats(
    priorCheckins.length > 0 ? priorCheckins : chronological,
  );

  const comparisons: FeatureComparisonRow[] = [];

  // Questionnaire comparisons
  if (checkin.questionnaire) {
    const q = checkin.questionnaire;
    const qVals: Record<string, number | null> = {
      dailyAffectMood: q.dailyAffectMood,
      dailyAffectEnergy: q.dailyAffectEnergy,
      dailyAffectStress: q.dailyAffectStress,
      phq2Total:
        q.phq2Anhedonia !== null && q.phq2DepressedMood !== null
          ? q.phq2Anhedonia + q.phq2DepressedMood
          : null,
      gad2Total:
        q.gad2Nervousness !== null && q.gad2Worrying !== null
          ? q.gad2Nervousness + q.gad2Worrying
          : null,
    };
    for (const meta of QUESTIONNAIRE_META) {
      const st = qStats[meta.key] ?? { count: 0, mean: null, std: null };
      comparisons.push(
        compareFeature({
          modality: "QUESTIONNAIRE",
          featureKey: meta.key,
          label: meta.label,
          units: meta.units,
          currentValue: qVals[meta.key],
          baselineMean: st.mean,
          baselineStd: st.std,
          baselineCount: st.count,
          zThreshold: 1.2,
          minStdFloor: 0.05,
        }),
      );
    }
  }

  // Facial comparisons
  if (checkin.faceFeatures) {
    const f = checkin.faceFeatures;
    const fVals: Record<string, number | null> = {
      facialMovementVelocity: f.facialMovementVelocity,
      eyeBlinkRatePm: f.eyeBlinkRatePm,
      headPoseJitterStd: f.headPoseJitterStd,
      smileIntensityProxy: f.smileIntensityProxy,
      browFurrowProxy: f.browFurrowProxy,
    };
    for (const meta of FACE_FEATURES_META) {
      const st = faceBaseline?.feature_stats?.[meta.key] ?? {
        count: 0,
        mean: null,
        std: null,
      };
      comparisons.push(
        compareFeature({
          modality: "FACE",
          featureKey: meta.key,
          label: meta.label,
          units: meta.units,
          currentValue: fVals[meta.key],
          baselineMean: st.mean,
          baselineStd: st.std,
          baselineCount: st.count,
          zThreshold: 1.2,
          minStdFloor: 1e-4,
        }),
      );
    }
  }

  // Voice comparisons
  if (checkin.voiceFeatures) {
    const v = checkin.voiceFeatures;
    const rawFeats = (v.raw?.features as Record<string, number | undefined>) ?? {};
    const vVals: Record<string, number | null> = {
      speakingRateWpm: v.speakingRateWpm ?? rawFeats.speakingRateWpm ?? null,
      totalPauseCount: v.totalPauseCount ?? rawFeats.totalPauseCount ?? null,
      meanPauseDurationMs: v.meanPauseDurationMs ?? rawFeats.meanPauseDurationMs ?? null,
      longestPauseDurationMs: v.longestPauseDurationMs ?? rawFeats.longestPauseDurationMs ?? null,
      speechRatio: v.speechRatio ?? rawFeats.speechRatio ?? null,
      speechDurationSec: v.speechDurationSec ?? rawFeats.speechDurationSec ?? null,
      silenceDurationSec: v.silenceDurationSec ?? rawFeats.silenceDurationSec ?? null,
      pitchMeanHz: v.pitchMeanHz ?? rawFeats.pitchMeanHz ?? null,
      pitchStdDevHz: v.pitchStdDevHz ?? rawFeats.pitchStdDevHz ?? null,
      pitchRangeHz: v.pitchRangeHz ?? rawFeats.pitchRangeHz ?? null,
      energyMeanRms: v.energyMeanRms ?? rawFeats.energyMeanRms ?? null,
      energyStdDev: v.energyStdDev ?? rawFeats.energyStdDev ?? null,
    };
    for (const meta of VOICE_FEATURES_META) {
      const st = voiceBaseline?.stats?.[meta.key];
      comparisons.push(
        compareFeature({
          modality: "VOICE",
          featureKey: meta.key,
          label: meta.label,
          units: meta.units,
          currentValue: vVals[meta.key],
          baselineMean: st ? st.mean : null,
          baselineStd: st ? st.std : null,
          baselineCount: st ? st.count : 0,
          zThreshold: 1.5,
          minStdFloor: voiceBaseline?.min_std_floor ?? 1e-4,
        }),
      );
    }
  }

  const allModalities: Modality[] = ["QUESTIONNAIRE", "FACE", "VOICE"];
  const missingModalities = allModalities.filter((m) => !checkin.availableModalities.includes(m));

  const notableChanges = comparisons
    .filter((c) => c.status === "higher_than_baseline" || c.status === "lower_than_baseline")
    .map((c) => `${c.modality} · ${c.label}: ${c.interpretation}`);

  return {
    reportVersion: "1.0.0",
    generatedAt: new Date().toISOString(),
    checkinId: checkin.id,
    userId: checkin.userId,
    sessionTimestamp: checkin.sessionTimestamp,
    status: checkin.status,
    availableModalities: checkin.availableModalities,
    missingModalities,
    stressScore: null,
    recordingQuality: {
      face: checkin.faceFeatures
        ? {
            qualityScore: checkin.faceFeatures.qualityScore,
            detectionCoverage: checkin.faceFeatures.detectionCoverage,
            usableFrames: checkin.faceFeatures.usableFrames,
            totalFrames: checkin.faceFeatures.totalFrames,
            isReliable: checkin.faceFeatures.isReliable,
            isSuitableForBaseline: checkin.faceFeatures.isSuitableForBaseline,
            durationSec: checkin.faceFeatures.durationSec,
          }
        : null,
      voice: checkin.voiceFeatures
        ? {
            qualityScore: checkin.voiceFeatures.qualityScore,
            durationSec: checkin.voiceFeatures.durationSec,
            sampleRate: checkin.voiceFeatures.sampleRate,
            technicalDeviationScore: checkin.voiceFeatures.technicalDeviationScore,
            warnings: (checkin.voiceFeatures.raw?.qualityWarnings as string[]) ?? [],
          }
        : null,
    },
    historicalContext: {
      priorCheckinCount: priorCheckins.length,
      totalCheckinCount: chronological.length,
      daysSincePreviousCheckin: daysSincePrevious,
      priorFaceSessions: priorCheckins.filter((s) => s.faceFeatures !== null).length,
      priorVoiceSessions: priorCheckins.filter((s) => s.voiceFeatures !== null).length,
      priorQuestionnaireSessions: priorCheckins.filter((s) => s.questionnaire !== null).length,
      faceBaselineCalibrated: faceBaseline?.is_calibrated ?? false,
      voiceBaselineEstablished: voiceBaseline?.is_established ?? false,
    },
    comparisons,
    notableChanges,
    limitations: [
      NON_DIAGNOSTIC_NOTICE,
      "Z-scores are suppressed whenever a personal baseline has fewer than 2 observations or zero variance.",
      "Omitted modalities or features are reported explicitly as unavailable (null) and never imputed as zero.",
    ],
  };
}
