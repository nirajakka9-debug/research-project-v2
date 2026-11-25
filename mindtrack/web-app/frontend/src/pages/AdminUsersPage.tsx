import React, { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  Loader2,
  Plus,
  RefreshCw,
  ShieldCheck,
  UserCheck,
  Users,
  UserX,
} from "lucide-react";
import { adminCreateUser, adminUpdateUser, fetchAdminUsers } from "../services/api";
import type { AdminUserRow, UserRole } from "../types/mindtrack";

interface AdminUsersPageProps {
  currentAdminId: string;
  onNotify: (type: "success" | "error" | "info", text: string) => void;
  onRefreshWorkspace?: () => void;
}

export const AdminUsersPage: React.FC<AdminUsersPageProps> = ({
  currentAdminId,
  onNotify,
  onRefreshWorkspace,
}) => {
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

  // Create account form
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("USER");
  const [creating, setCreating] = useState(false);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const list = await fetchAdminUsers();
      setUsers(list);
    } catch (err) {
      onNotify("error", err instanceof Error ? err.message : "Failed to load user accounts.");
    } finally {
      setLoading(false);
    }
  }, [onNotify]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      onNotify("error", "Password must be at least 8 characters long.");
      return;
    }
    setCreating(true);
    try {
      await adminCreateUser({
        ...(userId.trim() ? { id: userId.trim() } : {}),
        fullName: fullName.trim(),
        email: email.trim(),
        password,
        role,
        isActive: true,
      });
      onNotify("success", `Account created for ${email.trim()} (${role}).`);
      setFullName("");
      setEmail("");
      setUserId("");
      setPassword("");
      setRole("USER");
      await loadUsers();
      onRefreshWorkspace?.();
    } catch (err) {
      onNotify("error", err instanceof Error ? err.message : "Failed to create account.");
    } finally {
      setCreating(false);
    }
  };

  const handleToggleActive = async (row: AdminUserRow) => {
    setBusyUserId(row.id);
    try {
      await adminUpdateUser(row.id, { isActive: !row.isActive });
      onNotify(
        "success",
        `${row.fullName} has been ${row.isActive ? "deactivated" : "reactivated"}.`,
      );
      await loadUsers();
    } catch (err) {
      onNotify("error", err instanceof Error ? err.message : "Failed to update account status.");
    } finally {
      setBusyUserId(null);
    }
  };

  const handleToggleRole = async (row: AdminUserRow) => {
    const nextRole: UserRole = row.role === "ADMIN" ? "USER" : "ADMIN";
    setBusyUserId(row.id);
    try {
      await adminUpdateUser(row.id, { role: nextRole });
      onNotify("success", `Updated ${row.fullName}'s role to ${nextRole}.`);
      await loadUsers();
    } catch (err) {
      onNotify("error", err instanceof Error ? err.message : "Failed to update user role.");
    } finally {
      setBusyUserId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Users className="h-6 w-6 text-sky-600" />
            User Management
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Create accounts, activate/deactivate participant access, and inspect baseline coverage
          </p>
        </div>
        <button
          type="button"
          onClick={loadUsers}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Refresh List
        </button>
      </div>

      {/* Create New User Form */}
      <form onSubmit={handleCreate} className="wellness-card p-5 space-y-4">
        <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
          <Plus className="h-4 w-4 text-sky-600" /> Create User Account
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Full Name *</label>
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Jane Doe"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Email *</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="jane@example.com"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">User ID (optional)</label>
            <input
              type="text"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              placeholder="jane_doe"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Initial Password *</label>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="8+ chars"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as UserRole)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
            >
              <option value="USER">USER</option>
              <option value="ADMIN">ADMIN</option>
            </select>
          </div>
        </div>
        <button
          type="submit"
          disabled={creating}
          className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-sky-600 to-teal-600 px-5 py-2 text-xs font-semibold text-white hover:from-sky-700 hover:to-teal-700 disabled:opacity-50"
        >
          {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Create Account
        </button>
      </form>

      {/* Registered Users Table */}
      <div className="wellness-card p-5 space-y-3">
        <h2 className="text-sm font-semibold text-slate-900">
          Registered Users ({users.length})
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2.5 pr-4 font-semibold">User</th>
                <th className="py-2.5 pr-4 font-semibold">Role</th>
                <th className="py-2.5 pr-4 font-semibold">Status</th>
                <th className="py-2.5 pr-4 font-semibold">Check-ins &amp; Baselines</th>
                <th className="py-2.5 pr-4 font-semibold">Last Sign-in</th>
                <th className="py-2.5 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((u) => {
                const isSelf = u.id === currentAdminId;
                const busy = busyUserId === u.id;
                return (
                  <tr key={u.id} className={!u.isActive ? "bg-slate-50/80 opacity-75" : ""}>
                    <td className="py-3 pr-4">
                      <div className="font-semibold text-slate-900">{u.fullName}</div>
                      <div className="text-slate-500">{u.email}</div>
                      <div className="text-[11px] text-slate-400">
                        ID: {u.id} {!u.hasPassword ? "• Migrated (no password set)" : ""}
                      </div>
                    </td>
                    <td className="py-3 pr-4">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                          u.role === "ADMIN"
                            ? "bg-amber-50 text-amber-800 border-amber-200"
                            : "bg-sky-50 text-sky-700 border-sky-200"
                        }`}
                      >
                        {u.role === "ADMIN" && <ShieldCheck className="h-3 w-3" />}
                        {u.role}
                      </span>
                    </td>
                    <td className="py-3 pr-4">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                          u.isActive
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : "bg-rose-50 text-rose-700 border-rose-200"
                        }`}
                      >
                        <CheckCircle2 className="h-3 w-3" />
                        {u.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-slate-600">
                      <div>Check-ins: <strong>{u.checkinCount}</strong></div>
                      <div className="text-[11px] text-slate-400">
                        Face {u.faceBaselineCount}/5 {u.faceCalibrated ? "✓" : ""} • Voice{" "}
                        {u.voiceBaselineCount}/3 {u.voiceEstablished ? "✓" : ""}
                      </div>
                    </td>
                    <td className="py-3 pr-4 text-slate-500">
                      {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : "Never"}
                    </td>
                    <td className="py-3 text-right space-x-2 whitespace-nowrap">
                      <button
                        type="button"
                        disabled={busy || isSelf}
                        onClick={() => handleToggleRole(u)}
                        title={isSelf ? "Cannot change your own role" : "Switch role between USER and ADMIN"}
                        className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                      >
                        {u.role === "ADMIN" ? "Make USER" : "Make ADMIN"}
                      </button>
                      <button
                        type="button"
                        disabled={busy || isSelf}
                        onClick={() => handleToggleActive(u)}
                        className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-medium disabled:opacity-40 ${
                          u.isActive
                            ? "border-rose-200 bg-white text-rose-600 hover:bg-rose-50"
                            : "border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50"
                        }`}
                      >
                        {u.isActive ? (
                          <>
                            <UserX className="h-3 w-3" /> Deactivate
                          </>
                        ) : (
                          <>
                            <UserCheck className="h-3 w-3" /> Activate
                          </>
                        )}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
