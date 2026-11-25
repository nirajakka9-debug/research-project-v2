import React, { useEffect, useState } from "react";
import {
  Activity,
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  ShieldAlert,
  UserPlus,
} from "lucide-react";
import {
  bootstrapAdmin,
  fetchAuthStatus,
  loginUser,
  registerUser,
  requestForgotPassword,
} from "../services/api";
import type { AuthSessionResponse, AuthStatusResponse } from "../types/mindtrack";
import { NonDiagnosticBanner } from "./SharedUI";

type AuthViewMode = "login" | "register" | "forgot" | "bootstrap-admin";

interface AuthPagesProps {
  onAuthenticated: (session: AuthSessionResponse) => void;
  onNotify: (type: "success" | "error" | "info", text: string) => void;
}

export const AuthPages: React.FC<AuthPagesProps> = ({ onAuthenticated, onNotify }) => {
  const [view, setView] = useState<AuthViewMode>("login");
  const [authStatus, setAuthStatus] = useState<AuthStatusResponse | null>(null);

  // Shared / login fields
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");

  // Registration / admin bootstrap fields
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [userId, setUserId] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Forgot password state
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotNotice, setForgotNotice] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAuthStatus()
      .then((s) => setAuthStatus(s))
      .catch(() => setAuthStatus(null));
  }, []);

  const resetMessages = () => {
    setError(null);
    setForgotNotice(null);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    resetMessages();
    setSubmitting(true);
    try {
      const session = await loginUser({ identifier: identifier.trim(), password });
      onNotify("success", `Signed in as ${session.user.fullName} (${session.user.role}).`);
      onAuthenticated(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    resetMessages();
    if (password.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setSubmitting(true);
    try {
      const session = await registerUser({
        email: email.trim(),
        fullName: fullName.trim(),
        password,
        ...(userId.trim() ? { id: userId.trim() } : {}),
      });
      onNotify("success", `Welcome, ${session.user.fullName}! Your account is ready.`);
      onAuthenticated(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleBootstrapAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    resetMessages();
    if (password.length < 8) {
      setError("Administrator password must be at least 8 characters long.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setSubmitting(true);
    try {
      const session = await bootstrapAdmin({
        email: email.trim(),
        fullName: fullName.trim(),
        password,
        ...(userId.trim() ? { id: userId.trim() } : {}),
      });
      onNotify("success", "Initial administrator account created and signed in.");
      onAuthenticated(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Admin setup failed.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    resetMessages();
    setSubmitting(true);
    try {
      const resp = await requestForgotPassword(forgotEmail.trim());
      setForgotNotice(resp.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not process request.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-teal-50/70 flex flex-col justify-center py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full mx-auto space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="mx-auto h-12 w-12 rounded-2xl bg-gradient-to-br from-sky-500 to-teal-500 flex items-center justify-center shadow-md">
            <Activity className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">MindTrack</h1>
          <p className="text-sm text-slate-500">
            Non-Diagnostic Longitudinal Multimodal Wellness Research Platform
          </p>
        </div>

        <NonDiagnosticBanner compact />

        {authStatus?.allowAdminBootstrap && view !== "bootstrap-admin" && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50/90 p-4 text-xs text-amber-900 space-y-2">
            <div className="flex items-start gap-2">
              <ShieldAlert className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Initial Administrator Setup Required</p>
                <p className="mt-0.5 text-amber-800 leading-relaxed">
                  No administrator account is configured yet. Create the first administrator account securely below (or set{" "}
                  <code>MINDTRACK_ADMIN_EMAIL</code> and <code>MINDTRACK_ADMIN_PASSWORD</code> in server environment variables).
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                resetMessages();
                setView("bootstrap-admin");
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-800 transition"
            >
              <KeyRound className="h-3.5 w-3.5" /> Set Up First Administrator
            </button>
          </div>
        )}

        <div className="wellness-card p-6 sm:p-7 space-y-5">
          {/* Tabs when in login/register */}
          {(view === "login" || view === "register") && (
            <div className="grid grid-cols-2 rounded-xl bg-slate-100 p-1 text-xs font-semibold">
              <button
                type="button"
                onClick={() => {
                  resetMessages();
                  setView("login");
                }}
                className={`rounded-lg py-2 transition ${
                  view === "login" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => {
                  resetMessages();
                  setView("register");
                }}
                className={`rounded-lg py-2 transition ${
                  view === "register" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                Create Account
              </button>
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-800 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {view === "login" && (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Email or User ID</label>
                <div className="relative">
                  <Mail className="h-4 w-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    required
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full rounded-xl border border-slate-200 pl-9 pr-3 py-2 text-sm text-slate-800 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-slate-700">Password</label>
                  <button
                    type="button"
                    onClick={() => {
                      resetMessages();
                      setView("forgot");
                    }}
                    className="text-xs font-medium text-sky-600 hover:text-sky-700"
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="relative">
                  <Lock className="h-4 w-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Minimum 8 characters"
                    className="w-full rounded-xl border border-slate-200 pl-9 pr-3 py-2 text-sm text-slate-800 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-600 to-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:from-sky-700 hover:to-teal-700 disabled:opacity-50 transition"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
                Sign In to MindTrack
              </button>
            </form>
          )}

          {view === "register" && (
            <form onSubmit={handleRegister} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Alex Rivera"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-sky-400 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Email Address</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="alex@example.com"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-sky-400 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Profile User ID <span className="text-slate-400 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                  placeholder="e.g. alex_rivera (auto-generated if blank)"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-sky-400 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Password</label>
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="8+ chars"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-sky-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Confirm</label>
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repeat password"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-sky-400 focus:outline-none"
                  />
                </div>
              </div>

              <p className="text-[11px] text-slate-500">
                Public accounts are created with standard participant access (<code>USER</code> role) and isolated personal baselines.
              </p>

              <button
                type="submit"
                disabled={submitting}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-600 to-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:from-sky-700 hover:to-teal-700 disabled:opacity-50 transition"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                Create Participant Account
              </button>
            </form>
          )}

          {view === "forgot" && (
            <div className="space-y-4">
              <button
                type="button"
                onClick={() => {
                  resetMessages();
                  setView("login");
                }}
                className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-800"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Back to Sign In
              </button>

              <div>
                <h2 className="text-base font-bold text-slate-900">Password Recovery</h2>
                <p className="text-xs text-slate-500 mt-1">
                  Enter your registered email address to check recovery options.
                </p>
              </div>

              {forgotNotice && (
                <div className="rounded-xl border border-sky-200 bg-sky-50 p-3.5 text-xs text-sky-900 space-y-1">
                  <div className="flex items-center gap-1.5 font-semibold">
                    <CheckCircle2 className="h-4 w-4 text-sky-600" />
                    Email Delivery Not Configured
                  </div>
                  <p className="leading-relaxed">{forgotNotice}</p>
                </div>
              )}

              <form onSubmit={handleForgotSubmit} className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Registered Email</label>
                  <input
                    type="email"
                    required
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-sky-400 focus:outline-none"
                  />
                </div>
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                  Check Recovery Options
                </button>
              </form>
            </div>
          )}

          {view === "bootstrap-admin" && (
            <div className="space-y-4">
              <button
                type="button"
                onClick={() => {
                  resetMessages();
                  setView("login");
                }}
                className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-800"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Back to Sign In
              </button>

              <div>
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <KeyRound className="h-4 w-4 text-amber-600" />
                  Create Initial Administrator
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  One-time administrator bootstrap. Disabled permanently once an admin account exists.
                </p>
              </div>

              <form onSubmit={handleBootstrapAdmin} className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Administrator Name</label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Research Administrator"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Administrator Email</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@organization.org"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Password</label>
                    <input
                      type="password"
                      required
                      minLength={8}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="8+ chars"
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Confirm</label>
                    <input
                      type="password"
                      required
                      minLength={8}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Repeat password"
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800"
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                  Create Administrator Account
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
