
import React, { useState, useEffect, useRef } from 'react';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { TripDetail } from './pages/TripDetail';
import { AdminDashboard } from './pages/AdminDashboard';
import { Header } from './Header';
import { User, Trip, TripStatus, AppNotification } from './types';
import { MOCK_TRIPS, TRIP_STAGES } from './constants';
import { requestNotificationPermission, playSound, sendPushNotification } from './utils';
import { supabase } from './supabaseClient';
import { Siren, X, CheckCircle, AlertCircle, Info, Truck, RefreshCw } from 'lucide-react';
import { NewTripModal } from './pages/NewTripModal';

enum View {
  LOGIN,
  DASHBOARD,
  TRIP_DETAIL,
  ADMIN_DASHBOARD
}

interface ToastNotification {
  id: string;
  title: string;
  message: string;
  type: 'success' | 'alert' | 'info';
}

const App: React.FC = () => {
  // --- SESSION PERSISTENCE LOGIC ---
  const [user, setUser] = useState<User | null>(() => {
    try {
      const savedUser = localStorage.getItem('tls_session_user');
      return savedUser ? JSON.parse(savedUser) : null;
    } catch (e) {
      console.error("Error reading session", e);
      return null;
    }
  });

  const [currentView, setCurrentView] = useState<View>(() => {
    try {
      const savedUser = localStorage.getItem('tls_session_user');
      if (savedUser) {
        const parsedUser = JSON.parse(savedUser);
        return parsedUser.role === 'ADMIN' ? View.ADMIN_DASHBOARD : View.DASHBOARD;
      }
    } catch (e) {}
    return View.LOGIN;
  });

  const [trips, setTrips] = useState<Trip[]>(MOCK_TRIPS);
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [toasts, setToasts] = useState<ToastNotification[]>([]);
  const [newlyAssignedTrip, setNewlyAssignedTrip] = useState<Trip | null>(null);
  const [sosAlert, setSosAlert] = useState<{ notification: AppNotification; toastId: string; } | null>(null);
  
  const activeAlarmsRef = useRef<Map<string, HTMLAudioElement>>(new Map());

  useEffect(() => {
    if (user) {
        fetchNotifications();
        requestNotificationPermission(); 
    }
  }, [user]);

  const showToast = (title: string, message: string, type: 'success' | 'alert' | 'info'): string => {
    const id = Date.now().toString() + Math.random().toString().slice(2, 5);
    const newToast = { id, title, message, type };
    
    setToasts(prev => [...prev, newToast]);
    
    const isCritical = type === 'alert';
    const soundType = type === 'info' ? 'notification' : type;
    const audioInstance = playSound(soundType, isCritical);
    
    if (isCritical && audioInstance) {
        activeAlarmsRef.current.set(id, audioInstance);
    }
    
    if (user?.role !== 'ADMIN' || type !== 'alert') {
        setTimeout(() => {
            removeToast(id);
        }, 8000);
    }
    return id;
  };

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
    
    const alarmAudio = activeAlarmsRef.current.get(id);
    if (alarmAudio) {
        alarmAudio.pause();
        alarmAudio.currentTime = 0;
        activeAlarmsRef.current.delete(id);
    }
  };

  const fetchNotifications = async () => {
    if (!user) return;
    
    try {
        const { data, error } = await supabase
            .from('notificaciones')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(50); 
        
        if (error) {
            console.warn("Aviso al consultar notificaciones:", error.message || error);
            return;
        }

        if (data) {
            const myNotifs = data.filter((n: AppNotification) => {
                 const targetRole = n.target_role;
                 const targetUser = n.target_user_id;
                 const myRole = user?.role;
                 const myId = user?.id;
                 const myPlate = (user as any)?.plate || myId; 

                 const roleMatch = targetRole === 'ALL' || targetRole === myRole;
                 const userMatch = !targetUser || targetUser === myId || targetUser === myPlate;

                 return roleMatch && userMatch;
            });

            setNotifications(myNotifs);
        }
    } catch (err: any) {
        console.warn("Fetch Notifs Exception:", err?.message || err);
    }
  };

  const fetchTrips = async (retryCount = 0) => {
      if (!user) return;

      try {
        let query = supabase
          .from('viajes')
          .select('*')
          .order('created_at', { ascending: false });
        
        // Si es operador, filtrar solo sus viajes por operator_id
        if (user.role === 'OPERATOR') {
            // Backward compatibility: If no operator_id was set yet, still fallback to plate string comparison
            // But Supabase doesn't easily support dynamic OR conditions in a simple chaining. Let's just use operator_id.
            query = query.or(`operator_id.eq.${user.id},plate.eq.${(user as any).plate || 'none'}`);
        }

        const { data, error } = await query;
        
        if (error) {
            if (retryCount < 2 && (error.message?.includes('Failed to fetch') || error.message?.includes('TypeError') || error.message?.includes('NetworkError'))) {
                setTimeout(() => fetchTrips(retryCount + 1), 1500);
                return;
            }
            console.warn("Aviso al consultar viajes:", error.message || error);
            return;
        }
        
        if (data) {
          const mappedTrips: Trip[] = data.map((t: any) => ({
            id: t.id,
            code: t.code,
            origin: t.origin,
            originAddress: t.origin_address || '',
            originMapsLink: t.origin_maps_link || '',
            destination: t.destination,
            destinations: t.destinos_lista || [],
            client: t.client || 'Cliente General',
            project: t.project || 'Logística',
            appointment: t.appointment || '00:00',
            instructions: t.instructions || '',
            indicaciones_pdf_url: t.indicaciones_pdf_url || '',
            status: t.status as TripStatus,
            date: t.scheduled_date || new Date(t.created_at).toLocaleDateString('es-MX'), 
            cargoType: 'General',
            plate: t.plate,
            operator_id: t.operator_id,
            currentStageIndex: t.current_stage || 0,
            hasIncident: false,
            evidence: t.evidence || [], 
            evidenceStatus: t.evidence_status || 'NONE',
            locationHistory: t.locationhistory || [],
            extraCosts: t.extra_costs || [],
            odometerStart: t.odometer_start ? Number(t.odometer_start) : undefined,
            odometerEnd: t.odometer_end ? Number(t.odometer_end) : undefined,
            odometerAnterior: t.odometer_anterior ? Number(t.odometer_anterior) : undefined,
            gastosDepositados: t.gastos_depositados ? Number(t.gastos_depositados) : undefined,
            combustibleAsignado: t.combustible_asignado ? Number(t.combustible_asignado) : undefined,
            precioPorLitro: t.precio_por_litro ? Number(t.precio_por_litro) : undefined,
            costoTotalCombustible: t.costo_total_combustible ? Number(t.costo_total_combustible) : undefined,
            kmEstimados: t.km_estimados ? Number(t.km_estimados) : undefined
          }));

          const uniqueTrips = Array.from(new Map(mappedTrips.map(t => [t.id, t])).values());
          setTrips(uniqueTrips);
        }
      } catch (err: any) {
        if (retryCount < 2 && (err?.message?.includes('Failed to fetch') || err?.name === 'TypeError')) {
            setTimeout(() => fetchTrips(retryCount + 1), 1500);
            return;
        }
        console.warn("Excepción al consultar viajes:", err?.message || err);
      }
  };

  useEffect(() => {
    const handleVisibilityChange = () => {
        if (document.visibilityState === 'visible') {
            fetchTrips();
            fetchNotifications();
        }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    
    const intervalId = setInterval(() => {
        if (document.visibilityState === 'visible' && user) {
            fetchNotifications();
        }
    }, 10000);

    return () => {
        document.removeEventListener("visibilitychange", handleVisibilityChange);
        clearInterval(intervalId);
    };
  }, [user]);

  // --- REALTIME SUBSCRIPTIONS ---
  useEffect(() => {
    if (!user) {
      return; // No subscriptions if user is not logged in.
    }

    fetchTrips();

    const tripsChannel = supabase.channel('viajes-monitor') // Channel name updated as requested.
      .on('postgres_changes', { event: '*', schema: 'public', table: 'viajes' }, (payload) => {
        
        if (payload.eventType === 'INSERT') {
            const newTripData = payload.new;
            
            // FIX: Use `user` from hook scope, which is always current.
            if (user && user.role === 'OPERATOR' && newTripData.plate === (user as any).plate && newTripData.status === TripStatus.PENDING_ACCEPTANCE) {
                
                const mappedTrip: Trip = {
                    id: newTripData.id,
                    code: newTripData.code,
                    origin: newTripData.origin,
                    originAddress: newTripData.origin_address || '',
                    originMapsLink: newTripData.origin_maps_link || '',
                    destination: newTripData.destination,
                    destinations: newTripData.destinos_lista || [],
                    client: newTripData.client || 'Cliente General',
                    project: newTripData.project || 'Logística',
                    appointment: newTripData.appointment || '00:00',
                    instructions: newTripData.instructions || '',
                    indicaciones_pdf_url: newTripData.indicaciones_pdf_url || '',
                    status: newTripData.status as TripStatus,
                    date: newTripData.scheduled_date || new Date(newTripData.created_at).toLocaleDateString('es-MX'), 
                    cargoType: 'General',
                    plate: newTripData.plate,
                    currentStageIndex: newTripData.current_stage || 0,
                    hasIncident: false,
                    evidence: newTripData.evidence || [], 
                    evidenceStatus: newTripData.evidence_status || 'NONE',
                    locationHistory: newTripData.locationhistory || [],
                    extraCosts: newTripData.extra_costs || [],
                    odometerStart: newTripData.odometer_start ? Number(newTripData.odometer_start) : undefined,
                    odometerEnd: newTripData.odometer_end ? Number(newTripData.odometer_end) : undefined,
                    odometerAnterior: newTripData.odometer_anterior ? Number(newTripData.odometer_anterior) : undefined,
                    gastosDepositados: newTripData.gastos_depositados ? Number(newTripData.gastos_depositados) : undefined,
                    combustibleAsignado: newTripData.combustible_asignado ? Number(newTripData.combustible_asignado) : undefined,
                    precioPorLitro: newTripData.precio_por_litro ? Number(newTripData.precio_por_litro) : undefined,
                    costoTotalCombustible: newTripData.costo_total_combustible ? Number(newTripData.costo_total_combustible) : undefined,
                    kmEstimados: newTripData.km_estimados ? Number(newTripData.km_estimados) : undefined
                };

                setNewlyAssignedTrip(mappedTrip);
                playSound('alert', true);
            }
        }
        fetchTrips(); // Refresh trip list on any change.
      })
      .subscribe();

    const notifChannel = supabase.channel('realtime_notifs_global')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notificaciones' }, async (payload) => {
          
          const newNotif = payload.new as AppNotification;
          
          // FIX: Use `user` from hook scope.
          if (user) {
              const myRole = user.role;
              const myId = user.id;
              const myPlate = (user as any)?.plate || myId;

              const isRoleMatch = newNotif.target_role === 'ALL' || newNotif.target_role === myRole;
              const isUserMatch = !newNotif.target_user_id || newNotif.target_user_id === myId || newNotif.target_user_id === myPlate;

              if (isRoleMatch && isUserMatch) {
                  setNotifications(prev => [newNotif, ...prev.filter(n => n.id !== newNotif.id)]);
                  const toastId = showToast(newNotif.title, newNotif.message, newNotif.type);
                  sendPushNotification(user.role, newNotif.title, newNotif.message);

                  if (newNotif.type === 'alert' && user.role === 'ADMIN') {
                      setSosAlert({ notification: newNotif, toastId });
                  }
              }
          }
          await fetchNotifications();
      })
      .subscribe();

    // Cleanup function: remove channels when the user logs out.
    return () => {
      supabase.removeChannel(tripsChannel);
      supabase.removeChannel(notifChannel);
    };
  }, [user]); // FIX: Dependency array ensures the effect re-runs on login/logout.

  const handleLogin = async (loggedInUser: User) => {
    setUser(loggedInUser);
    localStorage.setItem('tls_session_user', JSON.stringify(loggedInUser));
    await requestNotificationPermission();
    
    if (loggedInUser.role === 'ADMIN') {
      setCurrentView(View.ADMIN_DASHBOARD);
    } else {
      setCurrentView(View.DASHBOARD);
    }
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('tls_session_user');
    setCurrentView(View.LOGIN);
    setSelectedTripId(null);
    setNewlyAssignedTrip(null);
    
    activeAlarmsRef.current.forEach(audio => {
        audio.pause();
        audio.currentTime = 0;
    });
    activeAlarmsRef.current.clear();
    setToasts([]); 
  };

  const handleSelectTrip = (trip: Trip) => {
    setSelectedTripId(trip.id);
    setCurrentView(View.TRIP_DETAIL);
  };

  const handleBackToDashboard = () => {
    setSelectedTripId(null);
    setCurrentView(user?.role === 'ADMIN' ? View.ADMIN_DASHBOARD : View.DASHBOARD);
  };

  const updateTrip = (updatedTrip: Trip) => {
    setTrips(prev => prev.map(t => t.id === updatedTrip.id ? updatedTrip : t));
  };

  const addTrip = (newTrip: Trip) => {
    setTrips(prev => {
        if (prev.some(t => t.id === newTrip.id)) return prev;
        return [newTrip, ...prev];
    });
  };

  const deleteTrip = async (tripId: string) => {
    try {
      // 1. Limpiar primero posibles registros relacionados en alertas_sos para evitar restricciones de FK
      try {
        await supabase.from('alertas_sos').delete().eq('trip_id', tripId);
      } catch (fkErr) {
        console.warn("Aviso al limpiar alertas_sos asociadas:", fkErr);
      }

      // 2. Eliminar directamente el registro de la tabla 'viajes' en Supabase
      const { error } = await supabase.from('viajes').delete().eq('id', tripId);
      if (error) {
        console.error("Error al eliminar viaje en Supabase:", error);
        alert(`Error al eliminar el registro en Supabase: ${error.message || 'Verifique conexión y permisos'}`);
        return;
      }

      // 3. Remover del estado local en memoria
      setTrips(prev => prev.filter(t => t.id !== tripId));
      if (selectedTripId === tripId) setSelectedTripId(null);
      playSound('notification');
    } catch (err: any) {
      console.error("Excepción en deleteTrip:", err);
      alert(`Error al eliminar: ${err?.message || 'Error desconocido'}`);
    }
  };

  const handleAcceptNewTrip = async (tripToAccept: Trip) => {
      playSound('success');
      
      if(newlyAssignedTrip) setNewlyAssignedTrip(null);

      // Actualiza el estado local inmediatamente para una UI fluida
      const updatedTrip = { ...tripToAccept, status: TripStatus.IN_TRANSIT };
      updateTrip(updatedTrip);

      // NAVEGACIÓN: Redirige al operador al monitor para que registre el odómetro
      setSelectedTripId(tripToAccept.id);
      setCurrentView(View.TRIP_DETAIL);

      // Actualiza la base de datos en segundo plano
      const { error } = await supabase
          .from('viajes')
          .update({ status: TripStatus.IN_TRANSIT }) // Se actualiza a "En Curso" como se solicitó
          .eq('id', tripToAccept.id);
      
      // Obtener ECO para notificacion
      let unitEco = tripToAccept.plate;
      try {
          const { data: unitData } = await supabase.from('unidades').select('eco').eq('plate', tripToAccept.plate).single();
          if (unitData && unitData.eco) unitEco = unitData.eco;
      } catch(e) {}

      await supabase.from('notificaciones').insert({
          target_role: 'ADMIN',
          title: '✅ VIAJE ACEPTADO',
          message: `El ECO ${unitEco} ha aceptado y estatus actualizado.`,
          type: 'success',
          metadata: { trip_id: tripToAccept.id }
      });

      if (error) {
          console.error("Error accepting trip:", error);
          showToast('Error de Red', 'No se pudo confirmar el viaje en el servidor.', 'alert');
          fetchTrips(); // Re-sincronizar si falla
      }
  };

  const markAsRead = async (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    await supabase.from('notificaciones').update({ is_read: true }).eq('id', id);
  };

  const deleteNotification = async (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
    await supabase.from('notificaciones').delete().eq('id', id);
  };

  const handleClearAllNotifications = async () => {
    if (notifications.length === 0) return;
    if (!window.confirm("¿Estás seguro de eliminar todo el historial de notificaciones?")) return;

    activeAlarmsRef.current.forEach(audio => {
        audio.pause();
        audio.currentTime = 0;
    });
    activeAlarmsRef.current.clear();
    setToasts([]); 

    const ids = notifications.map(n => n.id);
    setNotifications([]);
    
    await supabase.from('notificaciones').delete().in('id', ids);
  };

  const handleStopSosAlarm = () => {
    if (sosAlert) {
      removeToast(sosAlert.toastId);
      setSosAlert(null);
    }
  };

  const activeTrip = trips.find(t => t.id === selectedTripId);

  const renderSosModal = () => {
    if (!sosAlert) return null;
    
    return (
      <div className="fixed inset-0 z-[10000] bg-red-600/95 flex flex-col items-center justify-center p-4 text-white text-center animate-pulse">
        <Siren className="h-32 w-32 mb-8 drop-shadow-lg animate-ping" />
        <h1 className="text-5xl md:text-7xl font-black uppercase tracking-wider mb-4 drop-shadow-md">
            ¡SOS RECIBIDO!
        </h1>
        <h2 className="text-2xl md:text-4xl font-bold mb-8 drop-shadow-md">
            OPERADOR EN PELIGRO
        </h2>
        <p className="text-lg md:text-2xl font-semibold mb-2 max-w-2xl">{sosAlert.notification.message}</p>
        <p className="text-sm md:text-base font-mono mb-12 max-w-2xl">Folio Viaje: {sosAlert.notification.metadata?.trip_id}</p>

        <button
            onClick={handleStopSosAlarm}
            className="bg-white text-red-700 font-black text-xl md:text-2xl py-5 px-12 rounded-2xl shadow-2xl border-b-8 border-red-300 active:translate-y-1 active:border-b-0 transition-all animate-none hover:scale-105"
        >
            MARCAR COMO ATENDIDO
        </button>
      </div>
    );
  };

  return (
    <div className="min-h-screen flex flex-col">
      {renderSosModal()}
      {newlyAssignedTrip && user?.role === 'OPERATOR' && (
          <NewTripModal trip={newlyAssignedTrip} onAccept={handleAcceptNewTrip} />
      )}
      
      {currentView !== View.LOGIN && currentView !== View.TRIP_DETAIL && (
        <Header 
          userName={user?.name} 
          role={user?.role} 
          onLogout={handleLogout}
          notifications={notifications}
          onMarkAsRead={markAsRead}
          onDeleteNotification={deleteNotification}
          onClearAll={handleClearAllNotifications}
        />
      )}

      <div className="fixed bottom-6 right-6 z-[9999] flex flex-col-reverse gap-3 w-full max-w-sm pointer-events-none">
        {toasts.map((toast) => (
            <div 
                key={toast.id} 
                className={`pointer-events-auto bg-white shadow-2xl rounded-2xl border-l-8 overflow-hidden duration-500 flex items-start p-5 ${
                    toast.type === 'alert' ? 'border-red-500 animate-pulse' : toast.type === 'success' ? 'border-green-500' : 'border-blue-600'
                }`}
            >
                <div className={`mr-4 p-3 rounded-full shrink-0 ${
                    toast.type === 'alert' ? 'bg-red-100 text-red-600' : toast.type === 'success' ? 'bg-green-100 text-green-600' : 'bg-blue-100 text-blue-600'
                }`}>
                    {toast.type === 'alert' ? <AlertCircle size={24} /> : toast.type === 'success' ? <CheckCircle size={24} /> : <Truck size={24} />}
                </div>
                <div className="flex-1 min-w-0">
                    <h4 className="font-black text-slate-900 text-sm uppercase tracking-tight mb-1">{toast.title}</h4>
                    <p className="text-slate-600 text-xs font-medium leading-relaxed">{toast.message}</p>
                </div>
                <button 
                    onClick={() => removeToast(toast.id)} 
                    className="ml-3 text-slate-300 hover:text-slate-500 transition-colors p-1"
                >
                    <X size={20} />
                </button>
            </div>
        ))}
      </div>

      <main className={`flex-grow bg-slate-50 transition-all duration-300 ${currentView !== View.LOGIN && currentView !== View.TRIP_DETAIL ? 'pt-[70px]' : 'pt-0'}`}>
        {currentView === View.LOGIN && <Login onLogin={handleLogin} />}
        
        {currentView === View.DASHBOARD && (
          <Dashboard 
            trips={user?.role === 'OPERATOR' ? trips.filter(t => t.plate === (user as any).plate) : trips} 
            onSelectTrip={handleSelectTrip} 
            user={user} 
            onAcceptAndStart={handleAcceptNewTrip}
          />
        )}
        
        {currentView === View.TRIP_DETAIL && activeTrip && (
          <TripDetail 
            trip={activeTrip} 
            onBack={handleBackToDashboard}
            onUpdateTrip={updateTrip}
            user={user}
            onLogout={handleLogout}
            showToast={showToast}
          />
        )}

        {currentView === View.ADMIN_DASHBOARD && (
          <AdminDashboard 
            trips={trips} 
            onUpdateTrip={updateTrip}
            onAddTrip={addTrip}
            onDeleteTrip={deleteTrip}
          />
        )}
      </main>
    </div>
  );
};

export default App;
