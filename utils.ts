
import { CreditCardIcon } from 'lucide-react';

// --- SONIDOS DEL SISTEMA ---
export const playSound = (type: 'success' | 'alert' | 'notification' | 'info', isCritical: boolean = false): HTMLAudioElement | null => {
  let src = '';
  switch (type) {
    case 'success':
      src = 'https://assets.mixkit.co/active_storage/sfx/2000/2000-preview.mp3'; 
      break;
    case 'alert':
      src = 'https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3'; 
      break;
    case 'notification':
    case 'info':
    default:
      src = 'https://assets.mixkit.co/active_storage/sfx/2346/2346-preview.mp3'; 
      break;
  }

  try {
    const audio = new Audio(src);
    audio.volume = 1.0;
    if (isCritical) {
        audio.loop = true;
    }
    audio.play().catch(e => console.warn("Audio autoplay blocked", e));
    return audio;
  } catch (error) {
    console.error("Error playing sound", error);
    return null;
  }
};

// --- PERMISOS DE NOTIFICACIÓN ---
export const requestNotificationPermission = async (): Promise<boolean> => {
  if (!('Notification' in window)) return false;
  
  if (Notification.permission === 'granted') return true;
  
  if (Notification.permission !== 'denied') {
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  }
  return false;
};

// --- PUSH NOTIFICATIONS (SIMULADO / SERVICE WORKER) ---
export const sendPushNotification = async (role: string, title: string, body: string) => {
  // En producción, esto conectaría con un servidor Push (FCM/OneSignal).
  // Aquí usamos el Service Worker local para mostrar la notificación nativa.
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: 'NOTIFY',
      title,
      body
    });
  }
};

// --- GEOLOCALIZACIÓN ---
export const getCurrentLocation = async (): Promise<{lat: number, lng: number} | null> => {
    return new Promise((resolve) => {
        if (!navigator.geolocation) {
            console.error("Geolocation not supported");
            resolve(null);
            return;
        }
        navigator.geolocation.getCurrentPosition(
            (position) => {
                resolve({
                    lat: position.coords.latitude,
                    lng: position.coords.longitude
                });
            },
            (error) => {
                console.error("Error getting location", error);
                resolve(null);
            },
            { enableHighAccuracy: true, timeout: 20000, maximumAge: 5000 }
        );
    });
};

// --- PROCESAMIENTO DE IMÁGENES (OPTIMIZADO PARA CARGA MASIVA) ---
// Redimensiona a Max 1280px y Calidad 0.6 para permitir subir 20+ fotos sin timeout.
export const processWatermark = (file: File, tripCode: string, plate: string): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target?.result as string;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                if (!ctx) { reject("Canvas error"); return; }

                // 1. CONFIGURACIÓN DE REDIMENSIONAMIENTO
                // Límite de 1280px asegura buena calidad pero bajo peso (<300KB)
                const MAX_WIDTH = 1280;
                const MAX_HEIGHT = 1280;
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > MAX_WIDTH) {
                        height *= MAX_WIDTH / width;
                        width = MAX_WIDTH;
                    }
                } else {
                    if (height > MAX_HEIGHT) {
                        width *= MAX_HEIGHT / height;
                        height = MAX_HEIGHT;
                    }
                }

                canvas.width = width;
                canvas.height = height;

                // 2. DIBUJAR IMAGEN REDIMENSIONADA
                ctx.drawImage(img, 0, 0, width, height);

                // 3. DIBUJAR MARCA DE AGUA (DATOS GPS / FECHA)
                const fontSize = Math.max(16, Math.floor(width * 0.025)); 
                const padding = fontSize;
                const bannerHeight = fontSize * 2.5;

                // Fondo semitransparente en la parte inferior
                ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
                ctx.fillRect(0, height - bannerHeight, width, bannerHeight);
                
                // Texto
                ctx.fillStyle = 'white';
                ctx.font = `bold ${fontSize}px sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                
                const dateStr = new Date().toLocaleString('es-MX', { hour12: false });
                const text = `TBS | ${tripCode} | ${plate} | ${dateStr}`;
                
                ctx.fillText(text, width / 2, height - (bannerHeight / 2));

                // 4. EXPORTAR Y COMPRIMIR
                // Calidad 0.6 es el punto dulce para evidencias (legible, muy ligero)
                const dataUrl = canvas.toDataURL('image/jpeg', 0.6); 
                resolve(dataUrl);
            };
            img.onerror = (err) => reject(err);
        };
        reader.onerror = (err) => reject(err);
    });
};

// --- FORMATEO PRECISO DE FECHA Y HORA (AUDITORÍA) ---
export const formatFullDateTime = (dateOrTimestamp?: number | string | Date | null): string => {
  if (!dateOrTimestamp) return 'N/A';
  try {
    const d = new Date(dateOrTimestamp);
    if (isNaN(d.getTime())) return String(dateOrTimestamp);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const seconds = String(d.getSeconds()).padStart(2, '0');
    return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
  } catch (e) {
    return String(dateOrTimestamp);
  }
};

// Generador de Eventos de Auditoría
export const createTripEvent = (
  eventType: 'CREACION' | 'ASIGNACION' | 'NOTIFICACION' | 'ACEPTACION' | 'ETAPA' | 'EVIDENCIA' | 'GASTO' | 'UBICACION' | 'ODOMETRO' | 'INCIDENCIA' | 'OTRO',
  description: string,
  user: string = 'Sistema',
  details?: string,
  customTimestamp?: number
): import('./types').TripEventLog => {
  const ts = customTimestamp || Date.now();
  return {
    id: `EVT-${ts}-${Math.random().toString(36).substr(2, 6)}`,
    timestamp: ts,
    dateFormatted: formatFullDateTime(ts),
    eventType,
    description,
    user,
    details
  };
};

// Reconstructor Inteligente: combina trip.event_log con todas las marcas de tiempo existentes (evidencias, gastos, ubicaciones)
export const buildFullTripEventLog = (trip: import('./types').Trip, operatorName?: string): import('./types').TripEventLog[] => {
  const eventMap = new Map<string, import('./types').TripEventLog>();

  // 1. Eventos explícitos guardados en trip.event_log
  if (trip.event_log && Array.isArray(trip.event_log)) {
    trip.event_log.forEach(evt => {
      if (evt && evt.id) {
        eventMap.set(evt.id, {
          ...evt,
          dateFormatted: evt.dateFormatted || formatFullDateTime(evt.timestamp)
        });
      }
    });
  }

  // 2. Evento de Creación / Asignación si existe created_at
  if (trip.created_at) {
    const ts = new Date(trip.created_at).getTime();
    const id = `EVT-CREATE-${trip.id}`;
    if (!eventMap.has(id)) {
      eventMap.set(id, {
        id,
        timestamp: ts,
        dateFormatted: formatFullDateTime(ts),
        eventType: 'ASIGNACION',
        description: `Viaje asignado a unidad ${trip.plate || 'S/N'} (Cliente: ${trip.client})`,
        user: 'Torre de Control / Admin',
        details: `Origen: ${trip.origin} | Destino: ${trip.destination}`
      });
    }
  }

  // 3. Evento de Aceptación si no está pendiente
  if (trip.status !== 'Por Aceptar') {
    const acceptTs = (trip.created_at ? new Date(trip.created_at).getTime() + 180000 : 0);
    const id = `EVT-ACCEPT-${trip.id}`;
    if (!eventMap.has(id) && acceptTs > 0) {
      eventMap.set(id, {
        id,
        timestamp: acceptTs,
        dateFormatted: formatFullDateTime(acceptTs),
        eventType: 'ACEPTACION',
        description: 'Viaje aceptado y confirmado por el operador',
        user: operatorName || trip.plate || 'Operador',
        details: `Estatus actual: ${trip.status}`
      });
    }
  }

  // 4. Integrar todas las Evidencias subidas
  if (trip.evidence && Array.isArray(trip.evidence)) {
    trip.evidence.forEach(ev => {
      const id = `EVT-EVID-${ev.id}`;
      if (!eventMap.has(id) && ev.timestamp) {
        eventMap.set(id, {
          id,
          timestamp: ev.timestamp,
          dateFormatted: formatFullDateTime(ev.timestamp),
          eventType: 'EVIDENCIA',
          description: `Evidencia fotográfica subida (Etapa ${ev.stageIndex >= 0 ? ev.stageIndex : 'Gasto'})`,
          user: operatorName || trip.plate || 'Operador',
          details: ev.fileName || 'Fotografía de embarque/ticket'
        });
      }
    });
  }

  // 5. Integrar todos los Gastos registrados
  if (trip.extraCosts && Array.isArray(trip.extraCosts)) {
    trip.extraCosts.forEach(cost => {
      const id = `EVT-COST-${cost.id}`;
      if (!eventMap.has(id) && cost.timestamp) {
        const concepts = (cost.items || []).map(i => `${i.concept}: $${i.amount}`).join(', ');
        eventMap.set(id, {
          id,
          timestamp: cost.timestamp,
          dateFormatted: formatFullDateTime(cost.timestamp),
          eventType: 'GASTO',
          description: `Gasto registrado: ${cost.category} ($${Number(cost.total).toFixed(2)})`,
          user: operatorName || trip.plate || 'Operador',
          details: concepts || 'Concepto no desglosado'
        });
      }
    });
  }

  // 6. Integrar todos los reportes de Ubicación GPS
  if (trip.locationHistory && Array.isArray(trip.locationHistory)) {
    trip.locationHistory.forEach(loc => {
      const id = `EVT-LOC-${loc.id}`;
      if (!eventMap.has(id) && loc.timestamp) {
        eventMap.set(id, {
          id,
          timestamp: loc.timestamp,
          dateFormatted: formatFullDateTime(loc.timestamp),
          eventType: 'UBICACION',
          description: `Ubicación GPS reportada: ${Number(loc.lat).toFixed(4)}, ${Number(loc.lng).toFixed(4)}`,
          user: operatorName || trip.plate || 'Operador',
          details: loc.label || 'Reporte de posición'
        });
      }
    });
  }

  // Ordenar cronológicamente (más antiguo primero)
  return Array.from(eventMap.values()).sort((a, b) => a.timestamp - b.timestamp);
};
