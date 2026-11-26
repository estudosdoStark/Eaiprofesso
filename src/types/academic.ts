export type UserRole = 'student' | 'professor';
export type ThemeMode = 'light' | 'dark';
export type AppSection = 'chat' | 'grades' | 'deadlines' | 'gamification' | 'settings';

export type MessageTopic = 'Dúvida' | 'Material' | 'Prazo' | 'Geral';
export type AttachmentType = 'none' | 'image' | 'audio' | 'file';

export type GradeCategory = 'prova' | 'trabalho' | 'atividade';
export type GradeStatus = 'graded' | 'pending';

export type DeadlineType = 'prova' | 'trabalho' | 'atividade' | 'reuniao';
export type DeadlineStatus = 'pending' | 'submitted' | 'completed';
export type DeadlinePriority = 'low' | 'medium' | 'high';

export type ProfessorNotifyChannel = 'push_and_banner' | 'banner_only' | 'muted';
export type ProfessorAutoAcceptMode = 'manual' | 'subjects' | 'all';

export interface UserProfile {
  uid: string;
  displayName: string;
  email?: string;
  photoURL?: string;
  role: UserRole;
  institution?: string;
  academicHoursStart?: string;
  academicHoursEnd?: string;
  focusSilenceOutsideHours?: boolean;
  theme: ThemeMode;
  xp: number;
  level: number;
  streakDays?: number;
  badges?: string[];
  claimedRewards?: string[];
  notifyMessages?: boolean;
  notifyDeadlines?: boolean;
  defaultReminderMinutes?: number;
  professorNotifyNewRequests?: boolean;
  professorNotifyChannel?: ProfessorNotifyChannel;
  professorNotifyOnlyInAcademicHours?: boolean;
  professorAutoAcceptMode?: ProfessorAutoAcceptMode;
  professorAutoAcceptSubjects?: string[];
  professorAutoAcceptWelcome?: string;
  professorAutoJoinAsMember?: boolean;
  lastBackupAt?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface PublicProfile {
  uid: string;
  displayName: string;
  role: UserRole;
  xp: number;
  level: number;
  streakDays?: number;
  badgeCount?: number;
  isPublic: boolean;
  updatedAt?: unknown;
}

export interface GradeEntry {
  id: string;
  userId: string;
  subject: string;
  professorName: string;
  assessmentTitle: string;
  category: GradeCategory;
  score: number;
  maxScore: number;
  weight: number;
  date: string;
  feedback?: string;
  status: GradeStatus;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface DeadlineItem {
  id: string;
  userId: string;
  title: string;
  subject: string;
  type: DeadlineType;
  dueDate: string;
  dueTime?: string;
  status: DeadlineStatus;
  priority: DeadlinePriority;
  reminderMinutes: number;
  reminderEnabled: boolean;
  googleCalendarEventId?: string;
  notes?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type ChatRoomStatus = 'active' | 'pending_professor' | 'declined' | 'closed';

export interface ChatRoom {
  id: string;
  ownerId: string;
  title: string;
  subject: string;
  professorName: string;
  professorAvatar?: string;
  visibility: 'private' | 'shared';
  roomCode: string;
  chatStatus?: ChatRoomStatus;
  initiatedByRole?: UserRole;
  initiatedByUid?: string;
  studentName?: string;
  openingMessage?: string;
  moderationNote?: string;
  lastMessagePreview?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ChatMessage {
  id: string;
  roomId: string;
  roomOwnerId: string;
  roomVisibility: 'private' | 'shared';
  senderUid: string;
  senderName: string;
  senderRole: UserRole;
  text: string;
  topic: MessageTopic;
  attachmentType: AttachmentType;
  attachmentName?: string;
  attachmentMime?: string;
  attachmentData?: string;
  attachmentSize?: number;
  pinned: boolean;
  resolved: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface GoogleCalendarEvent {
  id: string;
  summary: string;
  description?: string;
  start: {
    dateTime?: string;
    date?: string;
  };
  end: {
    dateTime?: string;
    date?: string;
  };
  htmlLink?: string;
}

export interface BadgeDefinition {
  id: string;
  title: string;
  description: string;
  requirementText: string;
  xpBonus: number;
}

export interface RewardItem {
  id: string;
  title: string;
  description: string;
  costXp: number;
  category: string;
}
