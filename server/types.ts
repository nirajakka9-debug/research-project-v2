export type Modality = "QUESTIONNAIRE" | "FACE" | "VOICE";
export type OperationalMode = "single" | "calibrate" | "assess";
export type UserRole = "ADMIN" | "USER";

export interface StoredUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  isActive: boolean;
  passwordHash: string | null;
  tokenVersion: number;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
}

export interface StoredAnalysisRun {
  id: string;
  userId: string;
  modality: "FACE" | "VOICE";
  mode: OperationalMode;
  originalFilename: string;
  qualityScore: number | null;
  isReliable: boolean | null;
  result: Record<string, unknown>;
  createdAt: string;
  conversionId?: string | null;
}

export interface StoredAudioConversion {
  id: string;
  userId: string;
  originalFilename: string;
  originalExtension: string;
  originalSizeBytes: number;
  originalFormat: string;
  originalSampleRate: number | null;
  originalChannels: number | null;
  convertedFilename: string;
  convertedSizeBytes: number;
  convertedSampleRate: number;
  convertedChannels: number;
  durationSec: number;
  wavBase64: string;
  createdAt: string;
}

export interface StoredQuestionnaire {
  id: string;
  checkinId: string;
  phq2Anhedonia: number | null;
  phq2DepressedMood: number | null;
  gad2Nervousness: number | null;
  gad2Worrying: number | null;
  dailyAffectMood: number;
  dailyAffectEnergy: number;
  dailyAffectStress: number;
  sleepQuality: number | null;
  reflectionNote: string | null;
  createdAt: string;
}

export interface StoredFaceFeature {
  id: string;
  checkinId: string;
  analysisRunId: string | null;
  mode: OperationalMode;
  filename: string;
  durationSec: number | null;
  totalFrames: number | null;
  usableFrames: number | null;
  detectionCoverage: number | null;
  qualityScore: number | null;
  isReliable: boolean | null;
  isSuitableForBaseline: boolean | null;
  facialMovementVelocity: number | null;
  eyeBlinkRatePm: number | null;
  headPoseJitterStd: number | null;
  smileIntensityProxy: number | null;
  browFurrowProxy: number | null;
  raw: Record<string, unknown>;
}

export interface StoredVoiceFeature {
  id: string;
  checkinId: string;
  analysisRunId: string | null;
  mode: OperationalMode;
  filename: string;
  durationSec: number | null;
  sampleRate: number | null;
  qualityScore: number | null;
  speakingRateWpm: number | null;
  totalPauseCount: number | null;
  meanPauseDurationMs: number | null;
  longestPauseDurationMs: number | null;
  speechRatio: number | null;
  speechDurationSec: number | null;
  silenceDurationSec: number | null;
  pitchMeanHz: number | null;
  pitchStdDevHz: number | null;
  pitchRangeHz: number | null;
  energyMeanRms: number | null;
  energyStdDev: number | null;
  technicalDeviationScore: number | null;
  raw: Record<string, unknown>;
}

export interface StoredCheckinSession {
  id: string;
  userId: string;
  sessionTimestamp: string;
  status: string;
  availableModalities: Modality[];
  notes: string | null;
  createdAt: string;
  questionnaire: StoredQuestionnaire | null;
  faceFeatures: StoredFaceFeature | null;
  voiceFeatures: StoredVoiceFeature | null;
  wellnessSummary: Record<string, unknown> | null;
}

export interface FaceFeatureStat {
  count: number;
  mean: number | null;
  std: number | null;
  min: number | null;
  max: number | null;
}

export interface FaceBaselineProfile {
  version: string;
  user_id: string;
  created_at: string;
  updated_at: string;
  min_calibration_checkins: number;
  total_checkins_recorded: number;
  is_calibrated: boolean;
  feature_stats: Record<string, FaceFeatureStat>;
  history: Array<{
    timestamp: string;
    filename: string;
    quality_score: number;
    coverage: number;
    usable_frames: number;
    features: Record<string, number | null>;
  }>;
}

export interface VoiceFeatureStat {
  mean: number;
  std: number;
  min: number;
  max: number;
  count: number;
}

export interface VoiceBaselineProfile {
  user_id: string;
  min_observations: number;
  min_std_floor: number;
  observation_count: number;
  is_established: boolean;
  stats: Record<string, VoiceFeatureStat>;
  history: Array<{
    timestamp: string;
    features: Record<string, number>;
  }>;
}
