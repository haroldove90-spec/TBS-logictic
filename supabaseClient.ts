import { createClient } from '@supabase/supabase-js';

/**
 * TBS Logistics - Cliente Supabase (Vercel Ready)
 * 
 * Configuración estable para evitar errores de conexión interrumpida.
 */

const env = (import.meta as any).env || {};

function sanitizeSupabaseUrl(raw?: string): string {
  if (!raw || typeof raw !== 'string') {
    return 'https://vkzzfccktctoljvkmwsz.supabase.co';
  }
  let url = raw.trim();

  // Si se pegó la URL del dashboard de Supabase (ej: https://supabase.com/dashboard/project/vkzzfccktctoljvkmwsz)
  const dashboardMatch = url.match(/supabase\.com\/dashboard\/project\/([a-z0-9_-]+)/i);
  if (dashboardMatch) {
    return `https://${dashboardMatch[1]}.supabase.co`;
  }

  // Prevenir error 'Invalid path specified in request URL' si se copió la REST URL con /rest/v1
  url = url.replace(/\/rest\/v1\/?$/i, '');
  url = url.replace(/\/+$/, '');

  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = `https://${url}`;
  }

  return url;
}

const rawUrl = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
export const supabaseUrl = sanitizeSupabaseUrl(rawUrl);

// Soporte para VITE_SUPABASE_ANON_KEY y para variantes como VITE_SUPABASE_ANO (nombre recortado en secrets)
const rawAnonKey = 
  env.VITE_SUPABASE_ANON_KEY || 
  env.VITE_SUPABASE_ANO || 
  env.VITE_SUPABASE_ANON || 
  env.SUPABASE_ANON_KEY;

export const supabaseAnonKey = (rawAnonKey && rawAnonKey.trim() !== '')
  ? rawAnonKey.trim()
  : 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZrenpmY2NrdGN0b2xqdmttd3N6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwMTU5MjcsImV4cCI6MjA4MTU5MTkyN30.E-gEYVtixbbfmktUKVXUOUykr5vHizqVfvzMaJ3Thtk';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false
  },
  global: {
    headers: { 'x-application-name': 'tbs-logistics' }
  }
});

/**
 * Verifica si la conexión con Supabase es válida
 */
export const checkStorageBucket = async () => {
  try {
    const { error } = await supabase.storage.from('evidencias').list('', { limit: 1 });
    if (error) {
      console.error("Supabase Connectivity Error:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error("Critical Connection Error:", err);
    return false;
  }
};