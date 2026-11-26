import { DeadlineItem, GoogleCalendarEvent } from '../types/academic';

const CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

export async function fetchUpcomingCalendarEvents(
  accessToken: string,
  daysAhead = 45
): Promise<GoogleCalendarEvent[]> {
  const now = new Date();
  const timeMin = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const timeMax = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000).toISOString();

  const url = new URL(CALENDAR_API_BASE);
  url.searchParams.set('timeMin', timeMin);
  url.searchParams.set('timeMax', timeMax);
  url.searchParams.set('singleEvents', 'true');
  url.searchParams.set('orderBy', 'startTime');
  url.searchParams.set('maxResults', '30');

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Erro Google Calendar (${response.status}): ${errBody}`);
  }

  const data = await response.json();
  return Array.isArray(data.items) ? data.items : [];
}

export async function createDeadlineCalendarEvent(
  accessToken: string,
  deadline: DeadlineItem
): Promise<GoogleCalendarEvent> {
  const timeStr = deadline.dueTime && deadline.dueTime.includes(':') ? deadline.dueTime : '23:59';
  const startDateTime = new Date(`${deadline.dueDate}T${timeStr}:00`);
  const endDateTime = new Date(startDateTime.getTime() + 60 * 60 * 1000);

  const typeLabelMap: Record<DeadlineItem['type'], string> = {
    prova: 'Prova',
    trabalho: 'Trabalho',
    atividade: 'Atividade',
    reuniao: 'Orientação',
  };

  const payload = {
    summary: `[Eai Professô · ${typeLabelMap[deadline.type]}] ${deadline.title}`,
    description: `Disciplina: ${deadline.subject}\nPrioridade: ${deadline.priority.toUpperCase()}\n${deadline.notes || ''}`,
    start: {
      dateTime: startDateTime.toISOString(),
    },
    end: {
      dateTime: endDateTime.toISOString(),
    },
    reminders: {
      useDefault: false,
      overrides: [
        {
          method: 'popup',
          minutes: Math.max(5, Math.min(40320, deadline.reminderMinutes || 60)),
        },
      ],
    },
  };

  const response = await fetch(CALENDAR_API_BASE, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Falha ao criar evento no Google Calendar (${response.status}): ${errBody}`);
  }

  return await response.json();
}

export async function deleteCalendarEvent(accessToken: string, eventId: string): Promise<void> {
  const response = await fetch(`${CALENDAR_API_BASE}/${encodeURIComponent(eventId)}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok && response.status !== 404 && response.status !== 410) {
    const errBody = await response.text();
    throw new Error(`Falha ao remover evento do Google Calendar (${response.status}): ${errBody}`);
  }
}
