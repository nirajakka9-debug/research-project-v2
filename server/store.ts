import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { hashPassword } from "./auth";
import { normalizeUtcIso, validateSafeUserId } from "./config";
import type {
  FaceBaselineProfile,
  Modality,
  OperationalMode,
  StoredAnalysisRun,
  StoredAudioConversion,
  StoredCheckinSession,
  StoredFaceFeature,
  StoredQuestionnaire,
  StoredUser,
  StoredVoiceFeature,
  UserRole,
  VoiceBaselineProfile,
} from "./types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "data");
const STATE_PATH = path.resolve(DATA_DIR, "mindtrack_state.json");
const MAX_STORED_CONVERSIONS = 40;

interface RawSeedDump {
  users?: Array<{
    id: string;
    email: string;
    full_name: string;
    role: string;
    created_at: string;
  }>;
  analysis_runs?: Array<{
    id: string;
    user_id: string;
    modality: "FACE" | "VOICE";
    mode: OperationalMode;
    original_filename: string;
    quality_score: number | null;
    is_reliable: number | boolean | null;
    raw_json: string;
    created_at: string;
  }>;
  checkin_sessions?: Array<{
    id: string;
    user_id: string;
    session_timestamp: string;
    status: string;
    available_modalities: string;
    notes: string | null;
    created_at: string;
  }>;
  questionnaire_responses?: Array<{
    id: string;
    checkin_id: string;
    phq2_anhedonia: number | null;
    phq2_depressed_mood: number | null;
    gad2_nervousness: number | null;
    gad2_worrying: number | null;
    daily_affect_mood: number;
    daily_affect_energy: number;
    daily_affect_stress: number;
    sleep_quality: number | null;
    reflection_note: string | null;
    created_at: string;
  }>;
  face_features?: Array<{
    id: string;
    checkin_id: string;
    analysis_run_id: string | null;
    mode: OperationalMode;
    filename: string;
    duration_sec: number | null;
    total_frames: number | null;
    usable_frames: number | null;
    detection_coverage: number | null;
    quality_score: number | null;
    is_reliable: number | boolean | null;
    is_suitable_for_baseline: number | boolean | null;
    facial_movement_velocity: number | null;
    eye_blink_rate_pm: number | null;
    head_pose_jitter_std: number | null;
    smile_intensity_proxy: number | null;
    brow_furrow_proxy: number | null;
    raw_json: string;
  }>;
  voice_features?: Array<{
    id: string;
    checkin_id: string;
    analysis_run_id: string | null;
    mode: OperationalMode;
    filename: string;
    duration_sec: number | null;
    sample_rate: number | null;
    quality_score: number | null;
    speaking_rate_wpm: number | null;
    total_pause_count: number | null;
    mean_pause_duration_ms: number | null;
    longest_pause_duration_ms: number | null;
    speech_ratio: number | null;
    speech_duration_sec: number | null;
    silence_duration_sec: number | null;
    pitch_mean_hz: number | null;
    pitch_std_dev_hz: number | null;
    pitch_range_hz: number | null;
    energy_mean_rms: number | null;
    energy_std_dev: number | null;
    technical_deviation_score: number | null;
    raw_json: string;
  }>;
  wellness_summaries?: Array<{
    checkin_id: string;
    summary_json: string;
  }>;
}

interface PersistedState {
  version: number;
  users: StoredUser[];
  analysisRuns: StoredAnalysisRun[];
  checkins: StoredCheckinSession[];
  faceBaselines: FaceBaselineProfile[];
  voiceBaselines: VoiceBaselineProfile[];
}

function normalizeRole(rawRole: string | undefined): UserRole {
  const upper = (rawRole || "").toUpperCase();
  if (upper === "ADMIN" || upper === "ROLE_ADMIN") return "ADMIN";
  return "USER";
}

class MindTrackStore {
  users = new Map<string, StoredUser>();
  analysisRuns = new Map<string, StoredAnalysisRun>();
  checkins = new Map<string, StoredCheckinSession>();
  faceBaselines = new Map<string, FaceBaselineProfile>();
  voiceBaselines = new Map<string, VoiceBaselineProfile>();
  audioConversions = new Map<string, StoredAudioConversion>();

  constructor() {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!this.loadPersistedState()) {
      this.loadSeedData();
      this.ensureDefaultDemoUser();
    }
    this.bootstrapAdminFromEnv();
    this.persist();
  }

  private loadPersistedState(): boolean {
    if (!fs.existsSync(STATE_PATH)) return false;
    try {
      const parsed = JSON.parse(fs.readFileSync(STATE_PATH, "utf-8")) as PersistedState;
      for (const u of parsed.users ?? []) {
        this.users.set(u.id, {
          id: u.id,
          email: u.email,
          fullName: u.fullName,
          role: normalizeRole(u.role),
          isActive: u.isActive ?? true,
          passwordHash: u.passwordHash ?? null,
          tokenVersion: u.tokenVersion ?? 1,
          createdAt: normalizeUtcIso(u.createdAt),
          updatedAt: normalizeUtcIso(u.updatedAt || u.createdAt),
          lastLoginAt: u.lastLoginAt ?? null,
        });
      }
      for (const r of parsed.analysisRuns ?? []) {
        this.analysisRuns.set(r.id, r);
      }
      for (const c of parsed.checkins ?? []) {
        this.checkins.set(c.id, c);
      }
      for (const fb of parsed.faceBaselines ?? []) {
        this.faceBaselines.set(fb.user_id, fb);
      }
      for (const vb of parsed.voiceBaselines ?? []) {
        this.voiceBaselines.set(vb.user_id, vb);
      }
      return true;
    } catch (err) {
      console.warn("[MindTrack] Failed to read persisted state file, falling back to seed:", err);
      return false;
    }
  }

  private loadSeedData(): void {
    const seedPath = path.resolve(__dirname, "seed_data.json");
    if (fs.existsSync(seedPath)) {
      try {
        const raw = JSON.parse(fs.readFileSync(seedPath, "utf-8")) as RawSeedDump;
        for (const u of raw.users ?? []) {
          const created = normalizeUtcIso(u.created_at);
          this.users.set(u.id, {
            id: u.id,
            email: u.email,
            fullName: u.full_name,
            role: normalizeRole(u.role),
            isActive: true,
            passwordHash: null, // Existing migrated profile remains protected until password is set by Admin
            tokenVersion: 1,
            createdAt: created,
            updatedAt: created,
            lastLoginAt: null,
          });
        }
        for (const r of raw.analysis_runs ?? []) {
          this.analysisRuns.set(r.id, {
            id: r.id,
            userId: r.user_id,
            modality: r.modality,
            mode: r.mode,
            originalFilename: r.original_filename,
            qualityScore: r.quality_score,
            isReliable: r.is_reliable === null ? null : Boolean(r.is_reliable),
            result: JSON.parse(r.raw_json) as Record<string, unknown>,
            createdAt: normalizeUtcIso(r.created_at),
          });
        }

        const qByCheckin = new Map<string, StoredQuestionnaire>();
        for (const q of raw.questionnaire_responses ?? []) {
          qByCheckin.set(q.checkin_id, {
            id: q.id,
            checkinId: q.checkin_id,
            phq2Anhedonia: q.phq2_anhedonia,
            phq2DepressedMood: q.phq2_depressed_mood,
            gad2Nervousness: q.gad2_nervousness,
            gad2Worrying: q.gad2_worrying,
            dailyAffectMood: q.daily_affect_mood,
            dailyAffectEnergy: q.daily_affect_energy,
            dailyAffectStress: q.daily_affect_stress,
            sleepQuality: q.sleep_quality,
            reflectionNote: q.reflection_note,
            createdAt: normalizeUtcIso(q.created_at),
          });
        }

        const faceByCheckin = new Map<string, StoredFaceFeature>();
        for (const f of raw.face_features ?? []) {
          faceByCheckin.set(f.checkin_id, {
            id: f.id,
            checkinId: f.checkin_id,
            analysisRunId: f.analysis_run_id,
            mode: f.mode,
            filename: f.filename,
            durationSec: f.duration_sec,
            totalFrames: f.total_frames,
            usableFrames: f.usable_frames,
            detectionCoverage: f.detection_coverage,
            qualityScore: f.quality_score,
            isReliable: f.is_reliable === null ? null : Boolean(f.is_reliable),
            isSuitableForBaseline:
              f.is_suitable_for_baseline === null ? null : Boolean(f.is_suitable_for_baseline),
            facialMovementVelocity: f.facial_movement_velocity,
            eyeBlinkRatePm: f.eye_blink_rate_pm,
            headPoseJitterStd: f.head_pose_jitter_std,
            smileIntensityProxy: f.smile_intensity_proxy,
            browFurrowProxy: f.brow_furrow_proxy,
            raw: JSON.parse(f.raw_json) as Record<string, unknown>,
          });
        }

        const voiceByCheckin = new Map<string, StoredVoiceFeature>();
        for (const v of raw.voice_features ?? []) {
          voiceByCheckin.set(v.checkin_id, {
            id: v.id,
            checkinId: v.checkin_id,
            analysisRunId: v.analysis_run_id,
            mode: v.mode,
            filename: v.filename,
            durationSec: v.duration_sec,
            sampleRate: v.sample_rate,
            qualityScore: v.quality_score,
            speakingRateWpm: v.speaking_rate_wpm,
            totalPauseCount: v.total_pause_count,
            meanPauseDurationMs: v.mean_pause_duration_ms,
            longestPauseDurationMs: v.longest_pause_duration_ms,
            speechRatio: v.speech_ratio,
            speechDurationSec: v.speech_duration_sec,
            silenceDurationSec: v.silence_duration_sec,
            pitchMeanHz: v.pitch_mean_hz,
            pitchStdDevHz: v.pitch_std_dev_hz,
            pitchRangeHz: v.pitch_range_hz,
            energyMeanRms: v.energy_mean_rms,
            energyStdDev: v.energy_std_dev,
            technicalDeviationScore: v.technical_deviation_score,
            raw: JSON.parse(v.raw_json) as Record<string, unknown>,
          });
        }

        const summaryByCheckin = new Map<string, Record<string, unknown>>();
        for (const s of raw.wellness_summaries ?? []) {
          summaryByCheckin.set(s.checkin_id, JSON.parse(s.summary_json) as Record<string, unknown>);
        }

        for (const c of raw.checkin_sessions ?? []) {
          const mods = c.available_modalities
            .split(",")
            .map((m) => m.trim())
            .filter(Boolean) as Modality[];
          this.checkins.set(c.id, {
            id: c.id,
            userId: c.user_id,
            sessionTimestamp: normalizeUtcIso(c.session_timestamp),
            status: c.status,
            availableModalities: mods,
            notes: c.notes,
            createdAt: normalizeUtcIso(c.created_at),
            questionnaire: qByCheckin.get(c.id) ?? null,
            faceFeatures: faceByCheckin.get(c.id) ?? null,
            voiceFeatures: voiceByCheckin.get(c.id) ?? null,
            wellnessSummary: summaryByCheckin.get(c.id) ?? null,
          });
        }
      } catch (err) {
        console.warn("[MindTrack] Failed to load seed_data.json:", err);
      }
    }

    const voiceSeedPath = path.resolve(__dirname, "voice_seed_demo_user.json");
    if (fs.existsSync(voiceSeedPath)) {
      try {
        const vp = JSON.parse(fs.readFileSync(voiceSeedPath, "utf-8")) as VoiceBaselineProfile;
        this.voiceBaselines.set(vp.user_id, vp);
      } catch (err) {
        console.warn("[MindTrack] Failed to load voice_seed_demo_user.json:", err);
      }
    }
  }

  private ensureDefaultDemoUser(): void {
    if (this.users.has("demo_user")) return;
    const now = new Date().toISOString();
    this.users.set("demo_user", {
      id: "demo_user",
      email: "demo_user@mindtrack.local",
      fullName: "Demo Participant",
      role: "USER",
      isActive: true,
      passwordHash: null,
      tokenVersion: 1,
      createdAt: now,
      updatedAt: now,
      lastLoginAt: null,
    });
  }

  private bootstrapAdminFromEnv(): void {
    const email = (process.env.MINDTRACK_ADMIN_EMAIL || "").trim().toLowerCase();
    const password = process.env.MINDTRACK_ADMIN_PASSWORD || "";
    const fullName = (process.env.MINDTRACK_ADMIN_NAME || "MindTrack Administrator").trim();

    if (!email || !password) return;
    if (password.length < 8) {
      console.warn("[MindTrack] MINDTRACK_ADMIN_PASSWORD ignored because it is shorter than 8 characters.");
      return;
    }
    const existing = this.findUserByEmail(email);
    const now = new Date().toISOString();
    if (existing) {
      existing.role = "ADMIN";
      existing.isActive = true;
      if (!existing.passwordHash) {
        existing.passwordHash = hashPassword(password);
      }
      existing.updatedAt = now;
      return;
    }

    const adminId = "admin_" + crypto.createHash("sha256").update(email).digest("hex").slice(0, 8);
    this.users.set(adminId, {
      id: adminId,
      email,
      fullName,
      role: "ADMIN",
      isActive: true,
      passwordHash: hashPassword(password),
      tokenVersion: 1,
      createdAt: now,
      updatedAt: now,
      lastLoginAt: null,
    });
  }

  persist(): void {
    try {
      const payload: PersistedState = {
        version: 2,
        users: Array.from(this.users.values()),
        analysisRuns: Array.from(this.analysisRuns.values()),
        checkins: Array.from(this.checkins.values()),
        faceBaselines: Array.from(this.faceBaselines.values()),
        voiceBaselines: Array.from(this.voiceBaselines.values()),
      };
      const tmpPath = path.resolve(DATA_DIR, `mindtrack_state.${process.pid}.tmp`);
      fs.writeFileSync(tmpPath, JSON.stringify(payload, null, 2), "utf-8");
      fs.renameSync(tmpPath, STATE_PATH);
    } catch (err) {
      console.warn("[MindTrack] Failed to persist state:", err);
    }
  }

  hasAdminAccount(): boolean {
    return Array.from(this.users.values()).some((u) => u.role === "ADMIN" && u.isActive);
  }

  findUserByEmail(email: string): StoredUser | undefined {
    const target = email.trim().toLowerCase();
    return Array.from(this.users.values()).find((u) => u.email.trim().toLowerCase() === target);
  }

  saveAudioConversion(conv: StoredAudioConversion): void {
    this.audioConversions.set(conv.id, conv);
    while (this.audioConversions.size > MAX_STORED_CONVERSIONS) {
      const oldestKey = this.audioConversions.keys().next().value;
      if (!oldestKey) break;
      this.audioConversions.delete(oldestKey);
    }
  }

  readFaceBaseline(userId: string) {
    const cleanId = validateSafeUserId(userId);
    const profile = this.faceBaselines.get(cleanId);
    if (!profile) {
      return {
        exists: false,
        user_id: cleanId,
        is_calibrated: false,
        total_checkins_recorded: 0,
        min_calibration_checkins: 5,
        created_at: null,
        updated_at: null,
        feature_stats: {},
        history: [],
      };
    }
    return { ...profile, exists: true };
  }

  readVoiceBaseline(userId: string) {
    const cleanId = validateSafeUserId(userId);
    const profile = this.voiceBaselines.get(cleanId);
    if (!profile) {
      return {
        exists: false,
        user_id: cleanId,
        is_established: false,
        observation_count: 0,
        min_observations: 3,
        stats: {},
        history: [],
      };
    }
    return { ...profile, exists: true };
  }

  newId(): string {
    return crypto.randomUUID();
  }
}

export const store = new MindTrackStore();
