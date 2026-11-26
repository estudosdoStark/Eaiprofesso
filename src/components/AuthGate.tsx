import React, { useState } from 'react';
import { motion } from 'motion/react';
import {
  Award,
  CalendarCheck,
  CheckCircle2,
  Clock,
  Cloud,
  FileSpreadsheet,
  MessageSquare,
  Moon,
  ShieldCheck,
  Sun,
} from 'lucide-react';
import brandEmblem from '../assets/images/app_brand_emblem_1794560330007.jpg';
import profMathAvatar from '../assets/images/avatar_professor_math_1794560329276.jpg';
import { ThemeMode } from '../types/academic';
import { PWAInstallButton } from './PWAInstallButton';

interface AuthGateProps {
  onSignIn: () => Promise<void>;
  theme: ThemeMode;
  onToggleTheme: () => void;
  authError: string | null;
}

export const AuthGate: React.FC<AuthGateProps> = ({
  onSignIn,
  theme,
  onToggleTheme,
  authError,
}) => {
  const [loading, setLoading] = useState(false);

  const handleLoginClick = async () => {
    setLoading(true);
    try {
      await onSignIn();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col">
      {/* Top Bar Contract: 3 clean zones */}
      <header className="w-full border-b border-slate-200/80 dark:border-slate-800/80 bg-white/80 dark:bg-slate-950/80 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between gap-8">
          <div className="flex items-center gap-3 whitespace-nowrap shrink-0">
            <img
              src={brandEmblem}
              alt="Emblema Eai Professô"
              referrerPolicy="no-referrer"
              className="w-8 h-8 rounded-lg object-cover border border-slate-200 dark:border-slate-800"
            />
            <span className="text-lg font-display font-bold tracking-tight">Eai Professô</span>
          </div>

          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600 dark:text-slate-300">
            <a
              href="#comunicacao"
              className="hover:text-slate-950 dark:hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              Comunicação
            </a>
            <a
              href="#desempenho"
              className="hover:text-slate-950 dark:hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              Notas e Prazos
            </a>
            <a
              href="#agenda"
              className="hover:text-slate-950 dark:hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              Google Calendar
            </a>
            <a
              href="#recursos"
              className="hover:text-slate-950 dark:hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              Nuvem & Offline
            </a>
          </nav>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={onToggleTheme}
              className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              aria-label={theme === 'dark' ? 'Ativar modo claro' : 'Ativar modo escuro'}
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-6 py-10 lg:py-16 space-y-14">
        {/* Split Hero */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-stretch">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
            className="lg:col-span-6 flex flex-col justify-center space-y-6"
          >
            <p className="text-sm font-semibold text-blue-600 dark:text-blue-400">
              Comunicação Acadêmica · Mobile, Tablet e Desktop
            </p>

            <h1
              className="font-display font-bold tracking-tight text-slate-950 dark:text-white leading-[1.1]"
              style={{ fontSize: 'clamp(2.2rem, 3.8vw, 3.35rem)', textWrap: 'balance' }}
            >
              Converse com seus professores e organize todo o semestre em um só lugar.
            </h1>

            <p className="text-base text-slate-600 dark:text-slate-300 max-w-xl leading-relaxed">
              Separe a rotina acadêmica da vida pessoal com bate-papo direto por texto, áudio e
              arquivos, controle de médias e prazos, gamificação e sincronização real com o Google Calendar.
            </p>

            <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-3.5">
              <button
                type="button"
                onClick={handleLoginClick}
                disabled={loading}
                className="gsi-material-button disabled:opacity-60"
              >
                <div className="gsi-material-button-content-wrapper">
                  <div className="gsi-material-button-icon">
                    <svg
                      version="1.1"
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 48 48"
                      style={{ display: 'block' }}
                    >
                      <path
                        fill="#EA4335"
                        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                      />
                      <path
                        fill="#4285F4"
                        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                      />
                      <path
                        fill="#34A853"
                        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                      />
                      <path fill="none" d="M0 0h48v48H0z" />
                    </svg>
                  </div>
                  <span className="gsi-material-button-contents">
                    {loading ? 'Conectando...' : 'Entrar com Google'}
                  </span>
                </div>
              </button>

              <div className="sm:w-48">
                <PWAInstallButton />
              </div>
            </div>

            {authError && (
              <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-sm text-rose-700 dark:text-rose-300">
                {authError}
              </div>
            )}

            <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-500 dark:text-slate-400">
              <span>Backup automático em nuvem</span>
              <span aria-hidden="true">·</span>
              <span>Suporte offline com sincronização</span>
              <span aria-hidden="true">·</span>
              <span>Exportação PDF e CSV</span>
            </div>
          </motion.div>

          {/* Right Column: Structured Product Preview Surface */}
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28, delay: 0.05, ease: [0.16, 1, 0.3, 1] }}
            className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden flex flex-col justify-between"
          >
            {/* Preview Header */}
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4 bg-slate-50/70 dark:bg-slate-950/40">
              <div className="flex items-center gap-3 min-w-0">
                <img
                  src={profMathAvatar}
                  alt="Professor de Cálculo"
                  referrerPolicy="no-referrer"
                  className="w-10 h-10 rounded-full object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                />
                <div className="min-w-0">
                  <p className="font-display font-semibold text-sm text-slate-900 dark:text-white truncate">
                    Cálculo II · Plantão de Dúvidas
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                    Prof. Ricardo Mendes · Conversa autorizada
                  </p>
                </div>
              </div>
              <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5 shrink-0">
                <ShieldCheck className="w-4 h-4" />
                <span>Ativa</span>
              </span>
            </div>

            {/* Preview Body */}
            <div className="p-6 space-y-5 flex-1">
              <div className="space-y-3">
                <div className="max-w-[85%] rounded-2xl px-4 py-3 bg-slate-100 dark:bg-slate-800/80 text-sm text-slate-800 dark:text-slate-200">
                  <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                    Lucas · Dúvida · 14:12
                  </p>
                  <p className="leading-relaxed">
                    Professor, na questão 4 da lista podemos aplicar integração por partes direto?
                  </p>
                </div>

                <div className="max-w-[85%] ml-auto rounded-2xl px-4 py-3 bg-blue-600 text-white text-sm">
                  <p className="text-[11px] font-medium text-blue-100 mb-1">
                    Prof. Ricardo · Material · 14:14
                  </p>
                  <p className="leading-relaxed">
                    Sim! Use u = ln(x) e dv = x dx. Deixei a resolução passo a passo anexada na sala.
                  </p>
                </div>
              </div>

              {/* Clean Metric Divider Row */}
              <div className="pt-5 border-t border-slate-200 dark:border-slate-800 grid grid-cols-3 gap-4">
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Média Ponderada</p>
                  <p className="font-display font-bold text-xl tabular-nums text-slate-900 dark:text-white mt-0.5">
                    8.85
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Próxima Entrega</p>
                  <p className="font-display font-bold text-xl tabular-nums text-slate-900 dark:text-white mt-0.5">
                    23:59
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Engajamento</p>
                  <p className="font-display font-bold text-xl tabular-nums text-blue-600 dark:text-blue-400 mt-0.5">
                    +120 XP
                  </p>
                </div>
              </div>
            </div>

            {/* Preview Footer Summary */}
            <div className="px-6 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 flex items-center justify-between gap-4 text-xs text-slate-600 dark:text-slate-300">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>Controle de moderação pelo professor</span>
              </span>
              <span className="flex items-center gap-1.5 font-mono tabular-nums text-slate-500 dark:text-slate-400">
                <Clock className="w-3.5 h-3.5" />
                <span>Tempo real</span>
              </span>
            </div>
          </motion.div>
        </section>

        {/* Full-Width 4-Column Capability Strip Below Hero Split */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-2 border-t border-slate-200 dark:border-slate-800">
          <div id="comunicacao" className="pt-5 space-y-2">
            <MessageSquare className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <h2 className="font-display font-semibold text-sm text-slate-900 dark:text-white">
              Chat com controle docente
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Envie textos, áudios, fotos e anexos com aprovação de solicitações e início direto pelo professor.
            </p>
          </div>

          <div id="desempenho" className="pt-5 space-y-2">
            <FileSpreadsheet className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            <h2 className="font-display font-semibold text-sm text-slate-900 dark:text-white">
              Boletim & prazos claros
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Média ponderada automática por disciplina, histórico de feedbacks e exportação para PDF e CSV.
            </p>
          </div>

          <div id="agenda" className="pt-5 space-y-2">
            <CalendarCheck className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <h2 className="font-display font-semibold text-sm text-slate-900 dark:text-white">
              Sincronização Google Calendar
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Envie provas e trabalhos para sua agenda Google e compare com compromissos pessoais.
            </p>
          </div>

          <div id="recursos" className="pt-5 space-y-2">
            <div className="flex items-center gap-2">
              <Cloud className="w-5 h-5 text-slate-600 dark:text-slate-300" />
              <Award className="w-4 h-4 text-amber-500" />
            </div>
            <h2 className="font-display font-semibold text-sm text-slate-900 dark:text-white">
              Gamificação & modo offline
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Edite sem internet com sincronização em nuvem, ganhe XP e preserve seu horário de descanso.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
};
