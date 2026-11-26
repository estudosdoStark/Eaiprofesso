import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import {
  ArrowLeft,
  Ban,
  Check,
  CheckCircle2,
  Clock,
  Download,
  FileText,
  Image as ImageIcon,
  Lock,
  Mic,
  Paperclip,
  Pin,
  Plus,
  RotateCcw,
  Search,
  Send,
  ShieldCheck,
  Square,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { exportChatHistoryToCSV } from '../lib/exportUtils';
import { isWithinAcademicHours, sendPushNotification } from '../lib/notifications';
import {
  AttachmentType,
  ChatMessage,
  ChatRoom,
  ChatRoomStatus,
  MessageTopic,
  PublicProfile,
  UserProfile,
  UserRole,
} from '../types/academic';

interface ChatWorkspaceProps {
  profile: UserProfile;
  rooms: ChatRoom[];
  onAwardXp: (amount: number, reason: string) => void;
  onStatsChange: (sentCount: number, resolvedCount: number) => void;
  onSwitchRole: (role: UserRole) => Promise<void>;
  onOpenSettings?: () => void;
}

const TOPICS: MessageTopic[] = ['Dúvida', 'Material', 'Prazo', 'Geral'];

async function compressImageToDataUrl(file: File, maxDimension = 960): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxDimension / Math.max(img.width, img.height));
        const width = Math.round(img.width * scale);
        const height = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Canvas indisponível'));
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.72));
      };
      img.onerror = reject;
      img.src = String(reader.result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export const ChatWorkspace: React.FC<ChatWorkspaceProps> = ({
  profile,
  rooms,
  onAwardXp,
  onStatsChange,
  onSwitchRole,
  onOpenSettings,
}) => {
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [mobileShowThread, setMobileShowThread] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);

  const [roomSearch, setRoomSearch] = useState('');
  const [roomStatusFilter, setRoomStatusFilter] = useState<'active' | 'pending_professor' | 'all'>(
    'all'
  );
  const [messageSearch, setMessageSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<
    'all' | 'Dúvida' | 'Material' | 'Prazo' | 'pinned' | 'media'
  >('all');

  const [composerText, setComposerText] = useState('');
  const [composerTopic, setComposerTopic] = useState<MessageTopic>('Dúvida');
  const [pendingAttachment, setPendingAttachment] = useState<{
    type: AttachmentType;
    name: string;
    mime: string;
    data: string;
    size: number;
  } | null>(null);
  const [sending, setSending] = useState(false);
  const [composerFeedback, setComposerFeedback] = useState<string | null>(null);

  // Professor moderation states
  const [moderationReason, setModerationReason] = useState('');
  const [showDeclineReason, setShowDeclineReason] = useState(false);
  const [moderating, setModerating] = useState(false);

  // Audio recording
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

  // Lightbox image
  const [previewImage, setPreviewImage] = useState<{ src: string; name: string } | null>(null);

  // Room creation / initiation / join modal
  const [showRoomModal, setShowRoomModal] = useState(false);
  const [roomModalMode, setRoomModalMode] = useState<'create' | 'join'>('create');
  const [newRoomSubject, setNewRoomSubject] = useState('');
  const [newRoomTitle, setNewRoomTitle] = useState('');
  const [newRoomProfessor, setNewRoomProfessor] = useState('');
  const [newRoomStudentName, setNewRoomStudentName] = useState('');
  const [openingMessage, setOpeningMessage] = useState('');
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [roomModalError, setRoomModalError] = useState<string | null>(null);
  const [creatingRoom, setCreatingRoom] = useState(false);

  // Known students from public_profiles for direct professor initiation
  const [knownStudents, setKnownStudents] = useState<PublicProfile[]>([]);

  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const isProfessor = profile.role === 'professor';

  useEffect(() => {
    if (!isProfessor) return;
    const q = query(
      collection(db, 'public_profiles'),
      where('isPublic', '==', true),
      limit(30)
    );
    getDocs(q)
      .then((snap) => {
        const list = snap.docs
          .map((d) => d.data() as PublicProfile)
          .filter((p) => p.role === 'student' && p.uid !== profile.uid);
        setKnownStudents(list);
      })
      .catch(() => {});
  }, [isProfessor, profile.uid]);

  useEffect(() => {
    if (!selectedRoomId && rooms.length > 0) {
      setSelectedRoomId(rooms[0].id);
    }
  }, [rooms, selectedRoomId]);

  const activeRoom = useMemo(
    () => rooms.find((r) => r.id === selectedRoomId) || null,
    [rooms, selectedRoomId]
  );

  const activeRoomStatus: ChatRoomStatus = activeRoom?.chatStatus || 'active';

  useEffect(() => {
    setShowDeclineReason(false);
    setModerationReason('');
  }, [activeRoom?.id]);

  useEffect(() => {
    if (!activeRoom) {
      setMessages([]);
      return;
    }

    setLoadingMessages(true);
    const messagesRef = collection(db, 'rooms', activeRoom.id, 'messages');
    const q = query(messagesRef, where('roomVisibility', '==', activeRoom.visibility));

    const unsub = onSnapshot(
      q,
      (snap) => {
        const toMs = (v: unknown) =>
          v && typeof (v as { toMillis?: () => number }).toMillis === 'function'
            ? (v as { toMillis: () => number }).toMillis()
            : Date.now();
        const list: ChatMessage[] = snap.docs
          .map((d) => ({
            id: d.id,
            ...(d.data() as Omit<ChatMessage, 'id'>),
          }))
          .sort((a, b) => toMs(a.createdAt) - toMs(b.createdAt));
        setMessages(list);
        setLoadingMessages(false);

        const mySent = list.filter((m) => m.senderUid === profile.uid).length;
        const resolvedCount = list.filter((m) => m.resolved).length;
        onStatsChange(mySent, resolvedCount);
      },
      (err) => {
        setLoadingMessages(false);
        handleFirestoreError(err, OperationType.LIST, `rooms/${activeRoom.id}/messages`);
      }
    );

    return () => unsub();
  }, [activeRoom?.id, profile.uid]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, selectedRoomId]);

  const pendingCount = useMemo(
    () => rooms.filter((r) => (r.chatStatus || 'active') === 'pending_professor').length,
    [rooms]
  );

  const filteredRooms = useMemo(() => {
    const term = roomSearch.trim().toLowerCase();
    return rooms.filter((r) => {
      const status = r.chatStatus || 'active';
      if (roomStatusFilter === 'active' && status !== 'active') return false;
      if (roomStatusFilter === 'pending_professor' && status !== 'pending_professor') return false;
      if (!term) return true;
      return (
        r.subject.toLowerCase().includes(term) ||
        r.professorName.toLowerCase().includes(term) ||
        (r.studentName || '').toLowerCase().includes(term) ||
        r.title.toLowerCase().includes(term)
      );
    });
  }, [rooms, roomSearch, roomStatusFilter]);

  const filteredMessages = useMemo(() => {
    return messages.filter((m) => {
      if (activeFilter === 'pinned' && !m.pinned) return false;
      if (activeFilter === 'media' && m.attachmentType === 'none') return false;
      if (
        (activeFilter === 'Dúvida' || activeFilter === 'Material' || activeFilter === 'Prazo') &&
        m.topic !== activeFilter
      ) {
        return false;
      }
      const q = messageSearch.trim().toLowerCase();
      if (q) {
        const matchText = m.text.toLowerCase().includes(q);
        const matchFile = (m.attachmentName || '').toLowerCase().includes(q);
        const matchSender = m.senderName.toLowerCase().includes(q);
        if (!matchText && !matchFile && !matchSender) return false;
      }
      return true;
    });
  }, [messages, activeFilter, messageSearch]);

  const handleImagePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setComposerFeedback(null);
    try {
      const compressed = await compressImageToDataUrl(file);
      if (compressed.length > 430000) {
        setComposerFeedback('Imagem muito grande após compressão. Escolha uma foto menor.');
        return;
      }
      setPendingAttachment({
        type: 'image',
        name: file.name,
        mime: 'image/jpeg',
        data: compressed,
        size: file.size,
      });
    } catch {
      setComposerFeedback('Não foi possível processar a imagem selecionada.');
    }
  };

  const handleFilePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setComposerFeedback(null);

    if (file.size > 310 * 1024) {
      setComposerFeedback('Limite para anexo direto é 300 KB nesta versão.');
      return;
    }

    try {
      const dataUrl = await readFileAsDataUrl(file);
      if (dataUrl.length > 430000) {
        setComposerFeedback('Arquivo excede o limite de armazenamento em nuvem.');
        return;
      }
      setPendingAttachment({
        type: 'file',
        name: file.name,
        mime: file.type || 'application/octet-stream',
        data: dataUrl,
        size: file.size,
      });
    } catch {
      setComposerFeedback('Erro ao ler o arquivo.');
    }
  };

  const startRecording = async () => {
    setComposerFeedback(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setComposerFeedback('Gravação de áudio não suportada neste navegador.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];

      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) audioChunksRef.current.push(ev.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        if (blob.size > 320 * 1024) {
          setComposerFeedback('Áudio excedeu 300 KB. Grave uma mensagem mais curta.');
          return;
        }
        const reader = new FileReader();
        reader.onload = () => {
          setPendingAttachment({
            type: 'audio',
            name: `audio_${new Date().toISOString().slice(11, 19).replace(/:/g, '-')}.webm`,
            mime: blob.type || 'audio/webm',
            data: String(reader.result),
            size: blob.size,
          });
        };
        reader.readAsDataURL(blob);
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
      setRecordingSeconds(0);
      timerRef.current = window.setInterval(() => {
        setRecordingSeconds((prev) => {
          if (prev >= 44) {
            stopRecording();
            return prev;
          }
          return prev + 1;
        });
      }, 1000);
    } catch {
      setComposerFeedback('Permissão de microfone negada ou indisponível.');
    }
  };

  const stopRecording = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  };

  const canCurrentUserSend =
    activeRoomStatus === 'active' || isProfessor;

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeRoom || !canCurrentUserSend) return;
    const trimmed = composerText.trim();
    if (!trimmed && !pendingAttachment) return;

    setSending(true);
    setComposerFeedback(null);

    try {
      const memberRef = doc(db, 'rooms', activeRoom.id, 'members', profile.uid);
      const memberSnap = await getDoc(memberRef);
      if (!memberSnap.exists()) {
        await setDoc(memberRef, {
          uid: profile.uid,
          displayName: profile.displayName,
          role: profile.role,
          joinedAt: serverTimestamp(),
        });
      }

      const payload: Record<string, unknown> = {
        roomId: activeRoom.id,
        roomOwnerId: activeRoom.ownerId,
        roomVisibility: activeRoom.visibility,
        senderUid: profile.uid,
        senderName: profile.displayName,
        senderRole: profile.role,
        text: trimmed || (pendingAttachment ? `Anexo: ${pendingAttachment.name}` : ''),
        topic: composerTopic,
        attachmentType: pendingAttachment ? pendingAttachment.type : 'none',
        pinned: false,
        resolved: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      if (pendingAttachment) {
        payload.attachmentName = pendingAttachment.name.slice(0, 180);
        payload.attachmentMime = pendingAttachment.mime.slice(0, 120);
        payload.attachmentData = pendingAttachment.data;
        payload.attachmentSize = pendingAttachment.size;
      }

      await addDoc(collection(db, 'rooms', activeRoom.id, 'messages'), payload);

      const previewText = (trimmed || pendingAttachment?.name || 'Nova mensagem').slice(0, 220);
      await updateDoc(doc(db, 'rooms', activeRoom.id), {
        lastMessagePreview: previewText,
        updatedAt: serverTimestamp(),
      });

      setComposerText('');
      setPendingAttachment(null);
      onAwardXp(15, 'Mensagem enviada na disciplina');

      if (
        profile.notifyMessages &&
        isWithinAcademicHours(
          profile.academicHoursStart,
          profile.academicHoursEnd,
          profile.focusSilenceOutsideHours
        )
      ) {
        sendPushNotification(
          `${activeRoom.subject} · Mensagem salva`,
          previewText,
          `chat-${activeRoom.id}`
        );
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `rooms/${activeRoom.id}/messages`);
    } finally {
      setSending(false);
    }
  };

  const handleModerateRoom = async (nextStatus: ChatRoomStatus, note = '') => {
    if (!activeRoom || !isProfessor) return;
    setModerating(true);
    try {
      const statusPreviewMap: Record<ChatRoomStatus, string> = {
        active: 'Bate-papo aceito e liberado pelo professor.',
        pending_professor: 'Aguardando aceite do professor.',
        declined: note ? `Solicitação recusada: ${note}` : 'Solicitação recusada pelo professor.',
        closed: 'Conversa encerrada pelo professor.',
      };

      await updateDoc(doc(db, 'rooms', activeRoom.id), {
        chatStatus: nextStatus,
        moderationNote: note.trim().slice(0, 300),
        lastMessagePreview: statusPreviewMap[nextStatus].slice(0, 240),
        updatedAt: serverTimestamp(),
      });

      if (nextStatus === 'active') {
        if (profile.professorAutoJoinAsMember ?? true) {
          const memberRef = doc(db, 'rooms', activeRoom.id, 'members', profile.uid);
          const memberSnap = await getDoc(memberRef);
          if (!memberSnap.exists()) {
            await setDoc(memberRef, {
              uid: profile.uid,
              displayName: profile.displayName,
              role: profile.role,
              joinedAt: serverTimestamp(),
            });
          }
        }
        onAwardXp(20, 'Atendimento acadêmico liberado');
      }

      setShowDeclineReason(false);
      setModerationReason('');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `rooms/${activeRoom.id}`);
    } finally {
      setModerating(false);
    }
  };

  const togglePinMessage = async (msg: ChatMessage) => {
    if (!activeRoom) return;
    try {
      await updateDoc(doc(db, 'rooms', activeRoom.id, 'messages', msg.id), {
        pinned: !msg.pinned,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `rooms/${activeRoom.id}/messages/${msg.id}`);
    }
  };

  const toggleResolveMessage = async (msg: ChatMessage) => {
    if (!activeRoom) return;
    try {
      const nextResolved = !msg.resolved;
      await updateDoc(doc(db, 'rooms', activeRoom.id, 'messages', msg.id), {
        resolved: nextResolved,
        updatedAt: serverTimestamp(),
      });
      if (nextResolved) {
        onAwardXp(25, 'Dúvida acadêmica resolvida');
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `rooms/${activeRoom.id}/messages/${msg.id}`);
    }
  };

  const handleDeleteMessage = async (msg: ChatMessage) => {
    if (!activeRoom) return;
    try {
      await deleteDoc(doc(db, 'rooms', activeRoom.id, 'messages', msg.id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `rooms/${activeRoom.id}/messages/${msg.id}`);
    }
  };

  const handleCreateOrJoinRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    setRoomModalError(null);

    if (roomModalMode === 'create') {
      if (isProfessor) {
        // Professor initiates conversation directly without any student request
        if (!newRoomSubject.trim() || !newRoomStudentName.trim()) {
          setRoomModalError('Informe o nome do aluno e a disciplina.');
          return;
        }
        setCreatingRoom(true);
        try {
          const roomRef = doc(collection(db, 'rooms'));
          const code = `PROF-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
          const titleVal =
            newRoomTitle.trim() || `${newRoomSubject.trim()} — ${newRoomStudentName.trim()}`;
          const firstMsg = openingMessage.trim();

          await setDoc(roomRef, {
            ownerId: profile.uid,
            title: titleVal.slice(0, 140),
            subject: newRoomSubject.trim().slice(0, 120),
            professorName: profile.displayName.slice(0, 120),
            studentName: newRoomStudentName.trim().slice(0, 120),
            visibility: 'shared',
            roomCode: code,
            chatStatus: 'active',
            initiatedByRole: 'professor',
            initiatedByUid: profile.uid,
            openingMessage: firstMsg.slice(0, 1000),
            lastMessagePreview: (firstMsg || `Conversa iniciada com ${newRoomStudentName.trim()}`).slice(
              0,
              240
            ),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });

          await setDoc(doc(db, 'rooms', roomRef.id, 'members', profile.uid), {
            uid: profile.uid,
            displayName: profile.displayName,
            role: 'professor',
            joinedAt: serverTimestamp(),
          });

          if (firstMsg) {
            await addDoc(collection(db, 'rooms', roomRef.id, 'messages'), {
              roomId: roomRef.id,
              roomOwnerId: profile.uid,
              roomVisibility: 'shared',
              senderUid: profile.uid,
              senderName: profile.displayName,
              senderRole: 'professor',
              text: firstMsg,
              topic: 'Geral',
              attachmentType: 'none',
              pinned: false,
              resolved: false,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          }

          setSelectedRoomId(roomRef.id);
          setMobileShowThread(true);
          setShowRoomModal(false);
          setNewRoomTitle('');
          setNewRoomSubject('');
          setNewRoomStudentName('');
          setOpeningMessage('');
        } catch (err) {
          handleFirestoreError(err, OperationType.CREATE, 'rooms');
        } finally {
          setCreatingRoom(false);
        }
      } else {
        // Student requests chat approval from professor
        if (!newRoomSubject.trim() || !newRoomProfessor.trim() || !openingMessage.trim()) {
          setRoomModalError('Preencha a disciplina, o professor e o motivo da solicitação.');
          return;
        }
        setCreatingRoom(true);
        try {
          const roomRef = doc(collection(db, 'rooms'));
          const code = `ALUN-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
          const titleVal =
            newRoomTitle.trim() || `${newRoomSubject.trim()} — ${profile.displayName}`;

          await setDoc(roomRef, {
            ownerId: profile.uid,
            title: titleVal.slice(0, 140),
            subject: newRoomSubject.trim().slice(0, 120),
            professorName: newRoomProfessor.trim().slice(0, 120),
            studentName: profile.displayName.slice(0, 120),
            visibility: 'shared',
            roomCode: code,
            chatStatus: 'pending_professor',
            initiatedByRole: 'student',
            initiatedByUid: profile.uid,
            openingMessage: openingMessage.trim().slice(0, 1000),
            lastMessagePreview: `Solicitação pendente: ${openingMessage.trim()}`.slice(0, 240),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });

          await setDoc(doc(db, 'rooms', roomRef.id, 'members', profile.uid), {
            uid: profile.uid,
            displayName: profile.displayName,
            role: 'student',
            joinedAt: serverTimestamp(),
          });

          setSelectedRoomId(roomRef.id);
          setMobileShowThread(true);
          setShowRoomModal(false);
          setNewRoomTitle('');
          setNewRoomSubject('');
          setNewRoomProfessor('');
          setOpeningMessage('');
        } catch (err) {
          handleFirestoreError(err, OperationType.CREATE, 'rooms');
        } finally {
          setCreatingRoom(false);
        }
      }
    } else {
      const code = joinCodeInput.trim().toUpperCase();
      if (!code) {
        setRoomModalError('Informe o código da sala (ex: CALC-A1B2).');
        return;
      }
      setCreatingRoom(true);
      try {
        const q = query(
          collection(db, 'rooms'),
          where('visibility', '==', 'shared'),
          where('roomCode', '==', code)
        );
        const snap = await getDocs(q);
        if (snap.empty) {
          setRoomModalError('Nenhuma sala compartilhada encontrada com esse código.');
          return;
        }
        const target = snap.docs[0];
        const memberRef = doc(db, 'rooms', target.id, 'members', profile.uid);
        const memberSnap = await getDoc(memberRef);
        if (!memberSnap.exists()) {
          await setDoc(memberRef, {
            uid: profile.uid,
            displayName: profile.displayName,
            role: profile.role,
            joinedAt: serverTimestamp(),
          });
        }
        setSelectedRoomId(target.id);
        setMobileShowThread(true);
        setShowRoomModal(false);
        setJoinCodeInput('');
      } catch (err) {
        handleFirestoreError(err, OperationType.GET, 'rooms');
      } finally {
        setCreatingRoom(false);
      }
    }
  };

  const formatTimestamp = (ts: unknown): string => {
    if (!ts) return 'Enviando...';
    if (typeof (ts as { toDate?: () => Date }).toDate === 'function') {
      return (ts as { toDate: () => Date }).toDate().toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
      });
    }
    return 'Agora';
  };

  const roomStatusLabel = (status: ChatRoomStatus): string => {
    switch (status) {
      case 'pending_professor':
        return 'Aguardando professor';
      case 'declined':
        return 'Recusada';
      case 'closed':
        return 'Encerrada';
      default:
        return 'Ativa';
    }
  };

  return (
    <div className="h-[calc(100vh-8.5rem)] lg:h-[calc(100vh-7.5rem)] flex bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
      {/* Left Pane: Discipline Rooms */}
      <aside
        className={`${
          mobileShowThread ? 'hidden md:flex' : 'flex'
        } w-full md:w-80 lg:w-88 flex-col border-r border-slate-200 dark:border-slate-800 shrink-0`}
      >
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display font-semibold text-base text-slate-900 dark:text-white">
              Salas Acadêmicas
            </h2>
            <button
              type="button"
              onClick={() => {
                setRoomModalMode('create');
                setRoomModalError(null);
                setShowRoomModal(true);
              }}
              className="min-h-[40px] px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{isProfessor ? 'Iniciar com Aluno' : 'Solicitar Chat'}</span>
            </button>
          </div>

          {/* Mobile / Tablet Role Switcher */}
          <div className="lg:hidden grid grid-cols-2 gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800">
            <button
              type="button"
              onClick={() => onSwitchRole('student')}
              className={`py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                !isProfessor
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Visão Aluno
            </button>
            <button
              type="button"
              onClick={() => onSwitchRole('professor')}
              className={`py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                isProfessor
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Visão Professor
            </button>
          </div>

          {/* Room Status Filter Tabs */}
          <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/80">
            {[
              { key: 'all', label: 'Todas' },
              { key: 'active', label: 'Ativas' },
              {
                key: 'pending_professor',
                label: pendingCount > 0 ? `Pendentes (${pendingCount})` : 'Pendentes',
              },
            ].map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setRoomStatusFilter(tab.key as typeof roomStatusFilter)}
                className={`py-1.5 px-2 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer truncate ${
                  roomStatusFilter === tab.key
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={roomSearch}
              onChange={(e) => setRoomSearch(e.target.value)}
              placeholder="Buscar disciplina, aluno ou professor..."
              className="w-full pl-9 pr-3 py-2 text-sm rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-transparent focus:border-blue-500 focus:bg-white dark:focus:bg-slate-900 outline-none transition-colors text-slate-900 dark:text-slate-100 placeholder:text-slate-500"
            />
          </div>

          {isProfessor && (
            <div className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/70 text-[11px]">
              <span className="text-slate-600 dark:text-slate-300 truncate flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                <span className="truncate">
                  {profile.professorAutoAcceptMode === 'all'
                    ? 'Permissão: aceite automático total'
                    : profile.professorAutoAcceptMode === 'subjects'
                    ? `Permissão: ${(profile.professorAutoAcceptSubjects || []).length} matéria(s) auto`
                    : 'Permissão: aprovação manual'}
                </span>
              </span>
              {onOpenSettings && (
                <button
                  type="button"
                  onClick={onOpenSettings}
                  className="font-semibold text-blue-600 dark:text-blue-400 hover:underline shrink-0 cursor-pointer"
                >
                  Ajustar
                </button>
              )}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/70">
          {filteredRooms.length === 0 ? (
            <div className="p-6 text-center text-sm text-slate-500 dark:text-slate-400">
              Nenhuma conversa nesta lista.
            </div>
          ) : (
            filteredRooms.map((room) => {
              const isSelected = room.id === activeRoom?.id;
              const status = room.chatStatus || 'active';
              return (
                <button
                  key={room.id}
                  type="button"
                  onClick={() => {
                    setSelectedRoomId(room.id);
                    setMobileShowThread(true);
                  }}
                  className={`w-full text-left p-4 flex items-start gap-3 transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-blue-50/70 dark:bg-blue-950/30'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                  }`}
                >
                  {room.professorAvatar ? (
                    <img
                      src={room.professorAvatar}
                      alt={room.professorName}
                      referrerPolicy="no-referrer"
                      className="w-11 h-11 rounded-full object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                    />
                  ) : (
                    <div className="w-11 h-11 rounded-full bg-blue-600/10 text-blue-600 dark:text-blue-400 font-display font-bold flex items-center justify-center shrink-0">
                      {room.subject.slice(0, 2).toUpperCase()}
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold text-sm text-slate-900 dark:text-white truncate">
                        {room.subject}
                      </p>
                      <span className="text-[11px] font-mono text-slate-400 shrink-0">
                        {room.roomCode}
                      </span>
                    </div>

                    <p className="text-xs text-slate-600 dark:text-slate-300 truncate mt-0.5">
                      {room.studentName
                        ? `${room.studentName} · ${room.professorName}`
                        : room.professorName}
                    </p>

                    <div className="flex items-center gap-1.5 text-[11px] mt-1 truncate">
                      <span
                        className={`font-semibold shrink-0 ${
                          status === 'pending_professor'
                            ? 'text-amber-600 dark:text-amber-400'
                            : status === 'declined'
                            ? 'text-rose-600 dark:text-rose-400'
                            : status === 'closed'
                            ? 'text-slate-500 dark:text-slate-400'
                            : 'text-emerald-600 dark:text-emerald-400'
                        }`}
                      >
                        {roomStatusLabel(status)}
                      </span>
                      <span className="text-slate-400" aria-hidden="true">
                        ·
                      </span>
                      <span className="text-slate-500 dark:text-slate-400 truncate">
                        {room.lastMessagePreview || 'Sem mensagens ainda'}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </aside>

      {/* Right Pane: Active Thread */}
      <section
        className={`${
          mobileShowThread ? 'flex' : 'hidden md:flex'
        } flex-1 flex-col min-w-0 bg-slate-50/50 dark:bg-slate-950/30`}
      >
        {!activeRoom ? (
          <div className="flex-1 flex items-center justify-center p-8 text-center text-slate-500">
            Selecione uma disciplina ao lado para iniciar o atendimento.
          </div>
        ) : (
          <>
            {/* Thread Header */}
            <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <button
                  type="button"
                  onClick={() => setMobileShowThread(false)}
                  className="md:hidden min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800"
                  aria-label="Voltar às salas"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>

                {activeRoom.professorAvatar && (
                  <img
                    src={activeRoom.professorAvatar}
                    alt={activeRoom.professorName}
                    referrerPolicy="no-referrer"
                    className="w-10 h-10 rounded-full object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                  />
                )}

                <div className="min-w-0">
                  <h3 className="font-display font-semibold text-sm sm:text-base text-slate-900 dark:text-white truncate">
                    {activeRoom.title}
                  </h3>
                  <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 truncate">
                    <span>{activeRoom.professorName}</span>
                    {activeRoom.studentName && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>Aluno: {activeRoom.studentName}</span>
                      </>
                    )}
                    <span aria-hidden="true">·</span>
                    <span className="font-mono">{activeRoom.roomCode}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-semibold text-slate-700 dark:text-slate-200">
                      {roomStatusLabel(activeRoomStatus)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {isProfessor && activeRoomStatus === 'active' && (
                  <button
                    type="button"
                    disabled={moderating}
                    onClick={() => handleModerateRoom('closed')}
                    className="min-h-[38px] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <Lock className="w-3.5 h-3.5" />
                    <span>Encerrar Chat</span>
                  </button>
                )}

                {isProfessor && (activeRoomStatus === 'closed' || activeRoomStatus === 'declined') && (
                  <button
                    type="button"
                    disabled={moderating}
                    onClick={() => handleModerateRoom('active')}
                    className="min-h-[38px] px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Reabrir Chat</span>
                  </button>
                )}

                <div className="relative hidden sm:block">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={messageSearch}
                    onChange={(e) => setMessageSearch(e.target.value)}
                    placeholder="Filtrar histórico..."
                    className="pl-8 pr-3 py-1.5 text-xs rounded-lg bg-slate-100 dark:bg-slate-800 border border-transparent focus:border-blue-500 outline-none text-slate-900 dark:text-slate-100 w-40"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => exportChatHistoryToCSV(activeRoom, messages)}
                  className="min-h-[38px] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">CSV</span>
                </button>
              </div>
            </div>

            {/* Professor Approval Bar for Pending Requests */}
            {activeRoomStatus === 'pending_professor' && (
              <div className="bg-amber-50/90 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-900/60 px-4 py-3.5 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1 min-w-0">
                    <p className="text-xs font-semibold text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                      <Clock className="w-4 h-4 shrink-0" />
                      <span>
                        {isProfessor
                          ? `Solicitação de bate-papo de ${activeRoom.studentName || 'Aluno'}`
                          : 'Aguardando aprovação do professor para liberar o bate-papo'}
                      </span>
                    </p>
                    {activeRoom.openingMessage && (
                      <p className="text-sm text-slate-800 dark:text-slate-200 leading-relaxed">
                        “{activeRoom.openingMessage}”
                      </p>
                    )}
                  </div>

                  {isProfessor && (
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        disabled={moderating}
                        onClick={() => handleModerateRoom('active')}
                        className="min-h-[40px] px-4 rounded-xl bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                      >
                        <Check className="w-4 h-4" />
                        <span>Aceitar Bate-Papo</span>
                      </button>
                      <button
                        type="button"
                        disabled={moderating}
                        onClick={() => setShowDeclineReason((v) => !v)}
                        className="min-h-[40px] px-3.5 rounded-xl border border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs font-semibold hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                      >
                        <Ban className="w-3.5 h-3.5" />
                        <span>Recusar</span>
                      </button>
                    </div>
                  )}
                </div>

                {isProfessor && showDeclineReason && (
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-1">
                    <input
                      type="text"
                      value={moderationReason}
                      onChange={(e) => setModerationReason(e.target.value)}
                      placeholder="Motivo opcional para o aluno (ex: procure o horário de monitoria)..."
                      className="flex-1 px-3 py-2 text-xs rounded-xl bg-white dark:bg-slate-900 border border-amber-200 dark:border-slate-700 outline-none"
                    />
                    <button
                      type="button"
                      disabled={moderating}
                      onClick={() => handleModerateRoom('declined', moderationReason)}
                      className="min-h-[38px] px-4 rounded-xl bg-rose-600 text-white text-xs font-semibold hover:bg-rose-700 cursor-pointer whitespace-nowrap"
                    >
                      Confirmar Recusa
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Declined / Closed Status Banner */}
            {(activeRoomStatus === 'declined' || activeRoomStatus === 'closed') && (
              <div className="bg-slate-100 dark:bg-slate-900/90 border-b border-slate-200 dark:border-slate-800 px-4 py-3 flex items-center justify-between gap-3 text-xs text-slate-700 dark:text-slate-300">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-slate-500 shrink-0" />
                  <span>
                    {activeRoomStatus === 'declined'
                      ? `Solicitação recusada pelo professor.${
                          activeRoom.moderationNote ? ` Motivo: ${activeRoom.moderationNote}` : ''
                        }`
                      : 'Conversa encerrada pelo professor. O histórico permanece salvo.'}
                  </span>
                </div>
              </div>
            )}

            {/* Topic & Media Filter Tabs */}
            <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 py-2 flex items-center gap-1.5 overflow-x-auto">
              {[
                { key: 'all', label: 'Todas' },
                { key: 'Dúvida', label: 'Dúvidas' },
                { key: 'Material', label: 'Materiais' },
                { key: 'Prazo', label: 'Prazos' },
                { key: 'pinned', label: 'Fixadas' },
                { key: 'media', label: 'Arquivos & Mídia' },
              ].map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveFilter(tab.key as typeof activeFilter)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    activeFilter === tab.key
                      ? 'bg-slate-900 text-white dark:bg-blue-600'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Messages Feed */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
              {activeRoom.openingMessage && activeRoomStatus === 'active' && (
                <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300">
                  <span className="font-semibold text-slate-900 dark:text-white">
                    Assunto inicial ({activeRoom.initiatedByRole === 'professor' ? activeRoom.professorName : activeRoom.studentName || 'Aluno'}):
                  </span>{' '}
                  {activeRoom.openingMessage}
                </div>
              )}

              {loadingMessages ? (
                <div className="space-y-3">
                  <div className="h-16 w-2/3 rounded-2xl bg-slate-200/70 dark:bg-slate-800/70 animate-pulse" />
                  <div className="h-16 w-1/2 ml-auto rounded-2xl bg-slate-200/70 dark:bg-slate-800/70 animate-pulse" />
                </div>
              ) : filteredMessages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto py-12">
                  <p className="font-display font-semibold text-base text-slate-800 dark:text-slate-200">
                    {activeRoomStatus === 'pending_professor'
                      ? 'Solicitação aguardando decisão do professor'
                      : 'Histórico organizado pronto para uso'}
                  </p>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
                    {activeRoomStatus === 'pending_professor'
                      ? isProfessor
                        ? 'Clique em Aceitar Bate-Papo acima para liberar a conversa com este aluno.'
                        : 'Assim que o professor aceitar sua solicitação, você poderá enviar textos, áudios, fotos e arquivos aqui.'
                      : 'Envie uma dúvida, foto de exercício, gravação de áudio ou arquivo PDF abaixo.'}
                  </p>
                </div>
              ) : (
                filteredMessages.map((msg) => {
                  const isMine = msg.senderUid === profile.uid;
                  return (
                    <div
                      key={msg.id}
                      className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}
                    >
                      <div
                        className={`max-w-[88%] sm:max-w-[75%] rounded-2xl px-4 py-3 border ${
                          isMine
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border-slate-200 dark:border-slate-800 shadow-[0_1px_2px_rgba(15,23,42,0.04)]'
                        }`}
                      >
                        <div
                          className={`flex flex-wrap items-center gap-1.5 text-[11px] mb-1.5 ${
                            isMine ? 'text-blue-100' : 'text-slate-500 dark:text-slate-400'
                          }`}
                        >
                          <span className="font-semibold">{msg.senderName}</span>
                          <span aria-hidden="true">·</span>
                          <span>{msg.senderRole === 'professor' ? 'Professor' : 'Aluno'}</span>
                          <span aria-hidden="true">·</span>
                          <span>{msg.topic}</span>
                          <span aria-hidden="true">·</span>
                          <span className="tabular-nums">{formatTimestamp(msg.createdAt)}</span>
                          {msg.pinned && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="font-semibold">Fixada</span>
                            </>
                          )}
                          {msg.resolved && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="font-semibold">Resolvida</span>
                            </>
                          )}
                        </div>

                        {msg.text && (
                          <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
                            {msg.text}
                          </p>
                        )}

                        {msg.attachmentType === 'image' && msg.attachmentData && (
                          <button
                            type="button"
                            onClick={() =>
                              setPreviewImage({
                                src: msg.attachmentData!,
                                name: msg.attachmentName || 'Imagem anexada',
                              })
                            }
                            className="mt-2.5 block rounded-xl overflow-hidden border border-black/10 dark:border-white/10 cursor-pointer"
                          >
                            <img
                              src={msg.attachmentData}
                              alt={msg.attachmentName || 'Foto anexada'}
                              referrerPolicy="no-referrer"
                              className="max-h-64 w-auto object-cover"
                            />
                          </button>
                        )}

                        {msg.attachmentType === 'audio' && msg.attachmentData && (
                          <div className="mt-2.5">
                            <audio controls src={msg.attachmentData} className="w-full max-w-xs h-9" />
                          </div>
                        )}

                        {msg.attachmentType === 'file' && msg.attachmentData && (
                          <a
                            href={msg.attachmentData}
                            download={msg.attachmentName || 'arquivo'}
                            className={`mt-2.5 flex items-center gap-2.5 px-3 py-2 rounded-xl border text-xs font-medium ${
                              isMine
                                ? 'bg-blue-700/60 border-blue-500 text-white hover:bg-blue-700'
                                : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700'
                            }`}
                          >
                            <FileText className="w-4 h-4 shrink-0" />
                            <span className="truncate">{msg.attachmentName}</span>
                            <Download className="w-3.5 h-3.5 shrink-0 ml-auto" />
                          </a>
                        )}

                        <div
                          className={`mt-2 pt-1.5 border-t flex items-center gap-3 text-[11px] ${
                            isMine
                              ? 'border-blue-500/40 text-blue-100'
                              : 'border-slate-100 dark:border-slate-800 text-slate-500 dark:text-slate-400'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => togglePinMessage(msg)}
                            className="inline-flex items-center gap-1 hover:underline cursor-pointer"
                          >
                            <Pin className="w-3 h-3" />
                            <span>{msg.pinned ? 'Desafixar' : 'Fixar'}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleResolveMessage(msg)}
                            className="inline-flex items-center gap-1 hover:underline cursor-pointer"
                          >
                            <CheckCircle2 className="w-3 h-3" />
                            <span>{msg.resolved ? 'Reabrir' : 'Marcar resolvida'}</span>
                          </button>
                          {isMine && (
                            <button
                              type="button"
                              onClick={() => handleDeleteMessage(msg)}
                              className="inline-flex items-center gap-1 hover:underline cursor-pointer ml-auto"
                            >
                              <Trash2 className="w-3 h-3" />
                              <span>Excluir</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={bottomRef} />
            </div>

            {/* Composer (locked for students unless active; always available if active or professor) */}
            {!canCurrentUserSend ? (
              <div className="bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 px-4 py-3.5 text-center text-xs text-slate-500 dark:text-slate-400">
                Envio de mensagens bloqueado até a liberação pelo professor.
              </div>
            ) : (
              <form
                onSubmit={handleSendMessage}
                className="bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 p-3 sm:p-4 space-y-2.5"
              >
                {composerFeedback && (
                  <div className="text-xs text-rose-600 dark:text-rose-400 font-medium">
                    {composerFeedback}
                  </div>
                )}

                {pendingAttachment && (
                  <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs">
                    <span className="truncate font-medium text-slate-800 dark:text-slate-200">
                      Anexo pronto: {pendingAttachment.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => setPendingAttachment(null)}
                      className="p-1 text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                      aria-label="Remover anexo"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1">
                    {TOPICS.map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setComposerTopic(t)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                          composerTopic === t
                            ? 'bg-blue-600 text-white'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>

                  {isRecording && (
                    <span className="text-xs font-mono font-semibold text-rose-600 dark:text-rose-400 tabular-nums">
                      Gravando áudio: 00:{String(recordingSeconds).padStart(2, '0')}
                    </span>
                  )}
                </div>

                <div className="flex items-end gap-2">
                  <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleImagePick}
                    className="hidden"
                  />
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.doc,.docx,.txt,.csv,.zip,.py,.ts,.tsx,.js"
                    onChange={handleFilePick}
                    className="hidden"
                  />

                  <button
                    type="button"
                    onClick={() => imageInputRef.current?.click()}
                    className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
                    title="Enviar foto"
                    aria-label="Enviar foto"
                  >
                    <ImageIcon className="w-5 h-5" />
                  </button>

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
                    title="Enviar arquivo"
                    aria-label="Enviar arquivo"
                  >
                    <Paperclip className="w-5 h-5" />
                  </button>

                  <button
                    type="button"
                    onClick={isRecording ? stopRecording : startRecording}
                    className={`min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl border transition-colors cursor-pointer shrink-0 ${
                      isRecording
                        ? 'bg-rose-600 border-rose-600 text-white'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                    title={isRecording ? 'Parar gravação' : 'Gravar áudio'}
                    aria-label={isRecording ? 'Parar gravação' : 'Gravar áudio'}
                  >
                    {isRecording ? <Square className="w-4 h-4" /> : <Mic className="w-5 h-5" />}
                  </button>

                  <textarea
                    rows={1}
                    value={composerText}
                    onChange={(e) => setComposerText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage(e);
                      }
                    }}
                    placeholder={
                      isProfessor
                        ? 'Responder ao aluno ou enviar orientação...'
                        : 'Escreva sua dúvida ou recado para a disciplina...'
                    }
                    className="flex-1 min-h-[44px] max-h-28 px-3.5 py-2.5 text-sm rounded-xl bg-slate-100 dark:bg-slate-800 border border-transparent focus:border-blue-500 focus:bg-white dark:focus:bg-slate-900 outline-none resize-none text-slate-900 dark:text-slate-100 placeholder:text-slate-500"
                  />

                  <button
                    type="submit"
                    disabled={sending || (!composerText.trim() && !pendingAttachment)}
                    className="min-h-[44px] px-4 rounded-xl bg-blue-600 text-white font-semibold text-sm hover:bg-blue-700 disabled:opacity-40 transition-colors flex items-center gap-2 cursor-pointer shrink-0"
                  >
                    <Send className="w-4 h-4" />
                    <span className="hidden sm:inline">Enviar</span>
                  </button>
                </div>
              </form>
            )}
          </>
        )}
      </section>

      {/* Image Lightbox */}
      {previewImage && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setPreviewImage(null)}
        >
          <div
            className="max-w-3xl w-full bg-white dark:bg-slate-900 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 flex items-center justify-between border-b border-slate-200 dark:border-slate-800">
              <span className="text-sm font-semibold truncate">{previewImage.name}</span>
              <button
                type="button"
                onClick={() => setPreviewImage(null)}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <img
              src={previewImage.src}
              alt={previewImage.name}
              referrerPolicy="no-referrer"
              className="w-full max-h-[75vh] object-contain bg-slate-950"
            />
          </div>
        </div>
      )}

      {/* Create / Request / Direct Professor Initiate / Join Modal */}
      {showRoomModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-bold text-lg text-slate-900 dark:text-white">
                {roomModalMode === 'join'
                  ? 'Entrar por Código'
                  : isProfessor
                  ? 'Iniciar Conversa com Aluno'
                  : 'Solicitar Bate-Papo com Professor'}
              </h3>
              <button
                type="button"
                onClick={() => setShowRoomModal(false)}
                className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800">
              <button
                type="button"
                onClick={() => {
                  setRoomModalMode('create');
                  setRoomModalError(null);
                }}
                className={`py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                  roomModalMode === 'create'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                {isProfessor ? 'Chamar Aluno (Direto)' : 'Solicitar Chat'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setRoomModalMode('join');
                  setRoomModalError(null);
                }}
                className={`py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                  roomModalMode === 'join'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Usar Código
              </button>
            </div>

            <form onSubmit={handleCreateOrJoinRoom} className="space-y-4">
              {roomModalMode === 'create' ? (
                isProfessor ? (
                  <>
                    <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      Como professor, você inicia a conversa diretamente e sem necessidade de aprovação prévia do aluno.
                    </p>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Nome do Aluno
                      </label>
                      <input
                        type="text"
                        list="known-students-list"
                        value={newRoomStudentName}
                        onChange={(e) => setNewRoomStudentName(e.target.value)}
                        placeholder="Ex: Lucas Oliveira"
                        className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-none focus:border-blue-500"
                      />
                      {knownStudents.length > 0 && (
                        <datalist id="known-students-list">
                          {knownStudents.map((st) => (
                            <option key={st.uid} value={st.displayName} />
                          ))}
                        </datalist>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Disciplina
                      </label>
                      <input
                        type="text"
                        value={newRoomSubject}
                        onChange={(e) => setNewRoomSubject(e.target.value)}
                        placeholder="Ex: Cálculo III"
                        className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-none focus:border-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Primeira Mensagem (Opcional)
                      </label>
                      <textarea
                        rows={2}
                        value={openingMessage}
                        onChange={(e) => setOpeningMessage(e.target.value)}
                        placeholder="Ex: Olá! Gostaria de conversar sobre seu último trabalho..."
                        className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-none focus:border-blue-500 resize-none"
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      Sua solicitação ficará pendente até o professor aceitar o bate-papo.
                    </p>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Disciplina
                      </label>
                      <input
                        type="text"
                        value={newRoomSubject}
                        onChange={(e) => setNewRoomSubject(e.target.value)}
                        placeholder="Ex: Física Quântica"
                        className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-none focus:border-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Professor Responsável
                      </label>
                      <input
                        type="text"
                        value={newRoomProfessor}
                        onChange={(e) => setNewRoomProfessor(e.target.value)}
                        placeholder="Ex: Prof. Ricardo Mendes"
                        className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-none focus:border-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Título (Opcional)
                      </label>
                      <input
                        type="text"
                        value={newRoomTitle}
                        onChange={(e) => setNewRoomTitle(e.target.value)}
                        placeholder="Ex: Dúvida sobre Lista 4"
                        className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-none focus:border-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Assunto / Motivo da Solicitação
                      </label>
                      <textarea
                        rows={2}
                        value={openingMessage}
                        onChange={(e) => setOpeningMessage(e.target.value)}
                        placeholder="Descreva brevemente sua dúvida para o professor avaliar..."
                        className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-none focus:border-blue-500 resize-none"
                      />
                    </div>
                  </>
                )
              ) : (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Código da Sala Compartilhada
                  </label>
                  <input
                    type="text"
                    value={joinCodeInput}
                    onChange={(e) => setJoinCodeInput(e.target.value)}
                    placeholder="Ex: PROF-9F2K1"
                    className="w-full px-3.5 py-2.5 text-sm font-mono uppercase rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-none focus:border-blue-500"
                  />
                </div>
              )}

              {roomModalError && (
                <p className="text-xs text-rose-600 dark:text-rose-400">{roomModalError}</p>
              )}

              <button
                type="submit"
                disabled={creatingRoom}
                className="w-full min-h-[44px] rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                <UserPlus className="w-4 h-4" />
                <span>
                  {creatingRoom
                    ? 'Processando...'
                    : roomModalMode === 'join'
                    ? 'Entrar na Sala'
                    : isProfessor
                    ? 'Iniciar Conversa Agora'
                    : 'Enviar Solicitação'}
                </span>
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
