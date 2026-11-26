import React, { useEffect, useState } from 'react';
import {
  collection,
  doc,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { Award, CheckCircle2, Flame, Gift, Lock, Medal, Trophy } from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  BADGE_DEFINITIONS,
  calculateLevelFromXp,
  REWARDS_CATALOG,
} from '../lib/gamification';
import { PublicProfile, RewardItem, UserProfile } from '../types/academic';

interface GamificationViewProps {
  profile: UserProfile;
}

export const GamificationView: React.FC<GamificationViewProps> = ({ profile }) => {
  const [leaderboard, setLeaderboard] = useState<PublicProfile[]>([]);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  const levelInfo = calculateLevelFromXp(profile.xp);
  const unlockedIds = new Set(profile.badges || []);
  const claimedIds = new Set(profile.claimedRewards || []);

  useEffect(() => {
    const q = query(
      collection(db, 'public_profiles'),
      where('isPublic', '==', true),
      limit(50)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs
          .map((d) => d.data() as PublicProfile)
          .sort((a, b) => b.xp - a.xp)
          .slice(0, 15);
        setLeaderboard(list);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, 'public_profiles');
      }
    );
    return () => unsub();
  }, []);

  const handleClaimReward = async (reward: RewardItem) => {
    if (claimedIds.has(reward.id) || profile.xp < reward.costXp) return;
    setClaimingId(reward.id);
    setFeedbackMsg(null);
    try {
      const nextRewards = [...(profile.claimedRewards || []), reward.id].slice(0, 20);
      await updateDoc(doc(db, 'users', profile.uid), {
        claimedRewards: nextRewards,
        updatedAt: serverTimestamp(),
      });
      setFeedbackMsg(`Recompensa "${reward.title}" resgatada e salva no seu histórico!`);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${profile.uid}`);
    } finally {
      setClaimingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display font-bold text-2xl text-slate-900 dark:text-white">
          Gamificação & Engajamento
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">
          Ganhe XP interagindo com professores, resolvendo dúvidas e cumprindo seus prazos sem atraso.
        </p>
      </div>

      {/* Level & Streak Banner */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white font-display font-bold text-xl flex items-center justify-center tabular-nums">
                {levelInfo.level}
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  Nível Acadêmico Atual
                </p>
                <h2 className="font-display font-bold text-lg text-slate-900 dark:text-white">
                  {profile.displayName} · <span className="tabular-nums">{profile.xp} XP</span>
                </h2>
              </div>
            </div>

            <span className="text-xs font-mono font-semibold text-blue-600 dark:text-blue-400 tabular-nums">
              {levelInfo.currentLevelXp} / {levelInfo.nextLevelXp} XP
            </span>
          </div>

          <div className="w-full h-3 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
            <div
              className="h-full rounded-full bg-blue-600 transition-all duration-300"
              style={{ width: `${levelInfo.progressPercent}%` }}
            />
          </div>

          <p className="text-xs text-slate-500 dark:text-slate-400">
            Faltam <strong className="tabular-nums">{levelInfo.nextLevelXp - levelInfo.currentLevelXp} XP</strong> para alcançar o Nível {levelInfo.level + 1}.
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Sequência de Participação
            </span>
            <Flame className="w-5 h-5 text-amber-500" />
          </div>
          <div className="my-2">
            <span className="text-3xl font-display font-bold tabular-nums text-slate-900 dark:text-white">
              {profile.streakDays || 1} dias
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {unlockedIds.size} de {BADGE_DEFINITIONS.length} medalhas desbloqueadas
          </p>
        </div>
      </div>

      {feedbackMsg && (
        <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-sm text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{feedbackMsg}</span>
        </div>
      )}

      {/* Medals & Leaderboard */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Medals */}
        <div className="xl:col-span-7 space-y-4">
          <h2 className="font-display font-bold text-lg text-slate-900 dark:text-white flex items-center gap-2">
            <Medal className="w-5 h-5 text-amber-500" />
            <span>Medalhas de Conquista</span>
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {BADGE_DEFINITIONS.map((badge) => {
              const unlocked = unlockedIds.has(badge.id);
              return (
                <div
                  key={badge.id}
                  className={`rounded-2xl p-4 border transition-colors ${
                    unlocked
                      ? 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700'
                      : 'bg-slate-100/60 dark:bg-slate-900/40 border-slate-200/70 dark:border-slate-800/70 opacity-75'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                          unlocked
                            ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                            : 'bg-slate-200 dark:bg-slate-800 text-slate-400'
                        }`}
                      >
                        {unlocked ? <Award className="w-5 h-5" /> : <Lock className="w-4 h-4" />}
                      </div>
                      <div>
                        <h3 className="font-display font-semibold text-sm text-slate-900 dark:text-white">
                          {badge.title}
                        </h3>
                        <p className="text-[11px] font-mono text-slate-500 tabular-nums">
                          +{badge.xpBonus} XP · {unlocked ? 'Conquistada' : 'Bloqueada'}
                        </p>
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300 mt-2.5 leading-relaxed">
                    {badge.description}
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5">
                    Critério: {badge.requirementText}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Ranking Leaderboard */}
        <div className="xl:col-span-5 space-y-4">
          <h2 className="font-display font-bold text-lg text-slate-900 dark:text-white flex items-center gap-2">
            <Trophy className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <span>Ranking de Engajamento</span>
          </h2>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl divide-y divide-slate-100 dark:divide-slate-800">
            {leaderboard.length === 0 ? (
              <div className="p-6 text-center text-sm text-slate-500">
                Carregando classificação da turma...
              </div>
            ) : (
              leaderboard.map((entry, idx) => {
                const isSelf = entry.uid === profile.uid;
                return (
                  <div
                    key={entry.uid}
                    className={`px-4 py-3.5 flex items-center justify-between gap-3 ${
                      isSelf ? 'bg-blue-50/70 dark:bg-blue-950/30' : ''
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="w-6 text-center font-mono font-bold text-sm tabular-nums text-slate-500 dark:text-slate-400">
                        #{idx + 1}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                          {entry.displayName} {isSelf && '(Você)'}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {entry.role === 'professor' ? 'Professor' : 'Estudante'} · Nível{' '}
                          <span className="tabular-nums">{entry.level}</span>
                        </p>
                      </div>
                    </div>

                    <span className="font-mono font-bold text-sm tabular-nums text-blue-600 dark:text-blue-400 shrink-0">
                      {entry.xp} XP
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Rewards Catalog */}
      <div className="space-y-4">
        <h2 className="font-display font-bold text-lg text-slate-900 dark:text-white flex items-center gap-2">
          <Gift className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          <span>Recompensas Acadêmicas</span>
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {REWARDS_CATALOG.map((reward) => {
            const isClaimed = claimedIds.has(reward.id);
            const canAfford = profile.xp >= reward.costXp;
            return (
              <div
                key={reward.id}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 flex flex-col justify-between gap-4"
              >
                <div>
                  <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    {reward.category} · <span className="font-mono tabular-nums">{reward.costXp} XP</span>
                  </p>
                  <h3 className="font-display font-semibold text-sm text-slate-900 dark:text-white mt-1">
                    {reward.title}
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-slate-300 mt-2 leading-relaxed">
                    {reward.description}
                  </p>
                </div>

                <button
                  type="button"
                  disabled={isClaimed || !canAfford || claimingId === reward.id}
                  onClick={() => handleClaimReward(reward)}
                  className={`w-full min-h-[42px] rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                    isClaimed
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800'
                      : canAfford
                      ? 'bg-blue-600 text-white hover:bg-blue-700'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
                  }`}
                >
                  {isClaimed
                    ? 'Resgatada'
                    : canAfford
                    ? claimingId === reward.id
                      ? 'Resgatando...'
                      : 'Resgatar Recompensa'
                    : `Faltam ${reward.costXp - profile.xp} XP`}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
