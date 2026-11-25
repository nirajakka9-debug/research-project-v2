import express, { type NextFunction, type Request, type Response } from "express";
import fs from "fs";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import {
  assertCanAccessUser,
  createAuthMiddleware,
  hashPassword,
  publicUserDto,
  requireAdmin,
  signAccessToken,
  verifyPassword,
  type AuthenticatedRequest,
} from "./server/auth";
import { buildBaselineSummary, buildCheckinComparisonReport } from "./server/comparisonEngine";
import {
  DEFAULT_FACE_MAX_DURATION_SEC,
  MAX_AUDIO_SIZE_BYTES,
  MAX_VIDEO_SIZE_BYTES,
  NON_DIAGNOSTIC_NOTICE,
  validateSafeUserId,
} from "./server/config";
import { analyzeFaceVideoBuffer, FaceAnalysisError } from "./server/faceAnalyzer";
import {
  checkFfmpegStatus,
  convertAudioBufferTo16kMonoWav,
  SUPPORTED_CONVERTIBLE_AUDIO_EXTENSIONS,
} from "./server/mediaTools";
import { store } from "./server/store";
import type {
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
} from "./server/types";
import { analyzeVoiceWavBuffer, VoiceAnalysisError } from "./server/voiceAnalyzer";
import {
  ALL_MODALITIES,
  buildTransparentWellnessSummary,
  computeQuestionnaireBaselineStats,
  computeQuestionnaireSummary,
} from "./server/wellnessEngine";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIR = path.resolve(__dirname, "mindtrack/web-app/frontend");
const DIST_DIR = path.resolve(__dirname, "dist");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_VIDEO_SIZE_BYTES },
});

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const requireAuth = createAuthMiddleware((id) => store.users.get(id));

function validateEmail(emailRaw: unknown): string {
  if (typeof emailRaw !== "string") {
    throw new HttpError(422, "A valid email address is required.");
  }
  const email = emailRaw.trim().toLowerCase();
  if (email.length < 5 || email.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpError(422, "Please provide a valid email address.");
  }
  return email;
}

function validatePassword(pwRaw: unknown): string {
  if (typeof pwRaw !== "string" || pwRaw.length < 8 || pwRaw.length > 128) {
    throw new HttpError(422, "Password must be between 8 and 128 characters.");
  }
  return pwRaw;
}

function validateFullName(nameRaw: unknown): string {
  if (typeof nameRaw !== "string") {
    throw new HttpError(422, "Full name is required.");
  }
  const clean = nameRaw.trim();
  if (clean.length < 1 || clean.length > 120) {
    throw new HttpError(422, "Full name must be between 1 and 120 characters.");
  }
  return clean;
}

function makeUniqueUserIdFromEmail(email: string): string {
  const local = email
    .split("@")[0]
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32) || "user";
  let candidate = local;
  let counter = 1;
  while (store.users.has(candidate)) {
    candidate = `${local}_${counter}`;
    counter++;
  }
  return candidate;
}

function serializeCheckin(session: StoredCheckinSession) {
  const modalities = session.availableModalities;
  const missing = ALL_MODALITIES.filter((m) => !modalities.includes(m));
  const qData = computeQuestionnaireSummary(session.questionnaire);

  const faceData = session.faceFeatures
    ? {
        id: session.faceFeatures.id,
        analysisRunId: session.faceFeatures.analysisRunId,
        mode: session.faceFeatures.mode,
        filename: session.faceFeatures.filename,
        durationSec: session.faceFeatures.durationSec,
        totalFrames: session.faceFeatures.totalFrames,
        usableFrames: session.faceFeatures.usableFrames,
        detectionCoverage: session.faceFeatures.detectionCoverage,
        qualityScore: session.faceFeatures.qualityScore,
        isReliable: session.faceFeatures.isReliable,
        isSuitableForBaseline: session.faceFeatures.isSuitableForBaseline,
        features: {
          facialMovementVelocity: session.faceFeatures.facialMovementVelocity,
          eyeBlinkRatePm: session.faceFeatures.eyeBlinkRatePm,
          headPoseJitterStd: session.faceFeatures.headPoseJitterStd,
          smileIntensityProxy: session.faceFeatures.smileIntensityProxy,
          browFurrowProxy: session.faceFeatures.browFurrowProxy,
        },
        raw: session.faceFeatures.raw,
      }
    : null;

  const voiceData = session.voiceFeatures
    ? {
        id: session.voiceFeatures.id,
        analysisRunId: session.voiceFeatures.analysisRunId,
        mode: session.voiceFeatures.mode,
        filename: session.voiceFeatures.filename,
        durationSec: session.voiceFeatures.durationSec,
        sampleRate: session.voiceFeatures.sampleRate,
        qualityScore: session.voiceFeatures.qualityScore,
        technicalDeviationScore: session.voiceFeatures.technicalDeviationScore,
        features: (session.voiceFeatures.raw.features as Record<string, unknown>) ?? {},
        voicePattern: session.voiceFeatures.raw.voicePattern ?? null,
        qualityWarnings: (session.voiceFeatures.raw.qualityWarnings as string[]) ?? [],
        raw: session.voiceFeatures.raw,
      }
    : null;

  return {
    id: session.id,
    userId: session.userId,
    sessionTimestamp: session.sessionTimestamp,
    status: session.status,
    availableModalities: modalities,
    missingModalities: missing,
    notes: session.notes,
    questionnaire: qData,
    face: faceData,
    voice: voiceData,
    wellnessSummary: session.wellnessSummary,
  };
}

function parseBool(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    return ["true", "1", "yes", "on"].includes(value.trim().toLowerCase());
  }
  return false;
}

function parseOptionalIntRange(
  val: unknown,
  field: string,
  min: number,
  max: number,
): number | null {
  if (val === undefined || val === null || val === "") return null;
  const num = Number(val);
  if (!Number.isInteger(num) || num < min || num > max) {
    throw new HttpError(422, `${field} must be an integer between ${min} and ${max}.`);
  }
  return num;
}

function parseRequiredIntRange(val: unknown, field: string, min: number, max: number): number {
  const num = Number(val);
  if (!Number.isInteger(num) || num < min || num > max) {
    throw new HttpError(422, `${field} is required and must be an integer between ${min} and ${max}.`);
  }
  return num;
}

function validateQuestionnaireBody(body: Record<string, unknown>, fallbackUserId: string) {
  return {
    checkinId: typeof body.checkinId === "string" ? body.checkinId : null,
    userId: typeof body.userId === "string" && body.userId.trim() ? body.userId : fallbackUserId,
    phq2Anhedonia: parseOptionalIntRange(body.phq2Anhedonia, "phq2Anhedonia", 0, 3),
    phq2DepressedMood: parseOptionalIntRange(body.phq2DepressedMood, "phq2DepressedMood", 0, 3),
    gad2Nervousness: parseOptionalIntRange(body.gad2Nervousness, "gad2Nervousness", 0, 3),
    gad2Worrying: parseOptionalIntRange(body.gad2Worrying, "gad2Worrying", 0, 3),
    dailyAffectMood: parseRequiredIntRange(body.dailyAffectMood, "dailyAffectMood", 1, 5),
    dailyAffectEnergy: parseRequiredIntRange(body.dailyAffectEnergy, "dailyAffectEnergy", 1, 5),
    dailyAffectStress: parseRequiredIntRange(body.dailyAffectStress, "dailyAffectStress", 1, 5),
    sleepQuality: parseOptionalIntRange(body.sleepQuality, "sleepQuality", 1, 5),
    reflectionNote:
      typeof body.reflectionNote === "string" ? body.reflectionNote.slice(0, 1000) : null,
  };
}

function formatTrendLabel(iso: string): string {
  const dt = new Date(iso);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const m = months[dt.getMonth()];
  const d = String(dt.getDate()).padStart(2, "0");
  const hh = String(dt.getHours()).padStart(2, "0");
  const mm = String(dt.getMinutes()).padStart(2, "0");
  return `${m} ${d} ${hh}:${mm}`;
}

function resolveTargetUserId(req: AuthenticatedRequest, requestedUserId?: unknown): string {
  const fallback = req.auth!.userId;
  if (typeof requestedUserId !== "string" || !requestedUserId.trim()) {
    return fallback;
  }
  const cleanId = validateSafeUserId(requestedUserId);
  assertCanAccessUser(req, cleanId);
  return cleanId;
}

function paramStr(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

async function createApp() {
  const app = express();
  app.use(express.json({ limit: "5mb" }));

  // 1. Health (public non-sensitive status)
  app.get("/api/v1/health", async (_req, res) => {
    const ffStatus = await checkFfmpegStatus();
    res.json({
      service: "mindtrack-backend",
      runtime: "Express + Persistent Store (Node.js 22)",
      status: "UP",
      database: "CONNECTED (JSON State Store)",
      faceAiAvailable: true,
      voiceAiAvailable: true,
      ffmpegAvailable: ffStatus.available && ffStatus.ffprobeAvailable,
      ffmpegVersion: ffStatus.ffmpegVersion,
      disclaimer: NON_DIAGNOSTIC_NOTICE,
    });
  });

  // 2. Authentication & Account Endpoints
  app.get("/api/v1/auth/status", (_req, res) => {
    const adminBootstrapped = store.hasAdminAccount();
    res.json({
      adminBootstrapped,
      allowAdminBootstrap: !adminBootstrapped,
      registrationEnabled: true,
      emailDeliveryConfigured: false,
    });
  });

  app.post("/api/v1/auth/bootstrap-admin", (req, res, next) => {
    try {
      if (store.hasAdminAccount()) {
        throw new HttpError(
          409,
          "An active administrator account already exists. Sign in with your administrator credentials.",
        );
      }
      const body = (req.body ?? {}) as Record<string, unknown>;
      const email = validateEmail(body.email);
      const fullName = validateFullName(body.fullName);
      const password = validatePassword(body.password);

      if (store.findUserByEmail(email)) {
        throw new HttpError(409, "An account with this email already exists.");
      }

      const requestedId =
        typeof body.id === "string" && body.id.trim()
          ? validateSafeUserId(body.id)
          : makeUniqueUserIdFromEmail(email);
      if (store.users.has(requestedId)) {
        throw new HttpError(409, `User ID '${requestedId}' is already taken.`);
      }

      const now = new Date().toISOString();
      const adminUser: StoredUser = {
        id: requestedId,
        email,
        fullName,
        role: "ADMIN",
        isActive: true,
        passwordHash: hashPassword(password),
        tokenVersion: 1,
        createdAt: now,
        updatedAt: now,
        lastLoginAt: now,
      };
      store.users.set(adminUser.id, adminUser);
      store.persist();

      const { token, expiresInSec } = signAccessToken(adminUser);
      res.status(201).json({
        accessToken: token,
        tokenType: "Bearer",
        expiresInSec,
        user: publicUserDto(adminUser),
      });
    } catch (err) {
      next(err);
    }
  });

  app.post("/api/v1/auth/register", (req, res, next) => {
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const email = validateEmail(body.email);
      const fullName = validateFullName(body.fullName);
      const password = validatePassword(body.password);

      if (store.findUserByEmail(email)) {
        throw new HttpError(409, `Email '${email}' is already registered.`);
      }

      const userId =
        typeof body.id === "string" && body.id.trim()
          ? validateSafeUserId(body.id)
          : makeUniqueUserIdFromEmail(email);

      if (store.users.has(userId)) {
        throw new HttpError(409, `User ID '${userId}' is already registered.`);
      }

      const now = new Date().toISOString();
      // Public registration is strictly locked to USER role regardless of payload fields
      const newUser: StoredUser = {
        id: userId,
        email,
        fullName,
        role: "USER",
        isActive: true,
        passwordHash: hashPassword(password),
        tokenVersion: 1,
        createdAt: now,
        updatedAt: now,
        lastLoginAt: now,
      };
      store.users.set(newUser.id, newUser);
      store.persist();

      const { token, expiresInSec } = signAccessToken(newUser);
      res.status(201).json({
        accessToken: token,
        tokenType: "Bearer",
        expiresInSec,
        user: publicUserDto(newUser),
      });
    } catch (err) {
      next(err);
    }
  });

  app.post("/api/v1/auth/login", (req, res, next) => {
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const identifierRaw =
        typeof body.identifier === "string"
          ? body.identifier
          : typeof body.email === "string"
            ? body.email
            : "";
      const password = typeof body.password === "string" ? body.password : "";
      const identifier = identifierRaw.trim().toLowerCase();

      if (!identifier || !password) {
        throw new HttpError(400, "Email (or User ID) and password are required.");
      }

      const user = store.findUserByEmail(identifier) || store.users.get(identifierRaw.trim());
      if (!user || !user.passwordHash || !verifyPassword(password, user.passwordHash)) {
        throw new HttpError(401, "Invalid email/user ID or password.");
      }
      if (!user.isActive) {
        throw new HttpError(
          403,
          "This account has been deactivated. Contact a MindTrack administrator to restore access.",
        );
      }

      user.lastLoginAt = new Date().toISOString();
      store.persist();

      const { token, expiresInSec } = signAccessToken(user);
      res.json({
        accessToken: token,
        tokenType: "Bearer",
        expiresInSec,
        user: publicUserDto(user),
      });
    } catch (err) {
      next(err);
    }
  });

  app.post("/api/v1/auth/forgot-password", (req, res, next) => {
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      validateEmail(body.email);
      res.json({
        emailDeliveryConfigured: false,
        status: "DOCUMENTED_PLACEHOLDER",
        message:
          "Automated password reset email delivery is not configured in this MindTrack instance. " +
          "For security, passwords cannot be reset automatically without verified email delivery. " +
          "Please contact your system administrator to issue a temporary password update.",
      });
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/v1/auth/me", requireAuth, (req: AuthenticatedRequest, res) => {
    res.json(publicUserDto(req.auth!.user));
  });

  app.patch("/api/v1/auth/me", requireAuth, (req: AuthenticatedRequest, res, next) => {
    try {
      const user = req.auth!.user;
      const body = (req.body ?? {}) as Record<string, unknown>;
      if (body.fullName !== undefined) {
        user.fullName = validateFullName(body.fullName);
      }
      if (body.email !== undefined) {
        const nextEmail = validateEmail(body.email);
        const conflict = store.findUserByEmail(nextEmail);
        if (conflict && conflict.id !== user.id) {
          throw new HttpError(409, `Email '${nextEmail}' is already in use by another account.`);
        }
        user.email = nextEmail;
      }
      user.updatedAt = new Date().toISOString();
      store.persist();
      res.json(publicUserDto(user));
    } catch (err) {
      next(err);
    }
  });

  app.post("/api/v1/auth/change-password", requireAuth, (req: AuthenticatedRequest, res, next) => {
    try {
      const user = req.auth!.user;
      const body = (req.body ?? {}) as Record<string, unknown>;
      const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";
      const newPassword = validatePassword(body.newPassword);

      if (!user.passwordHash || !verifyPassword(currentPassword, user.passwordHash)) {
        throw new HttpError(401, "Current password is incorrect.");
      }

      user.passwordHash = hashPassword(newPassword);
      user.tokenVersion += 1;
      user.updatedAt = new Date().toISOString();
      store.persist();

      const { token, expiresInSec } = signAccessToken(user);
      res.json({
        updated: true,
        accessToken: token,
        tokenType: "Bearer",
        expiresInSec,
        user: publicUserDto(user),
      });
    } catch (err) {
      next(err);
    }
  });

  app.post("/api/v1/auth/logout", requireAuth, (req: AuthenticatedRequest, res) => {
    const user = req.auth!.user;
    user.tokenVersion += 1;
    user.updatedAt = new Date().toISOString();
    store.persist();
    res.json({ signedOut: true });
  });

  // 3. Administrator Routes (Strictly protected by requireAuth + requireAdmin)
  app.get("/api/v1/admin/overview", requireAuth, requireAdmin, async (_req, res) => {
    const users = Array.from(store.users.values());
    const checkins = Array.from(store.checkins.values());
    const runs = Array.from(store.analysisRuns.values());
    const ffStatus = await checkFfmpegStatus();

    const modalityCounts = {
      QUESTIONNAIRE: checkins.filter((c) => c.availableModalities.includes("QUESTIONNAIRE")).length,
      FACE: checkins.filter((c) => c.availableModalities.includes("FACE")).length,
      VOICE: checkins.filter((c) => c.availableModalities.includes("VOICE")).length,
    };

    res.json({
      systemHealth: {
        serviceStatus: "UP",
        runtime: "Node.js 22 + Express + Persistent Store",
        faceAiAvailable: true,
        voiceAiAvailable: true,
        ffmpegAvailable: ffStatus.available,
        ffprobeAvailable: ffStatus.ffprobeAvailable,
        ffmpegVersion: ffStatus.ffmpegVersion,
      },
      usageStats: {
        totalUsers: users.length,
        activeUsers: users.filter((u) => u.isActive).length,
        inactiveUsers: users.filter((u) => !u.isActive).length,
        adminCount: users.filter((u) => u.role === "ADMIN").length,
        standardUserCount: users.filter((u) => u.role === "USER").length,
        totalCheckins: checkins.length,
        totalAnalysisRuns: runs.length,
        faceAnalysisRuns: runs.filter((r) => r.modality === "FACE").length,
        voiceAnalysisRuns: runs.filter((r) => r.modality === "VOICE").length,
        cachedAudioConversions: store.audioConversions.size,
        establishedFaceBaselines: Array.from(store.faceBaselines.values()).filter((b) => b.is_calibrated).length,
        establishedVoiceBaselines: Array.from(store.voiceBaselines.values()).filter((b) => b.is_established).length,
        modalityCounts,
      },
    });
  });

  app.get("/api/v1/admin/users", requireAuth, requireAdmin, (_req, res) => {
    const users = Array.from(store.users.values())
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      .map((u) => {
        const userCheckins = Array.from(store.checkins.values()).filter((c) => c.userId === u.id);
        const faceBaseline = store.faceBaselines.get(u.id);
        const voiceBaseline = store.voiceBaselines.get(u.id);
        return {
          ...publicUserDto(u),
          checkinCount: userCheckins.length,
          faceBaselineCount: faceBaseline?.total_checkins_recorded ?? 0,
          faceCalibrated: faceBaseline?.is_calibrated ?? false,
          voiceBaselineCount: voiceBaseline?.observation_count ?? 0,
          voiceEstablished: voiceBaseline?.is_established ?? false,
        };
      });
    res.json(users);
  });

  app.post("/api/v1/admin/users", requireAuth, requireAdmin, (req, res, next) => {
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const email = validateEmail(body.email);
      const fullName = validateFullName(body.fullName);
      const password = validatePassword(body.password);
      const role: UserRole =
        typeof body.role === "string" && body.role.toUpperCase() === "ADMIN" ? "ADMIN" : "USER";
      const isActive = body.isActive === undefined ? true : Boolean(body.isActive);

      if (store.findUserByEmail(email)) {
        throw new HttpError(409, `Email '${email}' is already registered.`);
      }
      const userId =
        typeof body.id === "string" && body.id.trim()
          ? validateSafeUserId(body.id)
          : makeUniqueUserIdFromEmail(email);
      if (store.users.has(userId)) {
        throw new HttpError(409, `User ID '${userId}' already exists.`);
      }

      const now = new Date().toISOString();
      const created: StoredUser = {
        id: userId,
        email,
        fullName,
        role,
        isActive,
        passwordHash: hashPassword(password),
        tokenVersion: 1,
        createdAt: now,
        updatedAt: now,
        lastLoginAt: null,
      };
      store.users.set(created.id, created);
      store.persist();
      res.status(201).json(publicUserDto(created));
    } catch (err) {
      next(err);
    }
  });

  app.patch("/api/v1/admin/users/:user_id", requireAuth, requireAdmin, (req: AuthenticatedRequest, res, next) => {
    try {
      const targetId = validateSafeUserId(req.params.user_id);
      const target = store.users.get(targetId);
      if (!target) {
        throw new HttpError(404, `User '${targetId}' not found.`);
      }

      const body = (req.body ?? {}) as Record<string, unknown>;
      if (body.fullName !== undefined) {
        target.fullName = validateFullName(body.fullName);
      }
      if (body.email !== undefined) {
        const nextEmail = validateEmail(body.email);
        const conflict = store.findUserByEmail(nextEmail);
        if (conflict && conflict.id !== target.id) {
          throw new HttpError(409, `Email '${nextEmail}' is already assigned to another user.`);
        }
        target.email = nextEmail;
      }

      if (body.role !== undefined) {
        const nextRole: UserRole =
          String(body.role).toUpperCase() === "ADMIN" ? "ADMIN" : "USER";
        if (target.id === req.auth!.userId && nextRole !== "ADMIN") {
          throw new HttpError(400, "Administrators cannot remove their own administrator role.");
        }
        target.role = nextRole;
      }

      if (body.isActive !== undefined) {
        const nextActive = Boolean(body.isActive);
        if (target.id === req.auth!.userId && !nextActive) {
          throw new HttpError(400, "Administrators cannot deactivate their own active session account.");
        }
        target.isActive = nextActive;
        if (!nextActive) {
          target.tokenVersion += 1; // Revoke active sessions immediately upon deactivation
        }
      }

      if (typeof body.newPassword === "string" && body.newPassword.length > 0) {
        target.passwordHash = hashPassword(validatePassword(body.newPassword));
        target.tokenVersion += 1;
      }

      target.updatedAt = new Date().toISOString();
      store.persist();
      res.json(publicUserDto(target));
    } catch (err) {
      next(err);
    }
  });

  // 4. Face AI analyze (supports WebM + webcam recordings via FFprobe/FFmpeg normalization)
  app.post("/api/v1/face/analyze", requireAuth, upload.single("file"), async (req: AuthenticatedRequest, res, next) => {
    try {
      if (!req.file) {
        throw new HttpError(400, "No video file uploaded.");
      }
      const cleanUserId = resolveTargetUserId(req, req.body?.userId);
      const mode = String(req.body?.mode ?? "single") as OperationalMode;
      const maxDuration = Number(req.body?.maxDuration ?? DEFAULT_FACE_MAX_DURATION_SEC);
      const updateBaseline = parseBool(req.body?.updateBaseline);
      const existingProfile = store.faceBaselines.get(cleanUserId) ?? null;

      const { result, updatedProfile } = await analyzeFaceVideoBuffer({
        buffer: req.file.buffer,
        originalFilename: req.file.originalname || "recording.mp4",
        userId: cleanUserId,
        mode,
        maxDuration: Number.isFinite(maxDuration) ? maxDuration : DEFAULT_FACE_MAX_DURATION_SEC,
        updateBaseline,
        existingProfile,
      });

      if (updatedProfile) {
        store.faceBaselines.set(cleanUserId, updatedProfile);
      }

      const qual = (result.quality as { quality_score?: number; is_reliable?: boolean }) ?? {};
      const run: StoredAnalysisRun = {
        id: store.newId(),
        userId: cleanUserId,
        modality: "FACE",
        mode,
        originalFilename: path.basename(req.file.originalname || "recording.mp4"),
        qualityScore: qual.quality_score ?? null,
        isReliable: qual.is_reliable ?? null,
        result,
        createdAt: new Date().toISOString(),
      };
      store.analysisRuns.set(run.id, run);
      store.persist();

      res.json({
        runId: run.id,
        userId: cleanUserId,
        modality: "FACE",
        mode,
        filename: run.originalFilename,
        qualityScore: run.qualityScore,
        isReliable: run.isReliable,
        createdAt: run.createdAt,
        result,
        disclaimer: NON_DIAGNOSTIC_NOTICE,
      });
    } catch (err) {
      if (err instanceof FaceAnalysisError) {
        return next(new HttpError(err.statusCode, err.message));
      }
      next(err);
    }
  });

  // 5. Feature 3: Audio Conversion to 16 kHz Mono PCM WAV
  app.post("/api/v1/voice/convert", requireAuth, upload.single("file"), async (req: AuthenticatedRequest, res, next) => {
    try {
      if (!req.file) {
        throw new HttpError(400, "No audio file uploaded for conversion.");
      }
      if (req.file.size === 0) {
        throw new HttpError(400, "Uploaded audio file is empty (0 bytes).");
      }
      if (req.file.size > MAX_AUDIO_SIZE_BYTES) {
        throw new HttpError(
          413,
          `Audio file exceeds maximum allowed size (${Math.floor(MAX_AUDIO_SIZE_BYTES / (1024 * 1024))} MB).`,
        );
      }

      const cleanUserId = resolveTargetUserId(req, req.body?.userId);
      const originalFilename = path.basename(req.file.originalname || "audio_upload.webm");
      const ext = path.extname(originalFilename).toLowerCase();
      if (!SUPPORTED_CONVERTIBLE_AUDIO_EXTENSIONS.has(ext)) {
        throw new HttpError(
          400,
          `Unsupported audio format '${ext || "unknown"}'. Supported formats: ${Array.from(SUPPORTED_CONVERTIBLE_AUDIO_EXTENSIONS).sort().join(", ")}.`,
        );
      }

      const { wavBuffer, probe, convertedProbe } = await convertAudioBufferTo16kMonoWav({
        buffer: req.file.buffer,
        originalExt: ext,
      });

      const baseStem = path.basename(originalFilename, ext).replace(/[^a-zA-Z0-9._-]/g, "_") || "voice_audio";
      const convertedFilename = `${baseStem}_16k_mono.wav`;
      const conversionId = store.newId();
      const now = new Date().toISOString();

      const record: StoredAudioConversion = {
        id: conversionId,
        userId: cleanUserId,
        originalFilename,
        originalExtension: ext,
        originalSizeBytes: req.file.size,
        originalFormat: probe.formatName,
        originalSampleRate: probe.sampleRate ?? null,
        originalChannels: probe.channels ?? null,
        convertedFilename,
        convertedSizeBytes: wavBuffer.length,
        convertedSampleRate: convertedProbe.sampleRate ?? 16000,
        convertedChannels: convertedProbe.channels ?? 1,
        durationSec: convertedProbe.durationSec || probe.durationSec,
        wavBase64: wavBuffer.toString("base64"),
        createdAt: now,
      };
      store.saveAudioConversion(record);

      res.status(201).json({
        conversionId: record.id,
        userId: record.userId,
        originalFilename: record.originalFilename,
        originalExtension: record.originalExtension,
        originalSizeBytes: record.originalSizeBytes,
        originalFormat: record.originalFormat,
        originalSampleRate: record.originalSampleRate,
        originalChannels: record.originalChannels,
        convertedFilename: record.convertedFilename,
        convertedSizeBytes: record.convertedSizeBytes,
        convertedSampleRate: record.convertedSampleRate,
        convertedChannels: record.convertedChannels,
        durationSec: record.durationSec,
        downloadUrl: `/api/v1/voice/converted/${record.id}`,
        createdAt: record.createdAt,
      });
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/v1/voice/converted/:conversion_id", requireAuth, (req: AuthenticatedRequest, res, next) => {
    try {
      const conv = store.audioConversions.get(paramStr(req.params.conversion_id));
      if (!conv) {
        throw new HttpError(404, "Converted WAV audio is no longer in cache or does not exist.");
      }
      assertCanAccessUser(req, conv.userId);
      const wavBuf = Buffer.from(conv.wavBase64, "base64");
      res.setHeader("Content-Type", "audio/wav");
      res.setHeader("Content-Disposition", `inline; filename="${conv.convertedFilename}"`);
      res.setHeader("Content-Length", String(wavBuf.length));
      res.send(wavBuf);
    } catch (err) {
      next(err);
    }
  });

  // 6. Voice AI analyze (supports native WAV, conversionId, or auto-conversion of MP3/M4A/AAC/OGG/FLAC/WebM)
  app.post("/api/v1/voice/analyze", requireAuth, upload.single("file"), async (req: AuthenticatedRequest, res, next) => {
    try {
      const cleanUserId = resolveTargetUserId(req, req.body?.userId);
      const mode = String(req.body?.mode ?? "single") as OperationalMode;
      const updateBaseline = parseBool(req.body?.updateBaseline);
      const existingProfile = store.voiceBaselines.get(cleanUserId) ?? null;

      let wavBuffer: Buffer;
      let analysisFilename: string;
      let conversionMetadata: Record<string, unknown> | null = null;
      let conversionId: string | null = null;

      const requestedConversionId =
        typeof req.body?.conversionId === "string" ? req.body.conversionId.trim() : "";

      if (requestedConversionId) {
        const conv = store.audioConversions.get(requestedConversionId);
        if (!conv) {
          throw new HttpError(404, "Referenced converted WAV file was not found. Please reconvert the audio.");
        }
        assertCanAccessUser(req, conv.userId);
        wavBuffer = Buffer.from(conv.wavBase64, "base64");
        analysisFilename = conv.convertedFilename;
        conversionId = conv.id;
        conversionMetadata = {
          conversionId: conv.id,
          convertedAutomatically: true,
          originalFilename: conv.originalFilename,
          originalFormat: conv.originalFormat,
          originalSampleRate: conv.originalSampleRate,
          originalChannels: conv.originalChannels,
          convertedFilename: conv.convertedFilename,
          convertedSampleRate: conv.convertedSampleRate,
          convertedChannels: conv.convertedChannels,
        };
      } else if (req.file) {
        const origName = path.basename(req.file.originalname || "recording.wav");
        const ext = path.extname(origName).toLowerCase();
        if (ext === ".wav") {
          wavBuffer = req.file.buffer;
          analysisFilename = origName;
        } else if (SUPPORTED_CONVERTIBLE_AUDIO_EXTENSIONS.has(ext)) {
          const { wavBuffer: convBuf, probe, convertedProbe } = await convertAudioBufferTo16kMonoWav({
            buffer: req.file.buffer,
            originalExt: ext,
          });
          wavBuffer = convBuf;
          const stem = path.basename(origName, ext).replace(/[^a-zA-Z0-9._-]/g, "_") || "voice_audio";
          analysisFilename = `${stem}_16k_mono.wav`;
          conversionId = store.newId();
          const convRec: StoredAudioConversion = {
            id: conversionId,
            userId: cleanUserId,
            originalFilename: origName,
            originalExtension: ext,
            originalSizeBytes: req.file.size,
            originalFormat: probe.formatName,
            originalSampleRate: probe.sampleRate ?? null,
            originalChannels: probe.channels ?? null,
            convertedFilename: analysisFilename,
            convertedSizeBytes: convBuf.length,
            convertedSampleRate: convertedProbe.sampleRate ?? 16000,
            convertedChannels: convertedProbe.channels ?? 1,
            durationSec: convertedProbe.durationSec || probe.durationSec,
            wavBase64: convBuf.toString("base64"),
            createdAt: new Date().toISOString(),
          };
          store.saveAudioConversion(convRec);
          conversionMetadata = {
            conversionId: convRec.id,
            convertedAutomatically: true,
            originalFilename: convRec.originalFilename,
            originalFormat: convRec.originalFormat,
            originalSampleRate: convRec.originalSampleRate,
            originalChannels: convRec.originalChannels,
            convertedFilename: convRec.convertedFilename,
            convertedSampleRate: convRec.convertedSampleRate,
            convertedChannels: convRec.convertedChannels,
          };
        } else {
          throw new HttpError(
            400,
            `Unsupported audio format '${ext || "unknown"}'. Supported inputs: ${Array.from(SUPPORTED_CONVERTIBLE_AUDIO_EXTENSIONS).sort().join(", ")}.`,
          );
        }
      } else {
        throw new HttpError(400, "No audio file or conversionId provided.");
      }

      const { result, updatedProfile } = analyzeVoiceWavBuffer({
        buffer: wavBuffer,
        originalFilename: analysisFilename,
        userId: cleanUserId,
        mode,
        updateBaseline,
        existingProfile,
      });

      if (conversionMetadata) {
        result.audioConversion = conversionMetadata;
      }

      if (updatedProfile) {
        store.voiceBaselines.set(cleanUserId, updatedProfile);
      }

      const qScore = typeof result.qualityScore === "number" ? result.qualityScore : null;
      const isReliable = qScore !== null ? qScore >= 0.55 : null;
      const run: StoredAnalysisRun = {
        id: store.newId(),
        userId: cleanUserId,
        modality: "VOICE",
        mode,
        originalFilename: analysisFilename,
        qualityScore: qScore,
        isReliable,
        result,
        createdAt: new Date().toISOString(),
        conversionId,
      };
      store.analysisRuns.set(run.id, run);
      store.persist();

      res.json({
        runId: run.id,
        userId: cleanUserId,
        modality: "VOICE",
        mode,
        filename: run.originalFilename,
        qualityScore: run.qualityScore,
        isReliable: run.isReliable,
        createdAt: run.createdAt,
        result,
        disclaimer: NON_DIAGNOSTIC_NOTICE,
      });
    } catch (err) {
      if (err instanceof VoiceAnalysisError) {
        return next(new HttpError(err.statusCode, err.message));
      }
      next(err);
    }
  });

  // 7. Recent analysis runs (protected by ownership)
  app.get("/api/v1/analysis-runs/:user_id", requireAuth, (req: AuthenticatedRequest, res, next) => {
    try {
      const cleanId = validateSafeUserId(req.params.user_id);
      assertCanAccessUser(req, cleanId);
      const modality = typeof req.query.modality === "string" ? req.query.modality.toUpperCase() : null;
      const limitRaw = Number(req.query.limit ?? 15);
      const limit = Number.isFinite(limitRaw) ? Math.min(50, Math.max(1, limitRaw)) : 15;

      let runs = Array.from(store.analysisRuns.values()).filter((r) => r.userId === cleanId);
      if (modality) {
        runs = runs.filter((r) => r.modality === modality);
      }
      runs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      res.json(
        runs.slice(0, limit).map((r) => ({
          runId: r.id,
          userId: r.userId,
          modality: r.modality,
          mode: r.mode,
          filename: r.originalFilename,
          qualityScore: r.qualityScore,
          isReliable: r.isReliable,
          createdAt: r.createdAt,
          result: r.result,
        })),
      );
    } catch (err) {
      next(err);
    }
  });

  // 8. Questionnaire compatibility endpoints (protected by ownership)
  const handleQuestionnaireSubmit = (
    req: AuthenticatedRequest,
    res: Response,
    overrideCheckinId?: string,
  ) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const parsed = validateQuestionnaireBody(
      {
        ...body,
        ...(overrideCheckinId ? { checkinId: overrideCheckinId } : {}),
      },
      req.auth!.userId,
    );
    const cleanUserId = resolveTargetUserId(req, parsed.userId);
    const now = new Date().toISOString();

    let checkin: StoredCheckinSession;
    if (parsed.checkinId) {
      const existing = store.checkins.get(parsed.checkinId);
      if (!existing) {
        throw new HttpError(404, `Check-in session '${parsed.checkinId}' not found.`);
      }
      assertCanAccessUser(req, existing.userId);
      checkin = existing;
      if (!checkin.availableModalities.includes("QUESTIONNAIRE")) {
        checkin.availableModalities.unshift("QUESTIONNAIRE");
      }
    } else {
      checkin = {
        id: store.newId(),
        userId: cleanUserId,
        sessionTimestamp: now,
        status: "COMPLETED",
        availableModalities: ["QUESTIONNAIRE"],
        notes: null,
        createdAt: now,
        questionnaire: null,
        faceFeatures: null,
        voiceFeatures: null,
        wellnessSummary: null,
      };
      store.checkins.set(checkin.id, checkin);
    }

    const qRow: StoredQuestionnaire = {
      id: checkin.questionnaire?.id ?? store.newId(),
      checkinId: checkin.id,
      phq2Anhedonia: parsed.phq2Anhedonia,
      phq2DepressedMood: parsed.phq2DepressedMood,
      gad2Nervousness: parsed.gad2Nervousness,
      gad2Worrying: parsed.gad2Worrying,
      dailyAffectMood: parsed.dailyAffectMood,
      dailyAffectEnergy: parsed.dailyAffectEnergy,
      dailyAffectStress: parsed.dailyAffectStress,
      sleepQuality: parsed.sleepQuality,
      reflectionNote: parsed.reflectionNote,
      createdAt: checkin.questionnaire?.createdAt ?? now,
    };
    checkin.questionnaire = qRow;
    store.persist();

    res.status(201).json({
      status: "SUCCESS",
      checkinId: checkin.id,
      phq2Anhedonia: qRow.phq2Anhedonia,
      phq2DepressedMood: qRow.phq2DepressedMood,
      gad2Nervousness: qRow.gad2Nervousness,
      gad2Worrying: qRow.gad2Worrying,
      dailyAffectMood: qRow.dailyAffectMood,
      dailyAffectEnergy: qRow.dailyAffectEnergy,
      dailyAffectStress: qRow.dailyAffectStress,
      sleepQuality: qRow.sleepQuality,
      reflectionNote: qRow.reflectionNote,
      disclaimer: NON_DIAGNOSTIC_NOTICE,
    });
  };

  app.post("/api/v1/questionnaire", requireAuth, (req: AuthenticatedRequest, res, next) => {
    try {
      handleQuestionnaireSubmit(req, res);
    } catch (err) {
      next(err);
    }
  });

  app.post(
    "/api/v1/checkins/:checkin_id/questionnaire",
    requireAuth,
    (req: AuthenticatedRequest, res, next) => {
      try {
        handleQuestionnaireSubmit(req, res, paramStr(req.params.checkin_id));
      } catch (err) {
        next(err);
      }
    },
  );

  app.get("/api/v1/questionnaire/:checkin_id", requireAuth, (req: AuthenticatedRequest, res, next) => {
    try {
      const checkinId = paramStr(req.params.checkin_id);
      const checkin = store.checkins.get(checkinId);
      if (!checkin?.questionnaire) {
        throw new HttpError(404, `Questionnaire not found for check-in '${checkinId}'.`);
      }
      assertCanAccessUser(req, checkin.userId);
      const q = checkin.questionnaire;
      res.json({
        checkinId: q.checkinId,
        phq2Anhedonia: q.phq2Anhedonia,
        phq2DepressedMood: q.phq2DepressedMood,
        gad2Nervousness: q.gad2Nervousness,
        gad2Worrying: q.gad2Worrying,
        dailyAffectMood: q.dailyAffectMood,
        dailyAffectEnergy: q.dailyAffectEnergy,
        dailyAffectStress: q.dailyAffectStress,
        sleepQuality: q.sleepQuality,
        reflectionNote: q.reflectionNote,
        disclaimer: NON_DIAGNOSTIC_NOTICE,
      });
    } catch (err) {
      next(err);
    }
  });

  // 9. Checkins CRUD & Comparison Report (Feature 4B & 4C)
  app.post("/api/v1/checkins", requireAuth, (req: AuthenticatedRequest, res, next) => {
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const rawQuestionnaire = body.questionnaire as Record<string, unknown> | null | undefined;
      const faceRunId =
        typeof body.faceAnalysisRunId === "string" && body.faceAnalysisRunId
          ? body.faceAnalysisRunId
          : null;
      const voiceRunId =
        typeof body.voiceAnalysisRunId === "string" && body.voiceAnalysisRunId
          ? body.voiceAnalysisRunId
          : null;

      if (!rawQuestionnaire && !faceRunId && !voiceRunId) {
        throw new HttpError(
          400,
          "A check-in requires at least one completed modality (Questionnaire, Facial AI, or Voice AI).",
        );
      }

      const cleanUserId = resolveTargetUserId(req, body.userId);

      let faceRun: StoredAnalysisRun | null = null;
      if (faceRunId) {
        const found = store.analysisRuns.get(faceRunId);
        if (!found || found.modality !== "FACE" || found.userId !== cleanUserId) {
          throw new HttpError(400, "Invalid or mismatched facial analysis run ID for this user.");
        }
        faceRun = found;
      }

      let voiceRun: StoredAnalysisRun | null = null;
      if (voiceRunId) {
        const found = store.analysisRuns.get(voiceRunId);
        if (!found || found.modality !== "VOICE" || found.userId !== cleanUserId) {
          throw new HttpError(400, "Invalid or mismatched voice analysis run ID for this user.");
        }
        voiceRun = found;
      }

      const modalities: Modality[] = [];
      if (rawQuestionnaire) modalities.push("QUESTIONNAIRE");
      if (faceRun) modalities.push("FACE");
      if (voiceRun) modalities.push("VOICE");

      const now = new Date().toISOString();
      const checkinId = store.newId();

      let qRow: StoredQuestionnaire | null = null;
      if (rawQuestionnaire) {
        const parsedQ = validateQuestionnaireBody(rawQuestionnaire, cleanUserId);
        qRow = {
          id: store.newId(),
          checkinId,
          phq2Anhedonia: parsedQ.phq2Anhedonia,
          phq2DepressedMood: parsedQ.phq2DepressedMood,
          gad2Nervousness: parsedQ.gad2Nervousness,
          gad2Worrying: parsedQ.gad2Worrying,
          dailyAffectMood: parsedQ.dailyAffectMood,
          dailyAffectEnergy: parsedQ.dailyAffectEnergy,
          dailyAffectStress: parsedQ.dailyAffectStress,
          sleepQuality: parsedQ.sleepQuality,
          reflectionNote: parsedQ.reflectionNote,
          createdAt: now,
        };
      }

      let faceRow: StoredFaceFeature | null = null;
      if (faceRun) {
        const raw = faceRun.result;
        const meta = (raw.video_metadata as Record<string, unknown>) ?? {};
        const qual = (raw.quality as Record<string, unknown>) ?? {};
        const feats = (raw.features as Record<string, unknown>) ?? {};
        faceRow = {
          id: store.newId(),
          checkinId,
          analysisRunId: faceRun.id,
          mode: faceRun.mode,
          filename: faceRun.originalFilename,
          durationSec: (meta.duration_sec as number) ?? null,
          totalFrames: (qual.total_frames as number) ?? null,
          usableFrames: (qual.usable_frames as number) ?? null,
          detectionCoverage: (qual.detection_coverage as number) ?? null,
          qualityScore: (qual.quality_score as number) ?? null,
          isReliable: (qual.is_reliable as boolean) ?? null,
          isSuitableForBaseline: (qual.is_suitable_for_baseline as boolean) ?? null,
          facialMovementVelocity: (feats.facialMovementVelocity as number) ?? null,
          eyeBlinkRatePm: (feats.eyeBlinkRatePm as number) ?? null,
          headPoseJitterStd: (feats.headPoseJitterStd as number) ?? null,
          smileIntensityProxy: (feats.smileIntensityProxy as number) ?? null,
          browFurrowProxy: (feats.browFurrowProxy as number) ?? null,
          raw,
        };
      }

      let voiceRow: StoredVoiceFeature | null = null;
      if (voiceRun) {
        const raw = voiceRun.result;
        const audio = (raw.audio as Record<string, unknown>) ?? {};
        const feats = (raw.features as Record<string, unknown>) ?? {};
        const vp = (raw.voicePattern as Record<string, unknown>) ?? {};
        voiceRow = {
          id: store.newId(),
          checkinId,
          analysisRunId: voiceRun.id,
          mode: voiceRun.mode,
          filename: voiceRun.originalFilename,
          durationSec: (audio.durationSec as number) ?? null,
          sampleRate: (audio.sampleRate as number) ?? null,
          qualityScore: (raw.qualityScore as number) ?? null,
          speakingRateWpm: (feats.speakingRateWpm as number) ?? null,
          totalPauseCount: (feats.totalPauseCount as number) ?? null,
          meanPauseDurationMs: (feats.meanPauseDurationMs as number) ?? null,
          longestPauseDurationMs: (feats.longestPauseDurationMs as number) ?? null,
          speechRatio: (feats.speechRatio as number) ?? null,
          speechDurationSec: (feats.speechDurationSec as number) ?? null,
          silenceDurationSec: (feats.silenceDurationSec as number) ?? null,
          pitchMeanHz: (feats.pitchMeanHz as number) ?? null,
          pitchStdDevHz: (feats.pitchStdDevHz as number) ?? null,
          pitchRangeHz: (feats.pitchRangeHz as number) ?? null,
          energyMeanRms: (feats.energyMeanRms as number) ?? null,
          energyStdDev: (feats.energyStdDev as number) ?? null,
          technicalDeviationScore: (vp.technicalDeviationScore as number) ?? null,
          raw,
        };
      }

      const summary = buildTransparentWellnessSummary({
        availableModalities: modalities,
        questionnaire: qRow,
        face: faceRow,
        voice: voiceRow,
      });

      const session: StoredCheckinSession = {
        id: checkinId,
        userId: cleanUserId,
        sessionTimestamp: now,
        status: "COMPLETED",
        availableModalities: modalities,
        notes: typeof body.notes === "string" ? body.notes.slice(0, 1000) : null,
        createdAt: now,
        questionnaire: qRow,
        faceFeatures: faceRow,
        voiceFeatures: voiceRow,
        wellnessSummary: summary,
      };
      store.checkins.set(checkinId, session);
      store.persist();
      res.status(201).json(serializeCheckin(session));
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/v1/checkins", requireAuth, (req: AuthenticatedRequest, res, next) => {
    try {
      const cleanId = resolveTargetUserId(req, req.query.userId);
      const sessions = Array.from(store.checkins.values())
        .filter((s) => s.userId === cleanId)
        .sort(
          (a, b) =>
            new Date(b.sessionTimestamp).getTime() - new Date(a.sessionTimestamp).getTime(),
        );
      res.json(sessions.map(serializeCheckin));
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/v1/checkins/:checkin_id", requireAuth, (req: AuthenticatedRequest, res, next) => {
    try {
      const checkinId = paramStr(req.params.checkin_id);
      const session = store.checkins.get(checkinId);
      if (!session) {
        throw new HttpError(404, `Check-in '${checkinId}' not found.`);
      }
      assertCanAccessUser(req, session.userId);
      res.json(serializeCheckin(session));
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/v1/checkins/:checkin_id/report", requireAuth, (req: AuthenticatedRequest, res, next) => {
    try {
      const checkinId = paramStr(req.params.checkin_id);
      const session = store.checkins.get(checkinId);
      if (!session) {
        throw new HttpError(404, `Check-in '${checkinId}' not found.`);
      }
      assertCanAccessUser(req, session.userId);
      const userCheckins = Array.from(store.checkins.values()).filter((s) => s.userId === session.userId);
      const faceBaseline = store.faceBaselines.get(session.userId) ?? null;
      const voiceBaseline = store.voiceBaselines.get(session.userId) ?? null;

      const report = buildCheckinComparisonReport({
        checkin: session,
        allUserCheckins: userCheckins,
        faceBaseline,
        voiceBaseline,
      });
      res.json(report);
    } catch (err) {
      next(err);
    }
  });

  app.delete("/api/v1/checkins/:checkin_id", requireAuth, (req: AuthenticatedRequest, res, next) => {
    try {
      const checkinId = paramStr(req.params.checkin_id);
      const session = store.checkins.get(checkinId);
      if (!session) {
        throw new HttpError(404, `Check-in '${checkinId}' not found.`);
      }
      assertCanAccessUser(req, session.userId);
      store.checkins.delete(checkinId);
      store.persist();
      res.json({ deleted: true, checkinId });
    } catch (err) {
      next(err);
    }
  });

  // 10. Baselines & Summary (Feature 4A & 4E)
  app.get("/api/v1/baselines/:user_id/summary", requireAuth, (req: AuthenticatedRequest, res, next) => {
    try {
      const cleanId = validateSafeUserId(req.params.user_id);
      assertCanAccessUser(req, cleanId);
      const userCheckins = Array.from(store.checkins.values()).filter((s) => s.userId === cleanId);
      const faceBaseline = store.faceBaselines.get(cleanId) ?? null;
      const voiceBaseline = store.voiceBaselines.get(cleanId) ?? null;

      res.json(
        buildBaselineSummary({
          userId: cleanId,
          faceBaseline,
          voiceBaseline,
          checkins: userCheckins,
        }),
      );
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/v1/baselines/:user_id", requireAuth, (req: AuthenticatedRequest, res, next) => {
    try {
      const cleanId = validateSafeUserId(req.params.user_id);
      assertCanAccessUser(req, cleanId);
      const faceBaseline = store.readFaceBaseline(cleanId);
      const voiceBaseline = store.readVoiceBaseline(cleanId);
      const sessions = Array.from(store.checkins.values())
        .filter((s) => s.userId === cleanId)
        .sort(
          (a, b) =>
            new Date(a.sessionTimestamp).getTime() - new Date(b.sessionTimestamp).getTime(),
        );
      const questionnaireStats = computeQuestionnaireBaselineStats(sessions);
      const summary = buildBaselineSummary({
        userId: cleanId,
        faceBaseline: store.faceBaselines.get(cleanId) ?? null,
        voiceBaseline: store.voiceBaselines.get(cleanId) ?? null,
        checkins: sessions,
      });

      res.json({
        userId: cleanId,
        face: faceBaseline,
        voice: voiceBaseline,
        questionnaire: {
          sessionCount: sessions.filter((s) => s.questionnaire !== null).length,
          stats: questionnaireStats,
        },
        summary,
        disclaimer: NON_DIAGNOSTIC_NOTICE,
      });
    } catch (err) {
      next(err);
    }
  });

  app.delete("/api/v1/baselines/:user_id/:modality", requireAuth, (req: AuthenticatedRequest, res, next) => {
    try {
      const cleanId = validateSafeUserId(req.params.user_id);
      assertCanAccessUser(req, cleanId);
      const mod = paramStr(req.params.modality).toLowerCase();
      let removed = false;
      if (mod === "face") {
        removed = store.faceBaselines.delete(cleanId);
      } else if (mod === "voice") {
        removed = store.voiceBaselines.delete(cleanId);
      } else {
        throw new HttpError(400, "Modality must be 'face' or 'voice'.");
      }
      store.persist();
      res.json({ userId: cleanId, modality: mod, reset: removed });
    } catch (err) {
      next(err);
    }
  });

  // 11. Dashboard
  app.get("/api/v1/dashboard/:user_id", requireAuth, (req: AuthenticatedRequest, res, next) => {
    try {
      const cleanId = validateSafeUserId(req.params.user_id);
      assertCanAccessUser(req, cleanId);
      const user = store.users.get(cleanId);
      if (!user) {
        throw new HttpError(404, `User '${cleanId}' not found.`);
      }

      const sessions = Array.from(store.checkins.values())
        .filter((s) => s.userId === cleanId)
        .sort(
          (a, b) =>
            new Date(b.sessionTimestamp).getTime() - new Date(a.sessionTimestamp).getTime(),
        );

      const todayStr = new Date().toDateString();
      const checkedInToday = sessions.some(
        (s) => new Date(s.sessionTimestamp).toDateString() === todayStr,
      );

      const latestCheckin = sessions.length > 0 ? serializeCheckin(sessions[0]) : null;
      const latestQSession = sessions.find((s) => s.questionnaire !== null);
      const latestFaceSession = sessions.find((s) => s.faceFeatures !== null);
      const latestVoiceSession = sessions.find((s) => s.voiceFeatures !== null);

      const recentRuns = Array.from(store.analysisRuns.values())
        .filter((r) => r.userId === cleanId)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 10);

      const faceBaseline = store.readFaceBaseline(cleanId);
      const voiceBaseline = store.readVoiceBaseline(cleanId);

      const chronological = [...sessions].reverse();
      const trends = chronological.map((s) => {
        const q = s.questionnaire;
        const f = s.faceFeatures;
        const v = s.voiceFeatures;
        return {
          checkinId: s.id,
          timestamp: s.sessionTimestamp,
          label: formatTrendLabel(s.sessionTimestamp),
          availableModalities: s.availableModalities,
          mood: q ? q.dailyAffectMood : null,
          energy: q ? q.dailyAffectEnergy : null,
          stress: q ? q.dailyAffectStress : null,
          phq2Total:
            q && q.phq2Anhedonia !== null && q.phq2DepressedMood !== null
              ? q.phq2Anhedonia + q.phq2DepressedMood
              : null,
          gad2Total:
            q && q.gad2Nervousness !== null && q.gad2Worrying !== null
              ? q.gad2Nervousness + q.gad2Worrying
              : null,
          facialMovementVelocity: f ? f.facialMovementVelocity : null,
          eyeBlinkRatePm: f ? f.eyeBlinkRatePm : null,
          headPoseJitterStd: f ? f.headPoseJitterStd : null,
          smileIntensityProxy: f ? f.smileIntensityProxy : null,
          browFurrowProxy: f ? f.browFurrowProxy : null,
          faceQualityScore: f ? f.qualityScore : null,
          speakingRateWpm: v ? v.speakingRateWpm : null,
          pitchMeanHz: v ? v.pitchMeanHz : null,
          meanPauseDurationMs: v ? v.meanPauseDurationMs : null,
          speechRatio: v ? v.speechRatio : null,
          energyMeanRms: v ? v.energyMeanRms : null,
          voiceQualityScore: v ? v.qualityScore : null,
        };
      });

      res.json({
        user: {
          id: user.id,
          fullName: user.fullName,
          email: user.email,
          role: user.role,
        },
        todayStatus: {
          checkedInToday,
          totalCheckins: sessions.length,
          lastCheckinAt: sessions.length > 0 ? sessions[0].sessionTimestamp : null,
        },
        latestCheckin,
        latestQuestionnaire: latestQSession ? serializeCheckin(latestQSession).questionnaire : null,
        latestFace: latestFaceSession ? serializeCheckin(latestFaceSession).face : null,
        latestVoice: latestVoiceSession ? serializeCheckin(latestVoiceSession).voice : null,
        baselines: {
          face: {
            isCalibrated: faceBaseline.is_calibrated,
            totalRecorded: faceBaseline.total_checkins_recorded,
            minRequired: faceBaseline.min_calibration_checkins,
            featureStats: faceBaseline.feature_stats,
          },
          voice: {
            isEstablished: voiceBaseline.is_established,
            observationCount: voiceBaseline.observation_count,
            minRequired: voiceBaseline.min_observations,
            stats: voiceBaseline.stats,
          },
          questionnaire: computeQuestionnaireBaselineStats(sessions),
        },
        recentCheckins: sessions.slice(0, 6).map(serializeCheckin),
        recentAnalysisRuns: recentRuns.map((r) => ({
          runId: r.id,
          modality: r.modality,
          mode: r.mode,
          filename: r.originalFilename,
          qualityScore: r.qualityScore,
          isReliable: r.isReliable,
          createdAt: r.createdAt,
        })),
        trends,
        disclaimer: NON_DIAGNOSTIC_NOTICE,
      });
    } catch (err) {
      next(err);
    }
  });

  // Error handler returning clean { detail } without leaking stack traces on 500s
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) {
      return res.status(err.status).json({ detail: err.message });
    }
    if (err && typeof err === "object" && "status" in err && typeof err.status === "number") {
      const msg = err instanceof Error ? err.message : "Request failed.";
      return res.status(err.status).json({ detail: msg });
    }
    if (err instanceof multer.MulterError) {
      const status = err.code === "LIMIT_FILE_SIZE" ? 413 : 400;
      return res.status(status).json({ detail: err.message });
    }
    console.error("[MindTrack] Unhandled server error:", err);
    return res.status(500).json({ detail: "Internal server error" });
  });

  // Frontend serving (Vite dev middleware in dev, static dist in production)
  if (process.env.NODE_ENV === "production" && fs.existsSync(DIST_DIR)) {
    app.use(express.static(DIST_DIR));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(DIST_DIR, "index.html"));
    });
  } else {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      configFile: path.join(FRONTEND_DIR, "vite.config.ts"),
      server: {
        middlewareMode: true,
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  }

  const port = Number(process.env.PORT || 3000);
  app.listen(port, "0.0.0.0", () => {
    console.log(`MindTrack Node.js server listening on http://0.0.0.0:${port}`);
  });
}

void createApp();
