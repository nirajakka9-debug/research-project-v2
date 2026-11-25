import React, { useCallback, useEffect, useState } from "react";
import {
  Activity,
  BarChart3,
  ClipboardList,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  Mic,
  PlusCircle,
  ScanFace,
  Settings,
  Shield,
  Users,
  X,
} from "lucide-react";
import { AuthPages } from "./components/AuthPages";
import { ToastBanner } from "./components/SharedUI";
import { AdminDashboardPage } from "./pages/AdminDashboardPage";
import { AdminUsersPage } from "./pages/AdminUsersPage";
import { BaselinesPage } from "./pages/BaselinesPage";
import { DashboardPage } from "./pages/DashboardPage";
import { FaceAiPage } from "./pages/FaceAiPage";
import { HistoryPage } from "./pages/HistoryPage";
import { NewCheckinPage } from "./pages/NewCheckinPage";
import { QuestionnairePage } from "./pages/QuestionnairePage";
import { SettingsPage } from "./pages/SettingsPage";
import { VoiceAiPage } from "./pages/VoiceAiPage";
import {
  fetchAdminUsers,
  fetchBaselines,
  fetchCheckins,
  fetchDashboard,
  fetchRecentRuns,
  logoutUser,
  setAccessToken,
  setUnauthorizedHandler,
} from "./services/api";
import type {
  AdminUserRow,
  AnalysisRunResponse,
  AuthSessionResponse,
  BaselinesResponse,
  CheckinSession,
  DashboardResponse,
  FaceAnalysisResult,
  NavPage,
  UserProfile,
  VoiceAnalysisResult,
} from "./types/mindtrack";

const USER_NAV_ITEMS: { page: NavPage; label: string; icon: React.ReactNode }[] = [
  { page: "dashboard", label: "Dashboard", icon: <LayoutDashboard className="h-5 w-5" /> },
  { page: "checkin", label: "New Check-in", icon: <PlusCircle className="h-5 w-5" /> },
  { page: "questionnaire", label: "Questionnaire", icon: <ClipboardList className="h-5 w-5" /> },
  { page: "face", label: "Facial AI", icon: <ScanFace className="h-5 w-5" /> },
  { page: "voice", label: "Voice AI", icon: <Mic className="h-5 w-5" /> },
  { page: "baselines", label: "Baselines & Trends", icon: <BarChart3 className="h-5 w-5" /> },
  { page: "history", label: "Check-in History", icon: <History className="h-5 w-5" /> },
  { page: "settings", label: "Profile & Settings", icon: <Settings className="h-5 w-5" /> },
];

const ADMIN_NAV_ITEMS: { page: NavPage; label: string; icon: React.ReactNode }[] = [
  { page: "admin-dashboard", label: "Admin Dashboard", icon: <Shield className="h-5 w-5" /> },
  { page: "admin-users", label: "User Management", icon: <Users className="h-5 w-5" /> },
];

export default function App() {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [page, setPage] = useState<NavPage>("dashboard");
  const [activeUserId, setActiveUserId] = useState<string>("");
  const [adminUserList, setAdminUserList] = useState<AdminUserRow[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [baselines, setBaselines] = useState<BaselinesResponse | null>(null);
  const [checkins, setCheckins] = useState<CheckinSession[]>([]);
  const [faceRuns, setFaceRuns] = useState<AnalysisRunResponse<FaceAnalysisResult>[]>([]);
  const [voiceRuns, setVoiceRuns] = useState<AnalysisRunResponse<VoiceAnalysisResult>[]>([]);

  const [toast, setToast] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);

  const notify = useCallback((type: "success" | "error" | "info", text: string) => {
    setToast({ type, text });
    window.setTimeout(() => setToast(null), 5000);
  }, []);

  const clearSessionState = useCallback(() => {
    setAccessToken(null);
    setCurrentUser(null);
    setActiveUserId("");
    setAdminUserList([]);
    setDashboard(null);
    setBaselines(null);
    setCheckins([]);
    setFaceRuns([]);
    setVoiceRuns([]);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      clearSessionState();
      notify("info", "Your session expired or was revoked. Please sign in again.");
    });
    return () => setUnauthorizedHandler(null);
  }, [clearSessionState, notify]);

  const refreshAll = useCallback(async () => {
    if (!currentUser || !activeUserId) return;
    setLoading(true);
    try {
      const targetId = currentUser.role === "ADMIN" ? activeUserId : currentUser.id;
      const tasks: Promise<unknown>[] = [
        fetchDashboard(targetId),
        fetchBaselines(targetId),
        fetchCheckins(targetId),
        fetchRecentRuns<FaceAnalysisResult>(targetId, "FACE"),
        fetchRecentRuns<VoiceAnalysisResult>(targetId, "VOICE"),
      ];
      if (currentUser.role === "ADMIN") {
        tasks.push(fetchAdminUsers());
      }

      const [dash, bases, cks, fRuns, vRuns, aUsers] = await Promise.allSettled(tasks);
      if (dash.status === "fulfilled") setDashboard(dash.value as DashboardResponse);
      if (bases.status === "fulfilled") setBaselines(bases.value as BaselinesResponse);
      if (cks.status === "fulfilled") setCheckins(cks.value as CheckinSession[]);
      if (fRuns.status === "fulfilled") {
        setFaceRuns(fRuns.value as AnalysisRunResponse<FaceAnalysisResult>[]);
      }
      if (vRuns.status === "fulfilled") {
        setVoiceRuns(vRuns.value as AnalysisRunResponse<VoiceAnalysisResult>[]);
      }
      if (aUsers && aUsers.status === "fulfilled") {
        setAdminUserList(aUsers.value as AdminUserRow[]);
      }
    } finally {
      setLoading(false);
    }
  }, [currentUser, activeUserId]);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  const handleAuthenticated = (session: AuthSessionResponse) => {
    setAccessToken(session.accessToken);
    setCurrentUser(session.user);
    setActiveUserId(session.user.id);
    setPage(session.user.role === "ADMIN" ? "admin-dashboard" : "dashboard");
  };

  const handleSignOut = async () => {
    await logoutUser();
    clearSessionState();
    notify("info", "Signed out cleanly.");
  };

  const handleNavigate = useCallback((p: NavPage) => {
    setPage(p);
    setSidebarOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  if (!currentUser) {
    return (
      <>
        <AuthPages onAuthenticated={handleAuthenticated} onNotify={notify} />
        <ToastBanner toast={toast} onClose={() => setToast(null)} />
      </>
    );
  }

  const targetUserId = currentUser.role === "ADMIN" ? activeUserId || currentUser.id : currentUser.id;
  const navItems =
    currentUser.role === "ADMIN" ? [...ADMIN_NAV_ITEMS, ...USER_NAV_ITEMS] : USER_NAV_ITEMS;

  const renderPage = () => {
    switch (page) {
      case "admin-dashboard":
        return currentUser.role === "ADMIN" ? (
          <AdminDashboardPage onNavigate={handleNavigate} onNotify={notify} />
        ) : (
          <DashboardPage dashboard={dashboard} loading={loading} onNavigate={handleNavigate} />
        );
      case "admin-users":
        return currentUser.role === "ADMIN" ? (
          <AdminUsersPage
            currentAdminId={currentUser.id}
            onNotify={notify}
            onRefreshWorkspace={refreshAll}
          />
        ) : (
          <DashboardPage dashboard={dashboard} loading={loading} onNavigate={handleNavigate} />
        );
      case "dashboard":
        return <DashboardPage dashboard={dashboard} loading={loading} onNavigate={handleNavigate} />;
      case "checkin":
        return (
          <NewCheckinPage
            userId={targetUserId}
            baselines={baselines}
            onCheckinSaved={refreshAll}
            onNavigate={handleNavigate}
            onNotify={notify}
          />
        );
      case "questionnaire":
        return (
          <QuestionnairePage
            userId={targetUserId}
            checkins={checkins}
            onSaved={refreshAll}
            onNotify={notify}
          />
        );
      case "face":
        return (
          <FaceAiPage
            userId={targetUserId}
            baselines={baselines}
            recentRuns={faceRuns}
            onRefresh={refreshAll}
            onNotify={notify}
          />
        );
      case "voice":
        return (
          <VoiceAiPage
            userId={targetUserId}
            baselines={baselines}
            recentRuns={voiceRuns}
            onRefresh={refreshAll}
            onNotify={notify}
          />
        );
      case "baselines":
        return (
          <BaselinesPage
            userId={targetUserId}
            baselines={baselines}
            checkins={checkins}
            onRefresh={refreshAll}
            onNotify={notify}
          />
        );
      case "history":
        return (
          <HistoryPage
            userId={targetUserId}
            checkins={checkins}
            onRefresh={refreshAll}
            onNavigate={handleNavigate}
            onNotify={notify}
          />
        );
      case "settings":
        return (
          <SettingsPage
            currentUser={currentUser}
            onUserUpdated={(u) => setCurrentUser(u)}
            onSignOut={handleSignOut}
            onNotify={notify}
          />
        );
    }
  };

  return (
    <div className="min-h-screen flex">
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/30 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-slate-200/80 bg-white/95 backdrop-blur-md transition-transform duration-200 lg:relative lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-5 py-5 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-sky-500 to-teal-500 flex items-center justify-center shadow-sm">
              <Activity className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-slate-900 leading-none">MindTrack</h1>
              <p className="text-[10px] font-medium text-slate-400 leading-none mt-0.5">
                {currentUser.role === "ADMIN" ? "Admin & Research Console" : "Wellness Research Tool"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden rounded-lg p-1 hover:bg-slate-100"
          >
            <X className="h-5 w-5 text-slate-500" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {navItems.map((item) => {
            const active = page === item.page;
            return (
              <button
                key={item.page}
                type="button"
                onClick={() => handleNavigate(item.page)}
                className={`w-full flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all ${
                  active
                    ? "bg-gradient-to-r from-sky-50 to-teal-50 text-sky-700 border border-sky-200/70 shadow-sm"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                {item.icon}
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="border-t border-slate-100 px-4 py-4 space-y-3">
          {currentUser.role === "ADMIN" && adminUserList.length > 0 && (
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1 block">
                Inspect Workspace
              </label>
              <select
                value={targetUserId}
                onChange={(e) => setActiveUserId(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none"
              >
                {adminUserList.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.fullName} ({u.id})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="rounded-xl bg-slate-50 border border-slate-200/70 p-2.5 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-xs font-semibold text-slate-900 truncate">{currentUser.fullName}</div>
              <div className="text-[10px] text-slate-500 truncate">
                {currentUser.role} • {currentUser.id}
              </div>
            </div>
            <button
              type="button"
              onClick={handleSignOut}
              title="Sign Out"
              className="rounded-lg p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-600 transition shrink-0"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-h-screen">
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200/80 bg-white/90 backdrop-blur-md px-4 py-3 lg:hidden">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="rounded-lg p-1.5 hover:bg-slate-100"
            >
              <Menu className="h-5 w-5 text-slate-700" />
            </button>
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-sky-600" />
              <span className="text-sm font-bold text-slate-900">MindTrack</span>
            </div>
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            className="text-xs font-semibold text-rose-600 hover:underline"
          >
            Sign Out
          </button>
        </header>

        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6 lg:py-8 max-w-7xl w-full mx-auto">
          <React.Fragment key={targetUserId}>{renderPage()}</React.Fragment>
        </main>
      </div>

      <ToastBanner toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
