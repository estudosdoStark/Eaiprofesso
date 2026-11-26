import React, { useCallback, useEffect, useRef, useState } from 'react';
import { User } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { AnimatePresence, motion } from 'motion/react';
import {
  Award,
  CalendarDays,
  FolderArchive,
  GraduationCap,
  LogOut,
  MessageSquare,
  Moon,
  Sun,
} from 'lucide-react';
import brandEmblem from './assets/images/app_brand_emblem_1794560330007.jpg';
import { AuthGate } from './components/AuthGate';
import { ChatWorkspace } from './components/ChatWorkspace';
import { DeadlinesCalendarView } from './components/DeadlinesCalendarView';
import { GamificationView } from './components/GamificationView';
import { GradesView } from './components/GradesView';
import { OfflineIndicator } from './components/OfflineIndicator';
import { PWAInstallButton } from './components/PWAInstallButton';
import { SettingsBackupView } from './components/SettingsBackupView';
import {
  db,
  getAccessToken,
  googleSignIn,
  handleFirestoreError,
  initAuth,
  logout,
  OperationType,
} from './lib/firebase';
import { calculateLevelFromXp, evaluateUnlockedBadges } from './lib/gamification';
import { isWithinAcademicHours, sendPushNotification } from './lib/notifications';
import { ensureUserSeeded } from './lib/seedData';
import {
  AppSection,
  ChatRoom,
  DeadlineItem,
  GradeEntry,
  ThemeMode,
  UserProfile,
  UserRole,
} from './types/academic';

export default function App() {
  const [authReady, setAuthReady] = useState(false);
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [grades, setGrades] = useState<GradeEntry[]>([]);
  const [deadlines, setDeadlines] = useState<DeadlineItem[]>([]);
  const [rooms, setRooms] = useState<ChatRoom[]>([]);

  const [section, setSection] = useState<AppSection>('chat');
  const [xpToast, setXpToast] = useState<{ amount: number; reason: string } | null>(null);
  const [requestToast, setRequestToast] = useState<{ title: string; subtitle: string } | null>(null);
  const [chatStats, setChatStats] = useState({ sent: 0, resolved: 0 });
  const [roomsLoaded, setRoomsLoaded] = useState(false);

  const seenRoomIdsRef = useRef<Set<string>>(new Set());
  const roomsInitializedRef = useRef(false);
  const autoApprovingIdsRef = useRef<Set<string>>(new Set());

  const [theme, setTheme] = useState<ThemeMode>(() =>
    document.documentElement.classList.contains('dark') ? 'dark' : 'light'
  );

  const applyTheme = useCallback((next: ThemeMode) => {
    setTheme(next);
    if (next === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    try {
      localStorage.setItem('aulaviva-theme', next);
    } catch {
      // Ignore storage errors
    }
  }, []);

  const handleToggleTheme = useCallback(() => {
    const next: ThemeMode = theme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    if (firebaseUser) {
      updateDoc(doc(db, 'users', firebaseUser.uid), {
        theme: next,
        updatedAt: serverTimestamp(),
      }).catch(() => {});
    }
  }, [theme, applyTheme, firebaseUser]);

  useEffect(() => {
    const unsub = initAuth(async (user, token) => {
      setFirebaseUser(user);
      setAccessToken(token || getAccessToken());
      setAuthReady(true);
      setSyncError(null);
      if (user) {
        try {
          await ensureUserSeeded(user);
        } catch (err) {
          console.error('Seed check error:', err);
          setSyncError(
            err instanceof Error ? err.message : 'Erro ao inicializar dados na nuvem.'
          );
        }
      } else {
        setProfile(null);
        setGrades([]);
        setDeadlines([]);
        setRooms([]);
      }
    });
    return () => unsub();
  }, []);

  // Firestore Real-Time Subscriptions (with automatic multi-tab offline IndexedDB cache)
  useEffect(() => {
    if (!firebaseUser) return;

    const unsubProfile = onSnapshot(
      doc(db, 'users', firebaseUser.uid),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as UserProfile;
          setProfile(data);
        }
      },
      (err) => {
        handleFirestoreError(err, OperationType.GET, `users/${firebaseUser.uid}`);
      }
    );

    const gradesQuery = query(
      collection(db, 'users', firebaseUser.uid, 'grades'),
      where('userId', '==', firebaseUser.uid)
    );
    const unsubGrades = onSnapshot(
      gradesQuery,
      (snap) => {
        const list = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<GradeEntry, 'id'>),
        }));
        list.sort((a, b) => b.date.localeCompare(a.date));
        setGrades(list);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, `users/${firebaseUser.uid}/grades`);
      }
    );

    const deadlinesQuery = query(
      collection(db, 'users', firebaseUser.uid, 'deadlines'),
      where('userId', '==', firebaseUser.uid)
    );
    const unsubDeadlines = onSnapshot(
      deadlinesQuery,
      (snap) => {
        const list = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<DeadlineItem, 'id'>),
        }));
        list.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
        setDeadlines(list);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, `users/${firebaseUser.uid}/deadlines`);
      }
    );

    const roomsQuery = query(
      collection(db, 'rooms'),
      where('visibility', '==', 'shared')
    );
    const unsubRooms = onSnapshot(
      roomsQuery,
      (snap) => {
        const list = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<ChatRoom, 'id'>),
        }));
        const toMs = (v: unknown) =>
          v && typeof (v as { toMillis?: () => number }).toMillis === 'function'
            ? (v as { toMillis: () => number }).toMillis()
            : 0;
        list.sort((a, b) => toMs(b.updatedAt) - toMs(a.updatedAt));
        setRooms(list);
        setRoomsLoaded(true);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, 'rooms');
      }
    );

    return () => {
      unsubProfile();
      unsubGrades();
      unsubDeadlines();
      unsubRooms();
      setRoomsLoaded(false);
      roomsInitializedRef.current = false;
      seenRoomIdsRef.current.clear();
      autoApprovingIdsRef.current.clear();
    };
  }, [firebaseUser]);

  // Professor notifications for incoming requests & automatic room approvals
  useEffect(() => {
    if (!profile || !roomsLoaded) return;

    if (!roomsInitializedRef.current) {
      rooms.forEach((r) => seenRoomIdsRef.current.add(r.id));
      roomsInitializedRef.current = true;
    } else {
      rooms.forEach((room) => {
        if (seenRoomIdsRef.current.has(room.id)) return;
        seenRoomIdsRef.current.add(room.id);

        if (
          profile.role === 'professor' &&
          (room.chatStatus || 'active') === 'pending_professor' &&
          room.initiatedByUid !== profile.uid
        ) {
          const notifyEnabled = profile.professorNotifyNewRequests ?? true;
          const channel = profile.professorNotifyChannel || 'push_and_banner';
          const respectHours = Boolean(
            profile.professorNotifyOnlyInAcademicHours || profile.focusSilenceOutsideHours
          );
          const withinHours = isWithinAcademicHours(
            profile.academicHoursStart,
            profile.academicHoursEnd,
            respectHours
          );

          if (notifyEnabled && channel !== 'muted' && withinHours) {
            const subtitle = `${room.studentName || 'Aluno'} · ${room.subject}`;
            setRequestToast({
              title: 'Nova solicitação de bate-papo',
              subtitle,
            });
            window.setTimeout(() => setRequestToast(null), 6000);

            if (channel === 'push_and_banner') {
              sendPushNotification(
                'Eai Professô · Nova solicitação de conversa',
                `${room.studentName || 'Um aluno'} solicitou bate-papo em ${room.subject}.`,
                `chat-req-${room.id}`
              );
            }
          }
        }
      });
    }

    if (profile.role !== 'professor') return;
    const autoMode = profile.professorAutoAcceptMode || 'manual';
    if (autoMode === 'manual') return;

    const allowedSubjects = (profile.professorAutoAcceptSubjects || [])
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

    if (autoMode === 'subjects' && allowedSubjects.length === 0) return;

    const matchingRooms = rooms.filter((r) => {
      if ((r.chatStatus || 'active') !== 'pending_professor') return false;
      if (autoApprovingIdsRef.current.has(r.id)) return false;
      if (autoMode === 'all') return true;
      const roomSubject = r.subject.trim().toLowerCase();
      return allowedSubjects.some(
        (sub) => roomSubject.includes(sub) || sub.includes(roomSubject)
      );
    });

    matchingRooms.forEach(async (room) => {
      autoApprovingIdsRef.current.add(room.id);
      const welcomeNote =
        (profile.professorAutoAcceptWelcome || '').trim() ||
        'Solicitação aceita automaticamente pelas permissões do professor.';
      try {
        await updateDoc(doc(db, 'rooms', room.id), {
          chatStatus: 'active',
          moderationNote: welcomeNote.slice(0, 300),
          lastMessagePreview: welcomeNote.slice(0, 240),
          updatedAt: serverTimestamp(),
        });

        if (profile.professorAutoJoinAsMember ?? true) {
          const memberRef = doc(db, 'rooms', room.id, 'members', profile.uid);
          const memberSnap = await getDoc(memberRef);
          if (!memberSnap.exists()) {
            await setDoc(memberRef, {
              uid: profile.uid,
              displayName: profile.displayName,
              role: 'professor',
              joinedAt: serverTimestamp(),
            });
          }
        }

        setRequestToast({
          title: 'Permissão automática aplicada',
          subtitle: `${room.subject} liberada automaticamente`,
        });
        window.setTimeout(() => setRequestToast(null), 5000);
      } catch (err) {
        autoApprovingIdsRef.current.delete(room.id);
        console.error('Auto-accept room error:', err);
      }
    });
  }, [rooms, roomsLoaded, profile]);

  const handleSignIn = async () => {
    setAuthError(null);
    setSyncError(null);
    try {
      const res = await googleSignIn();
      setFirebaseUser(res.user);
      setAccessToken(res.accessToken);
      setAuthReady(true);
      await ensureUserSeeded(res.user);
    } catch (err) {
      setAuthError(
        err instanceof Error ? err.message : 'Falha na autenticação com Google.'
      );
    }
  };

  const handleAwardXp = useCallback(
    async (amount: number, reason: string) => {
      if (!profile) return;
      const nextXp = profile.xp + amount;
      const { level } = calculateLevelFromXp(nextXp);
      const nextBadges = evaluateUnlockedBadges({
        profile,
        deadlines,
        grades,
        sentMessagesCount: chatStats.sent,
        resolvedCount: chatStats.resolved,
      });

      setXpToast({ amount, reason });
      window.setTimeout(() => setXpToast(null), 3200);

      try {
        await updateDoc(doc(db, 'users', profile.uid), {
          xp: nextXp,
          level,
          badges: nextBadges,
          updatedAt: serverTimestamp(),
        });
        await updateDoc(doc(db, 'public_profiles', profile.uid), {
          displayName: profile.displayName,
          role: profile.role,
          xp: nextXp,
          level,
          streakDays: profile.streakDays || 1,
          badgeCount: nextBadges.length,
          isPublic: true,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        console.error('XP update error:', err);
      }
    },
    [profile, deadlines, grades, chatStats]
  );

  const handleChatStatsChange = useCallback((sent: number, resolved: number) => {
    setChatStats((prev) =>
      prev.sent === sent && prev.resolved === resolved ? prev : { sent, resolved }
    );
  }, []);

  const handleSwitchRole = useCallback(
    async (nextRole: UserRole) => {
      if (!profile || profile.role === nextRole) return;
      try {
        await updateDoc(doc(db, 'users', profile.uid), {
          role: nextRole,
          updatedAt: serverTimestamp(),
        });
        await updateDoc(doc(db, 'public_profiles', profile.uid), {
          role: nextRole,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `users/${profile.uid}`);
      }
    },
    [profile]
  );

  if (!authReady) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
        <div className="text-sm font-medium text-slate-500 dark:text-slate-400">
          Inicializando Eai Professô...
        </div>
      </div>
    );
  }

  if (!firebaseUser) {
    return (
      <>
        <AuthGate
          onSignIn={handleSignIn}
          theme={theme}
          onToggleTheme={handleToggleTheme}
          authError={authError}
        />
        <OfflineIndicator />
      </>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 text-center space-y-4">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
            {syncError ? 'Não foi possível carregar seu perfil acadêmico.' : 'Sincronizando seu espaço acadêmico...'}
          </p>
          {syncError && (
            <>
              <p className="text-xs text-rose-600 dark:text-rose-400 break-words">
                {syncError}
              </p>
              <div className="flex items-center justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    if (firebaseUser) {
                      setSyncError(null);
                      ensureUserSeeded(firebaseUser).catch((e) =>
                        setSyncError(e instanceof Error ? e.message : String(e))
                      );
                    }
                  }}
                  className="px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 cursor-pointer"
                >
                  Tentar Novamente
                </button>
                <button
                  type="button"
                  onClick={logout}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold cursor-pointer"
                >
                  Sair
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  const navItems: { id: AppSection; label: string; shortLabel: string; icon: React.ReactNode }[] = [
    {
      id: 'chat',
      label: 'Conversas',
      shortLabel: 'Chat',
      icon: <MessageSquare className="w-5 h-5" />,
    },
    {
      id: 'grades',
      label: 'Notas',
      shortLabel: 'Notas',
      icon: <GraduationCap className="w-5 h-5" />,
    },
    {
      id: 'deadlines',
      label: 'Prazos & Agenda',
      shortLabel: 'Agenda',
      icon: <CalendarDays className="w-5 h-5" />,
    },
    {
      id: 'gamification',
      label: 'Gamificação',
      shortLabel: 'Ranking',
      icon: <Award className="w-5 h-5" />,
    },
    {
      id: 'settings',
      label: 'Backup & Ajustes',
      shortLabel: 'Ajustes',
      icon: <FolderArchive className="w-5 h-5" />,
    },
  ];

  const pendingDeadlinesCount = deadlines.filter((d) => d.status === 'pending').length;
  const pendingChatRequestsCount = rooms.filter(
    (r) => (r.chatStatus || 'active') === 'pending_professor'
  ).length;
  const activeSectionLabel =
    navItems.find((item) => item.id === section)?.label || 'Conversas';

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col lg:flex-row">
      {/* Desktop Persistent Sidebar (256px) */}
      <aside className="hidden lg:flex w-64 flex-col border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0 sticky top-0 h-screen">
        <div className="px-5 h-14 border-b border-slate-200 dark:border-slate-800 flex items-center gap-3">
          <img
            src={brandEmblem}
            alt="Eai Professô"
            referrerPolicy="no-referrer"
            className="w-8 h-8 rounded-lg object-cover border border-slate-200 dark:border-slate-800"
          />
          <div className="min-w-0">
            <span className="font-display font-bold text-base tracking-tight block truncate">
              Eai Professô
            </span>
          </div>
        </div>

        <div className="px-3 pt-3">
          <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800">
            <button
              type="button"
              onClick={() => handleSwitchRole('student')}
              className={`py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                profile.role === 'student'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Aluno
            </button>
            <button
              type="button"
              onClick={() => handleSwitchRole('professor')}
              className={`py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                profile.role === 'professor'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Professor
            </button>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {navItems.map((item) => {
            const active = section === item.id;
            const badgeCount =
              item.id === 'deadlines'
                ? pendingDeadlinesCount
                : item.id === 'chat'
                ? pendingChatRequestsCount
                : 0;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSection(item.id)}
                className={`w-full min-h-[42px] px-3.5 py-2 rounded-xl text-sm font-semibold flex items-center justify-between transition-colors cursor-pointer whitespace-nowrap ${
                  active
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <span className="flex items-center gap-3">
                  {item.icon}
                  <span>{item.label}</span>
                </span>
                {badgeCount > 0 && (
                  <span
                    className={`text-xs font-mono tabular-nums ${
                      active
                        ? 'text-blue-100'
                        : item.id === 'chat'
                        ? 'text-amber-600 dark:text-amber-400 font-bold'
                        : 'text-slate-400'
                    }`}
                  >
                    {badgeCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
          <PWAInstallButton compact />

          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={handleToggleTheme}
              className="flex-1 min-h-[40px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold flex items-center justify-center gap-2 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              <span>{theme === 'dark' ? 'Claro' : 'Escuro'}</span>
            </button>

            <button
              type="button"
              onClick={logout}
              className="min-h-[40px] min-w-[40px] rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer"
              title="Sair da conta"
              aria-label="Sair da conta"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>

          <div className="pt-1 flex items-center gap-2.5">
            {profile.photoURL ? (
              <img
                src={profile.photoURL}
                alt={profile.displayName}
                referrerPolicy="no-referrer"
                className="w-8 h-8 rounded-full object-cover border border-slate-200 dark:border-slate-700 shrink-0"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center shrink-0">
                {profile.displayName.slice(0, 2).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                {profile.displayName}
              </p>
              <p className="text-[11px] font-mono text-slate-500 tabular-nums">
                Nível {profile.level} · {profile.xp} XP
              </p>
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile & Tablet Compact Top Bar (<= 56px) */}
      <header className="lg:hidden sticky top-0 z-30 h-14 px-4 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2.5 min-w-0">
          <img
            src={brandEmblem}
            alt="Eai Professô"
            referrerPolicy="no-referrer"
            className="w-8 h-8 rounded-lg object-cover shrink-0"
          />
          <span className="font-display font-bold text-base truncate">Eai Professô</span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs font-mono font-semibold text-blue-600 dark:text-blue-400 tabular-nums">
            Nv.{profile.level} · {profile.xp} XP
          </span>
          <button
            type="button"
            onClick={handleToggleTheme}
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700"
            aria-label="Alternar tema"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
          <button
            type="button"
            onClick={logout}
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"
            aria-label="Sair"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Content Column */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Desktop Top Workspace Bar */}
        <header className="hidden lg:flex h-14 px-8 border-b border-slate-200 dark:border-slate-800 bg-white/85 dark:bg-slate-900/80 backdrop-blur-md sticky top-0 z-20 items-center justify-between gap-6">
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span className="font-medium text-slate-500 dark:text-slate-400">Eai Professô</span>
            <span aria-hidden="true">/</span>
            <span className="font-semibold text-slate-900 dark:text-white">
              {activeSectionLabel}
            </span>
          </div>

          <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400 truncate">
            {profile.institution && (
              <>
                <span className="truncate max-w-xs">{profile.institution}</span>
                <span aria-hidden="true">·</span>
              </>
            )}
            <span className="font-semibold text-slate-700 dark:text-slate-200 whitespace-nowrap">
              {profile.role === 'professor' ? 'Perfil Docente' : 'Perfil Estudante'}
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums whitespace-nowrap">
              Foco {profile.academicHoursStart || '08:00'}–{profile.academicHoursEnd || '18:00'}
            </span>
          </div>
        </header>

        <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8 pb-24 lg:pb-8 max-w-7xl w-full mx-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={section}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            >
            {section === 'chat' && (
              <ChatWorkspace
                profile={profile}
                rooms={rooms}
                onAwardXp={handleAwardXp}
                onStatsChange={handleChatStatsChange}
                onSwitchRole={handleSwitchRole}
                onOpenSettings={() => setSection('settings')}
              />
            )}
            {section === 'grades' && (
              <GradesView
                profile={profile}
                grades={grades}
                onAwardXp={handleAwardXp}
              />
            )}
            {section === 'deadlines' && (
              <DeadlinesCalendarView
                profile={profile}
                deadlines={deadlines}
                accessToken={accessToken}
                onReconnectGoogle={handleSignIn}
                onAwardXp={handleAwardXp}
              />
            )}
            {section === 'gamification' && <GamificationView profile={profile} />}
            {section === 'settings' && (
              <SettingsBackupView
                profile={profile}
                grades={grades}
                deadlines={deadlines}
                rooms={rooms}
                theme={theme}
                onToggleTheme={handleToggleTheme}
              />
            )}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* Mobile & Tablet Fixed Bottom Tab Bar (Thumb Zone, 60px high <= 15% cap) */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 h-16 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 grid grid-cols-5 items-center px-1">
        {navItems.map((item) => {
          const active = section === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setSection(item.id)}
              className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 transition-colors cursor-pointer ${
                active
                  ? 'text-blue-600 dark:text-blue-400 font-semibold'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              {item.icon}
              <span className="text-[10px] tracking-tight whitespace-nowrap">
                {item.shortLabel}
              </span>
            </button>
          );
        })}
      </nav>

      {/* XP Reward Toast */}
      {xpToast && (
        <div className="fixed top-16 lg:top-6 right-4 z-50 bg-slate-900 dark:bg-blue-600 text-white px-4 py-2.5 rounded-xl shadow-lg text-xs font-semibold flex items-center gap-2">
          <Award className="w-4 h-4 text-amber-400 dark:text-amber-200 shrink-0" />
          <span className="tabular-nums">+{xpToast.amount} XP</span>
          <span aria-hidden="true">·</span>
          <span>{xpToast.reason}</span>
        </div>
      )}

      {/* Professor Chat Request Notification Toast */}
      {requestToast && (
        <div className="fixed bottom-20 lg:bottom-6 right-4 z-50 max-w-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg p-3.5 flex items-start gap-3">
          <MessageSquare className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-slate-900 dark:text-white">
              {requestToast.title}
            </p>
            <p className="text-[11px] text-slate-600 dark:text-slate-300 truncate mt-0.5">
              {requestToast.subtitle}
            </p>
            {section !== 'chat' && (
              <button
                type="button"
                onClick={() => {
                  setSection('chat');
                  setRequestToast(null);
                }}
                className="mt-1.5 text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
              >
                Abrir Conversas
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => setRequestToast(null)}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs cursor-pointer"
            aria-label="Fechar aviso"
          >
            ✕
          </button>
        </div>
      )}

      <OfflineIndicator />
    </div>
  );
}
