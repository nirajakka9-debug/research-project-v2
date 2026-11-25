import { NON_DIAGNOSTIC_NOTICE } from "./config";
import type {
  Modality,
  StoredCheckinSession,
  StoredFaceFeature,
  StoredQuestionnaire,
  StoredVoiceFeature,
} from "./types";

export const ALL_MODALITIES: Modality[] = ["QUESTIONNAIRE", "FACE", "VOICE"];

export function computeQuestionnaireSummary(q: StoredQuestionnaire | null) {
  if (!q) return null;
  const phq2Total =
    q.phq2Anhedonia !== null && q.phq2DepressedMood !== null
      ? q.phq2Anhedonia + q.phq2DepressedMood
      : null;
  const gad2Total =
    q.gad2Nervousness !== null && q.gad2Worrying !== null
      ? q.gad2Nervousness + q.gad2Worrying
      : null;
  return {
    phq2Anhedonia: q.phq2Anhedonia,
    phq2DepressedMood: q.phq2DepressedMood,
    phq2Total,
    gad2Nervousness: q.gad2Nervousness,
    gad2Worrying: q.gad2Worrying,
    gad2Total,
    dailyAffectMood: q.dailyAffectMood,
    dailyAffectEnergy: q.dailyAffectEnergy,
    dailyAffectStress: q.dailyAffectStress,
    sleepQuality: q.sleepQuality,
    reflectionNote: q.reflectionNote,
  };
}

export function computeQuestionnaireBaselineStats(checkins: StoredCheckinSession[]) {
  const fields: Record<string, number[]> = {
    dailyAffectMood: [],
    dailyAffectEnergy: [],
    dailyAffectStress: [],
    phq2Total: [],
    gad2Total: [],
  };

  for (const session of checkins) {
    const q = session.questionnaire;
    if (!q) continue;
    fields.dailyAffectMood.push(q.dailyAffectMood);
    fields.dailyAffectEnergy.push(q.dailyAffectEnergy);
    fields.dailyAffectStress.push(q.dailyAffectStress);
    if (q.phq2Anhedonia !== null && q.phq2DepressedMood !== null) {
      fields.phq2Total.push(q.phq2Anhedonia + q.phq2DepressedMood);
    }
    if (q.gad2Nervousness !== null && q.gad2Worrying !== null) {
      fields.gad2Total.push(q.gad2Nervousness + q.gad2Worrying);
    }
  }

  const stats: Record<string, { count: number; mean: number | null; std: number | null }> = {};
  for (const [key, values] of Object.entries(fields)) {
    const n = values.length;
    if (n === 0) {
      stats[key] = { count: 0, mean: null, std: null };
    } else if (n === 1) {
      stats[key] = { count: 1, mean: Number(values[0].toFixed(3)), std: 0.0 };
    } else {
      const mean = values.reduce((a, b) => a + b, 0) / n;
      const variance = values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / (n - 1);
      stats[key] = {
        count: n,
        mean: Number(mean.toFixed(3)),
        std: Number(Math.sqrt(Math.max(0, variance)).toFixed(3)),
      };
    }
  }
  return stats;
}

export function buildTransparentWellnessSummary(params: {
  availableModalities: Modality[];
  questionnaire: StoredQuestionnaire | null;
  face: StoredFaceFeature | null;
  voice: StoredVoiceFeature | null;
}) {
  const { availableModalities, questionnaire, face, voice } = params;
  const missing = ALL_MODALITIES.filter((m) => !availableModalities.includes(m));
  const observations: string[] = [];

  const qSummary = computeQuestionnaireSummary(questionnaire);
  if (qSummary) {
    observations.push(
      `Self-report affect recorded (Mood ${qSummary.dailyAffectMood}/5, Energy ${qSummary.dailyAffectEnergy}/5, Perceived Stress ${qSummary.dailyAffectStress}/5).`,
    );
  }

  let faceSummary: Record<string, unknown> | null = null;
  if (face) {
    const faceRaw = face.raw;
    const faceComp = faceRaw.baseline_comparison as
      | { summary_observations?: string[] }
      | undefined;
    const faceCal = faceRaw.calibration_status;
    faceSummary = {
      mode: face.mode,
      qualityScore: face.qualityScore,
      isReliable: face.isReliable,
      isSuitableForBaseline: face.isSuitableForBaseline,
      features: {
        facialMovementVelocity: face.facialMovementVelocity,
        eyeBlinkRatePm: face.eyeBlinkRatePm,
        headPoseJitterStd: face.headPoseJitterStd,
        smileIntensityProxy: face.smileIntensityProxy,
        browFurrowProxy: face.browFurrowProxy,
      },
      baselineComparison: faceComp ?? null,
      calibrationStatus: faceCal ?? null,
    };

    if (face.isReliable === false) {
      observations.push(
        `Facial recording quality was low (${face.qualityScore}/100); interpret facial features cautiously.`,
      );
    } else if (faceComp?.summary_observations?.length) {
      observations.push(...faceComp.summary_observations.slice(0, 2));
    } else {
      observations.push(
        `Facial behaviour measurements extracted (${face.usableFrames}/${face.totalFrames} tracked frames).`,
      );
    }
  }

  let voiceSummary: Record<string, unknown> | null = null;
  if (voice) {
    const voiceRaw = voice.raw;
    const vp = voiceRaw.voicePattern as
      | { significantDeviations?: string[] }
      | undefined;
    voiceSummary = {
      mode: voice.mode,
      qualityScore: voice.qualityScore,
      features: voiceRaw.features ?? {},
      voicePattern: vp ?? null,
      qualityWarnings: (voiceRaw.qualityWarnings as string[]) ?? [],
    };
    if (vp?.significantDeviations?.length) {
      observations.push(...vp.significantDeviations.slice(0, 2));
    } else {
      const qStr = voice.qualityScore !== null ? voice.qualityScore.toFixed(2) : "0.00";
      const wpmStr = voice.speakingRateWpm !== null ? voice.speakingRateWpm.toFixed(1) : "0.0";
      observations.push(`Voice acoustic measurements extracted (Quality ${qStr}/1.00, ${wpmStr} WPM).`);
    }
  }

  if (missing.length > 0) {
    observations.push(
      `Omitted modalities (${missing.join(", ")}) are stored as missing (null), never imputed as zero.`,
    );
  }

  return {
    fusionModelStatus: "UNVALIDATED_RESEARCH_FRAMEWORK",
    fusionModelNotice:
      "No validated multimodal AI fusion model or composite clinical stress score is active. " +
      "Modalities are presented side by side with personal-baseline comparisons where available.",
    stressScore: null,
    availableModalities,
    missingModalities: missing,
    questionnaire: qSummary,
    face: faceSummary,
    voice: voiceSummary,
    crossModalityObservations: observations,
    disclaimer: NON_DIAGNOSTIC_NOTICE,
  };
}
