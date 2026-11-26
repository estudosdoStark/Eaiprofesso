export function isNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!isNotificationSupported()) return 'denied';
  if (Notification.permission === 'granted') return 'granted';
  return await Notification.requestPermission();
}

export function isWithinAcademicHours(
  start = '08:00',
  end = '18:00',
  silenceOutside = false
): boolean {
  if (!silenceOutside) return true;
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  const [sH, sM] = start.split(':').map(Number);
  const [eH, eM] = end.split(':').map(Number);
  if (Number.isNaN(sH) || Number.isNaN(eH)) return true;

  const startMinutes = sH * 60 + (sM || 0);
  const endMinutes = eH * 60 + (eM || 0);

  if (startMinutes <= endMinutes) {
    return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
  }
  return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
}

export function sendPushNotification(title: string, body: string, tag?: string): boolean {
  if (!isNotificationSupported() || Notification.permission !== 'granted') {
    return false;
  }

  try {
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.ready.then((reg) => {
        reg.showNotification(title, {
          body,
          icon: '/pwa-192x192.png',
          badge: '/pwa-192x192.png',
          tag: tag || 'aulaviva-alert',
        });
      });
      return true;
    }

    new Notification(title, {
      body,
      icon: '/pwa-192x192.png',
      tag: tag || 'aulaviva-alert',
    });
    return true;
  } catch {
    return false;
  }
}
