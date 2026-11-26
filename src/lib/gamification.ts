import { BadgeDefinition, DeadlineItem, GradeEntry, RewardItem, UserProfile } from '../types/academic';

export const BADGE_DEFINITIONS: BadgeDefinition[] = [
  {
    id: 'primeiro_contato',
    title: 'Diálogo Aberto',
    description: 'Iniciou conversas organizadas diretamente com os professores.',
    requirementText: 'Enviar pelo menos 1 mensagem em sala acadêmica',
    xpBonus: 50,
  },
  {
    id: 'duvida_resolvida',
    title: 'Mente Curiosa',
    description: 'Marcou uma dúvida acadêmica como resolvida após o atendimento.',
    requirementText: 'Resolver 1 tópico de dúvida no chat',
    xpBonus: 75,
  },
  {
    id: 'pontualidade',
    title: 'Pontualidade Exemplar',
    description: 'Entregou e concluiu atividades dentro do cronograma do semestre.',
    requirementText: 'Concluir pelo menos 2 prazos acadêmicos',
    xpBonus: 120,
  },
  {
    id: 'agenda_sincronizada',
    title: 'Agenda Blindada',
    description: 'Sincronizou datas importantes de provas e trabalhos com o Google Calendar.',
    requirementText: 'Sincronizar 1 prazo com o Google Calendar',
    xpBonus: 100,
  },
  {
    id: 'desempenho_destaque',
    title: 'Média de Excelência',
    description: 'Mantém média ponderada igual ou superior a 8,0 nas avaliações.',
    requirementText: 'Alcançar média ponderada >= 8,0',
    xpBonus: 150,
  },
];

export const REWARDS_CATALOG: RewardItem[] = [
  {
    id: 'certificado_engajamento',
    title: 'Certificado de Engajamento Digital',
    description: 'Emita um registro oficial de participação ativa para atividades complementares.',
    costXp: 180,
    category: 'Acadêmico',
  },
  {
    id: 'revisao_prioritaria',
    title: 'Atendimento Prioritário em Dúvidas',
    description: 'Destaca suas perguntas no topo da fila de plantão do professor.',
    costXp: 250,
    category: 'Mentoria',
  },
  {
    id: 'material_extra',
    title: 'Pacote de Simulados Comentados',
    description: 'Desbloqueia listas extras de revisão pré-prova compartilhadas pelos docentes.',
    costXp: 320,
    category: 'Estudos',
  },
  {
    id: 'bonus_participacao',
    title: 'Selo Semestral +0,5 Participação',
    description: 'Crédito de engajamento contínuo para avaliação formativa da disciplina.',
    costXp: 500,
    category: 'Bonificação',
  },
];

export function calculateLevelFromXp(xp: number): {
  level: number;
  currentLevelXp: number;
  nextLevelXp: number;
  progressPercent: number;
} {
  const safeXp = Math.max(0, xp);
  const level = Math.floor(safeXp / 200) + 1;
  const currentLevelXp = safeXp % 200;
  const nextLevelXp = 200;
  const progressPercent = Math.round((currentLevelXp / nextLevelXp) * 100);
  return { level, currentLevelXp, nextLevelXp, progressPercent };
}

export function computeWeightedAverage(grades: GradeEntry[]): number {
  const graded = grades.filter((g) => g.status === 'graded' && g.maxScore > 0);
  if (graded.length === 0) return 0;
  const totalWeightedScore = graded.reduce(
    (acc, g) => acc + (g.score / g.maxScore) * 10 * g.weight,
    0
  );
  const totalWeights = graded.reduce((acc, g) => acc + g.weight, 0);
  if (totalWeights === 0) return 0;
  return Number((totalWeightedScore / totalWeights).toFixed(2));
}

export function evaluateUnlockedBadges(params: {
  profile: UserProfile | null;
  deadlines: DeadlineItem[];
  grades: GradeEntry[];
  sentMessagesCount: number;
  resolvedCount: number;
}): string[] {
  const current = new Set(params.profile?.badges || []);
  if (params.sentMessagesCount >= 1) current.add('primeiro_contato');
  if (params.resolvedCount >= 1) current.add('duvida_resolvida');
  const completedCount = params.deadlines.filter(
    (d) => d.status === 'completed' || d.status === 'submitted'
  ).length;
  if (completedCount >= 2) current.add('pontualidade');
  if (params.deadlines.some((d) => Boolean(d.googleCalendarEventId))) {
    current.add('agenda_sincronizada');
  }
  if (computeWeightedAverage(params.grades) >= 8.0) {
    current.add('desempenho_destaque');
  }
  return Array.from(current);
}
