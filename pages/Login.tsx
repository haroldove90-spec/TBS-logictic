
import React, { useState, useEffect } from 'react';
import { User } from '../types';
import { ShieldCheck, KeyRound, UserPlus, Truck, FileBadge, Hash, ChevronLeft, User as UserIcon, Lock, Download, X, Eye, EyeOff } from 'lucide-react';
import { supabase } from '../supabaseClient';

interface LoginProps {
  onLogin: (user: User) => void;
}

export const Login: React.FC<LoginProps> = ({ onLogin }) => {
  // Estado para Login
  const [loginUser, setLoginUser] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  // Estado para modo Registro
  const [isRegistering, setIsRegistering] = useState(false);
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [regData, setRegData] = useState({
    username: '',
    password: '',
    name: '',
    license: '',
    unit: '',
    plate: ''
  });

  // Estado para PWA Install
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallInstructions, setShowInstallInstructions] = useState(false);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      setDeferredPrompt(null);
    } else {
      setShowInstallInstructions(true);
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    const userClean = loginUser.trim();
    const passClean = loginPass.trim();
    const userUpper = userClean.toUpperCase();

    // 1. Acceso Hardcoded para ADMIN (Backdoor de seguridad/admin existente)
    if (userUpper === 'ADMIN' || userUpper === 'MONITOR') {
        setTimeout(() => {
            onLogin({
                id: 'ADM-001',
                name: 'Supervisor de Torre',
                role: 'ADMIN'
            });
        }, 500);
        return;
    }

    // 1.1 Acceso Hardcoded para Operador Solicitado
    if (userClean === 'operador' && passClean === '123ope') {
        setTimeout(() => {
            onLogin({
                id: 'OP-DEMO',
                name: 'Operador Demo',
                role: 'OPERATOR',
                plate: 'OP-DEMO'
            });
        }, 500);
        return;
    }

    // 2. Acceso Real a Base de Datos (Operadores y Administradores)
    try {
        const { data, error } = await supabase
            .from('operadores')
            .select('*')
            .ilike('username', userClean) // Case-insensitive para evitar fallos por mayúsculas en teclados móviles
            .eq('password', passClean)
            .single();

        if (error) {
            // PGRST116 significa que no se encontraron filas (0 resultados)
            if (error.code === 'PGRST116') {
                throw new Error('Credenciales incorrectas o usuario no encontrado.');
            }
            throw error; // Otros errores de conexión
        }

        if (!data) {
            throw new Error('Credenciales incorrectas o usuario no encontrado.');
        }

        // Login Exitoso - Detecta si es ADMIN desde la base de datos
        // CORRECCIÓN: Validación robusta. Normalizamos a mayúsculas y quitamos espacios para evitar errores.
        const dbRole = data.role ? data.role.trim().toUpperCase() : 'OPERATOR';
        const userRole = (dbRole === 'ADMIN') ? 'ADMIN' : 'OPERATOR';

        onLogin({
            id: data.id,
            name: data.name,
            role: userRole,
            plate: data.plate
        });

    } catch (err: any) {
        console.error("Login error:", err);
        setError(err.message || 'Error de conexión o credenciales inválidas.');
        setIsLoading(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    setIsLoading(true);

    if (!regData.name || !regData.unit || !regData.plate || !regData.username || !regData.password) {
        setError('Por favor complete todos los campos obligatorios (*).');
        setIsLoading(false);
        return;
    }

    try {
        // Verificar si el usuario ya existe
        const { data: existingUser } = await supabase.from('operadores').select('id').eq('username', regData.username.trim()).single();
        if (existingUser) {
            setError("El nombre de usuario ya está registrado. Intente con otro.");
            setIsLoading(false);
            return;
        }

        const { error: dbError } = await supabase.from('operadores').insert({
            username: regData.username.trim(),
            password: regData.password.trim(), 
            name: regData.name.trim(),
            license_number: regData.license.trim(),
            unit_number: regData.unit.trim(),
            plate: regData.plate.trim(),
            role: 'OPERATOR' // Por defecto al registrarse manualmente es operador
        });

        if (dbError) throw dbError;

        setSuccessMsg(`¡Registro Exitoso! Ya puedes ingresar con tu usuario: ${regData.username}`);
        setLoginUser(regData.username); // Autollenar el login
        setLoginPass('');
        
        // Reset form
        setRegData({ username: '', password: '', name: '', license: '', unit: '', plate: '' });
        
        // Volver al login tras breve pausa
        setTimeout(() => {
            setIsRegistering(false);
            setSuccessMsg('');
            setIsLoading(false);
        }, 2000);

    } catch (err: any) {
        console.error("Error registro:", err);
        setError("Error al registrar: Verifique su conexión o intente otro usuario.");
        setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden relative">
        <div className="bg-slate-900 p-10 text-center relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-full opacity-10 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-400 via-slate-900 to-slate-900"></div>
          
          <div className="flex justify-center mb-6 relative z-10">
            <img 
              src="https://appdesignproyectos.com/tlslogo.png" 
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).src = '/tlslogo.png';
              }}
              alt="TLS Logo" 
              className="w-auto h-20 object-contain"
            />
          </div>
          
          <h1 className="text-2xl font-black text-white relative z-10 tracking-tight">TBS Logistics Services</h1>
          <p className="text-slate-400 text-xs mt-1 relative z-10 font-bold uppercase tracking-widest">Control Operativo</p>
        </div>
        
        <div className="p-8">
          {isRegistering ? (
            /* FORMULARIO DE REGISTRO */
            <form onSubmit={handleRegisterSubmit} className="space-y-4 animate-in slide-in-from-right-10">
                <div className="flex items-center mb-2">
                    <button type="button" onClick={() => setIsRegistering(false)} className="mr-2 text-slate-400 hover:text-slate-600"><ChevronLeft/></button>
                    <h3 className="font-bold text-lg text-slate-800">Alta de Operador</h3>
                </div>

                {/* NUEVOS CAMPOS: CREDENCIALES */}
                <div className="bg-blue-50 p-3 rounded-xl border border-blue-100 mb-4 space-y-3">
                    <p className="text-[10px] font-black text-blue-500 uppercase tracking-wider mb-1">Crea tus credenciales de acceso</p>
                    <div>
                        <label className="block text-xs font-bold text-slate-600 mb-1">Usuario *</label>
                        <div className="relative">
                            <UserIcon className="absolute left-3 top-3 h-4 w-4 text-blue-400" />
                            <input required type="text" value={regData.username} onChange={e => setRegData({...regData, username: e.target.value})} className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm font-bold" placeholder="Ej. juan.perez" />
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-600 mb-1">Contraseña *</label>
                        <div className="relative">
                            <Lock className="absolute left-3 top-3 h-4 w-4 text-blue-400" />
                            <input 
                                required 
                                type={showRegPassword ? "text" : "password"} 
                                value={regData.password} 
                                onChange={e => setRegData({...regData, password: e.target.value})} 
                                className="w-full pl-9 pr-10 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm font-bold" 
                                placeholder="******" 
                            />
                            <button
                                type="button"
                                onClick={() => setShowRegPassword(!showRegPassword)}
                                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 focus:outline-none transition-colors"
                                title={showRegPassword ? "Ocultar contraseña" : "Ver contraseña"}
                                aria-label={showRegPassword ? "Ocultar contraseña" : "Ver contraseña"}
                            >
                                {showRegPassword ? (
                                    <EyeOff className="h-4 w-4" />
                                ) : (
                                    <Eye className="h-4 w-4" />
                                )}
                            </button>
                        </div>
                    </div>
                </div>

                <div>
                    <label className="block text-xs font-black text-slate-500 uppercase mb-1">Nombre Completo *</label>
                    <div className="relative">
                        <UserPlus className="absolute left-3 top-3 h-5 w-5 text-slate-400" />
                        <input required type="text" value={regData.name} onChange={e => setRegData({...regData, name: e.target.value})} className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Nombre Apellido" />
                    </div>
                </div>

                <div>
                    <label className="block text-xs font-black text-slate-500 uppercase mb-1">No. Licencia</label>
                    <div className="relative">
                        <FileBadge className="absolute left-3 top-3 h-5 w-5 text-slate-400" />
                        <input type="text" value={regData.license} onChange={e => setRegData({...regData, license: e.target.value})} className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Licencia Federal" />
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs font-black text-slate-500 uppercase mb-1">Unidad (Eco) *</label>
                        <div className="relative">
                            <Truck className="absolute left-3 top-3 h-5 w-5 text-slate-400" />
                            <input required type="text" value={regData.unit} onChange={e => setRegData({...regData, unit: e.target.value})} className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Eco-01" />
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-black text-slate-500 uppercase mb-1">Placas *</label>
                        <div className="relative">
                            <Hash className="absolute left-3 top-3 h-5 w-5 text-slate-400" />
                            <input required type="text" value={regData.plate} onChange={e => setRegData({...regData, plate: e.target.value})} className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" placeholder="XXX-999" />
                        </div>
                    </div>
                </div>

                {successMsg && (
                    <div className="bg-green-50 text-green-700 p-3 rounded-lg text-sm font-bold text-center animate-pulse border border-green-200">
                        {successMsg}
                    </div>
                )}
                
                {error && (
                    <div className="bg-red-50 text-red-600 text-sm p-3 rounded-xl flex items-center font-bold border border-red-100">
                        <ShieldCheck className="h-5 w-5 mr-2 shrink-0" /> {error}
                    </div>
                )}

                <button type="submit" disabled={isLoading} className="w-full py-4 rounded-xl text-white font-black text-sm uppercase tracking-widest shadow-lg bg-blue-700 hover:bg-blue-600 transition-all mt-2">
                    {isLoading ? 'Guardando...' : 'REGISTRARME'}
                </button>
            </form>
          ) : (
            /* FORMULARIO DE LOGIN CON CREDENCIALES */
            <form onSubmit={handleLoginSubmit} className="space-y-6 animate-in slide-in-from-left-10">
                <div className="space-y-4">
                    <div>
                        <label className="block text-xs font-black text-slate-500 uppercase mb-2 tracking-wider">Usuario</label>
                        <div className="relative">
                            <input
                                type="text"
                                value={loginUser}
                                onChange={(e) => setLoginUser(e.target.value)}
                                className="w-full pl-10 pr-4 py-4 bg-slate-50 border-2 border-slate-200 text-slate-900 placeholder-slate-400 rounded-xl focus:ring-4 focus:ring-blue-500/10 focus:border-blue-600 outline-none transition-all font-bold"
                                placeholder="Ingresa tu usuario"
                                autoComplete="username"
                                autoCapitalize="none"
                                autoCorrect="off"
                                spellCheck={false}
                            />
                            <UserIcon className="absolute left-3 top-4 h-5 w-5 text-slate-400" />
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-black text-slate-500 uppercase mb-2 tracking-wider">Contraseña</label>
                        <div className="relative">
                            <input
                                type={showPassword ? "text" : "password"}
                                value={loginPass}
                                onChange={(e) => setLoginPass(e.target.value)}
                                className="w-full pl-10 pr-12 py-4 bg-slate-50 border-2 border-slate-200 text-slate-900 placeholder-slate-400 rounded-xl focus:ring-4 focus:ring-blue-500/10 focus:border-blue-600 outline-none transition-all font-bold"
                                placeholder="******"
                                autoComplete="current-password"
                            />
                            <KeyRound className="absolute left-3 top-4 h-5 w-5 text-slate-400" />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-3 top-3.5 p-1 text-slate-400 hover:text-slate-600 focus:outline-none transition-colors"
                                title={showPassword ? "Ocultar contraseña" : "Ver contraseña"}
                                aria-label={showPassword ? "Ocultar contraseña" : "Ver contraseña"}
                            >
                                {showPassword ? (
                                    <EyeOff className="h-5 w-5" />
                                ) : (
                                    <Eye className="h-5 w-5" />
                                )}
                            </button>
                        </div>
                    </div>
                </div>

                {error && (
                <div className="bg-red-50 text-red-600 text-sm p-4 rounded-xl flex items-center font-bold border border-red-100 animate-in fade-in zoom-in-95">
                    <ShieldCheck className="h-5 w-5 mr-2 shrink-0" /> {error}
                </div>
                )}

                <button
                type="submit"
                disabled={isLoading}
                className={`w-full py-4 px-4 rounded-xl text-white font-black text-sm uppercase tracking-widest shadow-lg transition-all transform active:scale-[0.97]
                    ${isLoading ? 'bg-slate-700' : 'bg-blue-700 hover:bg-blue-600 hover:shadow-blue-200'}`}
                >
                {isLoading ? 'Verificando...' : 'INGRESAR AL SISTEMA'}
                </button>
                
                <div className="text-center pt-2">
                    <button 
                        type="button" 
                        onClick={() => setIsRegistering(true)}
                        className="text-sm font-bold text-blue-600 hover:text-blue-800 underline"
                    >
                        ¿Eres nuevo? Regístrate aquí
                    </button>
                </div>

                <div className="text-center pt-4 border-t border-slate-100 mt-4">
                    <button 
                        type="button" 
                        onClick={handleInstallClick}
                        className="w-full py-3 px-4 rounded-xl text-blue-700 bg-blue-50 font-black text-sm uppercase tracking-widest border border-blue-200 hover:bg-blue-100 flex items-center justify-center gap-2 transition-all"
                    >
                        <Download className="w-5 h-5" /> Instalar App
                    </button>
                </div>

                {showInstallInstructions && (
                    <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-800 text-left relative animate-in fade-in">
                        <button 
                            type="button" 
                            onClick={() => setShowInstallInstructions(false)}
                            className="absolute top-2 right-2 text-blue-400 hover:text-blue-600"
                        >
                            <X className="w-4 h-4" />
                        </button>
                        <p className="font-bold mb-2">Para instalar manualmente:</p>
                        <ul className="list-disc pl-4 space-y-1 text-xs">
                            <li><strong>iOS (Safari):</strong> Toca el ícono de Compartir <span className="inline-block border border-blue-300 rounded px-1">↑</span> y selecciona "Agregar a inicio".</li>
                            <li><strong>Android (Chrome):</strong> Toca el menú <span className="inline-block border border-blue-300 rounded px-1">⋮</span> y selecciona "Instalar aplicación".</li>
                        </ul>
                    </div>
                )}
            </form>
          )}

          <div className="mt-8 text-center border-t border-slate-50 pt-6">
            <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">
              TBS Logistics Services v2.7
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
