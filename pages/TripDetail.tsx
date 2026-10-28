
import React, { useState, useRef, useEffect } from 'react';
import { Trip, TripStatus, EvidenceStatus, Evidence, LocationReport, TripDestination, ExpenseCategory, ExpenseItem, ExpenseRecord, User } from '../types';
import { TRIP_STAGES } from '../constants';
import { supabase, checkStorageBucket } from '../supabaseClient';
import { sendPushNotification, playSound, processWatermark, getCurrentLocation } from '../utils';
import { 
  ArrowLeft, Check, BellRing, MapPin, AlertTriangle, 
  Navigation, Camera, Loader, Fuel, Clock, RotateCcw, 
  ShieldAlert, RefreshCw, FileWarning, FileText, 
  ChevronRight, X, Image as ImageIcon, Plus, CheckCircle, UploadCloud, ExternalLink, Share2, Map, Building2, Calendar, MessageSquare, Truck,
  Briefcase, Wrench, Wallet, Trash2, Save, Paperclip, Siren, Utensils, Ticket, ClipboardList, Cone, Gauge, FileJson, ChevronUp, ChevronDown, PlusCircle, LogOut,
  Box
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

interface TripDetailProps {
  trip: Trip;
  onBack: () => void;
  onUpdateTrip: (trip: Trip) => void;
  user: User | null;
  onLogout: () => void;
  showToast: (title: string, message: string, type: 'success' | 'alert' | 'info') => void;
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

export const TripDetail: React.FC<TripDetailProps> = ({ trip, onBack, onUpdateTrip, user, onLogout, showToast }) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [isUploading, setIsUploading] = useState(false); 
  const [isSharingLocation, setIsSharingLocation] = useState(false);
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const [showPdfModal, setShowPdfModal] = useState(false); 
  const [connectionError, setConnectionError] = useState<string | null>(null);
  
  // Estado para el botón de pánico
  const [isSendingPanic, setIsSendingPanic] = useState(false);

  // Estado para el número de ECO de la unidad
  const [unitEco, setUnitEco] = useState<string>(trip.plate);

  useEffect(() => {
    if (trip?.plate) {
      supabase.from('unidades').select('eco').eq('plate', trip.plate).single().then(({data}) => {
        if (data && data.eco) {
          setUnitEco(data.eco);
        }
      }).catch(() => {});
    }
  }, [trip?.plate]);

  // Estados para Gastos (Acordeón)
  const [expandedCategory, setExpandedCategory] = useState<ExpenseCategory | null>(null);
  const [subCategory, setSubCategory] = useState<string | null>(null); 
  const [expenseRows, setExpenseRows] = useState<ExpenseItem[]>([{ concept: '', amount: 0 }]);
  const [expenseEvidence, setExpenseEvidence] = useState<Evidence[]>([]); 
  const [isSavingExpense, setIsSavingExpense] = useState(false);
  const [isUploadingExpenseEvidence, setIsUploadingExpenseEvidence] = useState(false);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);

  // --- ESTADOS PARA ODÓMETRO MANUAL ---
  const [showOdometerModal, setShowOdometerModal] = useState(false);
  const [odometerInput, setOdometerInput] = useState<string>('');
  
  const [showFinalOdometerModal, setShowFinalOdometerModal] = useState(false);
  const [finalOdometerInput, setFinalOdometerInput] = useState<string>('');
  
  const initialOdometer = trip.odometerStart || 0;
  
  // Estados específicos para Combustible
  const [fuelData, setFuelData] = useState({
      currentOdometer: '',
      liters: '',
      pricePerLiter: ''
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const expenseFileInputRef = useRef<HTMLInputElement>(null); 
  
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

  const generateDriverReport = async () => {
    setIsGeneratingReport(true);
    try {
        let fetchedOperatorName = `Operador Unidad ${trip.plate}`;
        if (trip.plate) {
            const { data: opData } = await supabase
                .from('operadores')
                .select('name')
                .eq('plate', trip.plate)
                .single();
            if (opData && opData.name) {
                fetchedOperatorName = opData.name;
            }
        }

        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();

        // 1. Header
        doc.setFillColor(15, 23, 42); // slate-900
        doc.rect(0, 0, pageWidth, 28, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(16);
        doc.setFont("helvetica", "bold");
        doc.text("TBS Logistics Services", 14, 14);
        doc.setFontSize(10);
        doc.text("REPORTE OPERATIVO DE VIAJE", 14, 21);
        
        doc.text(`FOLIO: ${trip.code}`, pageWidth - 14, 14, { align: "right" });
        doc.text(`FECHA: ${new Date().toLocaleDateString('es-MX')}`, pageWidth - 14, 21, { align: "right" });

        let yPos = 36;
        doc.setTextColor(0, 0, 0);

        // 2. Información General
        // Aseguramos que el nombre del operador se muestre. Si user.name falla, usamos un fallback o la placa.
        const operatorName = user?.role === 'OPERATOR' ? (user.name || fetchedOperatorName) : fetchedOperatorName;

        const finalOdometer = trip.odometerEnd || 0;
        const startOdometer = trip.odometerStart || 0;
        const totalDistancia = (finalOdometer > startOdometer) ? (finalOdometer - startOdometer) : 0;

        const bodyData: any[] = [
            [{ content: 'Información del Viaje', colSpan: 2, styles: { fillColor: [241, 245, 249], fontStyle: 'bold' as const, textColor: [15, 23, 42] }}],
            ['Operador:', operatorName],
            ['Cliente:', trip.client],
            ['Proyecto:', trip.project],
            ['Origen:', trip.origin],
        ];

        if (trip.destinations && trip.destinations.length > 1) {
            trip.destinations.forEach((dest, idx) => {
                bodyData.push([`Destino ${idx + 1}:`, dest.name]);
            });
        } else {
            bodyData.push(['Destino Final:', trip.destination]);
        }

        bodyData.push(
            ['Unidad (Placas):', trip.plate],
            ['Fecha de Inicio:', trip.date],
            ['Odómetro Inicial:', `${startOdometer} km`],
            ['Odómetro Final:', trip.odometerEnd ? `${finalOdometer} km` : 'En curso'],
            ['Recorrido Total:', totalDistancia > 0 ? `${totalDistancia} km` : 'Pendiente']
        );

        autoTable(doc, {
            startY: yPos,
            body: bodyData,
            theme: 'grid',
            styles: { fontSize: 10, cellPadding: 1.5 },
            columnStyles: { 0: { fontStyle: 'bold', cellWidth: 50 } },
        });
        
        yPos = (doc as any).lastAutoTable.finalY + 10;

        // Variable para acumular LITROS TOTALES (Para cálculo real de rendimiento)
        let totalLitrosAccumulated = 0;

        // 3. Tabla de Gastos
        if (trip.extraCosts && trip.extraCosts.length > 0) {
            const expenseBody: any[] = [];
            let totalExpenses = 0;

            trip.extraCosts.forEach(record => {
                record.items.forEach(item => {
                    let performanceDisplay = 'N/A';
                    
                    // Si es combustible, sumamos litros para el cálculo global
                    if (record.category === 'GASTOS' && (item.concept.toLowerCase().includes('combustible') || item.liters)) {
                         // Mostrar rendimiento parcial si existe
                         performanceDisplay = item.performance ? `${item.performance} km/L` : 'N/A';
                         
                         // Acumular litros para el cálculo final CORRECTO (Suma de litros)
                         if (item.liters) {
                             totalLitrosAccumulated += parseFloat(item.liters as any) || 0;
                         }
                    }

                    expenseBody.push([
                        record.category,
                        item.concept,
                        item.liters ? `${item.liters} L` : '-',
                        `$${Number(item.amount).toFixed(2)}`,
                        performanceDisplay
                    ]);
                    totalExpenses += Number(item.amount);
                });
            });

            doc.setFontSize(11);
            doc.setFont("helvetica", "bold");
            doc.text("Desglose de Gastos y Operaciones", 14, yPos);
            yPos += 2;

            autoTable(doc, {
                startY: yPos,
                head: [['Tipo', 'Concepto', 'Litros', 'Importe', 'Rend. Parcial']],
                body: expenseBody,
                theme: 'striped',
                headStyles: { fillColor: [30, 41, 59] }, // bg-slate-800
                styles: { fontSize: 9 },
            });

             yPos = (doc as any).lastAutoTable.finalY + 5;
             doc.setFontSize(10);
             doc.setFont("helvetica", "bold");
             doc.text(`Total de Gastos Registrados: $${totalExpenses.toFixed(2)}`, pageWidth - 14, yPos, { align: 'right' });
             yPos += 12;
        }

        // 4. Resumen Final y Rendimiento Global
        // Cálculo del Rendimiento Global = Distancia Total / Litros Totales
        let globalPerformance = "N/A";
        if (totalLitrosAccumulated > 0 && totalDistancia > 0) {
            globalPerformance = (totalDistancia / totalLitrosAccumulated).toFixed(2) + " km/L";
        }

        const summaryBody: any[] = [
             [{ content: 'Resumen de Rendimiento y Estatus', colSpan: 2, styles: { fillColor: [241, 245, 249], fontStyle: 'bold' as const }}],
             ['Estatus del Viaje:', trip.status],
             ['Distancia Recorrida (Calc):', totalDistancia > 0 ? `${totalDistancia.toFixed(1)} km` : 'Pendiente'],
        ];

        // Solo mostramos combustible si hubo cargas
        if (totalLitrosAccumulated > 0) {
            summaryBody.push(['Combustible Total Consumido:', `${totalLitrosAccumulated.toFixed(2)} Litros`]);
            summaryBody.push(['Rendimiento Global Promedio:', globalPerformance]);
        }
        
        autoTable(doc, {
            startY: yPos,
            body: summaryBody,
            theme: 'grid',
            styles: { fontSize: 10, cellPadding: 2 },
            columnStyles: { 0: { fontStyle: 'bold', cellWidth: 70 } },
        });

        // 5. Footer
        const pageCount = (doc as any).internal.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.setFontSize(8);
            doc.setTextColor(150);
            doc.text(`Generado por: ${user?.name || 'Sistema'} | ${new Date().toLocaleString('es-MX')}`, 14, pageHeight - 10);
            doc.text(`Página ${i} de ${pageCount}`, pageWidth - 14, pageHeight - 10, { align: 'right' });
        }

        const sanitizedOperatorName = operatorName.replace(/[^a-zA-Z0-9]/g, '_');
        doc.save(`Reporte_Operador_${sanitizedOperatorName}_${trip.code}.pdf`);
        playSound('success');

    } catch (error) {
        console.error("Error generating PDF:", error);
        alert("Ocurrió un error al generar el reporte PDF.");
    } finally {
        setIsGeneratingReport(false);
    }
  };

  const handlePanicAlert = async () => {
    if (!window.confirm("⚠️ ¿ESTÁS EN UNA EMERGENCIA?\n\nSe enviará una alerta inmediata a la Torre de Control con tu ubicación actual.")) return;
    setIsSendingPanic(true);

    try {
        const location = await getCurrentLocation();
        if (!location) {
            throw new Error('No se pudo obtener la ubicación GPS. Verifique los permisos.');
        }

        const payload = {
            trip_id: trip.id,
            operator_name: user?.name || 'No identificado',
            lat: location.lat,
            lng: location.lng
        };

        // 1. Insert into alertas_sos table
        const { error: sosError } = await supabase.from('alertas_sos').insert(payload);
        if (sosError) throw sosError;

        // 2. Insert notification for Admin panel to react to
        const { error: notifError } = await supabase.from('notificaciones').insert({
            target_role: 'ADMIN',
            title: '🚨 ALERTA SOS: EMERGENCIA DE OPERADOR',
            message: `¡EMERGENCIA! Operador ${user?.name || 'S/A'} (ECO ${unitEco}) activó el botón de pánico.`,
            type: 'alert', // CRITICAL: This triggers sound/visuals in Admin panel
            metadata: { 
                trip_id: trip.id,
                lat: location.lat,
                lng: location.lng
            }
        });
        if (notifError) throw notifError;

        // 3. UI Feedback for Operator
        showToast('Alerta Enviada', 'Mantenga la calma, la administración ha sido notificada.', 'success');

    } catch (err: any) {
        console.error("Error enviando alerta SOS:", err);
        showToast('Error de Envío', `No se pudo enviar la alerta: ${err.message}`, 'alert');
    } finally {
        setIsSendingPanic(false);
    }
  };

  const toggleExpenseCategory = (category: ExpenseCategory) => {
    if (expandedCategory === category) {
        setExpandedCategory(null);
        setSubCategory(null); 
    } else {
        setExpandedCategory(category);
        setSubCategory(null); 
        setExpenseRows([{ concept: '', amount: 0 }]); 
        setExpenseEvidence([]); 
        setFuelData({ currentOdometer: '', liters: '', pricePerLiter: '' }); 
        playSound('notification');
    }
  };

  const handleSelectSubCategory = (sub: string) => {
      setSubCategory(sub);
      setExpenseRows([{ concept: '', amount: 0 }]); 
      setExpenseEvidence([]);
      setFuelData({ currentOdometer: '', liters: '', pricePerLiter: '' });
  };

  const handleAddExpenseRow = () => setExpenseRows([...expenseRows, { concept: '', amount: 0 }]);
  const handleRemoveExpenseRow = (index: number) => { if (expenseRows.length > 1) setExpenseRows(expenseRows.filter((_, i) => i !== index)); };
  const handleExpenseChange = (index: number, field: keyof ExpenseItem, value: string | number) => { const newRows = [...expenseRows]; newRows[index] = { ...newRows[index], [field]: value }; setExpenseRows(newRows); };
  
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
                stageIndex: -1, 
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
        showToast("Error de Carga", "No se pudo subir la evidencia. Intente de nuevo.", 'alert');
    } finally {
        setIsUploadingExpenseEvidence(false);
        if (expenseFileInputRef.current) expenseFileInputRef.current.value = '';
    }
  };

  const handleRemoveExpenseEvidence = (id: string) => setExpenseEvidence(prev => prev.filter(e => e.id !== id));

  const handleSaveExpense = async () => {
    if (!expandedCategory) return;
    
    let validRows: ExpenseItem[] = [];
    let total = 0;
    let newOdometerValue = 0; 

    if (subCategory === 'COMBUSTIBLE') {
        const odometerActualInput = parseFloat(fuelData.currentOdometer);
        const liters = parseFloat(fuelData.liters);
        const price = parseFloat(fuelData.pricePerLiter);

        if (isNaN(odometerActualInput) || isNaN(liters) || isNaN(price) || liters <= 0 || price <= 0) {
            showToast("Datos Incompletos", "Por favor completa todos los campos de combustible con valores válidos.", 'alert');
            return;
        }

        // --- LÓGICA DE CÁLCULO PARA GUARDADO ---
        // 1. Distancia (Resta): Odómetro actual - Odómetro inicial
        let distanciaRecorrida = odometerActualInput - initialOdometer;
        if (distanciaRecorrida < 0) {
            distanciaRecorrida = 0;
        }
        
        // 2. Rendimiento: Distancia / Litros
        const rendimientoGuardar = liters > 0 ? (distanciaRecorrida / liters).toFixed(2) : '0.00';
        
        // 3. Importe Total: Litros * Precio
        total = liters * price;
        // --------------------------------------------
        
        // El odómetro "final" que se guarda es el valor actual ingresado por el operador.
        newOdometerValue = odometerActualInput;

        validRows = [{
            concept: `Carga Combustible: ${liters}L @ $${price.toFixed(2)} | Recorrido: ${distanciaRecorrida.toFixed(1)} km`,
            amount: total,
            odometer: newOdometerValue, // Guardamos el odómetro actual
            liters: liters,
            pricePerLiter: price,
            initialOdometer: initialOdometer, 
            performance: rendimientoGuardar // Guardamos el rendimiento NUEVO
        }];

    } else {
        validRows = expenseRows.filter(r => r.concept.trim() !== '' && Number(r.amount) > 0);
        if (validRows.length === 0) {
            showToast("Datos Incompletos", "Agrega al menos un concepto con monto válido.", 'alert');
            return;
        }
        total = validRows.reduce((sum, r) => sum + Number(r.amount), 0);
        validRows = validRows.map(row => ({
            ...row,
            concept: subCategory ? `[${subCategory}] ${row.concept}` : row.concept,
            amount: Number(row.amount)
        }));
    }

    setIsSavingExpense(true);
    try {
        const newRecord: ExpenseRecord = { id: Math.random().toString(36).substr(2, 9), category: expandedCategory, items: validRows, total: total, timestamp: Date.now(), evidence: expenseEvidence };
        const updatedCosts = [...(trip.extraCosts || []), newRecord];
        
        const updatePayload: any = { extra_costs: updatedCosts };
        if (subCategory === 'COMBUSTIBLE' && newOdometerValue > 0) {
            // Actualizamos el 'odometer_end' del viaje con la lectura más reciente del odómetro
            updatePayload.odometer_end = newOdometerValue; 
        }

        const { error } = await supabase.from('viajes').update(updatePayload).eq('id', trip.id);
        if (error) throw error;

        // ---------- NUEVO: Respaldar sincronización frontend de odómetro ----------
        if (subCategory === 'COMBUSTIBLE' && newOdometerValue > 0 && trip.plate) {
            try { 
                await supabase.from('unidades').update({ current_odometer: newOdometerValue }).eq('plate', trip.plate);
            } catch (err) { console.warn('Error syncing frontend odometer on expense:', err); }
        }
        // -------------------------------------------------------------------------
        
        const expenseImageUrl = expenseEvidence.length > 0 ? expenseEvidence[0].url : undefined;
        await supabase.from('notificaciones').insert({
            target_role: 'ADMIN',
            title: subCategory === 'REPORTE URGENTE' ? '🚨 REPORTE URGENTE' : '💰 GASTO REGISTRADO',
            message: `ECO ${unitEco} registró: ${subCategory || expandedCategory} ($${total.toFixed(2)}).`,
            type: subCategory === 'REPORTE URGENTE' ? 'alert' : 'info',
            metadata: { trip_id: trip.id, image_url: expenseImageUrl, amount: total, category: expandedCategory, sub_category: subCategory }
        });

        const tripUpdateData: Partial<Trip> = { extraCosts: updatedCosts };
        if (subCategory === 'COMBUSTIBLE' && newOdometerValue > 0) {
            tripUpdateData.odometerEnd = newOdometerValue;
        }
        
        onUpdateTrip({ ...trip, ...tripUpdateData });
        playSound('success');
        setExpandedCategory(null);
        setSubCategory(null);
        showToast('Gasto Guardado', `El registro de ${subCategory || expandedCategory} se guardó exitosamente.`, 'success');
        
    } catch (error) {
        console.error("Error saving expense", error);
        showToast('Error al Guardar', "No se pudo guardar el registro. Verifica tu conexión.", 'alert');
    } finally {
        setIsSavingExpense(false);
    }
  };
  
  const handleAcceptTrip = async () => { /* ... (lógica sin cambios) ... */ };
  
  const handleShareLocation = async () => {
    if (isSharingLocation) return;
    setIsSharingLocation(true);
    playSound('notification');

    try {
        const location = await getCurrentLocation();
        if (!location) {
            showToast('Error de Ubicación', 'No se pudo obtener la ubicación. Verifique los permisos del GPS.', 'alert');
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
        const { error } = await supabase.from('viajes').update({ locationhistory: updatedHistory }).eq('id', trip.id);
        
        const { error: notifError } = await supabase.from('notificaciones').insert({
            target_role: 'ADMIN',
            title: '📍 UBICACIÓN COMPARTIDA',
            message: `ECO ${unitEco} compartió su ubicación: ${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}`,
            type: 'info',
            metadata: { 
                trip_id: trip.id,
                lat: location.lat,
                lng: location.lng
            }
        });

        if (error || notifError) {
             console.error("Error DB:", error || notifError);
             throw new Error("No se pudo guardar o notificar la ubicación.");
        }

        onUpdateTrip({ ...trip, locationHistory: updatedHistory });
        playSound('success');
        showToast('Ubicación Enviada', 'Tu ubicación se ha compartido con la Torre de Control.', 'success');

    } catch (error: any) {
        console.error("Error compartiendo ubicación:", error);
        showToast('Error de Red', `Error al compartir: ${error.message || 'Intente nuevamente'}`, 'alert');
    } finally {
        setIsSharingLocation(false);
    }
  };

  const handleStageClick = async (index: number, overrideFinalOdometer?: number) => {
    if (index !== trip.currentStageIndex || isProcessing) return;

    if (index === 0) {
        setOdometerInput(initialOdometer > 0 ? String(initialOdometer) : '');
        setShowOdometerModal(true);
        playSound('notification');
        return;
    }

    if (index === 6 && !overrideFinalOdometer) {
        setFinalOdometerInput(trip.odometerEnd ? String(trip.odometerEnd) : '');
        setShowFinalOdometerModal(true);
        playSound('notification');
        return;
    }

    const isEvidenceRequired = index === 2 || index === 5;
    const isUnloadingStep = index === 5;

    if (isEvidenceRequired) {
        const hasEvidence = trip.evidence.some(e => 
            e.stageIndex === index && 
            (index === 2 || !e.destinationId || e.destinationId === activeDest?.id)
        );
        if (!hasEvidence) {
            showToast('Evidencia Requerida', 'Debes tomar al menos una foto para confirmar esta etapa.', 'alert');
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

      if (isUnloadingStep) { 
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
      const isTripFinished = nextStepIndex === 7;

      if (isTripFinished) {
        newStatus = TripStatus.COMPLETED;
      } else if (nextStepIndex === 1 && trip.status === TripStatus.ACCEPTED) {
        newStatus = TripStatus.IN_TRANSIT;
      }

      const stageName = isTripFinished ? 'Fin de viaje' : TRIP_STAGES[nextStepIndex]?.label || 'Siguiente Etapa';
      const operatorName = user?.name || trip.plate;
      
      // Obtener ubicación actual y registrarla
      let locationLink = '';
      let updatedHistory = trip.locationHistory ? [...trip.locationHistory] : [];
      let locationMetadata: any = { trip_id: trip.id, stage_index: nextStepIndex };

      try {
        const location = await getCurrentLocation();
        if (location) {
          locationLink = `https://www.google.com/maps?q=${location.lat},${location.lng}`;
          locationMetadata = { ...locationMetadata, lat: location.lat, lng: location.lng, location_link: locationLink };
          
          const newReport: LocationReport = {
            id: `stage-${Date.now()}`,
            lat: location.lat,
            lng: location.lng,
            timestamp: Date.now(),
            type: 'UPDATE',
            label: `Avance: ${stageName}`,
            isOutOfRange: false
          };
          updatedHistory.push(newReport);
        }
      } catch (geoErr) {
        console.warn("No se pudo obtener la ubicación para la notificación:", geoErr);
      }

      let updatePayload: any = { 
        current_stage: currentStageAsNumber, 
        destinos_lista: updatedDestinations, 
        status: newStatus,
        locationhistory: updatedHistory
      };

      if (isTripFinished && overrideFinalOdometer) {
          updatePayload.odometer_end = overrideFinalOdometer;
      }

      const { data, error } = await supabase.from('viajes').update(updatePayload).eq('id', trip.id).select();
      if (error) throw error;

      if (isTripFinished && overrideFinalOdometer && trip.plate) {
          try {
              await supabase.from('unidades').update({ current_odometer: overrideFinalOdometer }).eq('plate', trip.plate);
          } catch(err) {
              console.warn("No se pudo actualizar odómetro en unidades:", err);
          }
      }

      await supabase.from('notificaciones').insert({
        target_role: 'ADMIN',
        title: isTripFinished ? '🏁 VIAJE COMPLETADO' : '🚚 AVANCE DE RUTA',
        message: isTripFinished ? `El ECO ${unitEco} ha finalizado el viaje.` : `ECO ${unitEco} avanzó a: ${stageName}`,
        type: isTripFinished ? 'success' : 'info',
        metadata: locationMetadata
      });

      const updatedTrip: Trip = { ...trip, currentStageIndex: nextStepIndex, destinations: updatedDestinations, status: newStatus };
      if (isTripFinished && overrideFinalOdometer) {
          updatedTrip.odometerEnd = overrideFinalOdometer;
      }
      onUpdateTrip(updatedTrip);
      playSound('success');
      
      if (isTripFinished) {
        setShowCompletionModal(true);
      } else if (alertMessage) {
        showToast('Siguiente Destino', alertMessage, 'info');
      } else {
        showToast('Avance de Ruta', `Etapa actualizada a: ${stageName}`, 'info');
      }

    } catch (err: any) {
      console.error("Fallo general en handleStageClick:", err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConfirmCompleteTrip = async () => {
    const finalVal = parseFloat(finalOdometerInput);
    if (isNaN(finalVal) || finalVal <= initialOdometer) {
        showToast('Inválido', 'El odómetro final debe ser mayor al inicial.', 'alert');
        return;
    }
    setShowFinalOdometerModal(false);
    await handleStageClick(6, finalVal);
  };

  const handleConfirmStartTrip = async () => {
    if (!initialOdometer || initialOdometer <= 0) {
        showToast('Odómetro Inválido', 'El odómetro inicial no ha sido establecido por el administrador.', 'alert');
        return;
    }

    setIsProcessing(true);
    setShowOdometerModal(false);

    try {
        const nextStepIndex = 1;
        const newStatus = TripStatus.IN_TRANSIT;

        let locationMetadata: any = { trip_id: trip.id };
        let updatedHistory = trip.locationHistory ? [...trip.locationHistory] : [];
        try {
            const location = await getCurrentLocation();
            if (location) {
                locationMetadata = { ...locationMetadata, lat: location.lat, lng: location.lng, location_link: `https://www.google.com/maps?q=${location.lat},${location.lng}` };
                
                const newReport: LocationReport = {
                  id: `start-${Date.now()}`,
                  lat: location.lat,
                  lng: location.lng,
                  timestamp: Date.now(),
                  type: 'UPDATE',
                  label: `Inicio de Ruta`,
                  isOutOfRange: false
                };
                updatedHistory.push(newReport);
            }
        } catch (e) {
            console.warn("No location for start trip", e);
        }

        const { error } = await supabase.from('viajes').update({ 
            current_stage: nextStepIndex,
            status: newStatus,
            locationhistory: updatedHistory
        }).eq('id', trip.id);

        if (error) throw error;
        
        await supabase.from('notificaciones').insert({
            target_role: 'ADMIN',
            title: '🚚 INICIO DE RUTA',
            message: `ECO ${unitEco} comenzó el viaje con odómetro en ${initialOdometer} km.`,
            type: 'info',
            metadata: locationMetadata
        });
        
        onUpdateTrip({ ...trip, currentStageIndex: nextStepIndex, status: newStatus });
        playSound('success');
        showToast('Viaje Iniciado', 'El odómetro ha sido confirmado y el viaje ha comenzado.', 'success');

    } catch (err) {
        console.error("Error confirmando inicio de viaje:", err);
        showToast('Error de Red', 'No se pudo iniciar el viaje. Intenta de nuevo.', 'alert');
    } finally {
        setIsProcessing(false);
    }
  };

  const handlePhotoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    setIsProcessing(true); // Bloquea otros botones mientras se sube
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

      const evidenceImageUrl = newEvidences.length > 0 ? newEvidences[0].url : undefined;
      
      await supabase.from('notificaciones').insert({
          target_role: 'ADMIN',
          title: '📷 NUEVA EVIDENCIA',
          message: `ECO ${unitEco} subió ${newEvidences.length} fotos nuevas.`,
          type: 'info',
          metadata: { 
              trip_id: trip.id,
              image_url: evidenceImageUrl,
              evidence_count: newEvidences.length
          }
      });

      onUpdateTrip(updatedTrip);
      playSound('success');
      showToast('Evidencia Subida', `${newEvidences.length} foto(s) guardada(s) correctamente.`, 'success');
      
    } catch (err: any) {
      console.error("Error al procesar evidencias:", err);
      showToast('Error de Carga', 'No se pudieron guardar las evidencias fotográficas.', 'alert');
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
                        <p className="text-sm text-slate-500 font-bold uppercase tracking-wide mb-1">Lugar de Carga</p>
                        <p className="font-bold text-slate-800 text-xl leading-snug">{idx === 0 ? trip.origin : (dest.origin || 'No especificado')}</p>
                        {(idx === 0 && trip.originAddress) && (
                            <p className="text-sm text-slate-600 font-medium mt-1">{trip.originAddress}</p>
                        )}
                    </div>

                    <div>
                        <p className="text-sm text-slate-500 font-bold uppercase tracking-wide mb-1">Lugar de Descarga</p>
                        <p className="font-bold text-slate-800 text-xl leading-snug">{dest.name}</p>
                        {dest.destinationAddress && (
                            <p className="text-sm text-slate-600 font-medium mt-1">{dest.destinationAddress}</p>
                        )}
                    </div>

                    {/* DUAL NAVIGATION BUTTONS */}
                    {dest.status !== 'COMPLETED' && (
                        <div className="grid grid-cols-2 gap-3 pt-2">
                            <button
                                onClick={() => {
                                    playSound('notification');
                                    const originName = idx === 0 ? trip.origin : (dest.origin || trip.origin);
                                    const originLink = idx === 0 ? trip.originMapsLink : undefined;
                                    const url = originLink || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(originName)}`;
                                    window.open(url, '_blank');
                                }}
                                className="bg-slate-800 text-white font-bold py-3 px-3 rounded-xl shadow-md hover:bg-slate-700 active:scale-95 transition-all flex items-center justify-center text-xs"
                            >
                                <Box className="h-4 w-4 mr-2" />
                                IR A CARGA
                            </button>
                            <button
                                onClick={() => {
                                    playSound('notification');
                                    const url = dest.mapsLink || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(dest.name)}`;
                                    window.open(url, '_blank');
                                }}
                                className="bg-blue-600 text-white font-bold py-3 px-3 rounded-xl shadow-md hover:bg-blue-700 active:scale-95 transition-all flex items-center justify-center text-xs"
                            >
                                <Navigation className="h-4 w-4 mr-2" />
                                IR A DESTINO
                            </button>
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-3">
                        <div className="flex items-center space-x-3 bg-blue-50 p-3 rounded-xl border border-blue-100">
                            <Calendar className="h-5 w-5 text-blue-600" />
                            <div>
                                <p className="text-[10px] text-slate-500 font-bold uppercase">Fecha</p>
                                <p className="text-sm font-black text-blue-900">{dest.date || trip.date}</p>
                            </div>
                        </div>
                        <div className="flex items-center space-x-3 bg-blue-50 p-3 rounded-xl border border-blue-100">
                            <Clock className="h-5 w-5 text-blue-600" />
                            <div>
                                <p className="text-[10px] text-slate-500 font-bold uppercase">Cita / Hora</p>
                                <p className="text-sm font-black text-blue-900">{dest.appointment || trip.appointment || 'Abierto'}</p>
                            </div>
                        </div>
                        {idx === 0 && trip.odometerStart && trip.odometerStart > 0 && (
                            <div className="col-span-2 flex items-center space-x-3 bg-blue-50 p-3 rounded-xl border border-blue-100">
                                <Gauge className="h-5 w-5 text-blue-600" />
                                <div>
                                    <p className="text-[10px] text-slate-500 font-bold uppercase">Odómetro Inicial</p>
                                    <p className="text-sm font-black text-blue-900">{trip.odometerStart} km</p>
                                </div>
                            </div>
                        )}
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

  const renderExpenseForm = (colorClass: string) => {
    // --- LÓGICA DE CÁLCULO ACTUALIZADA SEGÚN REQUERIMIENTOS ---
    const currentOdometerInput = parseFloat(fuelData.currentOdometer || '0');
    const liters = parseFloat(fuelData.liters || '0');
    const price = parseFloat(fuelData.pricePerLiter || '0');
    
    // 1. Fórmula de Distancia (Resta): Odómetro actual - Odómetro inicial
    let distanciaRecorrida = currentOdometerInput - initialOdometer;
    if (distanciaRecorrida < 0) {
      distanciaRecorrida = 0;
    }

    // 2. Fórmula de Rendimiento: Distancia / Litros
    // Si litros es 0, rendimiento es 0 para evitar división por cero.
    const rendimientoCalculado = liters > 0 ? (distanciaRecorrida / liters).toFixed(2) : '0.00';

    // 3. Importe Total: Litros * Precio x Litro
    const totalAmount = (liters * price).toFixed(2);
    // -----------------------------------------------------------

    return (
    <div className={`bg-slate-50 p-4 border-t-2 border-dashed ${colorClass} animate-in slide-in-from-top-2`}>
        {subCategory && (
            <div className="mb-4 bg-white p-2 rounded-lg border border-slate-200 flex justify-between items-center">
                <span className="text-xs font-black uppercase text-slate-500">Registrando: {subCategory}</span>
                <button onClick={() => setSubCategory(null)} className="text-xs text-blue-600 underline">Cambiar</button>
            </div>
        )}

        {subCategory === 'COMBUSTIBLE' ? (
            <div className="space-y-4 mb-4">
                <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
                    <div className="flex items-end justify-between">
                        <div>
                            <p className="text-xs text-slate-500 font-bold uppercase">Odómetro inicial</p>
                            <p className="text-2xl font-black text-slate-900">{initialOdometer} km</p>
                        </div>
                        <Truck className="h-8 w-8 text-blue-300 opacity-50" />
                    </div>
                </div>
                
                <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Odómetro actual *</label>
                    <div className="relative">
                        <Gauge className="absolute left-3 top-2.5 h-5 w-5 text-slate-400" />
                        <input type="number" className="w-full pl-10 pr-4 py-2 bg-gray-100 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-bold text-slate-900" placeholder="0" value={fuelData.currentOdometer} onChange={(e) => setFuelData({...fuelData, currentOdometer: e.target.value})} />
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Litros *</label>
                        <div className="relative">
                            <Fuel className="absolute left-3 top-2.5 h-5 w-5 text-slate-400" />
                            <input type="number" className="w-full pl-10 pr-4 py-2 bg-gray-100 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-bold text-slate-900" placeholder="0" value={fuelData.liters} onChange={(e) => setFuelData({...fuelData, liters: e.target.value})} />
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Precio x Litro *</label>
                        <div className="relative">
                            <span className="absolute left-3 top-2 text-slate-400 font-bold">$</span>
                            <input type="number" className="w-full pl-8 pr-4 py-2 bg-gray-100 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-bold text-slate-900" placeholder="0.00" value={fuelData.pricePerLiter} onChange={(e) => setFuelData({...fuelData, pricePerLiter: e.target.value})} />
                        </div>
                    </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4 pt-2">
                    <div className="bg-slate-100 p-3 rounded-lg border border-slate-200">
                        <p className="text-[10px] font-bold text-slate-500 uppercase">Distancia Recorrida</p>
                        <p className="text-lg font-black text-slate-900">{distanciaRecorrida.toFixed(1)} km</p>
                    </div>
                    <div className="bg-green-50 p-3 rounded-lg border border-green-200">
                        <p className="text-[10px] font-bold text-green-700 uppercase">Importe Total</p>
                        <p className="text-lg font-black text-green-900">${totalAmount}</p>
                    </div>
                    <div className="col-span-2 bg-blue-50 p-3 rounded-lg border border-blue-200">
                        <p className="text-[10px] font-bold text-blue-700 uppercase">Rendimiento (KM / Litro)</p>
                        <p className="text-lg font-black text-blue-900">{rendimientoCalculado} km/L</p>
                    </div>
                </div>
            </div>
        ) : (
            <>
                <div className="space-y-4 mb-4">
                    {expenseRows.map((row, index) => (
                        <div key={index} className="flex gap-2 items-start">
                            <div className="flex-grow space-y-2">
                                <input 
                                    type="text" 
                                    placeholder="Nombre del concepto" 
                                    className="w-full bg-gray-100 border border-slate-300 rounded-lg px-3 py-2 text-sm font-bold focus:ring-2 focus:ring-blue-500 outline-none text-slate-900"
                                    value={row.concept}
                                    onChange={(e) => handleExpenseChange(index, 'concept', e.target.value)}
                                />
                                <div className="relative">
                                    <span className="absolute left-3 top-2 text-slate-400 font-bold">$</span>
                                    <input 
                                        type="number" 
                                        placeholder="0.00" 
                                        className="w-full bg-gray-100 border border-slate-300 rounded-lg pl-6 pr-3 py-2 text-sm font-bold focus:ring-2 focus:ring-blue-500 outline-none text-slate-900"
                                        value={row.amount || ''}
                                        onChange={(e) => handleExpenseChange(index, 'amount', e.target.value)}
                                    />
                                </div>
                            </div>
                            {expenseRows.length > 1 && (
                                <button onClick={() => handleRemoveExpenseRow(index)} className="mt-1 p-2 text-red-500 hover:bg-red-100 rounded-lg">
                                    <Trash2 className="h-5 w-5" />
                                </button>
                            )}
                        </div>
                    ))}
                </div>
                <button onClick={handleAddExpenseRow} className="w-full py-2 mb-4 border border-dashed border-slate-300 text-slate-500 font-bold rounded-xl hover:bg-white text-xs flex items-center justify-center">
                    <Plus className="h-3 w-3 mr-2" /> AGREGAR CONCEPTO
                </button>
            </>
        )}

        <div className="border-t border-slate-200 pt-3 mb-4">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Evidencia</p>
            <button 
                onClick={() => expenseFileInputRef.current?.click()}
                disabled={isUploadingExpenseEvidence}
                className={`w-full py-2 rounded-lg bg-white border border-blue-200 text-blue-600 font-bold text-xs flex items-center justify-center hover:bg-blue-50 ${isUploadingExpenseEvidence ? 'opacity-50' : ''}`}
            >
                    {isUploadingExpenseEvidence ? <Loader className="h-4 w-4 animate-spin mr-2" /> : <Camera className="h-4 w-4 mr-2" />}
                    {isUploadingExpenseEvidence ? 'SUBIENDO...' : 'FOTO / TICKET'}
            </button>
            {expenseEvidence.length > 0 && (
                <div className="grid grid-cols-4 gap-2 mt-2">
                    {expenseEvidence.map((ev) => (
                        <div key={ev.id} className="relative group aspect-square">
                            <SafeImage src={ev.url} alt="Evidencia" className="w-full h-full rounded-md object-cover border border-slate-300" />
                            <button onClick={() => handleRemoveExpenseEvidence(ev.id)} className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5"><X className="h-2 w-2" /></button>
                        </div>
                    ))}
                </div>
            )}
        </div>

        <button 
            onClick={handleSaveExpense} 
            disabled={isSavingExpense || isUploadingExpenseEvidence}
            className={`w-full py-3 rounded-xl text-white font-black text-sm shadow-md flex items-center justify-center active:scale-[0.98] transition-all ${
                isSavingExpense || isUploadingExpenseEvidence ? 'bg-slate-400' : 'bg-slate-900 hover:bg-slate-800'
            }`}
        >
            {isSavingExpense ? <Loader className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
            GUARDAR {subCategory || expandedCategory}
        </button>

        {trip.extraCosts && trip.extraCosts.filter(e => e.category === expandedCategory).length > 0 && (
            <div className="mt-6 pt-4 border-t border-slate-200">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Historial Registrado ({expandedCategory})</p>
                
                {(() => {
                    const historyRecords = trip.extraCosts.filter(e => e.category === expandedCategory);
                    const totalPerformance = historyRecords.reduce((acc, record) => {
                        return acc + record.items.reduce((iAcc, item) => iAcc + (parseFloat(item.performance || '0') || 0), 0);
                    }, 0);

                    return (
                        <div className="space-y-2">
                            {historyRecords.map((record, idx) => (
                                <div key={record.id || idx} className="bg-white p-3 rounded-lg border border-slate-100 shadow-sm">
                                    <div className="flex justify-between items-start mb-1">
                                        <div>
                                            <p className="text-xs font-bold text-slate-700">{record.items[0]?.concept || 'Varios'}</p>
                                            <p className="text-[10px] text-slate-400">{new Date(record.timestamp).toLocaleTimeString()}</p>
                                        </div>
                                        <span className="text-xs font-black text-slate-900">${Number(record.total).toFixed(2)}</span>
                                    </div>
                                    
                                    {record.items[0]?.performance && parseFloat(record.items[0].performance) > 0 && (
                                        <div className="mt-1">
                                            <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                                                Rendimiento: {record.items[0].performance} km/L
                                            </span>
                                        </div>
                                    )}
                                </div>
                            ))}

                            {totalPerformance > 0 && (
                                <div className="mt-4 p-3 bg-slate-800 rounded-xl text-center shadow-md animate-in fade-in slide-in-from-bottom-2">
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Rendimiento Total Acumulado</p>
                                    <p className="text-2xl font-black text-white">{totalPerformance.toFixed(2)}</p>
                                </div>
                            )}
                        </div>
                    );
                })()}
            </div>
        )}
    </div>
  )};

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

      <div className="bg-blue-900 text-white p-4 shadow-md sticky top-0 z-[100]">
        <div className="flex justify-between items-center mb-4">
            <button onClick={() => { playSound('notification'); onBack(); }} className="p-2 bg-white/10 rounded-lg active:scale-90">
               <ArrowLeft className="h-6 w-6 text-white" />
            </button>
            <div className="flex items-center gap-3">
                <div className="text-right">
                    <div className="text-[10px] font-bold text-blue-300 uppercase">Operador</div>
                    <div className="text-sm font-extrabold">{user?.name}</div>
                </div>
                <button onClick={onLogout} className="p-2.5 bg-white/10 rounded-full active:scale-90" title="Cerrar Sesión">
                    <LogOut className="h-5 w-5" />
                </button>
            </div>
        </div>
        <div className="bg-black/20 p-3 rounded-xl flex justify-between items-center">
            <div>
                <div className="text-xs text-blue-200 font-bold uppercase">Viaje {trip.code}</div>
                <div className="text-2xl font-black text-white">{trip.plate}</div>
            </div>
            <div className={`px-3 py-1 rounded-full text-xs font-bold border-2 ${
                trip.status === TripStatus.IN_TRANSIT 
                  ? 'bg-indigo-500 border-indigo-400' 
                  : 'bg-white/10 border-white/20'
            }`}>
                {trip.status}
            </div>
        </div>
      </div>

      <div className="flex-1 px-4 pt-2 flex flex-col max-w-lg mx-auto w-full pb-32">
        
        <div className="mb-4">{renderInfoCards()}</div>

        {/* SECCIÓN DE BOTONES DE GASTOS Y FLUJO (REUBICADA: ARRIBA) */}
        <div className="bg-slate-100 p-4 rounded-3xl border border-slate-200 animate-in slide-in-from-bottom-2">
            
            <div className="flex justify-end mb-4">
                <button onClick={generateDriverReport} disabled={isGeneratingReport} className="text-[10px] font-bold bg-white border border-slate-300 px-3 py-1.5 rounded-lg flex items-center shadow-sm text-slate-600 hover:bg-slate-50">
                    {isGeneratingReport ? <Loader className="h-3 w-3 mr-1 animate-spin"/> : <FileJson className="h-3 w-3 mr-1" />}
                    DESCARGAR REPORTE (PDF)
                </button>
            </div>

            <h4 className="text-center text-xs font-black text-slate-400 uppercase tracking-widest mb-4">Centro de Costos y Operaciones</h4>
            <div className="grid grid-cols-1 gap-3">
                {/* 1. OPERATIVO (AZUL - Despliega Flujo del Viaje) */}
                <div className="rounded-xl overflow-hidden shadow-sm transition-all">
                    <button 
                        onClick={() => toggleExpenseCategory('OPERATIVO')}
                        className={`w-full text-white font-black py-4 px-6 rounded-xl shadow-lg border-b-4 transition-all active:translate-y-1 active:border-b-0 flex items-center justify-between
                            ${expandedCategory === 'OPERATIVO' ? 'bg-blue-700 border-blue-900 translate-y-1' : 'bg-blue-600 border-blue-800 hover:bg-blue-500'}`}
                    >
                        <div className="flex items-center">
                            <div className="bg-white/20 p-2 rounded-lg mr-3"><Briefcase className="h-6 w-6 text-white" /></div>
                            <div className="text-left leading-none"><span className="block text-lg uppercase tracking-tight">Operativo</span><span className="text-[10px] font-bold opacity-80">Monitor de Flujo</span></div>
                        </div>
                        {expandedCategory === 'OPERATIVO' ? <ChevronUp className="h-6 w-6 text-white" /> : <ChevronDown className="h-6 w-6 text-white" />}
                    </button>
                    {expandedCategory === 'OPERATIVO' && (
                        <div className="bg-white border-x-2 border-b-2 border-blue-100 rounded-b-xl overflow-hidden animate-in slide-in-from-top-2 p-4">
                            {/* LISTA DE ETAPAS DENTRO DEL ACORDEÓN */}
                            <div className="space-y-3">
                                {TRIP_STAGES.map((stage, index) => {
                                    const isCompleted = index < trip.currentStageIndex;
                                    const isCurrent = index === trip.currentStageIndex;
                                    const isEvidenceRequired = index === 2 || index === 5; 
                                    
                                    const currentEvidence = trip.evidence.filter(e => 
                                        e.stageIndex === index && 
                                        (index === 2 || !e.destinationId || e.destinationId === activeDest?.id)
                                    );

                                    return (
                                    <div key={stage.key} className="space-y-3">
                                        <button
                                        onClick={() => handleStageClick(index)}
                                        disabled={!isCurrent || isProcessing}
                                        className={`w-full py-4 px-4 rounded-xl flex items-center justify-between border-b-4 transition-all active:translate-y-1
                                            ${isCompleted ? 'bg-slate-100 border-slate-200 text-slate-400' : 
                                            isCurrent ? 'bg-amber-400 border-amber-600 text-black shadow-md' : 
                                            'bg-white border-slate-100 text-slate-300'}`}
                                        >
                                        <div className="flex items-center space-x-4">
                                            <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 font-black text-sm shrink-0
                                            ${isCurrent ? 'bg-black text-white border-black' : isCompleted ? 'bg-slate-300 text-slate-500 border-slate-400' : 'border-current'}`}>
                                            {isCompleted ? <Check className="h-4 w-4" /> : <span>{index + 1}</span>}
                                            </div>
                                            <div className="text-left">
                                            <span className="text-sm font-black uppercase tracking-tight block leading-none">{stage.label}</span>
                                            {isCurrent && (
                                                <span className="text-[10px] font-black uppercase opacity-70 flex items-center mt-1">
                                                {isProcessing ? <Loader className="h-3 w-3 animate-spin mr-1" /> : <ChevronRight className="h-3 w-3 mr-1" />}
                                                {isEvidenceRequired && currentEvidence.length === 0 ? "FOTO REQUERIDA" : "CONFIRMAR"}
                                                </span>
                                            )}
                                            </div>
                                        </div>
                                        </button>

                                        {isCurrent && isEvidenceRequired && (
                                        <div className="bg-slate-800 rounded-xl p-4 border-2 border-slate-600 shadow-lg animate-in slide-in-from-top-2">
                                            <div className="flex flex-col items-center mb-4 text-center">
                                                <h4 className="text-sm font-black text-white uppercase tracking-tight">Evidencia Requerida</h4>
                                            </div>
                                            <button 
                                                onClick={() => fileInputRef.current?.click()} 
                                                disabled={isUploading}
                                                className={`w-full text-white py-3 rounded-lg font-black text-xs uppercase flex items-center justify-center border-b-2 active:translate-y-1 active:border-b-0 transition-all mb-4 shadow-md group ${isUploading ? 'bg-slate-500 border-slate-700 cursor-wait' : 'bg-blue-600 hover:bg-blue-500 border-blue-800'}`}
                                            >
                                                {isUploading ? (
                                                    <>
                                                        <Loader className="h-4 w-4 mr-2 animate-spin" />
                                                        SUBIENDO...
                                                    </>
                                                ) : (
                                                    <>
                                                        <Plus className="h-4 w-4 mr-2 group-hover:rotate-90 transition-transform" />
                                                        SUBIR FOTO
                                                    </>
                                                )}
                                            </button>
                                            {currentEvidence.length > 0 && (
                                            <div className="grid grid-cols-3 gap-2">
                                                {currentEvidence.map((ev) => (
                                                    <div key={ev.id} className="relative group"><SafeImage src={ev.url} alt="Evidencia" className="aspect-square rounded-lg border-2 border-slate-600 shadow-sm" /><div className="absolute -top-1 -right-1 bg-green-500 rounded-full p-0.5 border border-white"><Check className="h-2 w-2 text-white" /></div></div>
                                                ))}
                                            </div>
                                            )}
                                        </div>
                                        )}
                                    </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>

                {/* BOTÓN DE PÁNICO (INDEPENDIENTE) */}
                <button 
                    onClick={handlePanicAlert}
                    disabled={isSendingPanic}
                    className="w-full bg-red-600 text-white font-black py-4 rounded-xl shadow-lg border-b-4 border-red-800 active:translate-y-1 active:border-b-0 transition-all flex items-center justify-center animate-pulse"
                >
                    {isSendingPanic ? <Loader className="h-6 w-6 animate-spin" /> : <Siren className="h-6 w-6 mr-2" />}
                    {isSendingPanic ? 'ENVIANDO ALERTA...' : 'ASISTENCIA URGENTE (SOS)'}
                </button>

                {/* 2. GASTOS (VERDE - Estilo Pánico) */}
                <div className="rounded-xl overflow-hidden shadow-sm transition-all">
                    <button 
                        onClick={() => toggleExpenseCategory('GASTOS')}
                        className={`w-full text-white font-black py-4 px-6 rounded-xl shadow-lg border-b-4 transition-all active:translate-y-1 active:border-b-0 flex items-center justify-between
                            ${expandedCategory === 'GASTOS' ? 'bg-green-700 border-green-900 translate-y-1' : 'bg-green-600 border-green-800 hover:bg-green-500'}`}
                    >
                        <div className="flex items-center">
                            <div className="bg-white/20 p-2 rounded-lg mr-3"><Wallet className="h-6 w-6 text-white" /></div>
                            <div className="text-left leading-none"><span className="block text-lg uppercase tracking-tight">Gastos</span><span className="text-[10px] font-bold opacity-80">Viáticos, Comidas...</span></div>
                        </div>
                        {expandedCategory === 'GASTOS' ? <ChevronUp className="h-6 w-6 text-white" /> : <Plus className="h-6 w-6 text-white" />}
                    </button>
                    {expandedCategory === 'GASTOS' && (
                        <div className="bg-white border-x-2 border-b-2 border-green-100 rounded-b-xl overflow-hidden animate-in slide-in-from-top-2">
                            {subCategory ? (
                                renderExpenseForm('border-green-300')
                            ) : (
                                <div className="p-4 grid grid-cols-2 gap-3">
                                    <button onClick={() => handleSelectSubCategory('COMBUSTIBLE')} className="flex flex-col items-center justify-center p-4 bg-green-50 border border-green-200 rounded-xl hover:bg-green-100 transition-colors">
                                        <Fuel className="h-8 w-8 text-green-600 mb-2"/>
                                        <span className="text-xs font-black text-green-800 uppercase text-center">Combustible</span>
                                    </button>
                                    <button onClick={() => handleSelectSubCategory('CASETAS EFECTIVO')} className="flex flex-col items-center justify-center p-4 bg-green-50 border border-green-200 rounded-xl hover:bg-green-100 transition-colors">
                                        <Ticket className="h-8 w-8 text-green-600 mb-2"/>
                                        <span className="text-xs font-black text-green-800 uppercase text-center">Casetas Efectivo</span>
                                    </button>
                                    <button onClick={() => handleSelectSubCategory('VIÁTICOS')} className="flex flex-col items-center justify-center p-4 bg-green-50 border border-green-200 rounded-xl hover:bg-green-100 transition-colors">
                                        <Utensils className="h-8 w-8 text-green-600 mb-2"/>
                                        <span className="text-xs font-black text-green-800 uppercase text-center">Viáticos</span>
                                    </button>
                                    <button onClick={() => handleSelectSubCategory('REPARACIONES Y REFACCIONES')} className="flex flex-col items-center justify-center p-4 bg-green-50 border border-green-200 rounded-xl hover:bg-green-100 transition-colors">
                                        <Wrench className="h-8 w-8 text-green-600 mb-2"/>
                                        <span className="text-xs font-black text-green-800 uppercase text-center">Refacciones</span>
                                    </button>
                                    <button onClick={() => handleSelectSubCategory('MANIOBRAS')} className="flex flex-col items-center justify-center p-4 bg-green-50 border border-green-200 rounded-xl hover:bg-green-100 transition-colors">
                                        <Cone className="h-8 w-8 text-green-600 mb-2"/>
                                        <span className="text-xs font-black text-green-800 uppercase text-center">Maniobras</span>
                                    </button>
                                    <button onClick={() => handleSelectSubCategory('OTROS GASTOS')} className="flex flex-col items-center justify-center p-4 bg-green-50 border border-green-200 rounded-xl hover:bg-green-100 transition-colors">
                                        <PlusCircle className="h-8 w-8 text-green-600 mb-2"/>
                                        <span className="text-xs font-black text-green-800 uppercase text-center">Otros Gastos</span>
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* 3. MANTENIMIENTO (NARANJA - Estilo Pánico) */}
                <div className="rounded-xl overflow-hidden shadow-sm transition-all">
                    <button 
                        onClick={() => toggleExpenseCategory('MANTENIMIENTO')}
                        className={`w-full text-white font-black py-4 px-6 rounded-xl shadow-lg border-b-4 transition-all active:translate-y-1 active:border-b-0 flex items-center justify-between
                            ${expandedCategory === 'MANTENIMIENTO' ? 'bg-orange-700 border-orange-900 translate-y-1' : 'bg-orange-600 border-orange-800 hover:bg-orange-500'}`}
                    >
                        <div className="flex items-center">
                            <div className="bg-white/20 p-2 rounded-lg mr-3"><Wrench className="h-6 w-6 text-white" /></div>
                            <div className="text-left leading-none"><span className="block text-lg uppercase tracking-tight">Mantenimiento</span><span className="text-[10px] font-bold opacity-80">Reparaciones, Piezas...</span></div>
                        </div>
                        {expandedCategory === 'MANTENIMIENTO' ? <ChevronUp className="h-6 w-6 text-white" /> : <Plus className="h-6 w-6 text-white" />}
                    </button>
                    {expandedCategory === 'MANTENIMIENTO' && (
                        <div className="bg-white border-x-2 border-b-2 border-orange-100 rounded-b-xl overflow-hidden animate-in slide-in-from-top-2">
                            {subCategory ? (
                                renderExpenseForm('border-orange-300')
                            ) : (
                                <div className="p-4 grid grid-cols-2 gap-3">
                                    <button onClick={() => handleSelectSubCategory('REPORTE INCIDENCIA')} className="flex flex-col items-center justify-center p-4 bg-orange-50 border border-orange-200 rounded-xl hover:bg-orange-100 transition-colors">
                                        <ClipboardList className="h-8 w-8 text-orange-600 mb-2"/>
                                        <span className="text-xs font-black text-orange-800 uppercase text-center">Reportar Incidencia</span>
                                    </button>
                                    <button onClick={() => handleSelectSubCategory('REPORTE URGENTE')} className="flex flex-col items-center justify-center p-4 bg-red-50 border border-red-200 rounded-xl hover:bg-red-100 transition-colors">
                                        <Siren className="h-8 w-8 text-red-600 mb-2 animate-pulse"/>
                                        <span className="text-xs font-black text-red-800 uppercase text-center">REPORTE URGENTE</span>
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
        
        <div className="flex items-center my-2 mt-6">
            <div className="flex-grow h-px bg-slate-300"></div>
            <span className="mx-4 text-slate-400 font-black uppercase text-sm tracking-widest">Navegación</span>
            <div className="flex-grow h-px bg-slate-300"></div>
        </div>
        
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden animate-in fade-in slide-in-from-top-2 mt-6">
            <div className="bg-slate-100 px-5 py-4 border-b border-slate-200 flex justify-between items-center">
                <h3 className="font-black text-sm text-slate-700 uppercase tracking-widest flex items-center">
                    <Map className="h-5 w-5 mr-2" /> RUTA ASIGNADA
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
            <button onClick={() => setShowPdfModal(true)} className="w-full bg-white border-2 border-blue-100 p-5 rounded-2xl shadow-sm flex items-center justify-between active:scale-[0.98] transition-all group hover:border-blue-400 mt-6">
                <div className="flex items-center">
                    <div className="bg-blue-100 p-4 rounded-xl mr-5 group-hover:bg-blue-600 transition-colors"><FileText className="h-8 w-8 text-blue-700 group-hover:text-white transition-colors" /></div>
                    <div className="text-left"><h4 className="text-lg font-black text-slate-800 uppercase tracking-tight">Documento de Viaje</h4><p className="text-sm text-slate-500 font-medium">Ver indicaciones (PDF)</p></div>
                </div>
                <div className="bg-slate-50 p-3 rounded-full"><ChevronRight className="h-6 w-6 text-slate-400" /></div>
            </button>
        )}
        
        {/* BOTÓN MAPA DE CARGA (ORIGEN) - VISIBLE EN ETAPAS 0 Y 1 */}
        {trip.currentStageIndex <= 1 && (
            <div className="mt-6 animate-in fade-in slide-in-from-top-2">
                <button onClick={() => { playSound('notification'); const url = trip.originMapsLink || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(trip.origin)}`; window.open(url, '_blank'); }} className="w-full bg-white border-2 border-slate-200 text-slate-800 p-4 rounded-2xl flex items-center justify-center space-x-3 active:scale-95 transition-all shadow-sm hover:border-slate-300">
                <MapPin className="h-6 w-6 text-red-600" />
                <div className="text-left leading-tight"><span className="block text-xs font-bold uppercase text-slate-400">Lugar de Carga</span><span className="block text-base font-black uppercase">Ver Mapa</span></div>
                </button>
            </div>
        )}

        {/* BOTÓN MAPA DESTINO - VISIBLE DURANTE TRÁNSITO HACIA DESTINO (ETAPAS 2 a 4) */}
        {trip.currentStageIndex >= 2 && trip.currentStageIndex <= 4 && activeDest && (
            <div className="mt-6 animate-in fade-in slide-in-from-top-2">
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
      
      {/* --- MODAL DE ODÓMETRO INICIAL (ACTUALIZADO) --- */}
      {showOdometerModal && (
        <div className="fixed inset-0 z-[2000] bg-slate-900/90 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in duration-300">
          <div className="bg-white rounded-3xl p-8 max-w-sm w-full text-center shadow-2xl">
            <div className="mx-auto bg-blue-100 w-20 h-20 rounded-full flex items-center justify-center mb-6"><Gauge className="h-12 w-12 text-blue-600" /></div>
            <h2 className="text-2xl font-black text-slate-900 mb-2 uppercase">Odómetro Inicial</h2>
            <p className="text-slate-500 font-medium text-sm mb-6">Confirma el kilometraje de tu unidad para comenzar el viaje.</p>
            
            <div className="relative mb-6">
                <input 
                    type="number"
                    value={odometerInput}
                    readOnly 
                    className="w-full text-center text-3xl font-black p-4 bg-slate-200 border-2 border-slate-300 rounded-xl outline-none cursor-not-allowed"
                    placeholder="0"
                />
                <span className="absolute right-4 top-5 text-lg font-bold text-slate-400">KM</span>
            </div>

            <div className="flex flex-col gap-3">
                <button onClick={handleConfirmStartTrip} disabled={isProcessing} className="w-full bg-slate-900 text-white font-black text-lg py-4 rounded-xl shadow-xl hover:bg-slate-800 active:scale-[0.98] transition-all flex items-center justify-center">
                    {isProcessing ? <Loader className="h-6 w-6 animate-spin" /> : 'CONFIRMAR Y CONTINUAR'}
                </button>
                <button onClick={() => setShowOdometerModal(false)} className="w-full text-slate-500 font-bold py-2 rounded-lg hover:bg-slate-100">
                    Cancelar
                </button>
            </div>
          </div>
        </div>
      )}
      
      {/* --- MODAL DE ODÓMETRO FINAL (NUEVO) --- */}
      {showFinalOdometerModal && (
        <div className="fixed inset-0 z-[2000] bg-slate-900/90 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in duration-300">
          <div className="bg-white rounded-3xl p-8 max-w-sm w-full text-center shadow-2xl">
            <div className="mx-auto bg-green-100 w-20 h-20 rounded-full flex items-center justify-center mb-6"><Gauge className="h-12 w-12 text-green-600" /></div>
            <h2 className="text-2xl font-black text-slate-900 mb-2 uppercase">Odómetro Final</h2>
            <p className="text-slate-500 font-medium text-sm mb-6">Ingresa el kilometraje actual de tu unidad para finalizar el viaje.</p>
            
            <div className="relative mb-6">
                <input 
                    type="number"
                    value={finalOdometerInput}
                    onChange={(e) => setFinalOdometerInput(e.target.value)}
                    className="w-full text-center text-3xl font-black p-4 bg-gray-50 border-2 border-green-300 rounded-xl outline-none focus:ring-2 focus:ring-green-500"
                    placeholder="0"
                />
                <span className="absolute right-4 top-5 text-lg font-bold text-slate-400">KM</span>
            </div>

            <div className="flex flex-col gap-3">
                <button onClick={handleConfirmCompleteTrip} disabled={isProcessing} className="w-full bg-green-600 text-white font-black text-lg py-4 rounded-xl shadow-xl hover:bg-green-700 active:scale-[0.98] transition-all flex items-center justify-center">
                    {isProcessing ? <Loader className="h-6 w-6 animate-spin" /> : 'CONFIRMAR FIN DE VIAJE'}
                </button>
                <button onClick={() => setShowFinalOdometerModal(false)} className="w-full text-slate-500 font-bold py-2 rounded-lg hover:bg-slate-100">
                    Cancelar
                </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
