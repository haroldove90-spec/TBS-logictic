
import React, { useState, useRef, useEffect } from 'react';
import { Trip, TripStatus, EvidenceStatus, Evidence, LocationReport, TripDestination, ExpenseCategory, ExpenseItem, ExpenseRecord } from '../types';
import { TRIP_STAGES } from '../constants';
import { supabase, checkStorageBucket } from '../supabaseClient';
import { sendPushNotification, playSound, processWatermark, getCurrentLocation } from '../utils';
import { 
  ArrowLeft, Check, BellRing, MapPin, AlertTriangle, 
  Navigation, Camera, Loader, Fuel, Clock, RotateCcw, 
  ShieldAlert, RefreshCw, FileWarning, FileText, 
  ChevronRight, X, Image as ImageIcon, Plus, CheckCircle, UploadCloud, ExternalLink, Share2, Map, Building2, Calendar, MessageSquare, Truck,
  Briefcase, Wrench, Wallet, Trash2, Save, Paperclip
} from 'lucide-react';

interface TripDetailProps {
  trip: Trip;
  onBack: () => void;
  onUpdateTrip: (trip: Trip) => void;
}

const SafeImage: React.FC<{ src: string; alt: string; className: string }> = ({ src, alt, className }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  return (
    <div className={`relative overflow-hidden flex items-center justify-center ${className} bg-slate-200 rounded-xl border border-gray-200 shadow-sm`}>
      {loading && <Loader className="absolute h-6 w-6 animate-spin text-slate-400 z-10" />}
      {error ? (
        <FileWarning className="h-8 w-8 text-red-400" />
      ) : (
        <img 
          src={src} 
          alt={alt} 
          className={`w-full h-full object-cover transition-opacity duration-300 ${loading ? 'opacity-0' : 'opacity-100'}`}
          onLoad={() => setLoading(false)}
          onError={() => setError(true)}
        />
      )}
    </div>
  );
};

export const TripDetail: React.FC<TripDetailProps> = ({ trip, onBack, onUpdateTrip }) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [isUploading, setIsUploading] = useState(false); 
  const [isSharingLocation, setIsSharingLocation] = useState(false);
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const [showPdfModal, setShowPdfModal] = useState(false); 
  const [connectionError, setConnectionError] = useState<string | null>(null);
  
  // Estados para Gastos
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [currentExpenseCategory, setCurrentExpenseCategory] = useState<ExpenseCategory | null>(null);
  const [expenseRows, setExpenseRows] = useState<ExpenseItem[]>([{ concept: '', amount: 0 }]);
  const [expenseEvidence, setExpenseEvidence] = useState<Evidence[]>([]); // Estado temporal para fotos de gastos
  const [isSavingExpense, setIsSavingExpense] = useState(false);
  const [isUploadingExpenseEvidence, setIsUploadingExpenseEvidence] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const expenseFileInputRef = useRef<HTMLInputElement>(null); // Ref separada para gastos
  
  const destinations: TripDestination[] = trip.destinations && trip.destinations.length > 0 
    ? trip.destinations 
    : [{ id: 'default', name: trip.destination, mapsLink: trip.destinationMapsLink, currentStageIndex: 0, status: 'PENDING' as const }];

  const currentDestIdx = destinations.findIndex(d => d.status !== 'COMPLETED');
  const activeDest = currentDestIdx !== -1 ? destinations[currentDestIdx] : destinations[destinations.length - 1];

  const verifyConnection = async () => {
    const ok = await checkStorageBucket();
    if (!ok) setConnectionError("⚠️ ERROR DE RED: Fallo de servidor de evidencias.");
    else setConnectionError(null);
  };

  useEffect(() => { verifyConnection(); }, []);

  // --- LÓGICA DE GASTOS ---
  const handleOpenExpenseModal = (category: ExpenseCategory) => {
    setCurrentExpenseCategory(category);
    setExpenseRows([{ concept: '', amount: 0 }]); // Reset rows
    setExpenseEvidence([]); // Reset evidence
    setShowExpenseModal(true);
    playSound('notification');
  };

  const handleAddExpenseRow = () => {
    setExpenseRows([...expenseRows, { concept: '', amount: 0 }]);
  };

  const handleRemoveExpenseRow = (index: number) => {
    if (expenseRows.length === 1) return;
    setExpenseRows(expenseRows.filter((_, i) => i !== index));
  };

  const handleExpenseChange = (index: number, field: keyof ExpenseItem, value: string | number) => {
    const newRows = [...expenseRows];
    newRows[index] = { ...newRows[index], [field]: value };
    setExpenseRows(newRows);
  };

  const handleExpensePhotoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setIsUploadingExpenseEvidence(true);
    playSound('notification');

    try {
        const location = await getCurrentLocation();
        const newEvidences: Evidence[] = [];

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const watermarkedUrl = await processWatermark(file, trip.code, trip.plate);
            
            // Guardar en carpeta 'expenses' para diferenciar de las evidencias operativas normales
            const fileName = `${trip.id}_EXPENSE_${Date.now()}_${i}.jpg`;
            const filePath = `${trip.id}/expenses/${fileName}`;

            const res = await fetch(watermarkedUrl);
            const blob = await res.blob();

            const { error: uploadError } = await supabase.storage
                .from('evidencias')
                .upload(filePath, blob, { contentType: 'image/jpeg', upsert: true });

            if (uploadError) throw uploadError;

            const { data: urlData } = supabase.storage.from('evidencias').getPublicUrl(filePath);

            newEvidences.push({
                id: Math.random().toString(36).substr(2, 9),
                tripId: trip.id,
                stageIndex: -1, // -1 indica que es un gasto, no una etapa de ruta
                url: urlData.publicUrl,
                fileName: fileName,
                path: filePath,
                timestamp: Date.now(),
                lat: location?.lat,
                lng: location?.lng
            });
        }

        setExpenseEvidence(prev => [...prev, ...newEvidences]);
        playSound('success');

    } catch (err) {
        console.error("Error subiendo evidencia de gasto", err);
        alert("Error al subir la evidencia.");
    } finally {
        setIsUploadingExpenseEvidence(false);
        if (expenseFileInputRef.current) expenseFileInputRef.current.value = '';
    }
  };

  const handleRemoveExpenseEvidence = (id: string) => {
      setExpenseEvidence(prev => prev.filter(e => e.id !== id));
  };

  const handleSaveExpense = async () => {
    if (!currentExpenseCategory) return;
    
    // Validar
    const validRows = expenseRows.filter(r => r.concept.trim() !== '' && Number(r.amount) > 0);
    if (validRows.length === 0) {
        alert("Agrega al menos un concepto con monto válido.");
        return;
    }

    setIsSavingExpense(true);
    try {
        const total = validRows.reduce((sum, r) => sum + Number(r.amount), 0);
        
        const newRecord: ExpenseRecord = {
            id: Math.random().toString(36).substr(2, 9),
            category: currentExpenseCategory,
            items: validRows,
            total: total,
            timestamp: Date.now(),
            evidence: expenseEvidence // Guardar las evidencias asociadas
        };

        const updatedCosts = [...(trip.extraCosts || []), newRecord];
        
        const { error } = await supabase
            .from('viajes')
            .update({ extra_costs: updatedCosts })
            .eq('id', trip.id);

        if (error) throw error;

        // NOTIFICACIÓN AL ADMIN CON EVIDENCIA SI LA HAY
        const expenseImageUrl = expenseEvidence.length > 0 ? expenseEvidence[0].url : undefined;
        
        await supabase.from('notificaciones').insert({
            target_role: 'ADMIN',
            title: '💰 GASTO REGISTRADO',
            message: `Unidad ${trip.plate} registró: ${currentExpenseCategory} ($${total}).`,
            type: 'info',
            metadata: { 
                trip_id: trip.id, 
                image_url: expenseImageUrl,
                amount: total,
                category: currentExpenseCategory
            }
        });

        onUpdateTrip({ ...trip, extraCosts: updatedCosts });
        playSound('success');
        setShowExpenseModal(false);
        
    } catch (error) {
        console.error("Error saving expense", error);
        alert("Error al guardar registro.");
    } finally {
        setIsSavingExpense(false);
    }
  };
  // ------------------------

  const handleAcceptTrip = async () => {
    playSound('notification');
    setIsProcessing(true);
    
    onUpdateTrip({...trip, status: TripStatus.ACCEPTED});
    playSound('success');

    const { error } = await supabase
        .from('viajes')
        .update({ status: TripStatus.ACCEPTED })
        .eq('id', trip.id);
    
    // NOTIFICACIÓN AL ADMIN
    await supabase.from('notificaciones').insert({
        target_role: 'ADMIN',
        title: '✅ VIAJE ACEPTADO',
        message: `La unidad ${trip.plate} ha confirmado la aceptación del viaje.`,
        type: 'success',
        metadata: { trip_id: trip.id }
    });

    if (error) {
        console.error("Error accepting trip in DB:", error);
        alert("Hubo un problema de conexión al confirmar el viaje, pero se ha guardado localmente.");
    }
    setIsProcessing(false);
  };

  const handleShareLocation = async () => {
    if (isSharingLocation) return;
    setIsSharingLocation(true);
    playSound('notification');

    try {
        const location = await getCurrentLocation();
        if (!location) {
            alert("No se pudo obtener la ubicación. Verifique los permisos del GPS.");
            setIsSharingLocation(false);
            return;
        }

        const newReport: LocationReport = {
            id: `manual-${Date.now()}`,
            lat: location.lat,
            lng: location.lng,
            timestamp: Date.now(),
            type: 'CHECKIN',
            label: 'Ubicación Compartida Manualmente',
            isOutOfRange: false
        };

        const updatedHistory = [...(trip.locationHistory || []), newReport];
        const { error } = await supabase.from('viajes').update({ locationHistory: updatedHistory }).eq('id', trip.id);
        
        // NOTIFICACIÓN AL ADMIN (Solicitud del usuario)
        const { error: notifError } = await supabase.from('notificaciones').insert({
            target_role: 'ADMIN',
            title: '📍 UBICACIÓN COMPARTIDA',
            message: `La unidad ${trip.plate} compartió su ubicación manual: ${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}`,
            type: 'info',
            metadata: { 
                trip_id: trip.id,
                lat: location.lat,
                lng: location.lng
            }
        });

        if (notifError) {
             console.error("Error enviando notificación:", notifError);
             throw new Error("No se pudo enviar la alerta al administrador (Error BD).");
        }

        onUpdateTrip({ ...trip, locationHistory: updatedHistory });
        playSound('success');
        alert("✅ Ubicación enviada correctamente a la Torre de Control.");

    } catch (error: any) {
        console.error("Error compartiendo ubicación:", error);
        alert(`Error al compartir: ${error.message || 'Intente nuevamente'}`);
    } finally {
        setIsSharingLocation(false);
    }
  };

  const handleStageClick = async (index: number) => {
    if (index !== trip.currentStageIndex || isProcessing) return;

    const isStepUnloaded = index === 5; 

    if (isStepUnloaded) {
        const hasEvidence = trip.evidence.some(e => e.stageIndex === 5 && (!e.destinationId || e.destinationId === activeDest?.id));
        if (!hasEvidence) {
            alert("⚠️ REQUERIDO: Debes tomar al menos una foto de evidencia para confirmar la descarga.");
            playSound('alert');
            fileInputRef.current?.click();
            return;
        }
    }

    playSound('notification');
    setIsProcessing(true);
    try {
      let nextStepIndex = index + 1;
      let updatedDestinations = [...destinations];
      let alertMessage = "";

      if (isStepUnloaded) { 
        if (activeDest) {
            updatedDestinations = updatedDestinations.map(d => 
                d.id === activeDest.id ? { ...d, status: 'COMPLETED' as const } : d
            );
        }
        
        const nextPendingDest = updatedDestinations.find(d => d.status === 'PENDING');
        
        if (nextPendingDest) {
          nextStepIndex = 3; 
          alertMessage = `✅ Destino completado. Iniciando ruta hacia: ${nextPendingDest.name}`;
        }
      }

      const currentStageAsNumber = Number(nextStepIndex);
      let newStatus = trip.status;
      // FIX: The trip is finished when the next step is 7 (after completing stage at index 6).
      const isTripFinished = nextStepIndex === 7;

      // CRÍTICO: Si el viaje finaliza, forzar estado COMPLETED
      if (isTripFinished) {
        newStatus = TripStatus.COMPLETED;
      } else if (nextStepIndex === 1) {
        newStatus = TripStatus.IN_TRANSIT;
      } else if (nextStepIndex > 1 && newStatus === TripStatus.ACCEPTED) {
        newStatus = TripStatus.IN_TRANSIT;
      }

      // 1. Actualizar DB Primero para que Realtime dispare a otros clientes
      const { data, error } = await supabase
        .from('viajes')
        .update({ 
          current_stage: currentStageAsNumber,
          destinos_lista: updatedDestinations,
          status: newStatus 
        })
        .eq('id', trip.id) 
        .select();

      if (error) throw error;
      
      // 2. Enviar notificación
      const stageName = isTripFinished ? 'Fin de viaje' : TRIP_STAGES[nextStepIndex]?.label || 'Siguiente Etapa';
      await supabase.from('notificaciones').insert({
        target_role: 'ADMIN',
        title: isTripFinished ? '🏁 VIAJE COMPLETADO' : '🚚 AVANCE DE RUTA',
        message: isTripFinished 
            ? `La unidad ${trip.plate} ha finalizado el viaje correctamente.`
            : `Unidad ${trip.plate} avanzó a: ${stageName}`,
        type: isTripFinished ? 'success' : 'info',
        metadata: { trip_id: trip.id }
      });

      // 3. Actualizar Estado Local
      const updatedTrip: Trip = { 
        ...trip, 
        currentStageIndex: nextStepIndex,
        destinations: updatedDestinations,
        status: newStatus
      };
      
      onUpdateTrip(updatedTrip);
      playSound('success');
      
      // 4. Mostrar Modal si terminó
      if (isTripFinished) {
        setShowCompletionModal(true);
      }
      
      if (alertMessage) {
        alert(alertMessage);
      }

    } catch (err: any) {
      console.error("Fallo general en handleStageClick:", err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePhotoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    setIsProcessing(true);
    playSound('notification');
    
    try {
      const location = await getCurrentLocation();
      const newEvidences: Evidence[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const watermarkedUrl = await processWatermark(file, trip.code, trip.plate);
        const stageLabel = TRIP_STAGES[trip.currentStageIndex].key; 
        const fileName = `${trip.id}_${stageLabel}_${Date.now()}_${i}.jpg`;
        const filePath = `${trip.id}/${stageLabel}/${fileName}`;

        const res = await fetch(watermarkedUrl);
        const blob = await res.blob();

        const { error: uploadError } = await supabase.storage
          .from('evidencias')
          .upload(filePath, blob, { contentType: 'image/jpeg', upsert: true });

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage.from('evidencias').getPublicUrl(filePath);

        newEvidences.push({
          id: Math.random().toString(36).substr(2, 9),
          tripId: trip.id,
          destinationId: activeDest?.id,
          stageIndex: trip.currentStageIndex,
          url: urlData.publicUrl,
          fileName: fileName,
          path: filePath,
          timestamp: Date.now(),
          lat: location?.lat,
          lng: location?.lng
        });
      }

      const updatedEvidenceList = [...trip.evidence, ...newEvidences];
      const updatedTrip = { ...trip, evidence: updatedEvidenceList, evidenceStatus: 'PENDING' as EvidenceStatus };

      await supabase.from('viajes').update({ 
          evidence: updatedEvidenceList,
          evidence_status: 'PENDING' 
      }).eq('id', trip.id);

      // NOTIFICACIÓN AL ADMIN CON URL DE LA PRIMERA IMAGEN
      const evidenceImageUrl = newEvidences.length > 0 ? newEvidences[0].url : undefined;
      
      await supabase.from('notificaciones').insert({
          target_role: 'ADMIN',
          title: '📷 NUEVA EVIDENCIA',
          message: `Unidad ${trip.plate} subió ${newEvidences.length} fotos nuevas.`,
          type: 'info',
          metadata: { 
              trip_id: trip.id,
              image_url: evidenceImageUrl, // IMPORTANTE: Enviamos la URL para que se vea en el modal
              evidence_count: newEvidences.length
          }
      });

      onUpdateTrip(updatedTrip);
      playSound('success');
      
    } catch (err: any) {
      console.error("Error al procesar evidencias:", err);
      alert("Error al guardar las evidencias fotográficas.");
    } finally {
      setIsProcessing(false);
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const renderInfoCards = () => (
    <div className="space-y-6">
        {destinations.map((dest, idx) => (
            <div key={dest.id} className="bg-white rounded-2xl p-6 shadow-sm border-l-8 border-blue-600 animate-in slide-in-from-right-4" style={{ animationDelay: `${idx * 100}ms` }}>
                 <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center">
                        <div className="bg-blue-100 p-2 rounded-lg mr-3">
                            <MapPin className="h-6 w-6 text-blue-700" />
                        </div>
                        <h3 className="text-xl font-black text-blue-900 uppercase">DESTINO #{idx + 1}</h3>
                    </div>
                    {dest.status === 'COMPLETED' && <span className="bg-green-100 text-green-700 font-bold px-3 py-1 rounded-full text-xs">COMPLETADO</span>}
                </div>

                <div className="space-y-5 pl-2">
                    <div>
                        <p className="text-sm text-slate-500 font-bold uppercase tracking-wide mb-1">Cliente</p>
                        <p className="font-black text-slate-900 text-2xl leading-tight">{dest.client || trip.client}</p>
                    </div>

                    <div>
                        <p className="text-sm text-slate-500 font-bold uppercase tracking-wide mb-1">Dirección de Entrega</p>
                        <p className="font-bold text-slate-800 text-xl leading-snug">{dest.name}</p>
                    </div>

                    <div className="flex items-center space-x-4 bg-blue-50 p-4 rounded-xl border border-blue-100">
                        <Clock className="h-6 w-6 text-blue-600" />
                        <div>
                            <p className="text-xs text-slate-500 font-bold uppercase">Cita / Horario</p>
                            <p className="text-xl font-black text-blue-900">{dest.appointment || trip.appointment || 'Abierto'}</p>
                        </div>
                    </div>

                    {dest.instructions && (
                        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded-r-lg">
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center">
                                    <MessageSquare className="h-5 w-5 text-yellow-700 mr-2" />
                                    <p className="text-xs font-black text-yellow-800 uppercase tracking-wide">INDICACIONES</p>
                                </div>
                                {dest.instructions_pdf_url && (
                                    <a href={dest.instructions_pdf_url} target="_blank" rel="noreferrer" className="bg-white border border-yellow-300 text-yellow-700 px-3 py-1 rounded-full text-xs font-bold flex items-center hover:bg-yellow-100">
                                        <FileText className="h-3 w-3 mr-1"/> Ver PDF
                                    </a>
                                )}
                            </div>
                            <p className="text-lg font-bold text-yellow-900 leading-snug">{dest.instructions}</p>
                        </div>
                    )}
                </div>
            </div>
        ))}
    </div>
  );

  if (trip.status === TripStatus.PENDING_ACCEPTANCE) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col p-4 pt-10">
        <div className="bg-amber-400 p-8 rounded-2xl mb-8 shadow-lg border-b-8 border-amber-600 text-center animate-in zoom-in-95">
          <BellRing className="h-20 w-20 text-black mx-auto mb-4 animate-bounce" />
          <h1 className="text-4xl font-black text-black uppercase tracking-tight leading-none">Nuevo Viaje</h1>
          <p className="text-2xl font-bold text-amber-900 mt-3">Confirma recepción</p>
        </div>
        
        <div className="mb-8">
            <h2 className="text-slate-400 font-bold uppercase text-sm tracking-widest mb-4 ml-2">Detalles de la Ruta</h2>
            {renderInfoCards()}
        </div>

        <button onClick={handleAcceptTrip} disabled={isProcessing} className="w-full bg-slate-900 text-white font-black text-2xl py-8 rounded-3xl shadow-2xl border-b-8 border-black active:translate-y-2 transition-all sticky bottom-4 z-50">
          {isProcessing ? <Loader className="h-8 w-8 animate-spin mx-auto" /> : "ACEPTAR VIAJE"}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-slate-50">
      <input type="file" accept="image/*" capture="environment" multiple ref={fileInputRef} onChange={handlePhotoUpload} className="hidden" />
      <input type="file" accept="image/*" capture="environment" multiple ref={expenseFileInputRef} onChange={handleExpensePhotoUpload} className="hidden" />
      
      {connectionError && (
        <div className="fixed top-20 left-4 right-4 z-[1001] bg-red-600 text-white p-6 rounded-2xl shadow-2xl border-4 border-white animate-in slide-in-from-top-4">
          <p className="font-bold text-xl text-center mb-4">{connectionError}</p>
          <button onClick={verifyConnection} className="w-full bg-white text-red-600 font-black py-4 text-lg rounded-xl shadow-lg">REINTENTAR</button>
        </div>
      )}

      <div className="bg-white p-4 shadow-sm border-b-2 border-gray-200 sticky top-0 z-[100]">
        <div className="flex items-center justify-between mb-4">
          <button onClick={() => { playSound('notification'); onBack(); }} className="p-3 bg-gray-100 rounded-xl active:scale-90 border border-gray-300">
             <ArrowLeft className="h-8 w-8 text-black" />
          </button>
          <div className="text-right">
            <p className="text-sm text-gray-500 font-bold uppercase tracking-widest">Viaje {trip.code}</p>
            <p className="text-3xl font-black text-slate-900 leading-none">{trip.plate}</p>
          </div>
        </div>
        <div className={`text-center py-3 rounded-xl font-black text-base uppercase tracking-widest shadow-sm ${trip.status === TripStatus.IN_TRANSIT ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
          Estatus: {trip.status}
        </div>
      </div>

      <div className="flex-1 p-4 flex flex-col max-w-lg mx-auto w-full pb-32 space-y-8">
        
        <div>{renderInfoCards()}</div>
        
        <div className="flex items-center my-2">
            <div className="flex-grow h-px bg-slate-300"></div>
            <span className="mx-4 text-slate-400 font-black uppercase text-sm tracking-widest">Control de Etapas</span>
            <div className="flex-grow h-px bg-slate-300"></div>
        </div>
        
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden animate-in fade-in slide-in-from-top-2">
            <div className="bg-slate-100 px-5 py-4 border-b border-slate-200 flex justify-between items-center">
                <h3 className="font-black text-sm text-slate-700 uppercase tracking-widest flex items-center">
                    <Map className="h-5 w-5 mr-2" /> Navegación Rápida
                </h3>
            </div>
            <div className="divide-y divide-slate-100">
                {destinations.map((dest, idx) => {
                    const isCompleted = dest.status === 'COMPLETED';
                    const isActive = dest.id === activeDest?.id && !isCompleted;

                    return (
                        <div key={dest.id} className={`p-5 flex items-center justify-between ${isActive ? 'bg-blue-50/50' : 'bg-white'}`}>
                             <div className="flex items-center space-x-4 overflow-hidden">
                                <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center font-black text-lg border-4 ${isCompleted ? 'bg-slate-200 text-slate-400 border-slate-300' : isActive ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-400 border-slate-200'}`}>
                                    {isCompleted ? <Check className="h-6 w-6" /> : idx + 1}
                                </div>
                                <div className="min-w-0">
                                    <p className={`text-lg font-black truncate ${isCompleted ? 'text-slate-400 line-through' : 'text-slate-900'}`}>{dest.name}</p>
                                    <p className="text-xs text-slate-500 font-bold uppercase tracking-wide">{isActive ? '🟢 Destino Actual' : isCompleted ? '⚪ Completado' : '🟠 Pendiente'}</p>
                                </div>
                            </div>
                            {!isCompleted && (
                                <button 
                                    onClick={() => { 
                                        playSound('notification'); 
                                        const url = dest.mapsLink || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(dest.name)}`; 
                                        window.open(url, '_blank'); 
                                    }} 
                                    className={`flex-shrink-0 p-3 rounded-xl border-2 transition-all active:scale-95 ${isActive ? 'bg-blue-600 text-white border-blue-600 shadow-md' : 'bg-white text-slate-500 border-slate-300 hover:border-blue-400 hover:text-blue-600'}`}
                                >
                                    <Navigation className="h-6 w-6" />
                                </button>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>

        {trip.indicaciones_pdf_url && (
            <button onClick={() => setShowPdfModal(true)} className="w-full bg-white border-2 border-blue-100 p-5 rounded-2xl shadow-sm flex items-center justify-between active:scale-[0.98] transition-all group hover:border-blue-400">
                <div className="flex items-center">
                    <div className="bg-blue-100 p-4 rounded-xl mr-5 group-hover:bg-blue-600 transition-colors"><FileText className="h-8 w-8 text-blue-700 group-hover:text-white transition-colors" /></div>
                    <div className="text-left"><h4 className="text-lg font-black text-slate-800 uppercase tracking-tight">Documento de Viaje</h4><p className="text-sm text-slate-500 font-medium">Ver indicaciones (PDF)</p></div>
                </div>
                <div className="bg-slate-50 p-3 rounded-full"><ChevronRight className="h-6 w-6 text-slate-400" /></div>
            </button>
        )}

        {/* Lista de Etapas */}
        <div className="space-y-4">
          {TRIP_STAGES.map((stage, index) => {
            const isCompleted = index < trip.currentStageIndex;
            const isCurrent = index === trip.currentStageIndex;
            const isStepUnloaded = index === 5; 
            
            const currentEvidence = trip.evidence.filter(e => 
                e.stageIndex === 5 && (!e.destinationId || e.destinationId === activeDest?.id)
            );

            return (
              <div key={stage.key} className="space-y-3">
                <button
                  onClick={() => handleStageClick(index)}
                  disabled={!isCurrent || isProcessing}
                  className={`w-full py-8 px-6 rounded-3xl flex items-center justify-between border-b-[6px] transition-all active:translate-y-1
                    ${isCompleted ? 'bg-slate-200 border-slate-300 text-slate-400' : 
                      isCurrent ? 'bg-amber-400 border-amber-600 text-black shadow-xl ring-4 ring-white' : 
                      'bg-white border-gray-100 text-gray-300 opacity-60'}`}
                >
                  <div className="flex items-center space-x-6">
                    <div className={`w-14 h-14 rounded-full flex items-center justify-center border-4 font-black text-3xl shadow-inner shrink-0
                      ${isCurrent ? 'bg-black text-white border-black' : isCompleted ? 'bg-slate-300 text-slate-500 border-slate-400' : 'border-current'}`}>
                      {isCompleted ? <Check className="h-8 w-8" /> : <span>{index + 1}</span>}
                    </div>
                    <div className="text-left">
                      <span className="text-2xl font-black uppercase tracking-tight block leading-none">{stage.label}</span>
                      {isCurrent && (
                        <span className="text-sm font-black uppercase opacity-70 flex items-center mt-2 bg-black/10 px-2 py-1 rounded w-fit">
                          {isProcessing ? <Loader className="h-4 w-4 animate-spin mr-2" /> : <ChevronRight className="h-4 w-4 mr-2" />}
                          {isStepUnloaded && currentEvidence.length === 0 ? "FOTO REQUERIDA" : "PULSAR PARA CONFIRMAR"}
                        </span>
                      )}
                    </div>
                  </div>
                </button>

                {index === 0 && (
                   <div className="mt-2 animate-in fade-in slide-in-from-top-2">
                     <button onClick={() => { playSound('notification'); const url = trip.originMapsLink || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(trip.origin)}`; window.open(url, '_blank'); }} className="w-full bg-white border-2 border-slate-200 text-slate-800 p-4 rounded-2xl flex items-center justify-center space-x-3 active:scale-95 transition-all shadow-sm hover:border-slate-300">
                       <MapPin className="h-6 w-6 text-red-600" />
                       <div className="text-left leading-tight"><span className="block text-xs font-bold uppercase text-slate-400">Lugar de Carga</span><span className="block text-base font-black uppercase">Ver Mapa</span></div>
                     </button>
                   </div>
                )}

                {/* CORRECCIÓN: Mostrar botón de mapa para "INICIAR DESTINO 2" (Index 3) */}
                {index === 3 && isCurrent && activeDest && (
                    <div className="mt-2 animate-in fade-in slide-in-from-top-2">
                        <button 
                            onClick={() => { 
                                playSound('notification'); 
                                const url = activeDest.mapsLink || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(activeDest.name)}`; 
                                window.open(url, '_blank'); 
                            }} 
                            className="w-full bg-white border-2 border-blue-100 text-slate-800 p-4 rounded-2xl flex items-center justify-center space-x-3 active:scale-95 transition-all shadow-sm hover:border-blue-300"
                        >
                            <div className="bg-blue-100 p-2 rounded-full">
                                <MapPin className="h-6 w-6 text-blue-600" />
                            </div>
                            <div className="text-left leading-tight min-w-0">
                                <span className="block text-xs font-bold uppercase text-slate-400">
                                    Destino #{destinations.findIndex(d => d.id === activeDest.id) + 1}
                                </span>
                                <span className="block text-base font-black text-blue-600 uppercase mb-1">VER MAPA</span>
                                <span className="block text-xl font-black uppercase truncate">{activeDest.name}</span>
                            </div>
                        </button>
                    </div>
                )}

                {isCurrent && isStepUnloaded && (
                  <div className="bg-slate-800 rounded-3xl p-6 border-4 border-slate-600 shadow-2xl animate-in slide-in-from-top-4 duration-300">
                    <div className="flex flex-col items-center mb-6 text-center">
                        <div className="bg-amber-400 p-4 rounded-full mb-4 shadow-lg animate-bounce"><Camera className="h-10 w-10 text-black" /></div>
                        <h4 className="text-2xl font-black text-white uppercase tracking-tight">Evidencia: {activeDest?.name || 'Destino'}</h4>
                        <p className="text-sm font-medium text-slate-300 mt-2 max-w-[250px]">Toma fotos de la mercancía descargada.</p>
                    </div>
                    <button 
                        onClick={() => fileInputRef.current?.click()} 
                        disabled={isUploading}
                        className={`w-full text-white py-5 rounded-2xl font-black text-lg uppercase flex items-center justify-center border-b-4 active:translate-y-1 active:border-b-0 transition-all mb-6 shadow-lg group ${isUploading ? 'bg-slate-500 border-slate-700 cursor-wait' : 'bg-blue-600 hover:bg-blue-500 border-blue-800'}`}
                    >
                        {isUploading ? (
                            <>
                                <Loader className="h-6 w-6 mr-3 animate-spin" />
                                SUBIENDO...
                            </>
                        ) : (
                            <>
                                <Plus className="h-6 w-6 mr-3 group-hover:rotate-90 transition-transform" />
                                SUBIR FOTO
                            </>
                        )}
                    </button>
                    {currentEvidence.length === 0 ? (
                      <div className="py-8 text-center border-2 border-dashed border-slate-600 rounded-2xl bg-slate-700/50"><ImageIcon className="h-10 w-10 text-slate-500 mx-auto mb-3" /><p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Sin evidencias</p></div>
                    ) : (
                      <div className="grid grid-cols-2 gap-4">
                        {currentEvidence.map((ev) => (
                            <div key={ev.id} className="relative group"><SafeImage src={ev.url} alt="Evidencia" className="aspect-square rounded-xl border-4 border-slate-600 shadow-lg" /><div className="absolute bottom-2 right-2 bg-black/80 text-white text-xs font-bold px-2 py-1 rounded-lg shadow-sm">{new Date(ev.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div><div className="absolute -top-2 -right-2 bg-green-500 rounded-full p-1 border-2 border-white"><Check className="h-4 w-4 text-white" /></div></div>
                          ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        
        {/* SECCIÓN DE BOTONES DE GASTOS Y REPORTES (AL FINAL DE LAS ETAPAS) */}
        <div className="mt-8 bg-slate-100 p-4 rounded-3xl border border-slate-200">
            <h4 className="text-center text-xs font-black text-slate-400 uppercase tracking-widest mb-4">Centro de Costos y Reportes</h4>
            <div className="grid grid-cols-1 gap-3">
                <button 
                    onClick={() => handleOpenExpenseModal('OPERATIVO')}
                    className="flex items-center justify-between w-full bg-white hover:bg-indigo-50 border-2 border-indigo-100 hover:border-indigo-300 p-4 rounded-xl transition-all shadow-sm group active:scale-[0.98]"
                >
                    <div className="flex items-center">
                        <div className="bg-indigo-100 p-3 rounded-lg mr-4 group-hover:bg-indigo-200"><Briefcase className="h-6 w-6 text-indigo-700" /></div>
                        <div className="text-left"><span className="block font-black text-indigo-900 uppercase">Operativo</span><span className="text-xs text-indigo-500 font-bold">Casetas, Maniobras...</span></div>
                    </div>
                    <Plus className="h-5 w-5 text-indigo-300" />
                </button>

                <button 
                    onClick={() => handleOpenExpenseModal('GASTOS')}
                    className="flex items-center justify-between w-full bg-white hover:bg-emerald-50 border-2 border-emerald-100 hover:border-emerald-300 p-4 rounded-xl transition-all shadow-sm group active:scale-[0.98]"
                >
                    <div className="flex items-center">
                        <div className="bg-emerald-100 p-3 rounded-lg mr-4 group-hover:bg-emerald-200"><Wallet className="h-6 w-6 text-emerald-700" /></div>
                        <div className="text-left"><span className="block font-black text-emerald-900 uppercase">Gastos</span><span className="text-xs text-emerald-500 font-bold">Viáticos, Comidas...</span></div>
                    </div>
                    <Plus className="h-5 w-5 text-emerald-300" />
                </button>

                <button 
                    onClick={() => handleOpenExpenseModal('MANTENIMIENTO')}
                    className="flex items-center justify-between w-full bg-white hover:bg-orange-50 border-2 border-orange-100 hover:border-orange-300 p-4 rounded-xl transition-all shadow-sm group active:scale-[0.98]"
                >
                    <div className="flex items-center">
                        <div className="bg-orange-100 p-3 rounded-lg mr-4 group-hover:bg-orange-200"><Wrench className="h-6 w-6 text-orange-700" /></div>
                        <div className="text-left"><span className="block font-black text-orange-900 uppercase">Mantenimiento</span><span className="text-xs text-orange-500 font-bold">Reparaciones, Piezas...</span></div>
                    </div>
                    <Plus className="h-5 w-5 text-orange-300" />
                </button>
            </div>
        </div>
      </div>

      <div className="fixed bottom-8 right-6 z-[500] flex flex-col items-end space-y-4">
          <button onClick={handleShareLocation} disabled={isSharingLocation} className={`p-6 rounded-full shadow-2xl border-4 border-white transition-all transform active:scale-90 ring-8 ${isSharingLocation ? 'bg-slate-400 ring-slate-200' : 'bg-green-600 ring-green-600/20'}`}>
            {isSharingLocation ? <Loader className="h-8 w-8 text-white animate-spin" /> : <Share2 className="h-8 w-8 text-white" />}
          </button>
          <span className="bg-black/90 text-white text-xs font-bold px-3 py-1.5 rounded-lg shadow backdrop-blur-sm">{isSharingLocation ? 'Enviando...' : 'Enviar ubicación'}</span>
      </div>

      {showCompletionModal && (
        <div className="fixed inset-0 z-[2000] bg-slate-900/90 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in duration-300">
          <div className="bg-white rounded-3xl p-10 max-w-sm w-full text-center shadow-2xl border-t-[10px] border-green-500">
            <div className="mx-auto bg-green-100 w-28 h-28 rounded-full flex items-center justify-center mb-8 animate-bounce"><CheckCircle className="h-16 w-16 text-green-600" /></div>
            <h2 className="text-4xl font-black text-slate-900 mb-3 uppercase tracking-tighter">¡Buen Trabajo!</h2>
            <p className="text-slate-600 font-bold text-lg mb-10 leading-relaxed">Viaje registrado como <strong className="text-slate-900 text-xl">COMPLETADO</strong>.</p>
            <button onClick={() => { playSound('notification'); onBack(); }} className="w-full bg-slate-900 text-white font-black text-xl py-5 rounded-2xl shadow-xl hover:bg-slate-800 active:scale-[0.98] transition-all">VOLVER AL INICIO</button>
          </div>
        </div>
      )}

      {showPdfModal && trip.indicaciones_pdf_url && (
        <div className="fixed inset-0 z-[2100] bg-slate-900/95 backdrop-blur-sm flex flex-col animate-in fade-in duration-200">
            <div className="bg-slate-800 px-5 py-5 flex justify-between items-center shadow-md shrink-0">
                <h3 className="text-white font-bold text-lg flex items-center"><FileText className="h-6 w-6 mr-3 text-blue-400" />Indicaciones Operativas</h3>
                <div className="flex gap-4"><a href={trip.indicaciones_pdf_url} target="_blank" rel="noreferrer" className="bg-slate-700 text-white p-3 rounded-xl hover:bg-slate-600 transition-colors" title="Abrir en navegador externo"><ExternalLink className="h-6 w-6" /></a><button onClick={() => setShowPdfModal(false)} className="bg-slate-700 text-white p-3 rounded-xl hover:bg-red-600 transition-colors"><X className="h-6 w-6" /></button></div>
            </div>
            <div className="flex-1 bg-slate-200 overflow-hidden relative"><iframe src={`${trip.indicaciones_pdf_url}#toolbar=0&navpanes=0&scrollbar=0`} className="w-full h-full border-0" title="Visor PDF" /></div>
        </div>
      )}

      {/* MODAL DE GASTOS */}
      {showExpenseModal && (
        <div className="fixed inset-0 z-[2200] bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4">
            <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl animate-in slide-in-from-bottom-10 overflow-hidden flex flex-col max-h-[90vh]">
                <div className={`px-6 py-4 flex justify-between items-center text-white shrink-0 ${
                    currentExpenseCategory === 'OPERATIVO' ? 'bg-indigo-600' : 
                    currentExpenseCategory === 'GASTOS' ? 'bg-emerald-600' : 'bg-orange-600'
                }`}>
                    <h3 className="font-black text-lg uppercase flex items-center">
                        {currentExpenseCategory === 'OPERATIVO' && <Briefcase className="h-5 w-5 mr-2"/>}
                        {currentExpenseCategory === 'GASTOS' && <Wallet className="h-5 w-5 mr-2"/>}
                        {currentExpenseCategory === 'MANTENIMIENTO' && <Wrench className="h-5 w-5 mr-2"/>}
                        Registrar {currentExpenseCategory}
                    </h3>
                    <button onClick={() => setShowExpenseModal(false)} className="p-1 hover:bg-white/20 rounded-full"><X className="h-6 w-6" /></button>
                </div>
                
                <div className="p-6 overflow-y-auto">
                    <div className="space-y-4">
                        {expenseRows.map((row, index) => (
                            <div key={index} className="flex gap-2 items-start animate-in fade-in slide-in-from-bottom-2">
                                <div className="flex-grow space-y-2">
                                    <input 
                                        type="text" 
                                        placeholder="Concepto (Ej. Caseta, Comida)" 
                                        className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm font-bold focus:ring-2 focus:ring-blue-500 outline-none"
                                        value={row.concept}
                                        onChange={(e) => handleExpenseChange(index, 'concept', e.target.value)}
                                    />
                                    <div className="relative">
                                        <span className="absolute left-3 top-2 text-slate-400 font-bold">$</span>
                                        <input 
                                            type="number" 
                                            placeholder="0.00" 
                                            className="w-full bg-slate-50 border border-slate-300 rounded-lg pl-6 pr-3 py-2 text-sm font-bold focus:ring-2 focus:ring-blue-500 outline-none"
                                            value={row.amount || ''}
                                            onChange={(e) => handleExpenseChange(index, 'amount', e.target.value)}
                                        />
                                    </div>
                                </div>
                                {expenseRows.length > 1 && (
                                    <button onClick={() => handleRemoveExpenseRow(index)} className="mt-1 p-2 text-red-500 hover:bg-red-50 rounded-lg border border-transparent hover:border-red-200">
                                        <Trash2 className="h-5 w-5" />
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>

                    <button onClick={handleAddExpenseRow} className="mt-4 w-full py-2 border-2 border-dashed border-slate-300 text-slate-500 font-bold rounded-xl hover:bg-slate-50 hover:border-slate-400 transition-colors flex items-center justify-center text-sm">
                        <Plus className="h-4 w-4 mr-2" /> AGREGAR OTRO CONCEPTO
                    </button>

                    {/* SECCIÓN DE EVIDENCIAS FOTOGRÁFICAS EN EL MODAL */}
                    <div className="mt-6 border-t border-slate-100 pt-4">
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Evidencia (Opcional)</p>
                        <button 
                            onClick={() => expenseFileInputRef.current?.click()}
                            disabled={isUploadingExpenseEvidence}
                            className={`w-full py-3 rounded-xl border-2 border-blue-100 bg-blue-50 text-blue-600 font-bold flex items-center justify-center hover:bg-blue-100 transition-all ${isUploadingExpenseEvidence ? 'opacity-50 cursor-wait' : ''}`}
                        >
                             {isUploadingExpenseEvidence ? <Loader className="h-5 w-5 animate-spin mr-2" /> : <Camera className="h-5 w-5 mr-2" />}
                             {isUploadingExpenseEvidence ? 'SUBIENDO...' : 'ADJUNTAR FOTO / TICKET'}
                        </button>
                        
                        {expenseEvidence.length > 0 && (
                            <div className="grid grid-cols-3 gap-2 mt-3">
                                {expenseEvidence.map((ev) => (
                                    <div key={ev.id} className="relative group">
                                        <SafeImage src={ev.url} alt="Evidencia Gasto" className="aspect-square rounded-lg border border-slate-200" />
                                        <button 
                                            onClick={() => handleRemoveExpenseEvidence(ev.id)}
                                            className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 shadow-sm"
                                        >
                                            <X className="h-3 w-3" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                </div>

                <div className="p-4 border-t border-slate-100 bg-slate-50 shrink-0">
                    <button 
                        onClick={handleSaveExpense} 
                        disabled={isSavingExpense || isUploadingExpenseEvidence}
                        className={`w-full py-4 rounded-xl text-white font-black text-lg shadow-lg flex items-center justify-center active:scale-[0.98] transition-all ${
                            isSavingExpense ? 'bg-slate-400 cursor-wait' : 'bg-slate-900 hover:bg-slate-800'
                        }`}
                    >
                        {isSavingExpense ? <Loader className="h-5 w-5 animate-spin mr-2" /> : <Save className="h-5 w-5 mr-2" />}
                        GUARDAR REGISTRO
                    </button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};
