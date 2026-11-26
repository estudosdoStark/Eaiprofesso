import React, { useEffect, useMemo, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import {
  AlertCircle,
  Bell,
  Calendar,
  CalendarCheck,
  CalendarPlus,
  CheckCircle2,
  Clock,
  Download,
  ExternalLink,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { exportDeadlinesToCSV } from '../lib/exportUtils';
import {
  createDeadlineCalendarEvent,
  deleteCalendarEvent,
  fetchUpcomingCalendarEvents,
} from '../lib/googleCalendar';
import { requestNotificationPermission, sendPushNotification } from '../lib/notifications';
import {
  DeadlineItem,
  DeadlinePriority,
  DeadlineStatus,
  DeadlineType,
  GoogleCalendarEvent,
  UserProfile,
} from '../types/academic';

interface DeadlinesCalendarViewProps {
  profile: UserProfile;
  deadlines: DeadlineItem[];
  accessToken: string | null;
  onReconnectGoogle: () => Promise<void>;
  onAwardXp: (amount: number, reason: string) => void;
}

type ConfirmAction =
  | { kind: 'sync_one'; item: DeadlineItem }
  | { kind: 'sync_all'; items: DeadlineItem[] }
  | { kind: 'unsync_one'; item: DeadlineItem };

export const DeadlinesCalendarView: React.FC<DeadlinesCalendarViewProps> = ({
  profile,
  deadlines,
  accessToken,
  onReconnectGoogle,
  onAwardXp,
}) => {
  const [filterType, setFilterType] = useState<'all' | DeadlineType>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'done'>('all');

  const [calendarEvents, setCalendarEvents] = useState<GoogleCalendarEvent[]>([]);
  const [loadingCalendar, setLoadingCalendar] = useState(false);
  const [calendarError, setCalendarError] = useState<string | null>(null);
  const [syncBusy, setSyncBusy] = useState(false);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);

  // Add Deadline modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('');
  const [type, setType] = useState<DeadlineType>('trabalho');
  const [dueDate, setDueDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [dueTime, setDueTime] = useState('23:59');
  const [priority, setPriority] = useState<DeadlinePriority>('high');
  const [reminderMinutes, setReminderMinutes] = useState(
    String(profile.defaultReminderMinutes || 60)
  );
  const [reminderEnabled, setReminderEnabled] = useState(true);
  const [notes, setNotes] = useState('');

  const loadGoogleEvents = async () => {
    if (!accessToken) return;
    setLoadingCalendar(true);
    setCalendarError(null);
    try {
      const items = await fetchUpcomingCalendarEvents(accessToken);
      setCalendarEvents(items);
    } catch (err) {
      setCalendarError(
        err instanceof Error ? err.message : 'Não foi possível ler os eventos do Google Calendar.'
      );
    } finally {
      setLoadingCalendar(false);
    }
  };

  useEffect(() => {
    if (accessToken) {
      loadGoogleEvents();
    }
  }, [accessToken]);

  const sortedDeadlines = useMemo(() => {
    return [...deadlines]
      .filter((d) => {
        if (filterType !== 'all' && d.type !== filterType) return false;
        if (filterStatus === 'pending' && d.status !== 'pending') return false;
        if (filterStatus === 'done' && d.status === 'pending') return false;
        return true;
      })
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }, [deadlines, filterType, filterStatus]);

  const unsyncedPending = useMemo(
    () => deadlines.filter((d) => d.status === 'pending' && !d.googleCalendarEventId),
    [deadlines]
  );

  const handleCreateDeadline = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !subject.trim() || !dueDate) return;

    try {
      await addDoc(collection(db, 'users', profile.uid, 'deadlines'), {
        userId: profile.uid,
        title: title.trim().slice(0, 180),
        subject: subject.trim().slice(0, 120),
        type,
        dueDate,
        dueTime: dueTime || '23:59',
        status: 'pending',
        priority,
        reminderMinutes: Math.max(0, Number(reminderMinutes) || 60),
        reminderEnabled,
        notes: notes.trim().slice(0, 800),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setShowAddModal(false);
      setTitle('');
      setSubject('');
      setNotes('');
      onAwardXp(15, 'Novo prazo acadêmico cadastrado');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `users/${profile.uid}/deadlines`);
    }
  };

  const handleToggleComplete = async (item: DeadlineItem) => {
    const nextStatus: DeadlineStatus = item.status === 'pending' ? 'completed' : 'pending';
    try {
      await updateDoc(doc(db, 'users', profile.uid, 'deadlines', item.id), {
        status: nextStatus,
        updatedAt: serverTimestamp(),
      });
      if (nextStatus === 'completed') {
        onAwardXp(40, `Prazo concluído: ${item.title}`);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${profile.uid}/deadlines/${item.id}`);
    }
  };

  const handleDeleteDeadline = async (item: DeadlineItem) => {
    try {
      await deleteDoc(doc(db, 'users', profile.uid, 'deadlines', item.id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `users/${profile.uid}/deadlines/${item.id}`);
    }
  };

  const handleTestReminderPush = async (item: DeadlineItem) => {
    const perm = await requestNotificationPermission();
    if (perm === 'granted') {
      sendPushNotification(
        `Lembrete Eai Professô · ${item.subject}`,
        `${item.title} vence em ${item.dueDate} às ${item.dueTime || '23:59'}.`,
        `deadline-${item.id}`
      );
    }
  };

  const executeConfirmedCalendarAction = async () => {
    if (!confirmAction || !accessToken) return;
    setSyncBusy(true);
    setCalendarError(null);

    try {
      if (confirmAction.kind === 'sync_one') {
        const ev = await createDeadlineCalendarEvent(accessToken, confirmAction.item);
        await updateDoc(doc(db, 'users', profile.uid, 'deadlines', confirmAction.item.id), {
          googleCalendarEventId: ev.id,
          updatedAt: serverTimestamp(),
        });
        onAwardXp(30, 'Prazo sincronizado com Google Calendar');
      } else if (confirmAction.kind === 'sync_all') {
        for (const item of confirmAction.items) {
          const ev = await createDeadlineCalendarEvent(accessToken, item);
          await updateDoc(doc(db, 'users', profile.uid, 'deadlines', item.id), {
            googleCalendarEventId: ev.id,
            updatedAt: serverTimestamp(),
          });
        }
        onAwardXp(50, 'Agenda acadêmica sincronizada com Google Calendar');
      } else if (confirmAction.kind === 'unsync_one') {
        if (confirmAction.item.googleCalendarEventId) {
          await deleteCalendarEvent(accessToken, confirmAction.item.googleCalendarEventId);
        }
        await updateDoc(doc(db, 'users', profile.uid, 'deadlines', confirmAction.item.id), {
          googleCalendarEventId: '',
          updatedAt: serverTimestamp(),
        });
      }
      await loadGoogleEvents();
    } catch (err) {
      setCalendarError(
        err instanceof Error ? err.message : 'Erro ao atualizar o Google Calendar.'
      );
    } finally {
      setSyncBusy(false);
      setConfirmAction(null);
    }
  };

  const reminderLabel = (mins: number) => {
    if (mins >= 1440) return `${Math.round(mins / 1440)} dia(s) antes`;
    if (mins >= 60) return `${Math.round(mins / 60)} hora(s) antes`;
    return `${mins} min antes`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display font-bold text-2xl text-slate-900 dark:text-white">
            Prazos, Provas e Google Calendar
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">
            Controle entregas acadêmicas, personalize lembretes push e sincronize com sua agenda Google.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => exportDeadlinesToCSV(deadlines)}
            className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center gap-2 cursor-pointer whitespace-nowrap"
          >
            <Download className="w-4 h-4" />
            <span>CSV Prazos</span>
          </button>
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="min-h-[44px] px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors flex items-center gap-2 cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>Novo Prazo</span>
          </button>
        </div>
      </div>

      {/* Top Summary Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Entregas Pendentes
          </p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-display font-bold tabular-nums text-slate-900 dark:text-white">
              {deadlines.filter((d) => d.status === 'pending').length}
            </span>
            <span className="text-sm text-slate-500 tabular-nums">
              de {deadlines.length} registradas
            </span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Vencimento em 7 Dias
          </p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-display font-bold tabular-nums text-amber-600 dark:text-amber-400">
              {
                deadlines.filter((d) => {
                  if (d.status !== 'pending') return false;
                  const diff =
                    (new Date(`${d.dueDate}T23:59:59`).getTime() - Date.now()) /
                    (1000 * 60 * 60 * 24);
                  return diff >= -1 && diff <= 7;
                }).length
              }
            </span>
            <span className="text-sm text-slate-500">prioritárias</span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Sincronizados no Calendar
          </p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-display font-bold tabular-nums text-blue-600 dark:text-blue-400">
              {deadlines.filter((d) => Boolean(d.googleCalendarEventId)).length}
            </span>
            <span className="text-sm text-slate-500">eventos vinculados</span>
          </div>
        </div>
      </div>

      {/* Main Split: Left Academic Deadlines | Right Google Calendar Separation */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Left: Academic Deadlines */}
        <div className="xl:col-span-7 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-x-auto">
              {[
                { key: 'all', label: 'Todos' },
                { key: 'prova', label: 'Provas' },
                { key: 'trabalho', label: 'Trabalhos' },
                { key: 'atividade', label: 'Atividades' },
              ].map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setFilterType(t.key as typeof filterType)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                    filterType === t.key
                      ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              {[
                { key: 'all', label: 'Tudo' },
                { key: 'pending', label: 'Pendentes' },
                { key: 'done', label: 'Concluídos' },
              ].map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setFilterStatus(s.key as typeof filterStatus)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                    filterStatus === s.key
                      ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl divide-y divide-slate-100 dark:divide-slate-800">
            {sortedDeadlines.length === 0 ? (
              <div className="p-10 text-center text-sm text-slate-500 dark:text-slate-400">
                Nenhum prazo encontrado neste filtro.
              </div>
            ) : (
              sortedDeadlines.map((item) => {
                const isDone = item.status !== 'pending';
                const isSynced = Boolean(item.googleCalendarEventId);
                return (
                  <div
                    key={item.id}
                    className="p-4 sm:p-5 flex flex-col gap-3 hover:bg-slate-50/70 dark:hover:bg-slate-800/30 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        <button
                          type="button"
                          onClick={() => handleToggleComplete(item)}
                          className={`mt-0.5 w-6 h-6 rounded-lg border flex items-center justify-center shrink-0 transition-colors cursor-pointer ${
                            isDone
                              ? 'bg-emerald-600 border-emerald-600 text-white'
                              : 'border-slate-300 dark:border-slate-600 hover:border-blue-500'
                          }`}
                          aria-label={isDone ? 'Reabrir prazo' : 'Concluir prazo'}
                        >
                          {isDone && <CheckCircle2 className="w-4 h-4" />}
                        </button>

                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                            <span className="font-semibold text-blue-600 dark:text-blue-400">
                              {item.subject}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span className="capitalize">{item.type}</span>
                            <span aria-hidden="true">·</span>
                            <span className="tabular-nums font-mono">
                              {item.dueDate} {item.dueTime || '23:59'}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>
                              {item.priority === 'high'
                                ? 'Prioridade Alta'
                                : item.priority === 'medium'
                                ? 'Prioridade Média'
                                : 'Prioridade Normal'}
                            </span>
                          </div>

                          <h3
                            className={`font-display font-semibold text-base mt-1 ${
                              isDone
                                ? 'line-through text-slate-400 dark:text-slate-500'
                                : 'text-slate-900 dark:text-white'
                            }`}
                          >
                            {item.title}
                          </h3>

                          {item.notes && (
                            <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                              {item.notes}
                            </p>
                          )}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleDeleteDeadline(item)}
                        className="p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer shrink-0"
                        aria-label="Excluir prazo"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="pl-9 flex flex-wrap items-center gap-3 text-xs">
                      <button
                        type="button"
                        onClick={() => handleTestReminderPush(item)}
                        className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 font-medium cursor-pointer"
                      >
                        <Bell className="w-3.5 h-3.5" />
                        <span>
                          {item.reminderEnabled
                            ? `Alerta ${reminderLabel(item.reminderMinutes)} (Testar)`
                            : 'Lembrete desativado'}
                        </span>
                      </button>

                      {accessToken && (
                        <>
                          {isSynced ? (
                            <button
                              type="button"
                              onClick={() => setConfirmAction({ kind: 'unsync_one', item })}
                              className="inline-flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 font-semibold hover:underline cursor-pointer"
                            >
                              <CalendarCheck className="w-3.5 h-3.5" />
                              <span>Sincronizado (Remover do Calendar)</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmAction({ kind: 'sync_one', item })}
                              className="inline-flex items-center gap-1.5 text-blue-600 dark:text-blue-400 font-semibold hover:underline cursor-pointer"
                            >
                              <CalendarPlus className="w-3.5 h-3.5" />
                              <span>Enviar para Google Calendar</span>
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right: Google Calendar Live Sync Panel */}
        <div className="xl:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 space-y-5">
          <div className="flex items-start justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
            <div>
              <h2 className="font-display font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
                <Calendar className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span>Agenda Google Calendar</span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Compare compromissos pessoais com entregas acadêmicas.
              </p>
            </div>

            {accessToken && (
              <button
                type="button"
                onClick={loadGoogleEvents}
                disabled={loadingCalendar}
                className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                aria-label="Atualizar agenda Google"
              >
                <RefreshCw className={`w-4 h-4 ${loadingCalendar ? 'animate-spin' : ''}`} />
              </button>
            )}
          </div>

          {!accessToken ? (
            <div className="space-y-4 py-4">
              <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                Conecte sua sessão ao Google Calendar para visualizar seus eventos e enviar prazos de
                provas e trabalhos automaticamente para sua agenda.
              </p>
              <button
                type="button"
                onClick={onReconnectGoogle}
                className="w-full min-h-[44px] rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors cursor-pointer"
              >
                Conectar Google Calendar
              </button>
            </div>
          ) : (
            <>
              {unsyncedPending.length > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    setConfirmAction({ kind: 'sync_all', items: unsyncedPending })
                  }
                  className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-blue-600 text-white text-xs sm:text-sm font-semibold hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 cursor-pointer"
                >
                  <CalendarPlus className="w-4 h-4 shrink-0" />
                  <span>
                    Sincronizar {unsyncedPending.length} prazo(s) pendente(s) no Calendar
                  </span>
                </button>
              )}

              {calendarError && (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{calendarError}</span>
                </div>
              )}

              {loadingCalendar ? (
                <div className="space-y-2.5">
                  <div className="h-14 rounded-xl bg-slate-100 dark:bg-slate-800 animate-pulse" />
                  <div className="h-14 rounded-xl bg-slate-100 dark:bg-slate-800 animate-pulse" />
                </div>
              ) : calendarEvents.length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">
                  Nenhum evento encontrado nos próximos 45 dias na sua agenda primária.
                </div>
              ) : (
                <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
                  {calendarEvents.map((ev) => {
                    const isAcademic =
                      ev.summary?.startsWith('[Eai Professô') ||
                      ev.summary?.startsWith('[Tinder 2.0') ||
                      ev.summary?.startsWith('[AulaViva');
                    const rawStart = ev.start?.dateTime || ev.start?.date || '';
                    const formattedDate = rawStart
                      ? new Date(rawStart).toLocaleString('pt-BR', {
                          day: '2-digit',
                          month: '2-digit',
                          hour: ev.start?.dateTime ? '2-digit' : undefined,
                          minute: ev.start?.dateTime ? '2-digit' : undefined,
                        })
                      : '';
                    return (
                      <div
                        key={ev.id}
                        className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 flex items-start justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                            <span
                              className={
                                isAcademic
                                  ? 'text-blue-600 dark:text-blue-400 font-semibold'
                                  : 'text-slate-500'
                              }
                            >
                              {isAcademic ? 'Acadêmico' : 'Agenda Pessoal'}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span className="tabular-nums">{formattedDate}</span>
                          </p>
                          <p className="text-sm font-semibold text-slate-900 dark:text-white truncate mt-0.5">
                            {ev.summary || 'Evento sem título'}
                          </p>
                        </div>

                        {ev.htmlLink && (
                          <a
                            href={ev.htmlLink}
                            target="_blank"
                            rel="noreferrer"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 shrink-0"
                            aria-label="Abrir no Google Calendar"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Add Deadline Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-bold text-lg text-slate-900 dark:text-white">
                Novo Prazo ou Prova
              </h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateDeadline} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold mb-1">Título</label>
                <input
                  required
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ex: Entrega do Trabalho Final"
                  className="w-full px-3 py-2 text-sm rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1">Disciplina</label>
                  <input
                    required
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="Ex: Estruturas de Dados"
                    className="w-full px-3 py-2 text-sm rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Categoria</label>
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value as DeadlineType)}
                    className="w-full px-3 py-2 text-sm rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-none"
                  >
                    <option value="prova">Prova</option>
                    <option value="trabalho">Trabalho</option>
                    <option value="atividade">Atividade</option>
                    <option value="reuniao">Orientação / Plantão</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1">Data</label>
                  <input
                    required
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Horário</label>
                  <input
                    type="time"
                    value={dueTime}
                    onChange={(e) => setDueTime(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-none"
                  />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-xs font-semibold mb-1">Prioridade</label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as DeadlinePriority)}
                    className="w-full px-3 py-2 text-sm rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-none"
                  >
                    <option value="high">Alta</option>
                    <option value="medium">Média</option>
                    <option value="low">Normal</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                <div>
                  <label className="block text-xs font-semibold mb-1">
                    Lembrete Personalizado
                  </label>
                  <select
                    value={reminderMinutes}
                    onChange={(e) => setReminderMinutes(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-none"
                  >
                    <option value="15">15 minutos antes</option>
                    <option value="60">1 hora antes</option>
                    <option value="180">3 horas antes</option>
                    <option value="1440">1 dia antes</option>
                    <option value="4320">3 dias antes</option>
                  </select>
                </div>

                <label className="flex items-center gap-2.5 pt-4 cursor-pointer text-sm">
                  <input
                    type="checkbox"
                    checked={reminderEnabled}
                    onChange={(e) => setReminderEnabled(e.target.checked)}
                    className="w-4 h-4 rounded accent-blue-600"
                  />
                  <span>Ativar notificação push</span>
                </label>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">Anotações</label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Instruções de entrega, sala da prova ou bibliografia..."
                  className="w-full px-3 py-2 text-sm rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-none resize-none"
                />
              </div>

              <button
                type="submit"
                className="w-full min-h-[44px] rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors cursor-pointer"
              >
                Salvar Prazo
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Mandatory User Confirmation Dialog for Google Calendar Mutations */}
      {confirmAction && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4 shadow-xl">
            <div className="flex items-start gap-3">
              <Clock className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
              <div>
                <h3 className="font-display font-bold text-base text-slate-900 dark:text-white">
                  {confirmAction.kind === 'unsync_one'
                    ? 'Remover evento do Google Calendar?'
                    : 'Confirmar criação no Google Calendar'}
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-300 mt-1.5 leading-relaxed">
                  {confirmAction.kind === 'sync_one' && (
                    <>
                      Deseja adicionar <strong>{confirmAction.item.title}</strong> (
                      {confirmAction.item.dueDate} às {confirmAction.item.dueTime || '23:59'}) à sua
                      agenda principal do Google Calendar?
                    </>
                  )}
                  {confirmAction.kind === 'sync_all' && (
                    <>
                      Deseja criar <strong>{confirmAction.items.length} evento(s)</strong> no seu
                      Google Calendar para os seguintes prazos pendentes?
                    </>
                  )}
                  {confirmAction.kind === 'unsync_one' && (
                    <>
                      Esta ação excluirá o evento <strong>{confirmAction.item.title}</strong> do seu
                      Google Calendar. O prazo continuará salvo no Eai Professô.
                    </>
                  )}
                </p>

                {confirmAction.kind === 'sync_all' && (
                  <ul className="mt-2.5 space-y-1 text-xs text-slate-500 dark:text-slate-400 max-h-32 overflow-y-auto">
                    {confirmAction.items.map((it) => (
                      <li key={it.id} className="truncate">
                        • {it.title} ({it.dueDate})
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setConfirmAction(null)}
                disabled={syncBusy}
                className="min-h-[44px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={executeConfirmedCalendarAction}
                disabled={syncBusy}
                className={`min-h-[44px] px-4 rounded-xl text-sm font-semibold text-white transition-colors cursor-pointer ${
                  confirmAction.kind === 'unsync_one'
                    ? 'bg-rose-600 hover:bg-rose-700'
                    : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {syncBusy
                  ? 'Sincronizando...'
                  : confirmAction.kind === 'unsync_one'
                  ? 'Confirmar Remoção'
                  : 'Confirmar Sincronização'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
