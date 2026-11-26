import React, { useMemo, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { AlertTriangle, CheckCircle2, Clock, Download, Plus, Trash2, X } from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { exportGradesToCSV } from '../lib/exportUtils';
import { computeWeightedAverage } from '../lib/gamification';
import { GradeCategory, GradeEntry, GradeStatus, UserProfile } from '../types/academic';

interface GradesViewProps {
  profile: UserProfile;
  grades: GradeEntry[];
  onAwardXp: (amount: number, reason: string) => void;
}

export const GradesView: React.FC<GradesViewProps> = ({ profile, grades, onAwardXp }) => {
  const [filterCategory, setFilterCategory] = useState<'all' | GradeCategory>('all');
  const [filterSubject, setFilterSubject] = useState<string>('all');
  const [showModal, setShowModal] = useState(false);

  const [subject, setSubject] = useState('');
  const [professorName, setProfessorName] = useState('');
  const [assessmentTitle, setAssessmentTitle] = useState('');
  const [category, setCategory] = useState<GradeCategory>('prova');
  const [score, setScore] = useState('8.5');
  const [maxScore, setMaxScore] = useState('10');
  const [weight, setWeight] = useState('2');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [feedback, setFeedback] = useState('');
  const [status, setStatus] = useState<GradeStatus>('graded');

  const subjects = useMemo(
    () => Array.from(new Set(grades.map((g) => g.subject))).sort(),
    [grades]
  );

  const filteredGrades = useMemo(() => {
    return grades.filter((g) => {
      if (filterCategory !== 'all' && g.category !== filterCategory) return false;
      if (filterSubject !== 'all' && g.subject !== filterSubject) return false;
      return true;
    });
  }, [grades, filterCategory, filterSubject]);

  const overallAverage = useMemo(() => computeWeightedAverage(grades), [grades]);

  const subjectSummaries = useMemo(() => {
    const map = new Map<string, GradeEntry[]>();
    grades.forEach((g) => {
      const list = map.get(g.subject) || [];
      list.push(g);
      map.set(g.subject, list);
    });
    return Array.from(map.entries()).map(([subj, items]) => {
      const avg = computeWeightedAverage(items);
      return {
        subject: subj,
        professorName: items[0]?.professorName || '',
        average: avg,
        count: items.length,
      };
    });
  }, [grades]);

  const handleSaveGrade = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !assessmentTitle.trim() || !professorName.trim()) return;

    const numScore = Math.max(0, Math.min(1000, Number(score) || 0));
    const numMax = Math.max(1, Math.min(1000, Number(maxScore) || 10));
    const numWeight = Math.max(0.5, Math.min(100, Number(weight) || 1));

    try {
      await addDoc(collection(db, 'users', profile.uid, 'grades'), {
        userId: profile.uid,
        subject: subject.trim().slice(0, 120),
        professorName: professorName.trim().slice(0, 120),
        assessmentTitle: assessmentTitle.trim().slice(0, 160),
        category,
        score: numScore,
        maxScore: numMax,
        weight: numWeight,
        date,
        feedback: feedback.trim().slice(0, 500),
        status,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setShowModal(false);
      setSubject('');
      setProfessorName('');
      setAssessmentTitle('');
      setFeedback('');
      onAwardXp(20, 'Avaliação registrada no boletim');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `users/${profile.uid}/grades`);
    }
  };

  const handleToggleStatus = async (entry: GradeEntry) => {
    const nextStatus: GradeStatus = entry.status === 'graded' ? 'pending' : 'graded';
    try {
      await updateDoc(doc(db, 'users', profile.uid, 'grades', entry.id), {
        status: nextStatus,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${profile.uid}/grades/${entry.id}`);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'users', profile.uid, 'grades', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `users/${profile.uid}/grades/${id}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display font-bold text-2xl text-slate-900 dark:text-white">
            Monitoramento de Notas
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">
            Acompanhe médias ponderadas, feedbacks dos professores e histórico de avaliações.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => exportGradesToCSV(grades)}
            className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center gap-2 cursor-pointer whitespace-nowrap"
          >
            <Download className="w-4 h-4" />
            <span>Exportar CSV</span>
          </button>
          <button
            type="button"
            onClick={() => setShowModal(true)}
            className="min-h-[44px] px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors flex items-center gap-2 cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>Nova Nota</span>
          </button>
        </div>
      </div>

      {/* Top KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Média Ponderada Geral
          </p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-display font-bold tabular-nums text-slate-900 dark:text-white">
              {overallAverage.toFixed(2)}
            </span>
            <span className="text-sm text-slate-500 tabular-nums">/ 10,0</span>
          </div>
          <p className="mt-2 text-xs font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>
              {overallAverage >= 7
                ? 'Acima da meta de aprovação'
                : 'Atenção às próximas entregas'}
            </span>
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Avaliações Lançadas
          </p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-display font-bold tabular-nums text-slate-900 dark:text-white">
              {grades.filter((g) => g.status === 'graded').length}
            </span>
            <span className="text-sm text-slate-500 tabular-nums">
              de {grades.length} registradas
            </span>
          </div>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            Sincronizado automaticamente em nuvem
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Disciplinas Monitoradas
          </p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-display font-bold tabular-nums text-slate-900 dark:text-white">
              {subjectSummaries.length}
            </span>
            <span className="text-sm text-slate-500">matérias ativas</span>
          </div>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            Cálculo contínuo com suporte offline
          </p>
        </div>
      </div>

      {/* Subject Averages */}
      {subjectSummaries.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {subjectSummaries.map((s) => {
            const pct = Math.min(100, Math.round((s.average / 10) * 100));
            const isHealthy = s.average >= 7;
            return (
              <div
                key={s.subject}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-display font-semibold text-base text-slate-900 dark:text-white truncate">
                      {s.subject}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                      {s.professorName} · {s.count} avaliações
                    </p>
                  </div>
                  <span className="font-mono font-bold text-lg tabular-nums text-slate-900 dark:text-white shrink-0">
                    {s.average.toFixed(1)}
                  </span>
                </div>

                <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      isHealthy ? 'bg-emerald-600' : 'bg-amber-500'
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>

                <div className="flex items-center gap-1.5 text-xs font-medium">
                  {isHealthy ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      <span className="text-emerald-700 dark:text-emerald-400">Desempenho regular</span>
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                      <span className="text-amber-700 dark:text-amber-400">Reforçar estudos</span>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          {[
            { key: 'all', label: 'Todas' },
            { key: 'prova', label: 'Provas' },
            { key: 'trabalho', label: 'Trabalhos' },
            { key: 'atividade', label: 'Atividades' },
          ].map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setFilterCategory(tab.key as typeof filterCategory)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                filterCategory === tab.key
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <select
          value={filterSubject}
          onChange={(e) => setFilterSubject(e.target.value)}
          className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 outline-none"
        >
          <option value="all">Todas as disciplinas</option>
          {subjects.map((subj) => (
            <option key={subj} value={subj}>
              {subj}
            </option>
          ))}
        </select>
      </div>

      {/* Assessments Data Table (Desktop) & List (Mobile) */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
        {filteredGrades.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <p className="font-display font-semibold text-base text-slate-800 dark:text-slate-200">
              Nenhuma nota encontrada para o filtro selecionado
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Registre sua primeira prova, trabalho ou atividade para acompanhar sua média ponderada.
            </p>
            <button
              type="button"
              onClick={() => setShowModal(true)}
              className="px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 cursor-pointer"
            >
              Registrar Avaliação
            </button>
          </div>
        ) : (
          <>
            {/* Desktop High-Density Data Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 text-xs font-semibold text-slate-500 dark:text-slate-400">
                    <th className="py-3 px-5">Avaliação</th>
                    <th className="py-3 px-4">Disciplina</th>
                    <th className="py-3 px-4">Tipo</th>
                    <th className="py-3 px-4 text-right">Peso</th>
                    <th className="py-3 px-4">Data</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Nota</th>
                    <th className="py-3 px-5 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                  {filteredGrades.map((item) => {
                    const normalized10 = item.maxScore > 0 ? (item.score / item.maxScore) * 10 : 0;
                    return (
                      <tr
                        key={item.id}
                        className="hover:bg-slate-50/80 dark:hover:bg-slate-800/30 transition-colors"
                      >
                        <td className="py-3.5 px-5 max-w-xs">
                          <p className="font-semibold text-slate-900 dark:text-white truncate">
                            {item.assessmentTitle}
                          </p>
                          {item.feedback && (
                            <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                              {item.professorName}: {item.feedback}
                            </p>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-xs font-medium text-blue-600 dark:text-blue-400 whitespace-nowrap">
                          {item.subject}
                        </td>
                        <td className="py-3.5 px-4 text-xs text-slate-600 dark:text-slate-300 capitalize whitespace-nowrap">
                          {item.category}
                        </td>
                        <td className="py-3.5 px-4 text-xs font-mono tabular-nums text-right text-slate-600 dark:text-slate-300">
                          {item.weight}
                        </td>
                        <td className="py-3.5 px-4 text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400 whitespace-nowrap">
                          {item.date}
                        </td>
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => handleToggleStatus(item)}
                            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:underline cursor-pointer"
                          >
                            {item.status === 'graded' ? (
                              <>
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                                <span>Lançada</span>
                              </>
                            ) : (
                              <>
                                <Clock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                                <span>Pendente</span>
                              </>
                            )}
                          </button>
                        </td>
                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          <span className="font-mono font-bold text-base tabular-nums text-slate-900 dark:text-white">
                            {item.status === 'graded' ? item.score.toFixed(1) : '--'}
                          </span>
                          <span className="text-xs text-slate-500 tabular-nums">
                            {' '}
                            / {item.maxScore}
                          </span>
                          {item.status === 'graded' && item.maxScore !== 10 && (
                            <p className="text-[11px] text-slate-400 tabular-nums">
                              {normalized10.toFixed(1)}/10
                            </p>
                          )}
                        </td>
                        <td className="py-3.5 px-5 text-right">
                          <button
                            type="button"
                            onClick={() => handleDelete(item.id)}
                            className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                            aria-label="Excluir nota"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Compact Rows */}
            <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-800">
              {filteredGrades.map((item) => {
                const normalized10 = item.maxScore > 0 ? (item.score / item.maxScore) * 10 : 0;
                return (
                  <div key={item.id} className="p-4 flex flex-col gap-3">
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                        <span className="font-semibold text-blue-600 dark:text-blue-400">
                          {item.subject}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="capitalize">{item.category}</span>
                        <span aria-hidden="true">·</span>
                        <span className="tabular-nums">Peso {item.weight}</span>
                        <span aria-hidden="true">·</span>
                        <span className="tabular-nums font-mono">{item.date}</span>
                      </div>
                      <h4 className="font-display font-semibold text-sm text-slate-900 dark:text-white">
                        {item.assessmentTitle}
                      </h4>
                      {item.feedback && (
                        <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                          {item.professorName}: {item.feedback}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center justify-between gap-4">
                      <button
                        type="button"
                        onClick={() => handleToggleStatus(item)}
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:underline cursor-pointer"
                      >
                        {item.status === 'graded' ? (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                            <span>Lançada</span>
                          </>
                        ) : (
                          <>
                            <Clock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                            <span>Pendente</span>
                          </>
                        )}
                      </button>

                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <span className="font-mono font-bold text-base tabular-nums text-slate-900 dark:text-white">
                            {item.status === 'graded' ? item.score.toFixed(1) : '--'}
                          </span>
                          <span className="text-xs text-slate-500 tabular-nums">
                            {' '}
                            / {item.maxScore}
                          </span>
                          {item.status === 'graded' && item.maxScore !== 10 && (
                            <p className="text-[11px] text-slate-400 tabular-nums">
                              ({normalized10.toFixed(1)}/10)
                            </p>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() => handleDelete(item.id)}
                          className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                          aria-label="Excluir nota"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Add Grade Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-bold text-lg text-slate-900 dark:text-white">
                Registrar Nota ou Avaliação
              </h3>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveGrade} className="space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1">Disciplina</label>
                  <input
                    required
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="Ex: Cálculo III"
                    className="w-full px-3 py-2 text-sm rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Professor</label>
                  <input
                    required
                    type="text"
                    value={professorName}
                    onChange={(e) => setProfessorName(e.target.value)}
                    placeholder="Ex: Prof. Ricardo Mendes"
                    className="w-full px-3 py-2 text-sm rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">Título da Avaliação</label>
                <input
                  required
                  type="text"
                  value={assessmentTitle}
                  onChange={(e) => setAssessmentTitle(e.target.value)}
                  placeholder="Ex: Prova 2 — Campos Vetoriais"
                  className="w-full px-3 py-2 text-sm rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1">Tipo</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as GradeCategory)}
                    className="w-full px-2.5 py-2 text-sm rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-none"
                  >
                    <option value="prova">Prova</option>
                    <option value="trabalho">Trabalho</option>
                    <option value="atividade">Atividade</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Nota</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={score}
                    onChange={(e) => setScore(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-none tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Máxima</label>
                  <input
                    type="number"
                    step="0.5"
                    min="1"
                    value={maxScore}
                    onChange={(e) => setMaxScore(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-none tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Peso</label>
                  <input
                    type="number"
                    step="0.5"
                    min="0.5"
                    value={weight}
                    onChange={(e) => setWeight(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-none tabular-nums"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1">Data</label>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Status</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as GradeStatus)}
                    className="w-full px-3 py-2 text-sm rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-none"
                  >
                    <option value="graded">Nota lançada</option>
                    <option value="pending">Aguardando correção</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">Comentário / Feedback</label>
                <textarea
                  rows={2}
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  placeholder="Observação do professor ou anotação pessoal de revisão..."
                  className="w-full px-3 py-2 text-sm rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-none resize-none"
                />
              </div>

              <button
                type="submit"
                className="w-full min-h-[44px] rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors cursor-pointer"
              >
                Salvar Avaliação
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
