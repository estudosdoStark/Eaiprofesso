import React, { useState } from 'react';
import { Download, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        onClick={install}
        type="button"
        className="w-full flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition-colors cursor-pointer whitespace-nowrap shrink-0 min-h-[44px]"
      >
        <Download className="w-4 h-4 shrink-0" />
        <span>{compact ? 'Instalar' : 'Instalar Aplicativo'}</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          onClick={() => setShowIOSGuide(true)}
          type="button"
          className="w-full flex items-center justify-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer whitespace-nowrap shrink-0 min-h-[44px]"
        >
          <Smartphone className="w-4 h-4 shrink-0" />
          <span>Instalar no iOS</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4">
            <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-xl">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Instalar no iPhone ou iPad
                </h3>
                <button
                  onClick={() => setShowIOSGuide(false)}
                  className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                  aria-label="Fechar"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="mt-3 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                1. Toque no botão <strong>Compartilhar</strong> na barra do Safari.<br />
                2. Role para baixo e selecione <strong>Adicionar à Tela de Início</strong>.
              </p>
              <button
                onClick={() => setShowIOSGuide(false)}
                className="mt-5 w-full rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
              >
                Entendi
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
