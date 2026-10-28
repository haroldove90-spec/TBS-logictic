
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
