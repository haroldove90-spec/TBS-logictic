

import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Fix: casting process to any to resolve TS error for cwd() method
  const env = loadEnv(mode, (process as any).cwd(), '');
  
  return {
    plugins: [react()],
    build: {
      outDir: 'dist',
      sourcemap: false,
      // Usamos esbuild que es nativo de Vite para evitar errores por falta de dependencia 'terser'
      minify: 'esbuild', 
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ['react', 'react-dom', '@supabase/supabase-js', 'lucide-react']
          }
        }
      }
    },
    // Definimos process.env para compatibilidad de librerías en el navegador
    define: {
      'process.env': {}
    },
    server: {
      port: 3000,
      host: true
    }
  };
});