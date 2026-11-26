import { User } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import avatarMath from '../assets/images/avatar_professor_math_1794560329276.jpg';
import avatarCs from '../assets/images/avatar_professor_cs_1794560329640.jpg';
import avatarHistory from '../assets/images/avatar_professor_history_1794560330507.jpg';
import { db, handleFirestoreError, OperationType } from './firebase';

function addDaysISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function ensureUserSeeded(user: User): Promise<void> {
  const userRef = doc(db, 'users', user.uid);
  let userSnap;
  try {
    userSnap = await getDoc(userRef);
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `users/${user.uid}`);
  }

  if (!userSnap.exists()) {
    const displayName = (user.displayName || user.email?.split('@')[0] || 'Estudante').slice(0, 120);
    const initialProfile = {
      uid: user.uid,
      displayName,
      email: (user.email || '').slice(0, 200),
      photoURL: (user.photoURL || '').slice(0, 500),
      role: 'student',
      institution: 'Campus Universitário Eai Professô',
      academicHoursStart: '08:00',
      academicHoursEnd: '18:00',
      focusSilenceOutsideHours: false,
      theme: document.documentElement.classList.contains('dark') ? 'dark' : 'light',
      xp: 240,
      level: 2,
      streakDays: 4,
      badges: ['primeiro_contato'],
      claimedRewards: [],
      notifyMessages: true,
      notifyDeadlines: true,
      defaultReminderMinutes: 60,
      lastBackupAt: new Date().toISOString(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    const publicProfile = {
      uid: user.uid,
      displayName,
      role: 'student',
      xp: 240,
      level: 2,
      streakDays: 4,
      badgeCount: 1,
      isPublic: true,
      updatedAt: serverTimestamp(),
    };

    try {
      const batch = writeBatch(db);
      batch.set(userRef, initialProfile);
      batch.set(doc(db, 'public_profiles', user.uid), publicProfile);

      // Starter grades
      const starterGrades = [
        {
          userId: user.uid,
          subject: 'Cálculo III',
          professorName: 'Prof. Ricardo Mendes',
          assessmentTitle: 'Prova 1 — Integrais Múltiplas',
          category: 'prova',
          score: 8.7,
          maxScore: 10,
          weight: 3,
          date: addDaysISO(-14),
          feedback: 'Excelente domínio na troca de coordenadas polares e cilíndricas.',
          status: 'graded',
        },
        {
          userId: user.uid,
          subject: 'Estruturas de Dados',
          professorName: 'Profa. Camila Sato',
          assessmentTitle: 'Projeto Árvores AVL & Grafos',
          category: 'trabalho',
          score: 9.4,
          maxScore: 10,
          weight: 2.5,
          date: addDaysISO(-7),
          feedback: 'Complexidade O(log n) bem validada e código limpo.',
          status: 'graded',
        },
        {
          userId: user.uid,
          subject: 'História Contemporânea',
          professorName: 'Prof. Arthur Silveira',
          assessmentTitle: 'Seminário Fontes Primárias',
          category: 'atividade',
          score: 8.2,
          maxScore: 10,
          weight: 1.5,
          date: addDaysISO(-3),
          feedback: 'Boa contextualização documental; aprofundar análise econômica.',
          status: 'graded',
        },
      ];

      starterGrades.forEach((g) => {
        const gRef = doc(collection(db, 'users', user.uid, 'grades'));
        batch.set(gRef, {
          ...g,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      });

      // Starter deadlines
      const starterDeadlines = [
        {
          userId: user.uid,
          title: 'Lista 4 — Teorema de Stokes e Divergência',
          subject: 'Cálculo III',
          type: 'atividade',
          dueDate: addDaysISO(2),
          dueTime: '23:59',
          status: 'pending',
          priority: 'high',
          reminderMinutes: 120,
          reminderEnabled: true,
          notes: 'Enviar PDF com resolução passo a passo pelo chat da disciplina.',
        },
        {
          userId: user.uid,
          title: 'Prova P2 — Algoritmos em Grafos',
          subject: 'Estruturas de Dados',
          type: 'prova',
          dueDate: addDaysISO(5),
          dueTime: '14:00',
          status: 'pending',
          priority: 'high',
          reminderMinutes: 1440,
          reminderEnabled: true,
          notes: 'Revisar Dijkstra, Bellman-Ford e ordenação topológica.',
        },
        {
          userId: user.uid,
          title: 'Ensaio Crítico — Pós-Guerra',
          subject: 'História Contemporânea',
          type: 'trabalho',
          dueDate: addDaysISO(9),
          dueTime: '18:00',
          status: 'pending',
          priority: 'medium',
          reminderMinutes: 1440,
          reminderEnabled: true,
          notes: 'Mínimo de 4 páginas em ABNT com 3 referências primárias.',
        },
      ];

      starterDeadlines.forEach((d) => {
        const dRef = doc(collection(db, 'users', user.uid, 'deadlines'));
        batch.set(dRef, {
          ...d,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      });

      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}`);
    }
  }

  // Ensure user has at least starter discipline rooms
  try {
    const ownedRoomsQuery = query(
      collection(db, 'rooms'),
      where('ownerId', '==', user.uid),
      limit(1)
    );
    const ownedSnap = await getDocs(ownedRoomsQuery);
    if (ownedSnap.empty) {
      const displayName = user.displayName || user.email?.split('@')[0] || 'Estudante';
      const starterRooms = [
        {
          title: 'Cálculo III — Plantão Direto',
          subject: 'Cálculo III',
          professorName: 'Prof. Ricardo Mendes',
          professorAvatar: avatarMath,
          visibility: 'shared' as const,
          roomCode: `CALC-${user.uid.slice(0, 4).toUpperCase()}`,
          lastMessagePreview: 'Canal organizado para dúvidas de integrais, provas e listas.',
        },
        {
          title: 'Estruturas de Dados — Lab & Código',
          subject: 'Estruturas de Dados',
          professorName: 'Profa. Camila Sato',
          professorAvatar: avatarCs,
          visibility: 'shared' as const,
          roomCode: `EDAT-${user.uid.slice(0, 4).toUpperCase()}`,
          lastMessagePreview: 'Envie arquivos, áudios ou prints de código para revisão.',
        },
        {
          title: 'História Contemporânea — Orientação',
          subject: 'História Contemporânea',
          professorName: 'Prof. Arthur Silveira',
          professorAvatar: avatarHistory,
          visibility: 'shared' as const,
          roomCode: `HIST-${user.uid.slice(0, 4).toUpperCase()}`,
          lastMessagePreview: 'Acompanhamento de seminários, ensaios e bibliografia.',
        },
      ];

      for (const roomData of starterRooms) {
        const roomRef = doc(collection(db, 'rooms'));
        await setDoc(roomRef, {
          ownerId: user.uid,
          ...roomData,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        await setDoc(doc(db, 'rooms', roomRef.id, 'members', user.uid), {
          uid: user.uid,
          displayName,
          role: 'student',
          joinedAt: serverTimestamp(),
        });
      }
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'rooms');
  }
}
