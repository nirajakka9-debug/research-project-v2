export type Modality = "QUESTIONNAIRE" | "FACE" | "VOICE";
export type OperationalMode = "single" | "calibrate" | "assess";
export type UserRole = "ADMIN" | "USER";

export type NavPage =
  | "dashboard"
  | "checkin"
  | "questionnaire"
  | "face"
  | "voice"
  | "baselines"
  | "history"
  | "settings"
  | "admin-dashboard"
  | "admin-users";

export interface HealthStatus {
  service: string;
  runtime: string;
  status: string;
  database: string;
  faceAiAvailable: boolean;
  voiceAiAvailable: boolean;
  ffmpegAvailable?: boolean;
  ffmpegVersion?: string | null;
  disclaimer: string;
}

export interface AuthStatusResponse {
  adminBootstrapped: boolean;
  allowAdminBootstrap: boolean;
  registrationEnabled: boolean;
  emailDeliveryConfigured: boolean;
}

export interface UserProfile {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  isActive: boolean;
  hasPassword: boolean;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
}

export interface AuthSessionResponse {
  accessToken: string;
  tokenType: "Bearer";
  expiresInSec: number;
  user: UserProfile;
}

export interface AdminUserRow extends UserProfile {
  checkinCount: number;
  faceBaselineCount: number;
  faceCalibrated: boolean;
  voiceBaselineCount: number;
  voiceEstablished: boolean;
}

export interface AdminOverviewResponse {
  systemHealth: {
    serviceStatus: string;
    runtime: string;
    faceAiAvailable: boolean;
    voiceAiAvailable: boolean;
    ffmpegAvailable: boolean;
    ffprobeAvailable: boolean;
    ffmpegVersion: string | null;
  };
  usageStats: {
    totalUsers: number;
    activeUsers: number;
    inactiveUsers: number;
    adminCount: number;
    standardUserCount: number;
    totalCheckins: number;
    totalAnalysisRuns: number;
    faceAnalysisRuns: number;
    voiceAnalysisRuns: number;
    cachedAudioConversions: number;
    establishedFaceBaselines: number;
    establishedVoiceBaselines: number;
    modalityCounts: Record<Modality, number>;
  };
}

export interface AudioConversionResult {
  conversionId: string;
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
  downloadUrl: string;
  createdAt: string;
}

export interface QuestionnairePayload {
  userId?: string;
  phq2Anhedonia?: number | null;
  phq2DepressedMood?: number | null;
  gad2Nervousness?: number | null;
  gad2Worrying?: number | null;
  dailyAffectMood: number;
  dailyAffectEnergy: number;
  dailyAffectStress: number;
  sleepQuality?: number | null;
  reflectionNote?: string | null;
}

export interface QuestionnaireSummary extends QuestionnairePayload {
  phq2Total: number | null;
  gad2Total: number | null;
}

export interface FaceQuality {
  total_frames: number;
  usable_frames: number;
  fps: number;
  duration_sec: number;
  detection_coverage: number;
  quality_score: number;
  is_reliable: boolean;
  is_suitable_for_baseline: boolean;
  multi_face_frames: number;
  identity_switch_warnings: number;
  avg_face_scale: number;
  avg_luminance: number;
  avg_contrast: number;
  warnings: string[];
}

export interface FaceFeaturesData {
  facialMovementVelocity: number | null;
  eyeBlinkRatePm: number | null;
  headPoseJitterStd: number | null;
  smileIntensityProxy: number | null;
  browFurrowProxy: number | null;
  units: Record<string, string>;
  auxiliary_metrics: Record<string, number | string | null>;
  feature_definitions: Record<string, string>;
}

export interface FaceBaselineComparisonItem {
  feature_name: string;
  current_value: number | null;
  baseline_mean: number | null;
  baseline_std: number | null;
  baseline_count: number;
  units: string;
  absolute_difference: number | null;
  relative_change_pct: number | null;
  standardized_z: number | null;
  interpretation: string;
}

export interface FaceAnalysisResult {
  version: string;
  module: string;
  disclaimer: string;
  processing_time_sec: number;
  operational_mode?: OperationalMode;
  user_id?: string;
  video_metadata: {
    filename: string;
    filesize_bytes: number;
    duration_sec: number;
    total_frames: number;
    fps: number;
    resolution: string;
    video_codec?: string;
    transcoded_from_webm?: boolean;
  };
  quality: FaceQuality;
  features: FaceFeaturesData;
  calibration_status?: {
    user_id: string;
    total_checkins?: number;
    min_required?: number;
    is_calibrated?: boolean;
    profile_path?: string;
    error?: string;
  };
  baseline_comparison?: {
    user_id: string;
    is_calibrated: boolean;
    total_calibration_checkins: number;
    min_checkins_required: number;
    comparisons: Record<string, FaceBaselineComparisonItem>;
    summary_observations: string[];
    limitations: string;
  };
}

export interface VoiceAnalysisResult {
  timestamp: string;
  status: string;
  operational_mode?: OperationalMode;
  user_id?: string;
  audio: {
    durationSec: number;
    sampleRate: number;
    channels: number;
    signalLevelRms: number;
    clippingRatio: number;
  };
  audioConversion?: {
    conversionId: string;
    convertedAutomatically: boolean;
    originalFilename: string;
    originalFormat: string;
    originalSampleRate: number | null;
    originalChannels: number | null;
    convertedFilename: string;
    convertedSampleRate: number;
    convertedChannels: number;
  };
  qualityScore: number;
  qualityWarnings?: string[];
  limitations?: string;
  features: {
    speakingRateWpm: number;
    totalPauseCount: number;
    meanPauseDurationMs: number;
    longestPauseDurationMs: number;
    speechRatio: number;
    speechDurationSec: number;
    silenceDurationSec: number;
    pitchMeanHz: number;
    pitchStdDevHz: number;
    pitchRangeHz: number;
    energyMeanRms: number;
    energyStdDev: number;
  };
  voicePattern?: {
    baselineType: string;
    isBaselineEstablished?: boolean;
    observationCount?: number;
    minObservationsRequired?: number;
    technicalDeviationScore: number | null;
    featureDeviations: Record<string, number | null>;
    significantDeviations: string[];
    status?: string;
  };
  calibrationStatus?: {
    user_id: string;
    observation_count: number;
    min_observations_required: number;
    is_established: boolean;
  };
}

export interface AnalysisRunResponse<T = FaceAnalysisResult | VoiceAnalysisResult> {
  runId: string;
  userId: string;
  modality: "FACE" | "VOICE";
  mode: OperationalMode;
  filename: string;
  qualityScore: number | null;
  isReliable: boolean | null;
  createdAt: string;
  result: T;
  disclaimer?: string;
}

export interface CheckinSession {
  id: string;
  userId: string;
  sessionTimestamp: string;
  status: string;
  availableModalities: Modality[];
  missingModalities: Modality[];
  notes?: string | null;
  questionnaire: QuestionnaireSummary | null;
  face: {
    id: string;
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
    features: {
      facialMovementVelocity: number | null;
      eyeBlinkRatePm: number | null;
      headPoseJitterStd: number | null;
      smileIntensityProxy: number | null;
      browFurrowProxy: number | null;
    };
    raw: FaceAnalysisResult;
  } | null;
  voice: {
    id: string;
    analysisRunId: string | null;
    mode: OperationalMode;
    filename: string;
    durationSec: number | null;
    sampleRate: number | null;
    qualityScore: number | null;
    technicalDeviationScore: number | null;
    features: VoiceAnalysisResult["features"];
    voicePattern?: VoiceAnalysisResult["voicePattern"];
    qualityWarnings?: string[];
    raw: VoiceAnalysisResult;
  } | null;
  wellnessSummary: {
    fusionModelStatus: string;
    fusionModelNotice: string;
    stressScore: null;
    availableModalities: Modality[];
    missingModalities: Modality[];
    crossModalityObservations: string[];
    disclaimer: string;
  } | null;
}

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

export interface CheckinComparisonReport {
  reportVersion: string;
  generatedAt: string;
  checkinId: string;
  userId: string;
  sessionTimestamp: string;
  status: string;
  availableModalities: Modality[];
  missingModalities: Modality[];
  stressScore: null;
  recordingQuality: {
    face: {
      qualityScore: number | null;
      detectionCoverage: number | null;
      usableFrames: number | null;
      totalFrames: number | null;
      isReliable: boolean | null;
      isSuitableForBaseline: boolean | null;
      durationSec: number | null;
    } | null;
    voice: {
      qualityScore: number | null;
      durationSec: number | null;
      sampleRate: number | null;
      technicalDeviationScore: number | null;
      warnings: string[];
    } | null;
  };
  historicalContext: {
    priorCheckinCount: number;
    totalCheckinCount: number;
    daysSincePreviousCheckin: number | null;
    priorFaceSessions: number;
    priorVoiceSessions: number;
    priorQuestionnaireSessions: number;
    faceBaselineCalibrated: boolean;
    voiceBaselineEstablished: boolean;
  };
  comparisons: FeatureComparisonRow[];
  notableChanges: string[];
  limitations: string[];
}

export interface BaselineSummaryData {
  userId: string;
  generatedAt: string;
  faceSummary: {
    status: "NOT_STARTED" | "CALIBRATING" | "CALIBRATED";
    calibrationCount: number;
    minRequired: number;
    validObservations: number;
    availableFeatures: string[];
    missingFeatures: string[];
    createdAt: string | null;
    updatedAt: string | null;
    avgQualityScore: number | null;
    avgDetectionCoverage: number | null;
  };
  voiceSummary: {
    status: "NOT_STARTED" | "CALIBRATING" | "ESTABLISHED";
    observationCount: number;
    minRequired: number;
    validObservations: number;
    availableFeatures: string[];
    missingFeatures: string[];
    createdAt: string | null;
    updatedAt: string | null;
    avgQualityScore: number | null;
  };
  questionnaireSummary: {
    sessionCount: number;
    validObservations: number;
    availableMetrics: string[];
    missingMetrics: string[];
    createdAt: string | null;
    updatedAt: string | null;
    stats: Record<string, { count: number; mean: number | null; std: number | null }>;
  };
  overallWellnessSummary: {
    experimentalStatus: string;
    stressScore: null;
    latestCheckinId: string | null;
    latestCheckinTimestamp: string | null;
    changedFeatures: Array<{ modality: string; feature: string; direction: string; detail: string }>;
    stableFeatures: Array<{ modality: string; feature: string }>;
    unavailableDueToQualityOrMissing: Array<{ modality: string; reason: string }>;
    needingMoreObservations: Array<{ modality: string; detail: string }>;
    notice: string;
  };
  disclaimer: string;
}

export interface TrendPoint {
  checkinId: string;
  timestamp: string;
  label: string;
  availableModalities: Modality[];
  mood: number | null;
  energy: number | null;
  stress: number | null;
  phq2Total: number | null;
  gad2Total: number | null;
  facialMovementVelocity: number | null;
  eyeBlinkRatePm: number | null;
  headPoseJitterStd: number | null;
  smileIntensityProxy: number | null;
  browFurrowProxy: number | null;
  faceQualityScore: number | null;
  speakingRateWpm: number | null;
  pitchMeanHz: number | null;
  meanPauseDurationMs: number | null;
  speechRatio: number | null;
  energyMeanRms: number | null;
  voiceQualityScore: number | null;
}

export interface DashboardResponse {
  user: { id: string; fullName: string; email: string; role: UserRole };
  todayStatus: {
    checkedInToday: boolean;
    totalCheckins: number;
    lastCheckinAt: string | null;
  };
  latestCheckin: CheckinSession | null;
  latestQuestionnaire: QuestionnaireSummary | null;
  latestFace: CheckinSession["face"];
  latestVoice: CheckinSession["voice"];
  baselines: {
    face: {
      isCalibrated: boolean;
      totalRecorded: number;
      minRequired: number;
      featureStats: Record<string, { count: number; mean: number | null; std: number | null; min: number | null; max: number | null }>;
    };
    voice: {
      isEstablished: boolean;
      observationCount: number;
      minRequired: number;
      stats: Record<string, { count: number; mean: number | null; std: number | null; min: number | null; max: number | null }>;
    };
    questionnaire: Record<string, { count: number; mean: number | null; std: number | null }>;
  };
  recentCheckins: CheckinSession[];
  recentAnalysisRuns: Array<{
    runId: string;
    modality: "FACE" | "VOICE";
    mode: OperationalMode;
    filename: string;
    qualityScore: number | null;
    isReliable: boolean | null;
    createdAt: string;
  }>;
  trends: TrendPoint[];
  disclaimer: string;
}

export interface BaselinesResponse {
  userId: string;
  face: {
    exists: boolean;
    user_id: string;
    is_calibrated: boolean;
    total_checkins_recorded: number;
    min_calibration_checkins: number;
    created_at?: string | null;
    updated_at?: string | null;
    feature_stats: Record<string, { count: number; mean: number | null; std: number | null; min: number | null; max: number | null }>;
    history: Array<{
      timestamp: string;
      filename: string;
      quality_score: number;
      coverage: number;
      usable_frames: number;
      features: Record<string, number | null>;
    }>;
  };
  voice: {
    exists: boolean;
    user_id: string;
    is_established: boolean;
    observation_count: number;
    min_observations: number;
    stats: Record<string, { count: number; mean: number | null; std: number | null; min: number | null; max: number | null }>;
    history: Array<{
      timestamp: string;
      features: Record<string, number>;
    }>;
  };
  questionnaire: {
    sessionCount: number;
    stats: Record<string, { count: number; mean: number | null; std: number | null }>;
  };
  summary?: BaselineSummaryData;
  disclaimer: string;
}
