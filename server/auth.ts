import crypto from "crypto";
import type { NextFunction, Request, Response } from "express";
import type { StoredUser, UserRole } from "./types";

const AUTH_SECRET =
  process.env.MINDTRACK_AUTH_SECRET && process.env.MINDTRACK_AUTH_SECRET.length >= 16
    ? process.env.MINDTRACK_AUTH_SECRET
    : crypto.randomBytes(32).toString("hex");

const TOKEN_TTL_SEC = 60 * 60 * 12; // 12 hours

export interface AuthTokenPayload {
  sub: string;
  role: UserRole;
  tv: number;
  iat: number;
  exp: number;
}

export interface AuthenticatedRequest extends Request {
  auth?: {
    userId: string;
    role: UserRole;
    user: StoredUser;
  };
}

export function hashPassword(password: string): string {
  if (typeof password !== "string" || password.length < 8) {
    throw new Error("Password must be at least 8 characters long.");
  }
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${derived}`;
}

export function verifyPassword(password: string, storedHash: string | null): boolean {
  if (!storedHash || typeof password !== "string" || !password) {
    return false;
  }
  const parts = storedHash.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") {
    return false;
  }
  const [, salt, hexDigest] = parts;
  if (!salt || !hexDigest) return false;
  try {
    const derived = crypto.scryptSync(password, salt, 64);
    const expected = Buffer.from(hexDigest, "hex");
    if (derived.length !== expected.length) return false;
    return crypto.timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

function base64UrlEncode(data: Buffer | string): string {
  return Buffer.from(data)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(str: string): Buffer {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (str.length % 4)) % 4);
  return Buffer.from(padded, "base64");
}

export function signAccessToken(user: StoredUser): { token: string; expiresInSec: number } {
  const nowSec = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload: AuthTokenPayload = {
    sub: user.id,
    role: user.role,
    tv: user.tokenVersion,
    iat: nowSec,
    exp: nowSec + TOKEN_TTL_SEC,
  };
  const body = base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${header}.${body}`;
  const sig = crypto.createHmac("sha256", AUTH_SECRET).update(signingInput).digest();
  return {
    token: `${signingInput}.${base64UrlEncode(sig)}`,
    expiresInSec: TOKEN_TTL_SEC,
  };
}

export function verifyAccessToken(token: string): AuthTokenPayload | null {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, body, sigB64] = parts;
  if (!header || !body || !sigB64) return null;

  try {
    const expectedSig = crypto.createHmac("sha256", AUTH_SECRET).update(`${header}.${body}`).digest();
    const providedSig = base64UrlDecode(sigB64);
    if (expectedSig.length !== providedSig.length) return null;
    if (!crypto.timingSafeEqual(expectedSig, providedSig)) return null;

    const payload = JSON.parse(base64UrlDecode(body).toString("utf-8")) as AuthTokenPayload;
    const nowSec = Math.floor(Date.now() / 1000);
    if (!payload.sub || !payload.exp || payload.exp <= nowSec) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export function createAuthMiddleware(getUserById: (id: string) => StoredUser | undefined) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) {
      return res.status(401).json({ detail: "Authentication required. Please sign in." });
    }
    const token = header.slice(7).trim();
    const payload = verifyAccessToken(token);
    if (!payload) {
      return res.status(401).json({ detail: "Session token is invalid or expired. Please sign in again." });
    }
    const user = getUserById(payload.sub);
    if (!user) {
      return res.status(401).json({ detail: "Authenticated account no longer exists." });
    }
    if (!user.isActive) {
      return res.status(403).json({ detail: "This user account has been deactivated by an administrator." });
    }
    if (user.tokenVersion !== payload.tv) {
      return res.status(401).json({ detail: "Session has been revoked. Please sign in again." });
    }
    req.auth = {
      userId: user.id,
      role: user.role,
      user,
    };
    return next();
  };
}

export function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.auth) {
    return res.status(401).json({ detail: "Authentication required." });
  }
  if (req.auth.role !== "ADMIN") {
    return res.status(403).json({ detail: "Administrator privileges are required for this action." });
  }
  return next();
}

export function assertCanAccessUser(req: AuthenticatedRequest, targetUserId: string): void {
  if (!req.auth) {
    throw Object.assign(new Error("Authentication required."), { status: 401 });
  }
  if (req.auth.role === "ADMIN") {
    return;
  }
  if (req.auth.userId !== targetUserId) {
    throw Object.assign(
      new Error("Access denied: you may only access your own MindTrack records."),
      { status: 403 },
    );
  }
}

export function publicUserDto(user: StoredUser) {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    isActive: user.isActive,
    hasPassword: Boolean(user.passwordHash),
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    lastLoginAt: user.lastLoginAt,
  };
}
