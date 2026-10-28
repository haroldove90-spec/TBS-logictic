
import React, { useState, useEffect, useRef } from 'react';
import { LogOut, Bell, BellOff, BellRing, X, Check, Trash2, Settings, Image as ImageIcon, Info, RefreshCw, Lock, MapPin, ExternalLink, Download } from 'lucide-react';
import { requestNotificationPermission, playSound } from './utils';
import { AppNotification } from './types';
import { supabase } from './supabaseClient';

interface HeaderProps {
  userName?: string;
  role?: 'ADMIN' | 'OPERATOR';
  onLogout: () => void;
  notifications: AppNotification[];
  onMarkAsRead: (id: string) => void;
  onDeleteNotification: (id: string) => void;
  onClearAll: () => void;
}

export const Header: React.FC<HeaderProps> = ({ userName, role, onLogout, notifications, onMarkAsRead, onDeleteNotification, onClearAll }) => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [showPanel, setShowPanel] = useState(false);
  const [selectedNotification, setSelectedNotification] = useState<AppNotification | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<NotificationPermission>('default');
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const unreadCount = notifications.filter(n => !n.is_read).length;

  useEffect(() => {
    const isRunningStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true;
    setIsStandalone(isRunningStandalone);

    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
    };
  }, []);

  const handleInstallApp = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      setDeferredPrompt(null);
    } else {
      alert("Para instalar en Android:\n1. Toca los tres puntos (⋮) en la esquina superior de Chrome.\n2. Selecciona 'Instalar aplicación' o 'Agregar a pantalla principal'.");
    }
  };

  const checkPermission = () => {
    if ('Notification' in window) {
      setPermissionStatus(Notification.permission);
    }
  };

  useEffect(() => {
    checkPermission();
    
    const handleScroll = () => setIsScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll, { passive: true });
    
    // Re-check permission on window focus (in case user changed it in settings)
    window.addEventListener('focus', checkPermission);

    const handleClickOutside = (event: MouseEvent) => {
        if (
            showPanel && 
            panelRef.current && 
            !panelRef.current.contains(event.target as Node) &&
            buttonRef.current &&
            !buttonRef.current.contains(event.target as Node)
        ) {
            setShowPanel(false);
        }
    };
    document.addEventListener('mousedown', handleClickOutside);
    
    return () => {
        window.removeEventListener('scroll', handleScroll);
        window.removeEventListener('focus', checkPermission);
        document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showPanel]);

  const handleRequestPermission = async () => {
    if (!('Notification' in window)) {
        alert("Tu navegador no soporta notificaciones de escritorio.");
        return;
    }

    // Intentar solicitar permiso directamente.
    // Si el usuario ya lo tiene en "Bloqueado", esto retornará false inmediatamente sin prompt.
    // Si el usuario lo cambió a "Preguntar" (reset), esto mostrará el prompt.
    const granted = await requestNotificationPermission();
    setPermissionStatus(granted ? 'granted' : Notification.permission);

    if (granted) {
        playSound('success');
        try {
            new Notification("¡Notificaciones Activas!", {
                body: "Ahora recibirás alertas de tus bitácoras en tiempo real.",
                icon: "https://appdesignproyectos.com/tlsicono.png"
            });
        } catch (e) {
            console.error("Error lanzando notificación de prueba", e);
        }
    } else if (Notification.permission === 'denied') {
        // Solo mostramos la alerta manual si después de intentar solicitar sigue denegado
        alert("⚠️ Las notificaciones están BLOQUEADAS.\n\nPara activarlas:\n1. Haz clic en el icono del candado 🔒 en la barra de direcciones (arriba a la izquierda).\n2. Busca la opción 'Notificaciones' o 'Permisos'.\n3. Cambia el interruptor a 'Permitir'.\n4. Presiona el botón de 'Recargar' que aparecerá en este panel.");
    }
  };

  const handleReload = () => {
    window.location.reload();
  };

  const handleTogglePanel = () => {
    checkPermission(); // Verificar permisos al abrir
    setShowPanel(prev => !prev);
  };

  const handleNotificationClick = (notification: AppNotification) => {
    setSelectedNotification(notification);
    if (!notification.is_read) {
        onMarkAsRead(notification.id);
    }
  };

  const bgColor = role === 'ADMIN' ? 'bg-slate-900' : 'bg-blue-900';
  const panelTopClass = isScrolled ? 'top-[50px]' : 'top-[70px]';

  return (
    <>
        <header 
        className={`fixed top-0 left-0 right-0 z-[1000] ${bgColor} text-white shadow-md transition-all duration-300 ease-in-out ${
            isScrolled ? 'h-[50px]' : 'h-[70px]'
        }`}
        >
        <div className="max-w-7xl mx-auto h-full px-4 flex justify-between items-center">
            <div className="flex items-center space-x-3">
            <div className="flex-shrink-0 flex items-center justify-center">
                <img 
                src="https://appdesignproyectos.com/tlslogo.png" 
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).src = '/tlslogo.png';
                }}
                alt="TLS Logo" 
                className={`w-auto object-contain transition-all duration-300 ${
                    isScrolled ? 'h-[30px]' : 'h-[40px]'
                }`}
                />
            </div>
            
            <div 
                className={`h-6 w-px bg-white/20 mx-1 hidden sm:block transition-opacity duration-300 ${
                isScrolled ? 'opacity-0' : 'opacity-100'
                }`}
            ></div>
            
            <span 
                className={`font-bold text-sm sm:text-base tracking-tight transition-all duration-300 transform ${
                isScrolled 
                    ? 'opacity-0 -translate-x-10 pointer-events-none w-0 overflow-hidden' 
                    : 'opacity-100 translate-x-0'
                }`}
            >
                Registro de Bitácoras
            </span>
            </div>

            <div className="flex items-center space-x-2 sm:space-x-3">
            {!isStandalone && (
              <button 
                onClick={handleInstallApp}
                title="Descargar / Instalar App en celular"
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-all shadow-sm active:scale-95 border border-blue-400/40"
              >
                <Download className={isScrolled ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
                <span className="hidden sm:inline">Instalar App</span>
              </button>
            )}

            <button 
                ref={buttonRef}
                onClick={handleTogglePanel}
                className={`p-2 rounded-full transition-all duration-300 relative ${
                showPanel ? 'bg-white/20 text-white' : 'hover:bg-white/10 text-white'
                }`}
            >
                {permissionStatus === 'denied' ? (
                 <BellOff className={isScrolled ? 'h-4 w-4' : 'h-5 w-5'} />
                ) : (
                 <Bell className={isScrolled ? 'h-4 w-4' : 'h-5 w-5'} />
                )}
                
                {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold ring-2 ring-slate-900">
                    {unreadCount > 9 ? '9+' : unreadCount}
                </span>
                )}
            </button>

            <div className={`flex flex-col text-right transition-all duration-300 ${isScrolled ? 'scale-90 opacity-80' : 'scale-100 opacity-100'}`}>
                <span className="text-[8px] uppercase font-black text-white/40 leading-none">
                {role === 'ADMIN' ? 'Control Tower' : 'Operador'}
                </span>
                <span className="text-xs font-bold truncate max-w-[80px] xs:max-w-[110px]">
                {userName}
                </span>
            </div>
            
            <button 
                onClick={onLogout}
                className={`p-2 hover:bg-white/10 rounded-full transition-all active:scale-90 ${
                isScrolled ? 'bg-transparent' : 'bg-white/5'
                }`}
            >
                <LogOut className={isScrolled ? 'h-4 w-4' : 'h-5 w-5'} />
            </button>
            </div>
        </div>
        </header>

        {showPanel && (
            <div 
                ref={panelRef} 
                className={`fixed ${panelTopClass} right-0 bottom-0 w-full sm:w-96 bg-white shadow-2xl z-[999] border-l border-gray-200 animate-in slide-in-from-right-10 flex flex-col transition-all duration-300`}
            >
                <div className="p-4 bg-slate-50 border-b border-gray-200 flex justify-between items-center">
                    <div>
                        <h3 className="font-black text-slate-800 text-lg">Notificaciones</h3>
                        <p className="text-xs text-slate-500">Historial de alertas recientes</p>
                    </div>
                    <div className="flex items-center gap-2">
                        {notifications.length > 0 && (
                            <button 
                                onClick={onClearAll}
                                className="p-2 hover:bg-red-100 rounded-full text-slate-400 hover:text-red-500 transition-colors"
                                title="Borrar Todas"
                            >
                                <Trash2 className="h-5 w-5" />
                            </button>
                        )}
                        <button onClick={() => setShowPanel(false)} className="p-2 hover:bg-slate-200 rounded-full text-slate-500"><X className="h-5 w-5"/></button>
                    </div>
                </div>
                
                {permissionStatus !== 'granted' && (
                    <div className={`p-3 mx-4 mt-4 rounded-lg border flex flex-col gap-2 ${permissionStatus === 'denied' ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}>
                        <div className="flex items-start gap-3">
                            {permissionStatus === 'denied' ? (
                                <Lock className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
                            ) : (
                                <BellOff className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                            )}
                            <div>
                                <p className={`text-xs font-bold mb-1 ${permissionStatus === 'denied' ? 'text-red-800' : 'text-amber-800'}`}>
                                    {permissionStatus === 'denied' ? 'Permisos Bloqueados por Navegador' : 'Permisos desactivados'}
                                </p>
                                {permissionStatus === 'denied' && (
                                    <p className="text-[10px] text-red-600 mb-2 leading-tight">
                                        Debes permitir las notificaciones desde el icono del candado 🔒 en la barra de dirección.
                                    </p>
                                )}
                                
                                <div className="flex gap-2">
                                    <button 
                                        onClick={handleRequestPermission} 
                                        className={`text-xs px-3 py-1.5 rounded-md font-bold transition-transform active:scale-95 ${
                                            permissionStatus === 'denied' 
                                            ? 'bg-white border border-red-200 text-red-700 hover:bg-red-50' 
                                            : 'bg-amber-200 text-amber-900 hover:bg-amber-300'
                                        }`}
                                    >
                                        {permissionStatus === 'denied' ? 'Ver Instrucciones / Reintentar' : 'Activar Notificaciones'}
                                    </button>
                                    
                                    {permissionStatus === 'denied' && (
                                        <button 
                                            onClick={handleReload}
                                            className="text-xs bg-red-600 text-white px-3 py-1.5 rounded-md font-bold hover:bg-red-700 active:scale-95 flex items-center"
                                        >
                                            <RefreshCw className="h-3 w-3 mr-1" /> Recargar
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {notifications.length === 0 ? (
                        <div className="text-center py-10 opacity-50">
                            <BellRing className="h-12 w-12 mx-auto text-slate-300 mb-2" />
                            <p className="text-sm font-bold text-slate-400">Sin notificaciones</p>
                        </div>
                    ) : (
                        notifications.map(n => (
                            <div 
                                key={n.id} 
                                onClick={() => handleNotificationClick(n)}
                                className={`p-3 rounded-xl border transition-all cursor-pointer ${
                                    n.is_read 
                                        ? 'bg-white border-slate-100 text-slate-500 hover:bg-slate-50 hover:border-slate-300' 
                                        : 'bg-blue-50 border-blue-100 shadow-sm hover:bg-blue-100 hover:shadow-md'
                                }`}
                            >
                                <div className="flex justify-between items-start mb-1">
                                    <h4 className={`text-sm font-bold ${n.is_read ? 'text-slate-700' : 'text-slate-900'}`}>{n.title}</h4>
                                    <div className="flex space-x-1">
                                        {!n.is_read && (
                                            <button onClick={(e) => { e.stopPropagation(); onMarkAsRead(n.id); }} className="p-1 hover:bg-blue-200 rounded text-blue-500" title="Marcar como leída"><Check className="h-3 w-3" /></button>
                                        )}
                                        <button onClick={(e) => { e.stopPropagation(); onDeleteNotification(n.id); }} className="p-1 hover:bg-red-100 rounded text-slate-400 hover:text-red-500" title="Eliminar"><Trash2 className="h-3 w-3" /></button>
                                    </div>
                                </div>
                                <p className="text-xs mb-2 leading-relaxed truncate">{n.message}</p>
                                
                                <div className="flex justify-between items-center">
                                    <span className="text-[10px] uppercase font-bold text-slate-400">{new Date(n.created_at).toLocaleString()}</span>
                                    {n.metadata?.lat && n.metadata?.lng ? (
                                        <MapPin className="h-3 w-3 text-red-500" />
                                    ) : n.metadata?.image_url ? (
                                        <ImageIcon className="h-3 w-3 text-slate-400" />
                                    ) : null}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        )}

        {selectedNotification && (
            <div className="fixed inset-0 z-[2000] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
                <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95">
                    <div className={`p-4 flex justify-between items-center ${
                        selectedNotification.type === 'alert' ? 'bg-red-600' : selectedNotification.type === 'success' ? 'bg-green-600' : 'bg-slate-900'
                    }`}>
                        <h3 className="text-white font-bold flex items-center">
                            <Info className="h-5 w-5 mr-2" /> Detalle de Notificación
                        </h3>
                        <button onClick={() => setSelectedNotification(null)} className="p-1 text-white/70 hover:text-white bg-white/10 rounded-full">
                            <X className="h-5 w-5" />
                        </button>
                    </div>
                    
                    <div className="p-6 max-h-[80vh] overflow-y-auto">
                        <h4 className="text-xl font-black text-slate-800 mb-2">{selectedNotification.title}</h4>
                        <p className="text-slate-600 font-medium leading-relaxed mb-4">{selectedNotification.message}</p>
                        
                        <div className="text-xs text-slate-400 font-bold uppercase tracking-widest mb-4">
                            Recibido: {new Date(selectedNotification.created_at).toLocaleString()}
                        </div>

                        {selectedNotification.metadata?.location_link && (
                            <a 
                                href={selectedNotification.metadata.location_link} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="block w-full text-center bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-lg mb-4 transition-colors uppercase text-xs tracking-wider"
                            >
                                LINK DE UBICACION GOOGLE MAPS, DE DONDE PRECIONA EL BOTON
                            </a>
                        )}

                        {selectedNotification.metadata?.image_url && (
                            <div className="mb-4">
                                <p className="text-xs font-bold text-slate-800 mb-2 uppercase">Evidencia Adjunta:</p>
                                <div className="rounded-xl overflow-hidden border border-slate-200 shadow-sm bg-slate-100">
                                    <img 
                                        src={selectedNotification.metadata.image_url} 
                                        alt="Evidencia Notificación" 
                                        className="w-full h-auto object-contain max-h-64"
                                    />
                                </div>
                            </div>
                        )}

                        {/* Mostrar Botón de Mapa si hay coordenadas */}
                        {selectedNotification.metadata?.lat && selectedNotification.metadata?.lng && (
                             <div className="mb-4 bg-blue-50 p-4 rounded-xl border border-blue-100">
                                <div className="flex items-center mb-2">
                                    <MapPin className="h-5 w-5 text-red-500 mr-2" />
                                    <p className="text-sm font-bold text-blue-900">Ubicación Compartida</p>
                                </div>
                                <a 
                                    href={`https://www.google.com/maps/search/?api=1&query=${selectedNotification.metadata.lat},${selectedNotification.metadata.lng}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="block w-full text-center bg-blue-600 text-white font-bold py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center"
                                >
                                    <ExternalLink className="h-4 w-4 mr-2" /> Abrir en Google Maps
                                </a>
                             </div>
                        )}

                        {selectedNotification.metadata?.trip_id && (
                             <p className="text-xs text-slate-400 mt-2">ID Viaje: {selectedNotification.metadata.trip_id}</p>
                        )}
                        
                        <div className="flex gap-3 mt-4">
                            <button 
                                onClick={(e) => { 
                                    if(selectedNotification) onDeleteNotification(selectedNotification.id); 
                                    setSelectedNotification(null); 
                                }}
                                className="flex-1 bg-red-50 text-red-600 font-bold py-3 rounded-xl hover:bg-red-100 transition-colors border border-red-100 flex items-center justify-center"
                            >
                                <Trash2 className="h-4 w-4 mr-2" /> Eliminar
                            </button>
                            <button 
                                onClick={() => setSelectedNotification(null)}
                                className="flex-1 bg-slate-100 text-slate-600 font-bold py-3 rounded-xl hover:bg-slate-200 transition-colors"
                            >
                                Cerrar
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        )}
    </>
  );
};
