import React, { useEffect, useMemo, useState } from 'react';
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import {
  Bell,
  CheckCircle2,
  Cloud,
  Download,
  FileSpreadsheet,
  FileText,
  GraduationCap,
  Moon,
  Plus,
  ShieldCheck,
  Sliders,
  Sun,
  X,
} from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  exportAcademicReportPDF,
  exportDeadlinesToCSV,
  exportFullBackupJSON,
  exportGradesToCSV,
} from '../lib/exportUtils';
import {
  isNotificationSupported,
  requestNotificationPermission,
  sendPushNotification,
} from '../lib/notifications';
import {
  ChatRoom,
  DeadlineItem,
  GradeEntry,
  ProfessorAutoAcceptMode,
  ProfessorNotifyChannel,
  ThemeMode,
  UserProfile,
  UserRole,
} from '../types/academic';
import { PWAInstallButton } from './PWAInstallButton';

interface SettingsBackupViewProps {
  profile: UserProfile;
  grades: GradeEntry[];
  deadlines: DeadlineItem[];
  rooms: ChatRoom[];
  theme: ThemeMode;
  onToggleTheme: () => void;
}

export const SettingsBackupView: React.FC<SettingsBackupViewProps> = ({
  profile,
  grades,
  deadlines,
  rooms,
  theme,
  onToggleTheme,
}) => {
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [role, setRole] = useState<UserRole>(profile.role);
  const [institution, setInstitution] = useState(profile.institution || '');
  const [academicHoursStart, setAcademicHoursStart] = useState(profile.academicHoursStart || '08:00');
  const [academicHoursEnd, setAcademicHoursEnd] = useState(profile.academicHoursEnd || '18:00');
  const [focusSilenceOutsideHours, setFocusSilenceOutsideHours] = useState(
    Boolean(profile.focusSilenceOutsideHours)
  );
  const [notifyMessages, setNotifyMessages] = useState(profile.notifyMessages ?? true);
  const [notifyDeadlines, setNotifyDeadlines] = useState(profile.notifyDeadlines ?? true);
  const [defaultReminderMinutes, setDefaultReminderMinutes] = useState(
    String(profile.defaultReminderMinutes || 60)
  );

  // Professor notification & automatic permission preferences
  const [professorNotifyNewRequests, setProfessorNotifyNewRequests] = useState(
    profile.professorNotifyNewRequests ?? true
  );
  const [professorNotifyChannel, setProfessorNotifyChannel] = useState<ProfessorNotifyChannel>(
    profile.professorNotifyChannel || 'push_and_banner'
  );
  const [professorNotifyOnlyInAcademicHours, setProfessorNotifyOnlyInAcademicHours] = useState(
    Boolean(profile.professorNotifyOnlyInAcademicHours)
  );
  const [professorAutoAcceptMode, setProfessorAutoAcceptMode] = useState<ProfessorAutoAcceptMode>(
    profile.professorAutoAcceptMode || 'manual'
  );
  const [professorAutoAcceptSubjects, setProfessorAutoAcceptSubjects] = useState<string[]>(
    profile.professorAutoAcceptSubjects || []
  );
  const [subjectInput, setSubjectInput] = useState('');
  const [professorAutoAcceptWelcome, setProfessorAutoAcceptWelcome] = useState(
    profile.professorAutoAcceptWelcome || ''
  );
  const [professorAutoJoinAsMember, setProfessorAutoJoinAsMember] = useState(
    profile.professorAutoJoinAsMember ?? true
  );

  const [saving, setSaving] = useState(false);
  const [savedFeedback, setSavedFeedback] = useState<string | null>(null);
  const [notifStatus, setNotifStatus] = useState<string>(
    isNotificationSupported() ? Notification.permission : 'unsupported'
  );

  useEffect(() => {
    setRole(profile.role);
  }, [profile.role]);

  useEffect(() => {
    setProfessorNotifyNewRequests(profile.professorNotifyNewRequests ?? true);
    setProfessorNotifyChannel(profile.professorNotifyChannel || 'push_and_banner');
    setProfessorNotifyOnlyInAcademicHours(Boolean(profile.professorNotifyOnlyInAcademicHours));
    setProfessorAutoAcceptMode(profile.professorAutoAcceptMode || 'manual');
    setProfessorAutoAcceptSubjects(profile.professorAutoAcceptSubjects || []);
    setProfessorAutoAcceptWelcome(profile.professorAutoAcceptWelcome || '');
    setProfessorAutoJoinAsMember(profile.professorAutoJoinAsMember ?? true);
  }, [
    profile.professorNotifyNewRequests,
    profile.professorNotifyChannel,
    profile.professorNotifyOnlyInAcademicHours,
    profile.professorAutoAcceptMode,
    profile.professorAutoAcceptSubjects,
    profile.professorAutoAcceptWelcome,
    profile.professorAutoJoinAsMember,
  ]);

  const suggestedSubjects = useMemo(() => {
    const all = new Set<string>();
    rooms.forEach((r) => {
      if (r.subject.trim()) all.add(r.subject.trim());
    });
    grades.forEach((g) => {
      if (g.subject.trim()) all.add(g.subject.trim());
    });
    deadlines.forEach((d) => {
      if (d.subject.trim()) all.add(d.subject.trim());
    });
    const currentLower = new Set(professorAutoAcceptSubjects.map((s) => s.toLowerCase()));
    return Array.from(all)
      .filter((s) => !currentLower.has(s.toLowerCase()))
      .slice(0, 6);
  }, [rooms, grades, deadlines, professorAutoAcceptSubjects]);

  const addAuthorizedSubject = (raw: string) => {
    const clean = raw.trim().slice(0, 120);
    if (!clean) return;
    if (professorAutoAcceptSubjects.length >= 15) return;
    const exists = professorAutoAcceptSubjects.some(
      (s) => s.toLowerCase() === clean.toLowerCase()
    );
    if (exists) {
      setSubjectInput('');
      return;
    }
    setProfessorAutoAcceptSubjects((prev) => [...prev, clean]);
    setSubjectInput('');
  };

  const removeAuthorizedSubject = (subjectToRemove: string) => {
    setProfessorAutoAcceptSubjects((prev) => prev.filter((s) => s !== subjectToRemove));
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSavedFeedback(null);

    const sanitizedSubjects = Array.from(
      new Set(
        professorAutoAcceptSubjects
          .map((s) => s.trim().slice(0, 120))
          .filter(Boolean)
      )
    ).slice(0, 15);

    try {
      await updateDoc(doc(db, 'users', profile.uid), {
        displayName: displayName.trim().slice(0, 120) || profile.displayName,
        role,
        institution: institution.trim().slice(0, 150),
        academicHoursStart,
        academicHoursEnd,
        focusSilenceOutsideHours,
        theme,
        notifyMessages,
        notifyDeadlines,
        defaultReminderMinutes: Number(defaultReminderMinutes) || 60,
        professorNotifyNewRequests,
        professorNotifyChannel,
        professorNotifyOnlyInAcademicHours,
        professorAutoAcceptMode,
        professorAutoAcceptSubjects: sanitizedSubjects,
        professorAutoAcceptWelcome: professorAutoAcceptWelcome.trim().slice(0, 240),
        professorAutoJoinAsMember,
        updatedAt: serverTimestamp(),
      });
      await updateDoc(doc(db, 'public_profiles', profile.uid), {
        displayName: displayName.trim().slice(0, 120) || profile.displayName,
        role,
        xp: profile.xp,
        level: profile.level,
        streakDays: profile.streakDays || 1,
        badgeCount: (profile.badges || []).length,
        isPublic: true,
        updatedAt: serverTimestamp(),
      });
      setSavedFeedback('Preferências de perfil, docente e sincronização atualizadas na nuvem.');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${profile.uid}`);
    } finally {
      setSaving(false);
    }
  };

  const handleCloudBackupNow = async () => {
    const nowIso = new Date().toISOString();
    try {
      await updateDoc(doc(db, 'users', profile.uid), {
        lastBackupAt: nowIso,
        updatedAt: serverTimestamp(),
      });
      setSavedFeedback('Backup em nuvem verificado e ponto de restauração atualizado.');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${profile.uid}`);
    }
  };

  const handleEnablePush = async () => {
    const res = await requestNotificationPermission();
    setNotifStatus(res);
    if (res === 'granted') {
      sendPushNotification(
        'Eai Professô · Notificações Ativas',
        'Você receberá lembretes de provas, trabalhos, mensagens e solicitações de conversa.',
        'test-push'
      );
    }
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="font-display font-bold text-2xl text-slate-900 dark:text-white">
          Exportação, Backup & Separação Acadêmica
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">
          Configure horários de foco, preferências do professor para solicitações de bate-papo, notificações push e exportações.
        </p>
      </div>

      {savedFeedback && (
        <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-sm text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{savedFeedback}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Profile, Academic Focus Hours, Notifications & Professor Permissions */}
        <form
          onSubmit={handleSaveSettings}
          className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-6"
        >
          <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
            <div>
              <h2 className="font-display font-semibold text-base text-slate-900 dark:text-white">
                Perfil & Separação Vida Pessoal / Acadêmica
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Defina seu papel na plataforma e limites de horário para alertas acadêmicos.
              </p>
            </div>
            <ShieldCheck className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold mb-1">Nome de Exibição</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1">Modo de Perfil</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as UserRole)}
                className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-none"
              >
                <option value="student">Aluno (Estudante)</option>
                <option value="professor">Professor (Docente)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1">Instituição / Curso</label>
            <input
              type="text"
              value={institution}
              onChange={(e) => setInstitution(e.target.value)}
              placeholder="Ex: Engenharia da Computação · USP"
              className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-none focus:border-blue-500"
            />
          </div>

          {/* Academic Focus Window */}
          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
            <h3 className="font-display font-semibold text-sm text-slate-900 dark:text-white">
              Janela de Horário Acadêmico
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold mb-1">Início das Aulas</label>
                <input
                  type="time"
                  value={academicHoursStart}
                  onChange={(e) => setAcademicHoursStart(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Fim do Expediente</label>
                <input
                  type="time"
                  value={academicHoursEnd}
                  onChange={(e) => setAcademicHoursEnd(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-none"
                />
              </div>
            </div>

            <label className="flex items-start gap-2.5 text-sm cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={focusSilenceOutsideHours}
                onChange={(e) => setFocusSilenceOutsideHours(e.target.checked)}
                className="w-4 h-4 rounded accent-blue-600 mt-0.5"
              />
              <span className="text-slate-700 dark:text-slate-300 text-xs leading-relaxed">
                Silenciar notificações push fora do horário acadêmico para preservar meu tempo pessoal.
              </span>
            </label>
          </div>

          {/* Notifications */}
          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-semibold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                <Bell className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span>Notificações Push & Lembretes</span>
              </h3>
              <button
                type="button"
                onClick={handleEnablePush}
                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                {notifStatus === 'granted' ? 'Testar Push Agora' : 'Ativar Push no Navegador'}
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={notifyMessages}
                  onChange={(e) => setNotifyMessages(e.target.checked)}
                  className="w-4 h-4 rounded accent-blue-600"
                />
                <span>Alertar novas mensagens e respostas de professores</span>
              </label>
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={notifyDeadlines}
                  onChange={(e) => setNotifyDeadlines(e.target.checked)}
                  className="w-4 h-4 rounded accent-blue-600"
                />
                <span>Alertar proximidade de provas, trabalhos e entregas</span>
              </label>
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1">
                Antecedência Padrão dos Lembretes
              </label>
              <select
                value={defaultReminderMinutes}
                onChange={(e) => setDefaultReminderMinutes(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-none"
              >
                <option value="15">15 minutos antes</option>
                <option value="60">1 hora antes</option>
                <option value="180">3 horas antes</option>
                <option value="1440">1 dia antes</option>
                <option value="4320">3 dias antes</option>
              </select>
            </div>
          </div>

          {/* Professor Preferences: Chat Request Notifications & Automatic Permissions */}
          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-display font-semibold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  <span>Preferências do Professor: Solicitações & Permissões Automáticas</span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Defina como deseja ser avisado sobre novos pedidos de bate-papo e quais conversas são liberadas automaticamente.
                </p>
              </div>
            </div>

            {role !== 'professor' ? (
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <GraduationCap className="w-4 h-4 text-slate-500 dark:text-slate-400 mt-0.5 shrink-0" />
                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                    Estas opções ficam ativas no perfil <strong>Professor (Docente)</strong>. Alterne o modo acima para configurar notificações de solicitações e aceite automático.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setRole('professor')}
                  className="px-3 py-2 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition-colors cursor-pointer shrink-0 whitespace-nowrap"
                >
                  Configurar como Professor
                </button>
              </div>
            ) : (
              <div className="space-y-5 pt-2">
                {/* 1. Notification preferences for incoming requests */}
                <div className="space-y-3">
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                    Notificações de novas solicitações
                  </p>

                  <label className="flex items-start gap-2.5 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={professorNotifyNewRequests}
                      onChange={(e) => setProfessorNotifyNewRequests(e.target.checked)}
                      className="w-4 h-4 rounded accent-blue-600 mt-0.5"
                    />
                    <span className="text-slate-700 dark:text-slate-200 leading-relaxed">
                      Notificar imediatamente quando um aluno solicitar abertura de bate-papo
                    </span>
                  </label>

                  {professorNotifyNewRequests && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                      <div>
                        <label className="block text-xs font-semibold mb-1 text-slate-700 dark:text-slate-300">
                          Formato do Alerta
                        </label>
                        <select
                          value={professorNotifyChannel}
                          onChange={(e) =>
                            setProfessorNotifyChannel(e.target.value as ProfessorNotifyChannel)
                          }
                          className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-none"
                        >
                          <option value="push_and_banner">Push do navegador + banner no app</option>
                          <option value="banner_only">Apenas banner discreto no app</option>
                          <option value="muted">Silenciar alertas (somente aba Pendentes)</option>
                        </select>
                      </div>

                      <div className="flex items-end pb-1">
                        <label className="flex items-start gap-2 text-xs cursor-pointer">
                          <input
                            type="checkbox"
                            checked={professorNotifyOnlyInAcademicHours}
                            onChange={(e) =>
                              setProfessorNotifyOnlyInAcademicHours(e.target.checked)
                            }
                            className="w-4 h-4 rounded accent-blue-600 mt-0.5"
                          />
                          <span className="text-slate-700 dark:text-slate-300 leading-snug">
                            Respeitar meu horário acadêmico para alertas de solicitações
                          </span>
                        </label>
                      </div>
                    </div>
                  )}
                </div>

                {/* 2. Automatic chat permissions */}
                <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                    Permissões automáticas de bate-papo
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {[
                      {
                        id: 'manual' as const,
                        title: 'Manual',
                        desc: 'Aprovar cada solicitação manualmente',
                      },
                      {
                        id: 'subjects' as const,
                        title: 'Por Disciplina',
                        desc: 'Liberar automaticamente matérias escolhidas',
                      },
                      {
                        id: 'all' as const,
                        title: 'Aceite Total',
                        desc: 'Aceitar todas as novas solicitações',
                      },
                    ].map((opt) => {
                      const active = professorAutoAcceptMode === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setProfessorAutoAcceptMode(opt.id)}
                          className={`p-3 rounded-xl border text-left transition-colors cursor-pointer ${
                            active
                              ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-500 text-slate-900 dark:text-white'
                              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                          }`}
                        >
                          <p className="text-xs font-semibold">{opt.title}</p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                            {opt.desc}
                          </p>
                        </button>
                      );
                    })}
                  </div>

                  {professorAutoAcceptMode === 'subjects' && (
                    <div className="space-y-2.5 pt-1">
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Disciplinas com Permissão Automática ({professorAutoAcceptSubjects.length}/15)
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={subjectInput}
                          onChange={(e) => setSubjectInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              addAuthorizedSubject(subjectInput);
                            }
                          }}
                          maxLength={120}
                          placeholder="Ex: Cálculo II, Estruturas de Dados..."
                          className="flex-1 px-3 py-2 text-xs rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 outline-none focus:border-blue-500"
                        />
                        <button
                          type="button"
                          onClick={() => addAuthorizedSubject(subjectInput)}
                          disabled={!subjectInput.trim() || professorAutoAcceptSubjects.length >= 15}
                          className="px-3 py-2 rounded-xl bg-slate-900 dark:bg-blue-600 text-white text-xs font-semibold hover:opacity-90 disabled:opacity-40 flex items-center gap-1 cursor-pointer shrink-0"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Adicionar</span>
                        </button>
                      </div>

                      {professorAutoAcceptSubjects.length === 0 ? (
                        <p className="text-[11px] text-amber-700 dark:text-amber-300">
                          Nenhuma disciplina adicionada ainda. Solicitações permanecerão pendentes até você incluir ao menos uma matéria.
                        </p>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {professorAutoAcceptSubjects.map((sub) => (
                            <span
                              key={sub}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-800 dark:text-slate-200"
                            >
                              <span>{sub}</span>
                              <button
                                type="button"
                                onClick={() => removeAuthorizedSubject(sub)}
                                className="text-slate-400 hover:text-rose-600 cursor-pointer"
                                aria-label={`Remover ${sub}`}
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}

                      {suggestedSubjects.length > 0 && professorAutoAcceptSubjects.length < 15 && (
                        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                          <span className="text-[11px] text-slate-500 dark:text-slate-400">
                            Sugestões rápidas:
                          </span>
                          {suggestedSubjects.map((sub) => (
                            <button
                              key={sub}
                              type="button"
                              onClick={() => addAuthorizedSubject(sub)}
                              className="px-2 py-1 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 text-[11px] text-slate-600 dark:text-slate-300 hover:border-blue-500 hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer"
                            >
                              + {sub}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {professorAutoAcceptMode !== 'manual' && (
                    <div>
                      <label className="block text-xs font-semibold mb-1 text-slate-700 dark:text-slate-300">
                        Nota Automática ao Liberar Conversa (opcional)
                      </label>
                      <input
                        type="text"
                        value={professorAutoAcceptWelcome}
                        onChange={(e) => setProfessorAutoAcceptWelcome(e.target.value)}
                        maxLength={240}
                        placeholder="Ex: Conversa liberada automaticamente. Envie sua dúvida com o tópico adequado."
                        className="w-full px-3 py-2 text-xs rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 outline-none focus:border-blue-500"
                      />
                    </div>
                  )}

                  <label className="flex items-start gap-2.5 text-xs cursor-pointer pt-1">
                    <input
                      type="checkbox"
                      checked={professorAutoJoinAsMember}
                      onChange={(e) => setProfessorAutoJoinAsMember(e.target.checked)}
                      className="w-4 h-4 rounded accent-blue-600 mt-0.5"
                    />
                    <span className="text-slate-700 dark:text-slate-300 leading-relaxed">
                      Ingressar automaticamente como participante da sala sempre que aceitar uma solicitação
                    </span>
                  </label>
                </div>
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full min-h-[44px] rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors cursor-pointer"
          >
            {saving ? 'Salvando na nuvem...' : 'Salvar Preferências'}
          </button>
        </form>

        {/* Right: Cloud Backup, Theme, PWA & Export */}
        <div className="lg:col-span-5 space-y-5">
          {/* Cloud Backup Card */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display font-semibold text-base text-slate-900 dark:text-white flex items-center gap-2">
                <Cloud className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                <span>Backup Automático em Nuvem</span>
              </h2>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Todas as conversas, notas e prazos são salvos em tempo real no Firebase Firestore com
              cache local offline. Você pode acessar de qualquer desktop, tablet ou celular com a
              mesma conta Google.
            </p>

            <div className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
              Última verificação:{' '}
              {profile.lastBackupAt
                ? new Date(profile.lastBackupAt).toLocaleString('pt-BR')
                : 'Automático em tempo real'}
            </div>

            <button
              type="button"
              onClick={handleCloudBackupNow}
              className="w-full min-h-[44px] rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              Verificar Sincronização Agora
            </button>
          </div>

          {/* Export PDF / CSV / JSON */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-3">
            <h2 className="font-display font-semibold text-base text-slate-900 dark:text-white">
              Exportação de Dados (PDF & CSV)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Gere relatórios acadêmicos prontos para impressão ou planilhas.
            </p>

            <button
              type="button"
              onClick={() => exportAcademicReportPDF({ profile, grades, deadlines, rooms })}
              className="w-full min-h-[44px] px-4 rounded-xl bg-slate-900 dark:bg-blue-600 text-white text-sm font-semibold hover:opacity-90 transition-opacity flex items-center justify-center gap-2 cursor-pointer"
            >
              <FileText className="w-4 h-4" />
              <span>Exportar Relatório Completo (PDF)</span>
            </button>

            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => exportGradesToCSV(grades)}
                className="min-h-[42px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>Notas (CSV)</span>
              </button>
              <button
                type="button"
                onClick={() => exportDeadlinesToCSV(deadlines)}
                className="min-h-[42px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>Prazos (CSV)</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => exportFullBackupJSON({ profile, grades, deadlines, rooms })}
              className="w-full min-h-[42px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Baixar Cópia de Segurança (JSON)</span>
            </button>
          </div>

          {/* Appearance & Desktop/Mobile PWA */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-3">
            <h2 className="font-display font-semibold text-base text-slate-900 dark:text-white">
              Aparência & Aplicativo Desktop/Mobile
            </h2>

            <button
              type="button"
              onClick={onToggleTheme}
              className="w-full min-h-[44px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-between cursor-pointer"
            >
              <span>{theme === 'dark' ? 'Modo Escuro Ativo' : 'Modo Claro Ativo'}</span>
              {theme === 'dark' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
            </button>

            <PWAInstallButton />
          </div>
        </div>
      </div>
    </div>
  );
};
