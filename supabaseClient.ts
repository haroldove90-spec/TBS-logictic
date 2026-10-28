import { createClient } from '@supabase/supabase-js';

/**
 * TBS Logistics - Cliente Supabase (Vercel Ready)
 * 
 * Configuración estable para evitar errores de conexión interrumpida.
 */

const env = (import.meta as any).env || {};

const supabaseUrl = env.VITE_SUPABASE_URL || 'https://vkzzfccktctoljvkmwsz.supabase.co';

// API Key oficial del proyecto proporcionada por el usuario
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZrenpmY2NrdGN0b2xqdmttd3N6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwMTU5MjcsImV4cCI6MjA4MTU5MTkyN30.E-gEYVtixbbfmktUKVXUOUykr5vHizqVfvzMaJ3Thtk'; 

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