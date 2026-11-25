import React, { useEffect, useState } from "react";
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  KeyRound,
  Loader2,
  LogOut,
  RefreshCw,
  Save,
  Server,
  Settings,
  User,
} from "lucide-react";
import { changeMyPassword, fetchHealth, setAccessToken, updateMyProfile } from "../services/api";
import type { HealthStatus, UserProfile } from "../types/mindtrack";
import { NonDiagnosticBanner } from "../components/SharedUI";

interface SettingsPageProps {
  currentUser: UserProfile;
  onUserUpdated: (user: UserProfile) => void;
  onSignOut: () => void;
  onNotify: (type: "success" | "error" | "info", text: string) => void;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({
  currentUser,
  onUserUpdated,
  onSignOut,
  onNotify,
}) => {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);

  const [fullName, setFullName] = useState(currentUser.fullName);
  const [email, setEmail] = useState(currentUser.email);
  const [savingProfile, setSavingProfile] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [updatingPassword, setUpdatingPassword] = useState(false);

  useEffect(() => {
    setFullName(currentUser.fullName);
    setEmail(currentUser.email);
  }, [currentUser]);

  const checkHealth = async () => {
    setHealthLoading(true);
    try {
      const h = await fetchHealth();
      setHealth(h);
    } catch {
      setHealth(null);
      onNotify("error", "Could not reach the MindTrack backend.");
    } finally {
      setHealthLoading(false);
    }
  };

  useEffect(() => {
    void checkHealth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      const updated = await updateMyProfile({
        fullName: fullName.trim(),
        email: email.trim(),
      });
      onUserUpdated(updated);
      onNotify("success", "Your profile has been updated.");
    } catch (err) {
      onNotify("error", err instanceof Error ? err.message : "Failed to update profile.");
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      onNotify("error", "New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmNewPassword) {
      onNotify("error", "New passwords do not match.");
      return;
    }
    setUpdatingPassword(true);
    try {
      const resp = await changeMyPassword({ currentPassword, newPassword });
      setAccessToken(resp.accessToken);
      onUserUpdated(resp.user);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
      onNotify("success", "Password updated and active session refreshed.");
    } catch (err) {
      onNotify("error", err instanceof Error ? err.message : "Password change failed.");
    } finally {
      setUpdatingPassword(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Settings className="h-6 w-6 text-sky-600" /> Account Profile &amp; Settings
          </h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Update your personal account details, change your password, and verify service health
          </p>
        </div>
        <button
          type="button"
          onClick={onSignOut}
          className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-white px-4 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50"
        >
          <LogOut className="h-4 w-4" /> Sign Out
        </button>
      </div>

      <NonDiagnosticBanner compact />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Profile Form */}
        <form onSubmit={handleSaveProfile} className="wellness-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <User className="h-4 w-4 text-sky-600" /> Personal Profile
            </h3>
            <span className="text-[11px] font-semibold rounded-full bg-sky-50 text-sky-700 border border-sky-200 px-2.5 py-0.5">
              Role: {currentUser.role}
            </span>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">User ID</label>
            <input
              type="text"
              disabled
              value={currentUser.id}
              className="w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Full Name</label>
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-sky-400 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Email Address</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-sky-400 focus:outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={savingProfile}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-sky-600 to-teal-600 px-5 py-2.5 text-xs font-semibold text-white hover:from-sky-700 hover:to-teal-700 disabled:opacity-50"
          >
            {savingProfile ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Profile Changes
          </button>
        </form>

        {/* Change Password Form */}
        <form onSubmit={handleChangePassword} className="wellness-card p-5 space-y-4">
          <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-violet-600" /> Security &amp; Password
          </h3>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Current Password</label>
            <input
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">New Password</label>
            <input
              type="password"
              required
              minLength={8}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Minimum 8 characters"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Confirm New Password</label>
            <input
              type="password"
              required
              minLength={8}
              value={confirmNewPassword}
              onChange={(e) => setConfirmNewPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800"
            />
          </div>

          <button
            type="submit"
            disabled={updatingPassword}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {updatingPassword ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
            Update Password
          </button>
        </form>
      </div>

      {/* Backend health */}
      <div className="wellness-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
            <Server className="h-4 w-4 text-slate-500" /> Service &amp; Media Pipeline Status
          </h3>
          <button
            type="button"
            onClick={checkHealth}
            disabled={healthLoading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {healthLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Check
          </button>
        </div>

        {health ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
              <div className="text-slate-500 mb-1">Service Runtime</div>
              <div className="font-bold text-slate-900">{health.runtime}</div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
              <div className="text-slate-500 mb-1">API Status</div>
              <div className="flex items-center gap-1.5">
                {health.status === "UP" ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-rose-600" />
                )}
                <span className="font-bold text-slate-900">{health.status}</span>
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
              <div className="text-slate-500 mb-1">AI Modules</div>
              <div className="font-bold text-slate-900">
                Face: {health.faceAiAvailable ? "Ready" : "Off"} • Voice: {health.voiceAiAvailable ? "Ready" : "Off"}
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
              <div className="text-slate-500 mb-1">FFmpeg Audio/Video</div>
              <div className="flex items-center gap-1.5">
                {health.ffmpegAvailable ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-amber-500" />
                )}
                <span className="font-bold text-slate-900">
                  {health.ffmpegAvailable ? "Available" : "Unavailable"}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-xs text-rose-800 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Backend unreachable</p>
              <p className="mt-0.5">Verify the MindTrack Node.js server is running (`npm run dev` on port 3000).</p>
            </div>
          </div>
        )}
      </div>

      {/* About */}
      <div className="wellness-card p-5 space-y-3">
        <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
          <Activity className="h-4 w-4 text-sky-600" /> About MindTrack
        </h3>
        <div className="text-xs text-slate-600 space-y-2 leading-relaxed">
          <p>
            MindTrack is a non-diagnostic longitudinal multimodal wellness monitoring tool. It tracks self-reported
            check-ins, facial behaviour metrics, and voice acoustic features relative to your isolated personal baseline.
          </p>
          <p className="text-amber-700 font-medium">
            ⚠ MindTrack does not detect, diagnose, or score stress, depression, anxiety, or any medical condition.
          </p>
        </div>
      </div>
    </div>
  );
};
