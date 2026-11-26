import { jsPDF } from 'jspdf';
import { ChatMessage, ChatRoom, DeadlineItem, GradeEntry, UserProfile } from '../types/academic';
import { computeWeightedAverage } from './gamification';

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function escapeCSV(val: unknown): string {
  const str = String(val ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function exportGradesToCSV(grades: GradeEntry[]) {
  const headers = [
    'Disciplina',
    'Professor',
    'Avaliação',
    'Categoria',
    'Nota',
    'Nota Máxima',
    'Peso',
    'Data',
    'Status',
    'Feedback',
  ];
  const rows = grades.map((g) => [
    g.subject,
    g.professorName,
    g.assessmentTitle,
    g.category,
    g.score,
    g.maxScore,
    g.weight,
    g.date,
    g.status === 'graded' ? 'Lançada' : 'Pendente',
    g.feedback || '',
  ]);
  const csvContent =
    '\uFEFF' + [headers.map(escapeCSV).join(','), ...rows.map((r) => r.map(escapeCSV).join(','))].join('\n');
  downloadBlob(new Blob([csvContent], { type: 'text/csv;charset=utf-8;' }), 'eai_professo_notas.csv');
}

export function exportDeadlinesToCSV(deadlines: DeadlineItem[]) {
  const headers = [
    'Título',
    'Disciplina',
    'Tipo',
    'Data de Entrega',
    'Horário',
    'Status',
    'Prioridade',
    'Lembrete (min)',
    'Sincronizado Google Calendar',
    'Observações',
  ];
  const rows = deadlines.map((d) => [
    d.title,
    d.subject,
    d.type,
    d.dueDate,
    d.dueTime || '23:59',
    d.status,
    d.priority,
    d.reminderMinutes,
    d.googleCalendarEventId ? 'Sim' : 'Não',
    d.notes || '',
  ]);
  const csvContent =
    '\uFEFF' + [headers.map(escapeCSV).join(','), ...rows.map((r) => r.map(escapeCSV).join(','))].join('\n');
  downloadBlob(new Blob([csvContent], { type: 'text/csv;charset=utf-8;' }), 'eai_professo_prazos.csv');
}

export function exportChatHistoryToCSV(room: ChatRoom | null, messages: ChatMessage[]) {
  const headers = ['Sala', 'Remetente', 'Perfil', 'Tópico', 'Mensagem', 'Anexo', 'Fixada', 'Resolvida'];
  const rows = messages.map((m) => [
    room?.title || m.roomId,
    m.senderName,
    m.senderRole === 'professor' ? 'Professor' : 'Aluno',
    m.topic,
    m.text,
    m.attachmentName || m.attachmentType,
    m.pinned ? 'Sim' : 'Não',
    m.resolved ? 'Sim' : 'Não',
  ]);
  const csvContent =
    '\uFEFF' + [headers.map(escapeCSV).join(','), ...rows.map((r) => r.map(escapeCSV).join(','))].join('\n');
  const safeName = (room?.subject || 'conversas').toLowerCase().replace(/[^a-z0-9]+/g, '_');
  downloadBlob(
    new Blob([csvContent], { type: 'text/csv;charset=utf-8;' }),
    `eai_professo_historico_${safeName}.csv`
  );
}

export function exportAcademicReportPDF(params: {
  profile: UserProfile | null;
  grades: GradeEntry[];
  deadlines: DeadlineItem[];
  rooms: ChatRoom[];
}) {
  const { profile, grades, deadlines, rooms } = params;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 18;

  const ensureSpace = (needed: number) => {
    if (y + needed > 278) {
      doc.addPage();
      y = 18;
    }
  };

  // Header
  doc.setFillColor(30, 58, 138);
  doc.rect(0, 0, pageWidth, 30, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('Eai Professô — Relatório Acadêmico', 14, 14);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(
    `${profile?.displayName || 'Estudante'} · Nível ${profile?.level || 1} (${profile?.xp || 0} XP) · Gerado em ${new Date().toLocaleDateString('pt-BR')}`,
    14,
    22
  );

  y = 40;
  doc.setTextColor(15, 23, 42);

  // Summary strip
  const avg = computeWeightedAverage(grades);
  const pendingCount = deadlines.filter((d) => d.status === 'pending').length;
  const completedCount = deadlines.filter((d) => d.status !== 'pending').length;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('Resumo Semestral', 14, y);
  y += 7;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(
    `Média Ponderada Geral: ${avg.toFixed(2)} / 10.0   |   Prazos Pendentes: ${pendingCount}   |   Concluídos: ${completedCount}   |   Salas Ativas: ${rooms.length}`,
    14,
    y
  );
  y += 10;

  // Grades Section
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('Notas e Avaliações', 14, y);
  y += 6;
  doc.setDrawColor(203, 213, 225);
  doc.line(14, y, pageWidth - 14, y);
  y += 6;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  if (grades.length === 0) {
    doc.text('Nenhuma avaliação registrada até o momento.', 14, y);
    y += 8;
  } else {
    grades.forEach((g) => {
      ensureSpace(12);
      const scoreText = g.status === 'graded' ? `${g.score.toFixed(1)} / ${g.maxScore}` : 'Aguardando';
      doc.setFont('helvetica', 'bold');
      doc.text(`${g.subject} — ${g.assessmentTitle}`, 14, y);
      doc.setFont('helvetica', 'normal');
      doc.text(`Nota: ${scoreText} (Peso ${g.weight}) · ${g.date}`, pageWidth - 14, y, { align: 'right' });
      y += 5;
      if (g.feedback) {
        doc.setTextColor(71, 85, 105);
        const lines = doc.splitTextToSize(`Feedback (${g.professorName}): ${g.feedback}`, pageWidth - 28);
        doc.text(lines, 14, y);
        y += lines.length * 4.5;
        doc.setTextColor(15, 23, 42);
      }
      y += 2;
    });
  }

  y += 6;
  ensureSpace(20);

  // Deadlines Section
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('Cronograma de Prazos, Provas e Trabalhos', 14, y);
  y += 6;
  doc.line(14, y, pageWidth - 14, y);
  y += 6;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  if (deadlines.length === 0) {
    doc.text('Nenhum prazo cadastrado.', 14, y);
    y += 8;
  } else {
    deadlines.forEach((d) => {
      ensureSpace(10);
      const statusLabel = d.status === 'pending' ? 'Pendente' : d.status === 'submitted' ? 'Entregue' : 'Concluído';
      doc.setFont('helvetica', 'bold');
      doc.text(`[${d.type.toUpperCase()}] ${d.title}`, 14, y);
      doc.setFont('helvetica', 'normal');
      doc.text(`${d.dueDate} ${d.dueTime || ''} · ${statusLabel}`, pageWidth - 14, y, { align: 'right' });
      y += 5;
      doc.setTextColor(71, 85, 105);
      doc.text(`Disciplina: ${d.subject}${d.googleCalendarEventId ? ' · Sincronizado no Google Calendar' : ''}`, 14, y);
      doc.setTextColor(15, 23, 42);
      y += 6;
    });
  }

  doc.save('eai_professo_relatorio_academico.pdf');
}

export function exportFullBackupJSON(data: {
  profile: UserProfile | null;
  grades: GradeEntry[];
  deadlines: DeadlineItem[];
  rooms: ChatRoom[];
}) {
  const payload = {
    exportedAt: new Date().toISOString(),
    app: 'Eai Professô',
    version: '1.0',
    ...data,
  };
  downloadBlob(
    new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }),
    `eai_professo_backup_${new Date().toISOString().slice(0, 10)}.json`
  );
}
