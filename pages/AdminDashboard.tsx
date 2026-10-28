import React, { useState, useEffect, useRef } from 'react';
import { TRIP_STAGES, MOCK_OPERATORS } from '../constants';
import { Trip, TripStatus, EvidenceStatus, Evidence, LocationReport, TripDestination, ExpenseRecord, Unit, Operator } from '../types';
import { supabase } from '../supabaseClient';
import { sendPushNotification, playSound } from '../utils';
import { Siren, Search, Filter, CheckCircle, Clock, MapPin, Truck, AlertTriangle, Plus, X, Users, Save, Eye, ChevronRight, FileText, Link, ThumbsUp, ThumbsDown, Camera, AlertCircle, Folder, Download, ZoomIn, Image as ImageIcon, Archive, Map, Fuel, Loader, FileWarning, Paperclip, Check, Trash2, Navigation, Circle, CheckCircle2, Dot, Share2, Calendar, Building2, MessageSquare, Wallet, Wrench, Briefcase, FileJson, Hash, Gauge, Box, CreditCard, Pencil, UserCog, User, Lock, FileBadge, EyeOff, DollarSign, Database, ExternalLink, Copy, FileSpreadsheet } from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  exportBitacorasExcel,
  exportBitacorasPDF,
  exportHistoryExcel,
  exportHistoryPDF,
  exportFleetExcel,
  exportFleetPDF,
  exportOperatorsExcel,
  exportOperatorsPDF,
  exportExpensesExcel,
  exportExpensesPDF,
  extractFlatExpenses,
  FlatExpenseRow,
  getDateRange,
  filterByDateRange,
  DateFilterMode,
  DateRangeResult
} from '../exportUtils';

interface AdminDashboardProps {
  trips: Trip[];
  onUpdateTrip: (trip: Trip) => void;
  onAddTrip: (trip: Trip) => void;
  onDeleteTrip: (tripId: string) => void;
}

const REJECTION_REASONS = [
    "Foto borrosa / No visible",
    "Ángulo incorrecto",
    "Documento incompleto",
    "Unidad no visible",
    "Poca iluminación",
    "Ubicación no coincide"
];

const SafeImage: React.FC<{ src: string; alt: string; className: string; onClick?: () => void }> = ({ src, alt, className, onClick }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  return (
    <div className={`relative overflow-hidden flex items-center justify-center ${className} bg-slate-100 cursor-pointer transition-transform hover:scale-[1.02]`} onClick={onClick}>
      {loading && <Loader className="absolute h-5 w-5 animate-spin text-slate-400 z-10" />}
      
      {error ? (
        <div className="flex flex-col items-center justify-center p-2 text-center w-full h-full">
          <FileWarning className="h-5 w-5 text-red-500 mb-1" />
          <button 
            onClick={(e) => { e.stopPropagation(); setError(false); setLoading(true); setRetryCount(prev => prev + 1); }}
            className="text-[8px] font-bold text-blue-600 underline"
          >
            Reintentar
          </button>
        </div>
      ) : (
        <img 
          src={`${src}${retryCount > 0 ? `?retry=${retryCount}` : ''}`} 
          alt={alt} 
          className={`w-full h-full object-cover transition-opacity duration-300 ${loading ? 'opacity-0' : 'opacity-100'}`}
          onLoad={() => setLoading(false)}
          onError={() => { setError(true); setLoading(false); }}
        />
      )}
    </div>
  );
};

const generateUUID = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ trips, onUpdateTrip, onAddTrip, onDeleteTrip }) => {
  const [activeTab, setActiveTab] = useState<'MONITOR' | 'CREATE' | 'HISTORY' | 'FLEET' | 'OPERATORS' | 'EXPENSES' | 'DATABASE'>('MONITOR');
  const [filterText, setFilterText] = useState('');
  
  // Filtros por fecha / período para consultas y descargas
  const [dateFilterMode, setDateFilterMode] = useState<DateFilterMode>('ALL');
  const [customDateStart, setCustomDateStart] = useState<string>('');
  const [customDateEnd, setCustomDateEnd] = useState<string>('');

  const [audioEnabled, setAudioEnabled] = useState(false);
  const [showDbPassword, setShowDbPassword] = useState(false);
  const [copiedDbText, setCopiedDbText] = useState<string | null>(null);

  const handleCopyDb = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedDbText(label);
    setTimeout(() => setCopiedDbText(null), 2000);
  };
  const [selectedTripForMonitor, setSelectedTripForMonitor] = useState<Trip | null>(null);
  const [showRejectionMenu, setShowRejectionMenu] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null); 
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isSubmittingRef = useRef(false);
  
  const [uploadingPdfId, setUploadingPdfId] = useState<string | null>(null);
  const autoAlertsSent = useRef<Set<string>>(new Set());

  // Estado para Módulo de Gastos y Edición de Gastos por Operador
  const [expenseSearch, setExpenseSearch] = useState('');
  const [expenseCategoryFilter, setExpenseCategoryFilter] = useState<'ALL' | 'OPERATIVO' | 'GASTOS' | 'MANTENIMIENTO'>('ALL');
  const [editingExpense, setEditingExpense] = useState<{
    tripId: string;
    tripCode: string;
    recordId: string;
    category: 'OPERATIVO' | 'GASTOS' | 'MANTENIMIENTO';
    items: {
      concept: string;
      amount: number | string;
      liters?: number;
      pricePerLiter?: number;
      odometer?: number;
    }[];
  } | null>(null);
  const [isSavingExpenseEdit, setIsSavingExpenseEdit] = useState(false);

  // Estado para registro de viaje
  const [editingTripId, setEditingTripId] = useState<string | null>(null);
  const [newTrip, setNewTrip] = useState({
    code: '', 
    client: '',
    project: '',
    origin: '',
    originAddress: '',
    originMapsLink: '',
    scheduledDate: new Date().toISOString().split('T')[0],
    appointment: '',
    odometerStart: '',
    odometerAnterior: '',
    instructions: '',
    indicaciones_pdf_url: '',
    plate: '', 
    operator_id: '',
    gastosDepositados: '',
    combustibleAsignado: '',
    precioPorLitro: '',
    kmEstimados: '',
    destinations: [
      { id: Date.now().toString(), name: '', mapsLink: '', destinationAddress: '', date: '', appointment: '', currentStageIndex: 0, status: 'PENDING' as const, instructions: '', instructions_pdf_url: '', tripNumber: '' }
    ]
  });

  // Estado para Flota (Unidades)
  const [unitData, setUnitData] = useState({ 
    eco: '', 
    plate: '', 
    type: 'Camioneta', 
    box_type: 'Caja Seca',
    current_odometer: '' 
  });
  const [unitsList, setUnitsList] = useState<Unit[]>([]);
  const [editingUnitId, setEditingUnitId] = useState<string | null>(null);

  // Estado para Operadores
  const [operatorData, setOperatorData] = useState({ 
      name: '', 
      username: '', 
      password: '', 
      license_number: '', 
      unit_number: '', 
      plate: '',
      role: 'OPERATOR'
  });
  const [operatorsList, setOperatorsList] = useState<Operator[]>([]);
  const [editingOperatorId, setEditingOperatorId] = useState<string | null>(null);
  
  // Estado para mostrar contraseña en formulario de operador
  const [showOperatorPass, setShowOperatorPass] = useState(false);

  const criticalTrips = trips.filter(t => t.hasIncident || t.status === TripStatus.DELAYED || t.status === TripStatus.INCIDENT);

  // Fetch initial data
  useEffect(() => {
      const fetchData = async () => {
          // Fetch units for all tabs where we need to display unit eco or manage them
          const { data: unitsData } = await supabase.from('unidades').select('*').order('created_at', { ascending: false });
          if (unitsData) setUnitsList(unitsData as Unit[]);
          
          // Fetch operators for all tabs where we need to display operator names
          const { data: operatorsData } = await supabase.from('operadores').select('*').order('created_at', { ascending: false });
          if (operatorsData) setOperatorsList(operatorsData as Operator[]);
      };
      fetchData();
  }, [activeTab]);

  // --- SINCRONIZACIÓN EN TIEMPO REAL DEL MONITOR ---
  useEffect(() => {
    if (selectedTripForMonitor) {
      const updatedTrip = trips.find(t => t.id === selectedTripForMonitor.id);
      if (updatedTrip) {
        setSelectedTripForMonitor(updatedTrip);
      } else {
         setSelectedTripForMonitor(null);
      }
    }
  }, [trips]); 
  // -----------------------------------------------

  // ... (Se mantiene el resto del código de Unidades y Operadores igual) ...
  // [Se omite el código repetitivo de handleRegisterUnit, handleEditUnit, etc. para ir directo a la solución en handleCreateTrip]
  
  const handleRegisterUnit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (isSubmitting) return;

      setIsSubmitting(true);
      try {
          const payload = {
            eco: unitData.eco,
            plate: unitData.plate,
            type: unitData.type,
            box_type: unitData.box_type,
            current_odometer: unitData.current_odometer ? parseFloat(unitData.current_odometer) : 0,
            status: 'AVAILABLE'
          };

          if (editingUnitId) {
              const { error } = await supabase.from('unidades')
                  .update({
                      eco: unitData.eco,
                      plate: unitData.plate,
                      type: unitData.type,
                      box_type: unitData.box_type,
                      current_odometer: payload.current_odometer
                  })
                  .eq('id', editingUnitId);

              if (error) throw error;
              alert("✅ Unidad actualizada correctamente");
              setEditingUnitId(null);
          } else {
              const { error } = await supabase.from('unidades').insert([payload]);

              if (error) throw error;
              alert("✅ Unidad registrada correctamente");
          }
          
          setUnitData({ eco: '', plate: '', type: 'Camioneta', box_type: 'Caja Seca', current_odometer: '' });
          playSound('success');
          const { data } = await supabase.from('unidades').select('*').order('created_at', { ascending: false });
          if (data) setUnitsList(data as Unit[]);

      } catch (err: any) {
          console.error("Error gestión unidad", err);
          playSound('alert');
          alert(`Error al procesar unidad: ${err.message || JSON.stringify(err)}`);
      } finally {
          setIsSubmitting(false);
      }
  };

  const handleEditUnit = (unit: Unit) => {
      setUnitData({ 
        eco: unit.eco, 
        plate: unit.plate, 
        type: unit.type, 
        box_type: unit.box_type,
        current_odometer: unit.current_odometer ? unit.current_odometer.toString() : ''
      });
      setEditingUnitId(unit.id);
      window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancelEditUnit = () => {
      setUnitData({ eco: '', plate: '', type: 'Camioneta', box_type: 'Caja Seca', current_odometer: '' });
      setEditingUnitId(null);
  };

  const handleDeleteUnit = async (id: string) => {
      if (!confirm("⚠️ ¿Estás seguro de ELIMINAR permanentemente esta unidad de la base de datos?\nSe borrará directamente de Supabase para que el sistema no la vuelva a cargar.")) return;
      try {
          const { error } = await supabase.from('unidades').delete().eq('id', id);
          if (error) throw error;
          setUnitsList(prev => prev.filter(u => u.id !== id));
          playSound('notification');
      } catch (err: any) {
          console.error("Error eliminando unidad en Supabase", err);
          alert(`Error al eliminar unidad de Supabase: ${err.message || 'Error desconocido'}`);
      }
  };

  const handleRegisterOperator = async (e: React.FormEvent) => {
      e.preventDefault();
      if (isSubmitting) return;
      setIsSubmitting(true);

      try {
          const payload = {
              name: operatorData.name,
              username: operatorData.username,
              password: operatorData.password,
              license_number: operatorData.license_number || 'N/A',
              unit_number: operatorData.unit_number || 'N/A',
              plate: operatorData.plate || 'N/A',
              status: 'AVAILABLE',
              role: operatorData.role
          };

          if (editingOperatorId) {
              const { error } = await supabase.from('operadores')
                  .update(payload)
                  .eq('id', editingOperatorId);
              if (error) throw error;
              alert("✅ Operador actualizado correctamente");
              setEditingOperatorId(null);
          } else {
              const { data: existing } = await supabase.from('operadores').select('id').eq('username', operatorData.username).single();
              if (existing) {
                  alert("⚠️ El nombre de usuario ya existe. Elige otro.");
                  setIsSubmitting(false);
                  return;
              }

              const { error } = await supabase.from('operadores').insert([payload]);
              if (error) throw error;
              alert("✅ Operador registrado exitosamente");
          }

          setOperatorData({ name: '', username: '', password: '', license_number: '', unit_number: '', plate: '', role: 'OPERATOR' });
          playSound('success');
          
          const { data } = await supabase.from('operadores').select('*').order('created_at', { ascending: false });
          if (data) setOperatorsList(data as Operator[]);

      } catch (err: any) {
          console.error("Error operador", err);
          playSound('alert');
          alert(`Error: ${err.message || 'Verifique los datos'}`);
      } finally {
          setIsSubmitting(false);
      }
  };

  const handleEditOperator = (op: Operator) => {
      setOperatorData({
          name: op.name,
          username: op.username || '',
          password: op.password || '',
          license_number: op.license_number || '',
          unit_number: op.unit_number || '',
          plate: op.plate || '',
          role: op.role || 'OPERATOR'
      });
      setEditingOperatorId(op.id);
      window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancelEditOperator = () => {
      setOperatorData({ name: '', username: '', password: '', license_number: '', unit_number: '', plate: '', role: 'OPERATOR' });
      setEditingOperatorId(null);
  };

  const handleDeleteOperator = async (id: string) => {
      if (!confirm("⚠️ ¿Estás seguro de ELIMINAR a este operador de la base de datos?\nSe borrará su cuenta y acceso directamente de Supabase para que no se vuelva a cargar.")) return;
      try {
          const { error } = await supabase.from('operadores').delete().eq('id', id);
          if (error) throw error;
          setOperatorsList(prev => prev.filter(op => op.id !== id));
          playSound('notification');
      } catch (err: any) {
          console.error("Error eliminando operador en Supabase", err);
          alert(`Error al eliminar operador de Supabase: ${err.message || 'Error desconocido'}`);
      }
  };

  useEffect(() => {
    if (criticalTrips.length > 0 && audioEnabled) {
      const audio = new Audio('https://codeskulptor-demos.commondatastorage.googleapis.com/GalaxyInvaders/pause.wav');
      const interval = setInterval(() => {
        audio.play().catch(() => {});
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [criticalTrips.length, audioEnabled]);

  // ... (Funciones auxiliares: uploadFileToStorage, handlePdfUpload, etc.) ...
  const uploadFileToStorage = async (file: File): Promise<string | null> => {
    try {
      const fileName = `documentos/${Date.now()}_${file.name}`;
      const { data, error } = await supabase.storage
        .from('evidencias')
        .upload(fileName, file);

      if (error) throw error;
      const { data: urlData } = supabase.storage.from('evidencias').getPublicUrl(fileName);
      return urlData.publicUrl;
    } catch (err: any) {
      console.error("Error al subir archivo:", err);
      alert("Error al subir el documento. Verifique su conexión.");
      return null;
    }
  };

  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>, destId: string | 'GENERAL') => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingPdfId(destId);
    const publicUrl = await uploadFileToStorage(file);
    
    if (publicUrl) {
        if (destId === 'GENERAL') {
            setNewTrip(prev => ({ ...prev, indicaciones_pdf_url: publicUrl }));
        } else {
            setNewTrip(prev => ({
                ...prev,
                destinations: prev.destinations.map(d => d.id === destId ? { ...d, instructions_pdf_url: publicUrl } : d)
            }));
        }
    }
    setUploadingPdfId(null);
  };

  const handleAddDestination = () => {
    setNewTrip(prev => ({
      ...prev,
      destinations: [
        ...prev.destinations,
        { 
            id: (Date.now() + Math.random()).toString(), 
            name: '', 
            mapsLink: '', 
            destinationAddress: '',
            currentStageIndex: 0, 
            status: 'PENDING' as const,
            client: '',
            origin: '',
            date: new Date().toISOString().split('T')[0],
            appointment: '',
            instructions: '',
            instructions_pdf_url: '',
            tripNumber: ''
        }
      ]
    }));
  };

  const handleRemoveDestination = (id: string) => {
    if (newTrip.destinations.length <= 1) return;
    setNewTrip(prev => ({
      ...prev,
      destinations: prev.destinations.filter(d => d.id !== id)
    }));
  };

  const updateDestination = (id: string, field: string, value: string) => {
    setNewTrip(prev => ({
      ...prev,
      destinations: prev.destinations.map(d => d.id === id ? { ...d, [field]: value } : d)
    }));
  };

  const handleApproveEvidence = async (trip: Trip) => {
    let newStatus = trip.status;
    if (trip.currentStageIndex >= 6 || trip.status === TripStatus.COMPLETED) {
         newStatus = TripStatus.COMPLETED;
    }

    const updatedTrip = { 
        ...trip, 
        evidenceStatus: 'APPROVED' as EvidenceStatus,
        status: newStatus,
        rejectionReason: undefined
    };

    const { error } = await supabase
        .from('viajes')
        .update({ 
            evidence_status: 'APPROVED',
            status: newStatus 
        })
        .eq('id', trip.id);
    
    await supabase.from('notificaciones').insert({
        target_role: 'OPERATOR',
        target_user_id: trip.operator_id || trip.plate,
        title: '✅ EVIDENCIA APROBADA',
        message: 'Tus fotos han sido validadas por la torre de control.',
        type: 'success'
    });

    if (error) return;

    onUpdateTrip(updatedTrip);
    setSelectedTripForMonitor(updatedTrip);
    playSound('success');
  };

  const handleRejectEvidence = async (trip: Trip, reason: string) => {
    const updatedTrip = { 
        ...trip, 
        evidenceStatus: 'REJECTED' as EvidenceStatus, 
        rejectionReason: reason 
    };

    const { error } = await supabase
        .from('viajes')
        .update({ evidence_status: 'REJECTED' })
        .eq('id', trip.id);

    await supabase.from('notificaciones').insert({
        target_role: 'OPERATOR',
        target_user_id: trip.operator_id || trip.plate,
        title: '⚠️ EVIDENCIA RECHAZADA',
        message: `Motivo: ${reason}. Por favor captura la evidencia nuevamente.`,
        type: 'alert'
    });

    if (error) return;

    onUpdateTrip(updatedTrip);
    setSelectedTripForMonitor(updatedTrip); 
    setShowRejectionMenu(false);
    playSound('alert');
  };

  const handleDeleteClick = (e: React.MouseEvent, tripId: string) => {
    e.stopPropagation(); 
    const confirmDelete = window.confirm("⚠️ ¿Estás seguro de ELIMINAR permanentemente este viaje de la base de datos?\nSe borrará directamente de Supabase para que el sistema no lo vuelva a cargar.");
    if (confirmDelete) {
      if (selectedTripForMonitor?.id === tripId) {
        setSelectedTripForMonitor(null);
      }
      onDeleteTrip(tripId);
    }
  };

  // --- GESTIÓN DE GASTOS REPORTADOS POR OPERADORES ---
  const handleOpenEditExpense = (tripId: string, record: ExpenseRecord) => {
    const targetTrip = trips.find(t => t.id === tripId);
    setEditingExpense({
      tripId,
      tripCode: targetTrip?.code || 'VIAJE',
      recordId: record.id,
      category: record.category,
      items: (record.items && record.items.length > 0)
        ? record.items.map(it => ({ ...it }))
        : [{ concept: 'Gasto registrado', amount: record.total || 0 }]
    });
  };

  const handleCancelEditExpense = () => {
    setEditingExpense(null);
  };

  const handleAddExpenseItemRow = () => {
    if (!editingExpense) return;
    setEditingExpense({
      ...editingExpense,
      items: [...editingExpense.items, { concept: '', amount: 0 }]
    });
  };

  const handleRemoveExpenseItemRow = (index: number) => {
    if (!editingExpense || editingExpense.items.length <= 1) return;
    setEditingExpense({
      ...editingExpense,
      items: editingExpense.items.filter((_, i) => i !== index)
    });
  };

  const handleExpenseItemChange = (index: number, field: string, value: any) => {
    if (!editingExpense) return;
    const newItems = [...editingExpense.items];
    newItems[index] = { ...newItems[index], [field]: value };
    setEditingExpense({
      ...editingExpense,
      items: newItems
    });
  };

  const handleDeleteExpense = async (tripId: string, recordId: string) => {
    const confirmDelete = window.confirm("⚠️ ¿Estás seguro de ELIMINAR este gasto registrado por el operador?\nEsta acción actualizará los registros en Supabase.");
    if (!confirmDelete) return;

    const targetTrip = trips.find(t => t.id === tripId);
    if (!targetTrip) return;

    const updatedExtraCosts = (targetTrip.extraCosts || []).filter(r => r.id !== recordId);
    const updatedTrip: Trip = { ...targetTrip, extraCosts: updatedExtraCosts };

    try {
      const { error } = await supabase.from('viajes').update({ extra_costs: updatedExtraCosts }).eq('id', tripId);
      if (error) {
        console.error("Error al borrar gasto en Supabase:", error);
        alert("Error al eliminar gasto: " + error.message);
        return;
      }
      onUpdateTrip(updatedTrip);
      if (selectedTripForMonitor?.id === tripId) {
        setSelectedTripForMonitor(updatedTrip);
      }
      playSound('info');
    } catch (err: any) {
      console.error("Error deleting expense:", err);
      alert("Error al eliminar gasto: " + (err.message || 'Error desconocido'));
    }
  };

  const handleSaveEditedExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingExpense) return;

    const targetTrip = trips.find(t => t.id === editingExpense.tripId);
    if (!targetTrip) return;

    const validItems = editingExpense.items.map(it => ({
      ...it,
      concept: it.concept.trim(),
      amount: Number(it.amount) || 0
    })).filter(it => it.concept !== '');

    if (validItems.length === 0) {
      alert("Por favor ingresa al menos un concepto de gasto.");
      return;
    }

    const calculatedTotal = validItems.reduce((acc, it) => acc + (Number(it.amount) || 0), 0);

    setIsSavingExpenseEdit(true);
    try {
      const updatedExtraCosts = (targetTrip.extraCosts || []).map(r => {
        if (r.id === editingExpense.recordId) {
          return {
            ...r,
            category: editingExpense.category,
            items: validItems,
            total: calculatedTotal
          };
        }
        return r;
      });

      const updatedTrip: Trip = { ...targetTrip, extraCosts: updatedExtraCosts };
      const { error } = await supabase.from('viajes').update({ extra_costs: updatedExtraCosts }).eq('id', editingExpense.tripId);
      if (error) {
        console.error("Error actualizando gasto en Supabase:", error);
        alert("Error al actualizar gasto: " + error.message);
        setIsSavingExpenseEdit(false);
        return;
      }

      onUpdateTrip(updatedTrip);
      if (selectedTripForMonitor?.id === editingExpense.tripId) {
        setSelectedTripForMonitor(updatedTrip);
      }
      setEditingExpense(null);
      playSound('success');
    } catch (err: any) {
      console.error("Error saving expense edit:", err);
      alert("Error al guardar: " + (err.message || 'Error desconocido'));
    } finally {
      setIsSavingExpenseEdit(false);
    }
  };

  const generateOrderPDF = (trip: Trip) => {
    setIsGeneratingPdf(true);
    try {
        const doc = new jsPDF();
        
        doc.setFillColor(15, 23, 42); 
        doc.rect(0, 0, 210, 24, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(16);
        doc.setFont("helvetica", "bold");
        doc.text("TBS Logistics Services", 14, 12);
        doc.setFontSize(9);
        doc.text("ORDEN DE SERVICIO / BITÁCORA", 14, 18);
        
        doc.text(`FOLIO: ${trip.code}`, 195, 12, { align: "right" });
        doc.text(`FECHA: ${trip.date}`, 195, 18, { align: "right" });

        let yPos = 32; 
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.setFillColor(241, 245, 249); 
        doc.rect(14, yPos - 4, 182, 6, 'F');
        doc.text("1. INFORMACIÓN GENERAL", 16, yPos);
        yPos += 8;

        const generalInfo = [
            ["Operador:", operatorsList.find(op => op.plate === trip.plate)?.name || "Sin Asignar"],
            ["Cliente:", trip.client],
            ["Proyecto:", trip.project],
            ["Origen:", trip.origin],
            ["Dirección Origen:", trip.originAddress || "No especificada"],
            ["Link Maps:", trip.originMapsLink || "No disponible"],
            ["Cita Carga:", `${trip.date} - ${trip.appointment}`]
        ];

        autoTable(doc, {
            startY: yPos,
            body: generalInfo,
            theme: 'plain',
            styles: { fontSize: 8, cellPadding: 1, minCellHeight: 4 },
            columnStyles: { 0: { fontStyle: 'bold', cellWidth: 40 } }
        });

        yPos = (doc as any).lastAutoTable.finalY + 8;
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.setFillColor(241, 245, 249);
        doc.rect(14, yPos - 4, 182, 6, 'F');
        doc.text("2. ITINERARIO Y DESTINOS", 16, yPos);
        yPos += 8;

        // FIX: Explicitly type destinations and ensure the fallback object conforms to TripDestination interface.
        const destinations: TripDestination[] = trip.destinations && trip.destinations.length > 0 
            ? trip.destinations 
            : [{ id: 'main', name: trip.destination, mapsLink: trip.destinationMapsLink, currentStageIndex: 0, status: 'PENDING' as const }];

        destinations.forEach((dest, idx) => {
             if (yPos > 270) {
                 doc.addPage();
                 yPos = 20;
             }

             doc.setFontSize(9);
             doc.setFont("helvetica", "bold");
             doc.setTextColor(30, 58, 138);
             doc.text(`DESTINO #${idx + 1}: ${dest.name}`, 14, yPos);
             yPos += 4;
             
             const destData: (string | { content: string; styles: any })[][] = [
                 ["Dirección:", dest.destinationAddress || "No especificada"],
                 ["Link Maps:", dest.mapsLink || "No disponible"]
             ];

             if (idx === 0) {
                 destData.push(["Cita Destino:", `${dest.date || ''} ${dest.appointment || ''}`.trim() || "No especificada"]);
                 destData.push(["Indicaciones:", trip.instructions || "Sin indicaciones"]);
                 destData.push(["PDF Adjunto:", trip.indicaciones_pdf_url ? "SÍ" : "NO"]);
             } else {
                 destData.push(["No. Viaje / Ref:", dest.tripNumber || "N/A"]);
                 destData.push(["Cliente:", dest.client || "N/A"]);
                 destData.push(["Origen:", dest.origin || "N/A"]);
                 destData.push(["Cita:", `${dest.date || ''} ${dest.appointment || ''}`]);
                 destData.push(["Indicaciones:", dest.instructions || "N/A"]);
                 destData.push(["PDF:", dest.instructions_pdf_url ? "SÍ" : "NO"]);
             }

             autoTable(doc, {
                startY: yPos,
                body: destData,
                theme: 'grid',
                styles: { fontSize: 7, cellPadding: 1 },
                columnStyles: { 0: { fontStyle: 'bold', cellWidth: 35, fillColor: [248, 250, 252] } },
                margin: { left: 14 }
             });

             yPos = (doc as any).lastAutoTable.finalY + 6;
        });

        if (yPos + 30 > 280) { doc.addPage(); yPos = 20; }
        
        doc.setTextColor(0,0,0);
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.setFillColor(241, 245, 249);
        doc.rect(14, yPos - 4, 182, 6, 'F');
        doc.text("3. ASIGNACIÓN DE UNIDAD Y ODÓMETRO", 16, yPos);
        yPos += 8;

        const totalDistance = (trip.odometerStart && trip.odometerEnd) ? (trip.odometerEnd - trip.odometerStart) : null;
        const operatorName = operatorsList.find(op => op.plate === trip.plate)?.name || 'Sin Asignar';
        const unitEco = unitsList.find(u => u.plate === trip.plate)?.eco || trip.plate;

        autoTable(doc, {
            startY: yPos,
            body: [
                ["Unidad:", unitEco],
                ["Estatus:", trip.status],
                ["Operador:", operatorName],
                ["Odómetro Anterior:", trip.odometerAnterior ? `${trip.odometerAnterior} KM` : "NO REGISTRADO"],
                ["Odómetro Inicial:", trip.odometerStart ? `${trip.odometerStart} KM` : "NO REGISTRADO"],
                ["Odómetro Final:", trip.odometerEnd ? `${trip.odometerEnd} KM` : "NO REGISTRADO"],
                ["Recorrido Total:", totalDistance !== null ? `${totalDistance} KM` : "NO CALCULABLE"],
                ["Gastos Depositados:", trip.gastosDepositados ? `$${trip.gastosDepositados}` : "N/A"],
                ["Combustible Asignado:", trip.combustibleAsignado ? `${trip.combustibleAsignado} L` : "N/A"],
                ["Precio por Litro:", trip.precioPorLitro ? `$${trip.precioPorLitro}` : "N/A"],
                ["Costo Total Combustible:", trip.costoTotalCombustible ? `$${trip.costoTotalCombustible}` : "N/A"],
                ["KM Estimados:", trip.kmEstimados ? `${trip.kmEstimados} KM` : "N/A"]
            ],
            theme: 'plain',
            styles: { fontSize: 8, cellPadding: 1 },
            columnStyles: { 0: { fontStyle: 'bold', cellWidth: 40 } }
        });

        if (trip.extraCosts && trip.extraCosts.length > 0) {
            yPos = (doc as any).lastAutoTable.finalY + 8;
            if (yPos + 30 > 280) { doc.addPage(); yPos = 20; }

            doc.setFillColor(241, 245, 249);
            doc.rect(14, yPos - 4, 182, 6, 'F');
            doc.text("4. REGISTRO DE GASTOS, OPERATIVO Y MANTENIMIENTO", 16, yPos);
            yPos += 8;

            const expenseData: any[] = [];
            let grandTotal = 0;

            trip.extraCosts.forEach(record => {
                const hasEvidence = record.evidence && record.evidence.length > 0;
                
                record.items.forEach(item => {
                    let desc = item.concept;
                    
                    if (desc.includes('Reporte urgente')) {
                        desc = `!!! URGENTE !!! ${desc}`;
                    }

                    if (item.liters && item.pricePerLiter) {
                        desc += ` (${item.liters}L a $${item.pricePerLiter}/L - Odo: ${item.odometer})`;
                    }

                    if (hasEvidence) {
                        desc += ' [EVIDENCIA ADJUNTA]';
                    }

                    // PROTECCIÓN CONTRA STRINGS EN AMOUNT
                    const safeAmount = Number(item.amount || 0);

                    expenseData.push([
                        record.category,
                        desc,
                        `$${safeAmount.toFixed(2)}`
                    ]);
                    
                    grandTotal += safeAmount;
                });
            });

            expenseData.push([
                { content: 'TOTAL ACUMULADO', colSpan: 2, styles: { halign: 'right', fontStyle: 'bold', fillColor: [240, 240, 240] } },
                { content: `$${Number(grandTotal).toFixed(2)}`, styles: { fontStyle: 'bold', fillColor: [240, 240, 240] } }
            ]);

            autoTable(doc, {
                startY: yPos,
                head: [['Categoría', 'Concepto / Detalle', 'Monto']],
                body: expenseData,
                theme: 'striped',
                styles: { fontSize: 7, cellPadding: 2, valign: 'middle' }, 
                columnStyles: { 
                    0: { fontStyle: 'bold', cellWidth: 25 },
                    2: { halign: 'right', fontStyle: 'bold' } 
                }
            });
        }

        doc.save(`Orden_Servicio_${trip.code}.pdf`);
        playSound('success');

    } catch (error) {
        console.error("Error generating Order PDF", error);
        alert("Error generando el PDF.");
    } finally {
        setIsGeneratingPdf(false);
    }
  };

  const handleEditTrip = (trip: Trip) => {
    setNewTrip({
      code: trip.code,
      client: trip.client,
      project: trip.project,
      origin: trip.origin,
      originAddress: trip.originAddress || '',
      originMapsLink: trip.originMapsLink || '',
      scheduledDate: trip.date || new Date().toISOString().split('T')[0],
      appointment: trip.appointment,
      odometerStart: trip.odometerStart ? trip.odometerStart.toString() : '',
      odometerAnterior: trip.odometerAnterior ? trip.odometerAnterior.toString() : '',
      instructions: trip.instructions || '',
      indicaciones_pdf_url: trip.indicaciones_pdf_url || '',
      plate: trip.plate,
      operator_id: trip.operator_id || '',
      gastosDepositados: trip.gastosDepositados ? trip.gastosDepositados.toString() : '',
      combustibleAsignado: trip.combustibleAsignado ? trip.combustibleAsignado.toString() : '',
      precioPorLitro: trip.precioPorLitro ? trip.precioPorLitro.toString() : '',
      kmEstimados: trip.kmEstimados ? trip.kmEstimados.toString() : '',
      destinations: trip.destinations && trip.destinations.length > 0 ? trip.destinations : [{ id: Date.now().toString(), name: trip.destination, mapsLink: '', destinationAddress: '', date: '', appointment: '', currentStageIndex: 0, status: 'PENDING' as const, instructions: '', instructions_pdf_url: '', tripNumber: '' }]
    });
    setEditingTripId(trip.id);
    setActiveTab('CREATE');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancelEditTrip = () => {
    setNewTrip({ 
      code: '',
      client: '', 
      project: '', 
      origin: '',
      originAddress: '',
      originMapsLink: '', 
      scheduledDate: new Date().toISOString().split('T')[0],
      appointment: '', 
      odometerStart: '',
      odometerAnterior: '',
      instructions: '', 
      indicaciones_pdf_url: '', 
      plate: '',
      operator_id: '',
      gastosDepositados: '',
      combustibleAsignado: '',
      precioPorLitro: '',
      kmEstimados: '',
      destinations: [{ id: Date.now().toString(), name: '', mapsLink: '', destinationAddress: '', currentStageIndex: 0, status: 'PENDING' as const, instructions: '', instructions_pdf_url: '', tripNumber: '' }]
    });
    setEditingTripId(null);
    setActiveTab('MONITOR');
  };

  const handleUnitSelection = async (selectedPlate: string) => {
      const selectedUnit = unitsList.find(u => u.plate === selectedPlate);
      let lastOdometer = selectedUnit?.current_odometer ? selectedUnit.current_odometer.toString() : '';
      
      try {
          const { data: lastTrip } = await supabase
              .from('viajes')
              .select('odometer_end, odometer_start')
              .eq('plate', selectedPlate)
              .order('created_at', { ascending: false })
              .limit(1)
              .single();
              
          if (lastTrip) {
              if (lastTrip.odometer_end && lastTrip.odometer_end > 0) {
                  lastOdometer = lastTrip.odometer_end.toString();
              } else if (lastTrip.odometer_start && lastTrip.odometer_start > 0) {
                  lastOdometer = lastTrip.odometer_start.toString();
              }
          }
      } catch (err) {
          console.warn('Could not fetch last trip odometer:', err);
      }

      setNewTrip(prev => ({
          ...prev, 
          plate: selectedPlate,
          odometerStart: lastOdometer,
          odometerAnterior: lastOdometer
      }));
  };

  const handleCreateTrip = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation(); 
    
    if (isSubmitting || isSubmittingRef.current) return; 
    isSubmittingRef.current = true;
    setIsSubmitting(true);

    try {
        let startOdometer = 0;
        const manualOdometer = newTrip.odometerStart ? parseFloat(newTrip.odometerStart) : 0;

        if (manualOdometer > 0) {
            startOdometer = manualOdometer;
        } else {
            const { data: unitData } = await supabase
                .from('unidades')
                .select('current_odometer')
                .eq('plate', newTrip.plate)
                .single();
            
            if (unitData && unitData.current_odometer) {
                startOdometer = unitData.current_odometer;
            }
        }

        const finalCode = newTrip.code.trim() !== '' ? newTrip.code : `VIA-TLS-${Math.floor(Math.random() * 1000)}`;

        if (editingTripId) {
            const { error } = await supabase.from('viajes').update({
                 code: finalCode,
                 origin: newTrip.origin,
                 origin_address: newTrip.originAddress || '',
                 origin_maps_link: newTrip.originMapsLink || '',
                 destination: newTrip.destinations[0]?.name || 'Varias Paradas',
                 client: newTrip.client,
                 project: newTrip.project,
                 appointment: newTrip.appointment,
                 plate: newTrip.plate,
                 operator_id: newTrip.operator_id,
                 destinos_lista: newTrip.destinations,
                 instructions: newTrip.instructions,
                 indicaciones_pdf_url: newTrip.indicaciones_pdf_url || null,
                 scheduled_date: newTrip.scheduledDate,
                 odometer_start: startOdometer || null,
                 
                 gastos_depositados: newTrip.gastosDepositados ? parseFloat(newTrip.gastosDepositados) : null,
                 combustible_asignado: newTrip.combustibleAsignado ? parseFloat(newTrip.combustibleAsignado) : null,
                 precio_por_litro: newTrip.precioPorLitro ? parseFloat(newTrip.precioPorLitro) : null,
                 costo_total_combustible: (newTrip.combustibleAsignado && newTrip.precioPorLitro) ? (parseFloat(newTrip.combustibleAsignado) * parseFloat(newTrip.precioPorLitro)) : null,
                 km_estimados: newTrip.kmEstimados ? parseFloat(newTrip.kmEstimados) : null
            }).eq('id', editingTripId);

            if (error) {
                console.error("Error updating trip in Supabase:", error);
                throw error;
            }
            
            alert(`✅ Viaje actualizado correctamente.`);
        } else {
            const tripId = generateUUID();
            
            const { error } = await supabase.from('viajes').insert({
                 id: tripId,
                 code: finalCode,
                 origin: newTrip.origin,
                 origin_address: newTrip.originAddress || '',
                 origin_maps_link: newTrip.originMapsLink || '',
                 destination: newTrip.destinations[0]?.name || 'Varias Paradas',
                 client: newTrip.client,
                 project: newTrip.project,
                 appointment: newTrip.appointment,
                 status: TripStatus.PENDING_ACCEPTANCE,
                 plate: newTrip.plate,
                 operator_id: newTrip.operator_id,
                 current_stage: 0,
                 destinos_lista: newTrip.destinations,
                 instructions: newTrip.instructions,
                 indicaciones_pdf_url: newTrip.indicaciones_pdf_url || null,
                 scheduled_date: newTrip.scheduledDate,
                 odometer_start: startOdometer || null,
                 
                 gastos_depositados: newTrip.gastosDepositados ? parseFloat(newTrip.gastosDepositados) : null,
                 combustible_asignado: newTrip.combustibleAsignado ? parseFloat(newTrip.combustibleAsignado) : null,
                 precio_por_litro: newTrip.precioPorLitro ? parseFloat(newTrip.precioPorLitro) : null,
                 costo_total_combustible: (newTrip.combustibleAsignado && newTrip.precioPorLitro) ? (parseFloat(newTrip.combustibleAsignado) * parseFloat(newTrip.precioPorLitro)) : null,
                 km_estimados: newTrip.kmEstimados ? parseFloat(newTrip.kmEstimados) : null
            });

            if (error) {
                console.error("Error creating trip in Supabase:", error);
                throw error;
            }
            
            // Only send notification if operator_id is present
            if (newTrip.operator_id) {
                await supabase.from('notificaciones').insert({
                    target_role: 'OPERATOR',
                    target_user_id: newTrip.operator_id,
                    title: '🚨 NUEVO VIAJE ASIGNADO',
                    message: `Cliente: ${newTrip.client} | Destino: ${newTrip.destinations[0]?.name || 'Varios'}`,
                    type: 'alert',
                    metadata: { trip_id: tripId }
                });
            }
            
            alert(`✅ Viaje creado y notificado correctamente.`);
        }
        
        setNewTrip({ 
          code: '',
          client: '', 
          project: '', 
          origin: '',
          originAddress: '',
          originMapsLink: '', 
          scheduledDate: new Date().toISOString().split('T')[0],
          appointment: '', 
          odometerStart: '',
          odometerAnterior: '',
          instructions: '', 
          indicaciones_pdf_url: '', 
          plate: '',
          operator_id: '',
          gastosDepositados: '',
          combustibleAsignado: '',
          precioPorLitro: '',
          kmEstimados: '',
          destinations: [{ id: Date.now().toString(), name: '', mapsLink: '', destinationAddress: '', currentStageIndex: 0, status: 'PENDING' as const, instructions: '', instructions_pdf_url: '', tripNumber: '' }]
        });
        
        setEditingTripId(null);
        setActiveTab('MONITOR');
        playSound('success');

    } catch (err: any) {
        console.error("Critical error during trip creation", err);
        playSound('alert');
        alert(`Error al guardar el viaje: ${err.message}`);
    } finally {
        setIsSubmitting(false);
        isSubmittingRef.current = false;
    }
  };

  // Cálculo del rango activo de fechas
  const activeDateRange = getDateRange(dateFilterMode, customDateStart, customDateEnd);

  const filteredTrips = trips.filter(trip => {
    const unitEco = unitsList.find(u => u.plate === trip.plate)?.eco || '';
    const operatorName = operatorsList.find(op => op.plate === trip.plate)?.name || '';
    
    const matchesSearch = trip.client.toLowerCase().includes(filterText.toLowerCase()) ||
      trip.project.toLowerCase().includes(filterText.toLowerCase()) ||
      trip.code.toLowerCase().includes(filterText.toLowerCase()) ||
      trip.plate.toLowerCase().includes(filterText.toLowerCase()) ||
      unitEco.toLowerCase().includes(filterText.toLowerCase()) ||
      operatorName.toLowerCase().includes(filterText.toLowerCase());

    const matchesDate = filterByDateRange(trip.date, activeDateRange);

    return matchesSearch && matchesDate;
  });

  const filteredHistoryTrips = trips.filter(trip => {
    return filterByDateRange(trip.date, activeDateRange);
  });

  const inputStyle = "w-full bg-gray-100 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:bg-white block p-3 transition-colors outline-none placeholder-gray-500";
  const labelStyle = "block text-sm font-bold text-gray-700 mb-1.5";
  
  const getLastLocation = (trip: Trip) => {
    if (!trip.locationHistory || trip.locationHistory.length === 0) return null;
    return trip.locationHistory[trip.locationHistory.length - 1];
  };

  const lastLocation = selectedTripForMonitor ? getLastLocation(selectedTripForMonitor) : null;

  const handleShareEvidence = async (trip: Trip) => {
    if (!trip.evidence || trip.evidence.length === 0) {
        alert("No hay evidencias para compartir.");
        return;
    }

    try {
        const files: File[] = [];
        for (let i = 0; i < trip.evidence.length; i++) {
            const ev = trip.evidence[i];
            const response = await fetch(ev.url);
            const blob = await response.blob();
            const file = new File([blob], `evidencia_${trip.code}_${i+1}.jpg`, { type: blob.type });
            files.push(file);
        }

        if (navigator.canShare && navigator.canShare({ files })) {
            await navigator.share({
                title: `Evidencias del viaje ${trip.code}`,
                text: `Adjunto evidencias del viaje ${trip.code} - Unidad ${trip.plate}`,
                files: files
            });
        } else {
            // Fallback: Download individually
            files.forEach(file => {
                const url = URL.createObjectURL(file);
                const a = document.createElement('a');
                a.href = url;
                a.download = file.name;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            });
            alert("Las evidencias se han descargado porque tu dispositivo no soporta compartir múltiples archivos directamente.");
        }
    } catch (error) {
        console.error("Error al compartir evidencias:", error);
        alert("Hubo un error al intentar compartir las evidencias.");
    }
  };

  const allFlatExpenses = extractFlatExpenses(trips, operatorsList);
  const filteredFlatExpenses = allFlatExpenses.filter(e => {
    const matchCat = expenseCategoryFilter === 'ALL' || e.category === expenseCategoryFilter;
    const q = expenseSearch.toLowerCase().trim();
    const matchQuery = !q || 
      e.tripCode.toLowerCase().includes(q) ||
      e.operatorName.toLowerCase().includes(q) ||
      e.concept.toLowerCase().includes(q) ||
      e.plate.toLowerCase().includes(q);
    const matchDate = filterByDateRange(e.timestamp || e.dateStr, activeDateRange);
    return matchCat && matchQuery && matchDate;
  });

  const renderDateFilterToolbar = (badgeInfo?: string) => (
    <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3 text-xs mb-4 animate-in fade-in">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-black text-slate-500 uppercase tracking-wider text-[11px] mr-1 flex items-center gap-1">
          <Calendar className="w-3.5 h-3.5 text-blue-600" /> Período:
        </span>
        {(['ALL', 'TODAY', 'YESTERDAY', 'WEEK', 'MONTH', 'CUSTOM'] as const).map((m) => {
          const labels: Record<string, string> = {
            ALL: 'Todos',
            TODAY: 'Hoy',
            YESTERDAY: 'Ayer',
            WEEK: 'Esta Semana',
            MONTH: 'Este Mes',
            CUSTOM: 'Personalizado'
          };
          const isSelected = dateFilterMode === m;
          return (
            <button
              key={m}
              type="button"
              onClick={() => {
                setDateFilterMode(m);
                if (m !== 'CUSTOM') {
                  setCustomDateStart('');
                  setCustomDateEnd('');
                }
              }}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all text-xs ${
                isSelected
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {labels[m]}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-2 flex-wrap w-full lg:w-auto justify-start lg:justify-end">
        <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1">
          <span className="text-[10px] font-bold text-slate-400 uppercase">Desde:</span>
          <input
            type="date"
            value={customDateStart}
            onChange={(e) => {
              setCustomDateStart(e.target.value);
              setDateFilterMode('CUSTOM');
            }}
            className="bg-transparent text-slate-700 font-bold outline-none text-xs cursor-pointer"
          />
        </div>
        <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1">
          <span className="text-[10px] font-bold text-slate-400 uppercase">Hasta:</span>
          <input
            type="date"
            value={customDateEnd}
            onChange={(e) => {
              setCustomDateEnd(e.target.value);
              setDateFilterMode('CUSTOM');
            }}
            className="bg-transparent text-slate-700 font-bold outline-none text-xs cursor-pointer"
          />
        </div>
        {(dateFilterMode !== 'ALL' || customDateStart || customDateEnd) && (
          <button
            type="button"
            onClick={() => {
              setDateFilterMode('ALL');
              setCustomDateStart('');
              setCustomDateEnd('');
            }}
            className="text-[11px] font-bold text-rose-600 hover:text-rose-800 underline px-1.5 py-1"
            title="Quitar filtro de fecha"
          >
            Limpiar
          </button>
        )}
        {badgeInfo && (
          <span className="text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200 px-2.5 py-1 rounded-lg">
            {badgeInfo}
          </span>
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-100 p-4 lg:p-6 relative">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
          <div className="flex space-x-2 overflow-x-auto w-full md:w-auto pb-2 md:pb-0">
              <button onClick={() => setActiveTab('MONITOR')} className={`px-4 py-2 rounded-lg font-bold transition-colors whitespace-nowrap ${activeTab === 'MONITOR' ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>Bitácoras</button>
              <button onClick={() => setActiveTab('CREATE')} className={`px-4 py-2 rounded-lg font-bold transition-colors flex items-center whitespace-nowrap ${activeTab === 'CREATE' ? 'bg-blue-700 text-white' : 'bg-white text-blue-700 hover:bg-blue-50'}`}><Plus className="h-4 w-4 mr-2" /> Nuevo Viaje</button>
              <button onClick={() => setActiveTab('FLEET')} className={`px-4 py-2 rounded-lg font-bold transition-colors flex items-center whitespace-nowrap ${activeTab === 'FLEET' ? 'bg-orange-600 text-white' : 'bg-white text-orange-600 hover:bg-orange-50'}`}><Truck className="h-4 w-4 mr-2" /> Flota</button>
              <button onClick={() => setActiveTab('OPERATORS')} className={`px-4 py-2 rounded-lg font-bold transition-colors flex items-center whitespace-nowrap ${activeTab === 'OPERATORS' ? 'bg-indigo-600 text-white' : 'bg-white text-indigo-600 hover:bg-indigo-50'}`}><UserCog className="h-4 w-4 mr-2" /> Usuarios</button>
              <button onClick={() => setActiveTab('EXPENSES')} className={`px-4 py-2 rounded-lg font-bold transition-colors flex items-center whitespace-nowrap ${activeTab === 'EXPENSES' ? 'bg-amber-600 text-white shadow' : 'bg-white text-amber-700 hover:bg-amber-50'}`}><DollarSign className="h-4 w-4 mr-2" /> Gastos</button>
              <button onClick={() => setActiveTab('HISTORY')} className={`px-4 py-2 rounded-lg font-bold transition-colors flex items-center whitespace-nowrap ${activeTab === 'HISTORY' ? 'bg-emerald-700 text-white' : 'bg-white text-emerald-700 hover:bg-emerald-50'}`}><Archive className="h-4 w-4 mr-2" /> Historial</button>
              <button onClick={() => setActiveTab('DATABASE')} className={`px-4 py-2 rounded-lg font-bold transition-colors flex items-center whitespace-nowrap ${activeTab === 'DATABASE' ? 'bg-cyan-700 text-white shadow' : 'bg-white text-cyan-800 hover:bg-cyan-50'}`}><Database className="h-4 w-4 mr-2" /> Base de datos</button>
          </div>
      </div>

      {activeTab === 'OPERATORS' && (
          <div className="space-y-6">
              {/* FORMULARIO DE REGISTRO DE OPERADOR */}
              <div className="bg-white rounded-xl shadow-lg border border-gray-200 max-w-3xl mx-auto overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-300">
                  <div className={`p-4 text-white flex justify-between items-center ${editingOperatorId ? 'bg-blue-600' : 'bg-indigo-600'}`}>
                      <h3 className="font-bold text-lg flex items-center">
                          {editingOperatorId ? <Pencil className="h-5 w-5 mr-2"/> : <UserCog className="h-5 w-5 mr-2" />} 
                          {editingOperatorId ? 'Actualizar Usuario' : 'Registrar Nuevo Usuario'}
                      </h3>
                      <button onClick={() => { setActiveTab('MONITOR'); handleCancelEditOperator(); }} className="hover:bg-white/20 rounded p-1 transition-colors"><X className="h-5 w-5" /></button>
                  </div>
                  <form onSubmit={handleRegisterOperator} className="p-6 space-y-5">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                          <div>
                              <label className={labelStyle}>Nombre Completo</label>
                              <div className="relative"><User className="absolute left-3 top-3 h-5 w-5 text-gray-400" /><input required type="text" className={`${inputStyle} pl-10`} placeholder="Nombre y Apellido" value={operatorData.name} onChange={e => setOperatorData({...operatorData, name: e.target.value})} /></div>
                          </div>
                          <div>
                              <label className={labelStyle}>Tipo de Rol</label>
                              <select 
                                  required 
                                  className={inputStyle} 
                                  value={operatorData.role} 
                                  onChange={e => setOperatorData({...operatorData, role: e.target.value as 'OPERATOR' | 'ADMIN'})}
                              >
                                  <option value="OPERATOR">Operador</option>
                                  <option value="ADMIN">Administrador</option>
                              </select>
                          </div>
                          
                          <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
                              <p className="md:col-span-2 text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Credenciales de Acceso</p>
                              <div>
                                  <label className={labelStyle}>Usuario (Login)</label>
                                  <div className="relative"><Users className="absolute left-3 top-3 h-5 w-5 text-indigo-400" /><input required type="text" className={`${inputStyle} pl-10 bg-white`} placeholder="juan.perez" value={operatorData.username} onChange={e => setOperatorData({...operatorData, username: e.target.value})} /></div>
                              </div>
                              <div>
                                  <label className={labelStyle}>Contraseña</label>
                                  <div className="relative">
                                      <Lock className="absolute left-3 top-3 h-5 w-5 text-indigo-400" />
                                      <input 
                                        required 
                                        type={showOperatorPass ? "text" : "password"} 
                                        className={`${inputStyle} pl-10 pr-10 bg-white`} 
                                        placeholder="******" 
                                        value={operatorData.password} 
                                        onChange={e => setOperatorData({...operatorData, password: e.target.value})} 
                                      />
                                      <button 
                                        type="button"
                                        onClick={() => setShowOperatorPass(!showOperatorPass)}
                                        className="absolute right-3 top-3 text-gray-400 hover:text-indigo-600 transition-colors"
                                      >
                                        {showOperatorPass ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                                      </button>
                                  </div>
                              </div>
                          </div>

                          <div><label className={labelStyle}>Licencia</label><div className="relative"><FileBadge className="absolute left-3 top-3 h-5 w-5 text-gray-400" /><input required={operatorData.role === 'OPERATOR'} type="text" className={`${inputStyle} pl-10`} placeholder="Num. Licencia" value={operatorData.license_number} onChange={e => setOperatorData({...operatorData, license_number: e.target.value})} /></div></div>
                          
                          {/* SELECCIÓN DE UNIDAD (CAMBIO PRINCIPAL) */}
                          <div>
                            <label className={labelStyle}>Asignar Unidad (Eco)</label>
                            <div className="relative">
                                <Truck className="absolute left-3 top-3 h-5 w-5 text-gray-400 pointer-events-none" />
                                <select 
                                    className={`${inputStyle} pl-10`} 
                                    value={operatorData.unit_number} 
                                    required={operatorData.role === 'OPERATOR'}
                                    onChange={e => {
                                        const selectedUnit = unitsList.find(u => u.eco === e.target.value);
                                        setOperatorData({
                                            ...operatorData, 
                                            unit_number: e.target.value,
                                            plate: selectedUnit ? selectedUnit.plate : operatorData.plate // Auto-asignar placa
                                        });
                                    }}
                                >
                                    <option value="">-- Seleccionar Unidad --</option>
                                    {unitsList.map(u => (
                                        <option key={u.id} value={u.eco}>{u.eco} - {u.type} ({u.plate})</option>
                                    ))}
                                </select>
                            </div>
                          </div>

                          <div>
                              <label className={labelStyle}>Placas Asignadas</label>
                              <div className="relative">
                                <CreditCard className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                                <input 
                                    required={operatorData.role === 'OPERATOR'} 
                                    type="text" 
                                    className={`${inputStyle} pl-10 bg-gray-50`} 
                                    placeholder="Placas Default" 
                                    value={operatorData.plate} 
                                    onChange={e => setOperatorData({...operatorData, plate: e.target.value})} 
                                    readOnly={!!operatorData.unit_number} // Solo lectura si viene de unidad
                                />
                              </div>
                          </div>
                      </div>
                      
                      <div className="flex gap-3 pt-4">
                          {editingOperatorId && (
                              <button type="button" onClick={handleCancelEditOperator} className="flex-1 bg-slate-100 text-slate-500 font-bold py-3 rounded-xl hover:bg-slate-200 transition-all">CANCELAR</button>
                          )}
                          <button type="submit" disabled={isSubmitting} className={`flex-1 text-white font-bold py-3 rounded-xl shadow-md transition-all ${isSubmitting ? 'bg-gray-400' : editingOperatorId ? 'bg-blue-600 hover:bg-blue-700' : 'bg-indigo-600 hover:bg-indigo-700'}`}>
                              {isSubmitting ? <Loader className="h-5 w-5 animate-spin mx-auto"/> : editingOperatorId ? 'ACTUALIZAR OPERADOR' : 'REGISTRAR OPERADOR'}
                          </button>
                      </div>
                  </form>
              </div>

              {/* LISTA DE OPERADORES */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                  <div className="bg-slate-50 px-6 py-4 border-b border-gray-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                      <div>
                          <h3 className="font-bold text-slate-800">Base de Datos de Usuarios ({operatorsList.length})</h3>
                          <p className="text-xs text-slate-500">Directorio oficial de operadores y administradores</p>
                      </div>
                      <div className="flex items-center gap-2">
                          <button
                              type="button"
                              onClick={() => exportOperatorsExcel(operatorsList)}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-sm transition active:scale-95"
                              title="Descargar directorio de usuarios en Excel"
                          >
                              <FileSpreadsheet className="h-4 w-4" />
                              <span>Excel</span>
                          </button>
                          <button
                              type="button"
                              onClick={() => exportOperatorsPDF(operatorsList)}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-lg shadow-sm transition active:scale-95"
                              title="Descargar directorio de usuarios en PDF"
                          >
                              <FileText className="h-4 w-4" />
                              <span>PDF</span>
                          </button>
                      </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50"><tr><th className="px-6 py-3 text-left text-xs font-black text-gray-500 uppercase">Nombre</th><th className="px-6 py-3 text-left text-xs font-black text-gray-500 uppercase">Usuario</th><th className="px-6 py-3 text-left text-xs font-black text-gray-500 uppercase">Rol</th><th className="px-6 py-3 text-left text-xs font-black text-gray-500 uppercase">Licencia / Eco</th><th className="px-6 py-3 text-right text-xs font-black text-gray-500 uppercase">Acciones</th></tr></thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {operatorsList.length === 0 ? (
                                <tr><td colSpan={5} className="px-6 py-8 text-center text-slate-400">No hay usuarios registrados</td></tr>
                            ) : (
                                operatorsList.map((op) => (
                                    <tr key={op.id} className="hover:bg-slate-50 transition-colors">
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-slate-900">{op.name}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-indigo-600 font-medium">{op.username || '---'}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500"><span className={`px-2 py-1 rounded text-xs font-bold ${op.role === 'ADMIN' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600'}`}>{op.role === 'ADMIN' ? 'ADMIN' : 'OPERADOR'}</span></td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">{op.role === 'ADMIN' ? 'N/A' : `${op.license_number || 'N/A'} - ${op.unit_number || op.plate || 'N/A'}`}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right">
                                            <div className="flex justify-end gap-2">
                                                <button onClick={() => handleEditOperator(op)} className="p-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors" title="Editar"><Pencil className="h-4 w-4" /></button>
                                                <button onClick={() => handleDeleteOperator(op.id)} className="p-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors" title="Eliminar"><Trash2 className="h-4 w-4" /></button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                  </div>
              </div>
          </div>
      )}

      {activeTab === 'FLEET' && (
          <div className="space-y-6">
              {/* FORMULARIO DE REGISTRO DE UNIDAD */}
              <div className="bg-white rounded-xl shadow-lg border border-gray-200 max-w-2xl mx-auto overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-300">
                  <div className={`p-4 text-white flex justify-between items-center ${editingUnitId ? 'bg-blue-600' : 'bg-orange-600'}`}>
                      <h3 className="font-bold text-lg flex items-center">
                          {editingUnitId ? <Pencil className="h-5 w-5 mr-2"/> : <Truck className="h-5 w-5 mr-2" />} 
                          {editingUnitId ? 'Actualizar Unidad' : 'Registrar Unidad'}
                      </h3>
                      <button onClick={() => { setActiveTab('MONITOR'); handleCancelEditUnit(); }} className="hover:bg-white/20 rounded p-1 transition-colors"><X className="h-5 w-5" /></button>
                  </div>
                  <form onSubmit={handleRegisterUnit} className="p-6 space-y-5">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                          <div><label className={labelStyle}>Número Económico (Eco)</label><div className="relative"><Hash className="absolute left-3 top-3 h-5 w-5 text-gray-400" /><input required type="text" className={`${inputStyle} pl-10`} placeholder="Ej. ECO-25" value={unitData.eco} onChange={e => setUnitData({...unitData, eco: e.target.value})} /></div></div>
                          <div><label className={labelStyle}>Placas</label><div className="relative"><CreditCard className="absolute left-3 top-3 h-5 w-5 text-gray-400" /><input required type="text" className={`${inputStyle} pl-10`} placeholder="Ej. 123-ABC" value={unitData.plate} onChange={e => setUnitData({...unitData, plate: e.target.value})} /></div></div>
                          <div><label className={labelStyle}>Tipo de Unidad</label><select className={inputStyle} value={unitData.type} onChange={e => setUnitData({...unitData, type: e.target.value})}><option value="Camioneta">Camioneta</option><option value="Van">Van</option><option value="Torton">Torton</option><option value="Trailer">Trailer</option><option value="Rabón">Rabón</option></select></div>
                          <div><label className={labelStyle}>Tipo de Caja</label><div className="relative"><Box className="absolute left-3 top-3 h-5 w-5 text-gray-400" /><select className={`${inputStyle} pl-10`} value={unitData.box_type} onChange={e => setUnitData({...unitData, box_type: e.target.value})}><option value="Caja Seca">Caja Seca</option><option value="Refrigerada">Refrigerada</option><option value="Plataforma">Plataforma</option><option value="Redilas">Redilas</option></select></div></div>
                          <div className="md:col-span-2">
                            <label className={labelStyle}>Odómetro Actual (KM)</label>
                            <div className="relative">
                                <Gauge className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                                <input 
                                    required 
                                    type="number" 
                                    className={`${inputStyle} pl-10`} 
                                    placeholder="Ej. 154000" 
                                    value={unitData.current_odometer} 
                                    onChange={e => setUnitData({...unitData, current_odometer: e.target.value})} 
                                />
                            </div>
                            <p className="text-[10px] text-slate-400 mt-1 font-medium">* Este valor se usará como base para el cálculo de combustible del operador.</p>
                          </div>
                      </div>
                      
                      <div className="flex gap-3">
                          {editingUnitId && (
                              <button type="button" onClick={handleCancelEditUnit} className="flex-1 bg-slate-100 text-slate-500 font-bold py-3 rounded-xl hover:bg-slate-200 transition-all">CANCELAR</button>
                          )}
                          <button type="submit" disabled={isSubmitting} className={`flex-1 text-white font-bold py-3 rounded-xl shadow-md transition-all ${isSubmitting ? 'bg-gray-400' : editingUnitId ? 'bg-blue-600 hover:bg-blue-700' : 'bg-orange-600 hover:bg-orange-700'}`}>
                              {isSubmitting ? <Loader className="h-5 w-5 animate-spin mx-auto"/> : editingUnitId ? 'ACTUALIZAR UNIDAD' : 'GUARDAR UNIDAD'}
                          </button>
                      </div>
                  </form>
              </div>

              {/* LISTA DE UNIDADES */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                  <div className="bg-slate-50 px-6 py-4 border-b border-gray-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                      <div>
                          <h3 className="font-bold text-slate-800">Parque Vehicular Registrado ({unitsList.length})</h3>
                          <p className="text-xs text-slate-500">Inventario y estado de odómetros de la flota</p>
                      </div>
                      <div className="flex items-center gap-2">
                          <button
                              type="button"
                              onClick={() => exportFleetExcel(unitsList)}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-sm transition active:scale-95"
                              title="Descargar flota vehicular en Excel"
                          >
                              <FileSpreadsheet className="h-4 w-4" />
                              <span>Excel</span>
                          </button>
                          <button
                              type="button"
                              onClick={() => exportFleetPDF(unitsList)}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-lg shadow-sm transition active:scale-95"
                              title="Descargar flota vehicular en PDF"
                          >
                              <FileText className="h-4 w-4" />
                              <span>PDF</span>
                          </button>
                      </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50"><tr><th className="px-6 py-3 text-left text-xs font-black text-gray-500 uppercase">Eco</th><th className="px-6 py-3 text-left text-xs font-black text-gray-500 uppercase">Placas</th><th className="px-6 py-3 text-left text-xs font-black text-gray-500 uppercase">Tipo</th><th className="px-6 py-3 text-left text-xs font-black text-gray-500 uppercase">Odómetro</th><th className="px-6 py-3 text-right text-xs font-black text-gray-500 uppercase">Acciones</th></tr></thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {unitsList.length === 0 ? (
                                <tr><td colSpan={5} className="px-6 py-8 text-center text-slate-400">No hay unidades registradas</td></tr>
                            ) : (
                                unitsList.map((u) => (
                                    <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-slate-900">{u.eco}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">{u.plate}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">{u.type} / {u.box_type}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-slate-800 bg-slate-50">{u.current_odometer ? `${u.current_odometer} km` : '---'}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right">
                                            <div className="flex justify-end gap-2">
                                                <button onClick={() => handleEditUnit(u)} className="p-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors" title="Editar"><Pencil className="h-4 w-4" /></button>
                                                <button onClick={() => handleDeleteUnit(u.id)} className="p-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors" title="Eliminar"><Trash2 className="h-4 w-4" /></button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                  </div>
              </div>
          </div>
      )}

      {/* Resto de tabs (CREATE, HISTORY, MONITOR) ... */}
      
      {activeTab === 'CREATE' && (
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 max-w-2xl mx-auto overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-300">
              <div className="bg-blue-700 p-4 text-white flex justify-between items-center"><h3 className="font-bold text-lg flex items-center">{editingTripId ? <Pencil className="h-5 w-5 mr-2" /> : <Plus className="h-5 w-5 mr-2" />} {editingTripId ? 'Actualizar Viaje' : 'Nuevo Viaje'}</h3><button onClick={handleCancelEditTrip} className="hover:bg-blue-600 rounded p-1 transition-colors"><X className="h-5 w-5" /></button></div>
              <form onSubmit={handleCreateTrip} className="p-6 space-y-5">
                  <div className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <div><label className={labelStyle}>Número de Viaje / Folio</label><div className="relative"><Hash className="absolute left-3 top-3 h-5 w-5 text-gray-400" /><input required type="text" className={`${inputStyle} pl-10`} placeholder="Ej. VIA-12345" value={newTrip.code} onChange={e => setNewTrip({...newTrip, code: e.target.value})} /></div></div>
                        <div><label className={labelStyle}>Cliente</label><input required type="text" className={inputStyle} placeholder="Ej. Ford Motor Co." value={newTrip.client} onChange={e => setNewTrip({...newTrip, client: e.target.value})} /></div>
                        <div className="md:col-span-2"><label className={labelStyle}>Proyecto</label><input required type="text" className={inputStyle} placeholder="Ej. Just In Time" value={newTrip.project} onChange={e => setNewTrip({...newTrip, project: e.target.value})} /></div>
                      </div>
                      <div className="md:col-span-2 bg-slate-50 p-4 rounded-lg border border-slate-200">
                          <h4 className="text-sm font-black text-slate-800 uppercase tracking-wider flex items-center mb-3">
                              <Box className="h-4 w-4 mr-2 text-red-600" /> ORIGEN DE CARGA
                          </h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div>
                                  <label className={labelStyle}>Nombre del Lugar</label>
                                  <div className="relative"><Building2 className="absolute left-3 top-3 h-5 w-5 text-gray-400" /><input required type="text" className={`${inputStyle} pl-10`} placeholder="Ej. CEDIS Tultitlán" value={newTrip.origin} onChange={e => setNewTrip({...newTrip, origin: e.target.value})} /></div>
                              </div>
                              <div>
                                  <label className={labelStyle}>Dirección</label>
                                  <div className="relative"><MapPin className="absolute left-3 top-3 h-5 w-5 text-gray-400" /><input type="text" className={`${inputStyle} pl-10`} placeholder="Calle, Número, Colonia..." value={newTrip.originAddress} onChange={e => setNewTrip({...newTrip, originAddress: e.target.value})} /></div>
                              </div>
                              <div className="md:col-span-2">
                                  <label className={labelStyle}>Link Google Maps</label>
                                  <div className="relative"><Link className="absolute left-3 top-3 h-5 w-5 text-gray-400" /><input type="url" className={`${inputStyle} pl-10`} placeholder="https://maps.app.goo.gl/..." value={newTrip.originMapsLink} onChange={e => setNewTrip({...newTrip, originMapsLink: e.target.value})} /></div>
                              </div>
                          </div>
                      </div>
                      <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div>
                            <label className={labelStyle}>Fecha de Carga</label>
                            <div className="relative">
                                <Calendar className="absolute left-3 top-3 h-5 w-5 text-gray-400 pointer-events-none" />
                                <input 
                                    required 
                                    type="date" 
                                    className={`${inputStyle} pl-10`} 
                                    value={newTrip.scheduledDate} 
                                    onChange={e => setNewTrip({...newTrip, scheduledDate: e.target.value})} 
                                />
                            </div>
                        </div>
                        <div>
                            <label className={labelStyle}>Hora de Carga</label>
                            <input required type="time" className={inputStyle} value={newTrip.appointment} onChange={e => setNewTrip({...newTrip, appointment: e.target.value})} />
                        </div>
                        <div>
                            <label className={labelStyle}>Odómetro Inicial (KM)</label>
                            <div className="relative">
                                <Gauge className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                                <input 
                                    type="number" 
                                    className={`${inputStyle} pl-10`} 
                                    placeholder="Opcional" 
                                    value={newTrip.odometerStart} 
                                    onChange={e => setNewTrip({...newTrip, odometerStart: e.target.value})} 
                                />
                            </div>
                        </div>
                      </div>
                  </div>

                  <div className="space-y-4 pt-4 border-t border-gray-100">
                    <div className="bg-slate-50 -mx-6 px-6 py-3 border-y border-gray-100">
                      <h4 className="text-sm font-black text-slate-800 uppercase tracking-wider flex items-center">
                        <Navigation className="h-4 w-4 mr-2 text-blue-600" /> DESTINOS / PARADAS
                      </h4>
                    </div>

                    <div className="space-y-4">
                      {newTrip.destinations.map((dest, idx) => (
                        <div key={dest.id} className="bg-white p-4 rounded-xl border-2 border-slate-200 relative group animate-in slide-in-from-right-2 duration-200 shadow-sm">
                          <div className="absolute -left-3 top-4 w-8 h-8 bg-slate-800 text-white text-xs font-black rounded-full flex items-center justify-center shadow-lg border-2 border-white">#{idx + 1}</div>
                          {newTrip.destinations.length > 1 && (
                            <button 
                              type="button" 
                              onClick={() => handleRemoveDestination(dest.id)}
                              className="absolute -right-2 -top-2 bg-red-100 text-red-600 p-1.5 rounded-full border border-red-200 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-200"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}

                          {idx > 0 && (
                            <div className="mb-4 pb-4 border-b border-gray-100 bg-blue-50/50 p-3 rounded-lg">
                                <h5 className="text-[10px] font-bold text-blue-600 uppercase mb-3 flex items-center"><Share2 className="h-3 w-3 mr-1"/> Detalles de Logística - Destino #{idx + 1}</h5>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">Número de Viaje</label>
                                        <div className="relative"><Hash className="absolute left-2 top-2 h-4 w-4 text-gray-400"/><input type="text" className={`${inputStyle} py-2 pl-8 text-xs`} placeholder="Ej. REM-9988" value={dest.tripNumber || ''} onChange={e => updateDestination(dest.id, 'tripNumber', e.target.value)} /></div>
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">Cliente</label>
                                        <div className="relative"><Building2 className="absolute left-2 top-2 h-4 w-4 text-gray-400"/><input type="text" className={`${inputStyle} py-2 pl-8 text-xs`} placeholder="Ej. DHL" value={(dest as any).client || ''} onChange={e => updateDestination(dest.id, 'client', e.target.value)} /></div>
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">Lugar de Carga (Origen)</label>
                                        <div className="relative"><MapPin className="absolute left-2 top-2 h-4 w-4 text-gray-400"/><input type="text" className={`${inputStyle} py-2 pl-8 text-xs`} placeholder="Ej. Almacén Central" value={(dest as any).origin || ''} onChange={e => updateDestination(dest.id, 'origin', e.target.value)} /></div>
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">Fecha Carga</label>
                                        <input type="date" className={`${inputStyle} py-2 text-xs`} value={(dest as any).date || ''} onChange={e => updateDestination(dest.id, 'date', e.target.value)} />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">Hora Cita</label>
                                        <input type="time" className={`${inputStyle} py-2 text-xs`} value={(dest as any).appointment || ''} onChange={e => updateDestination(dest.id, 'appointment', e.target.value)} />
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">Indicaciones Específicas</label>
                                        <div className="flex gap-2">
                                          <div className="relative flex-grow">
                                            <MessageSquare className="absolute left-2 top-2 h-4 w-4 text-gray-400"/>
                                            <input type="text" className={`${inputStyle} py-2 pl-8 text-xs`} placeholder="Ej. Contactar a seguridad en puerta 2" value={dest.instructions || ''} onChange={e => updateDestination(dest.id, 'instructions', e.target.value)} />
                                          </div>
                                          <label className="shrink-0 bg-white border border-blue-200 p-2 rounded-lg cursor-pointer hover:bg-blue-50 transition-colors flex items-center justify-center shadow-sm">
                                            <Paperclip className={`h-4 w-4 ${dest.instructions_pdf_url ? 'text-green-600' : 'text-slate-400'}`} />
                                            <input type="file" accept="application/pdf" className="hidden" onChange={(e) => handlePdfUpload(e, dest.id)} />
                                          </label>
                                        </div>
                                        {uploadingPdfId === dest.id && <p className="text-[10px] text-blue-600 font-bold mt-1 animate-pulse">Subiendo PDF...</p>}
                                        {dest.instructions_pdf_url && <p className="text-[10px] text-green-600 font-bold mt-1 flex items-center"><Check className="h-3 w-3 mr-1" /> PDF de parada adjuntado</p>}
                                    </div>
                                </div>
                            </div>
                          )}
                          
                          <div className="space-y-3 ml-2">
                              <div>
                                  <label className="text-[10px] font-black text-slate-400 uppercase mb-1 block">PARADA #{idx+1}: DESTINO (NOMBRE)</label>
                                  <input required type="text" className={inputStyle} placeholder="Ej. Planta Ford Izcalli" value={dest.name} onChange={e => updateDestination(dest.id, 'name', e.target.value)} />
                              </div>
                              <div>
                                  <label className="text-[10px] font-black text-slate-400 uppercase mb-1 block">DIRECCIÓN DESTINO</label>
                                  <input type="text" className={inputStyle} placeholder="Calle, Número, Colonia..." value={dest.destinationAddress || ''} onChange={e => updateDestination(dest.id, 'destinationAddress', e.target.value)} />
                              </div>
                              <div>
                                  <label className="text-[10px] font-black text-slate-400 uppercase mb-1 block">DESTINO (LINK MAPS)</label>
                                  <div className="relative">
                                      <Link className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                                      <input type="url" className={`${inputStyle} pl-9`} placeholder="https://maps.app.goo.gl/..." value={dest.mapsLink} onChange={e => updateDestination(dest.id, 'mapsLink', e.target.value)} />
                                  </div>
                              </div>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                  <div>
                                      <label className="text-[10px] font-black text-slate-400 uppercase mb-1 block">FECHA</label>
                                      <input type="date" className={inputStyle} value={dest.date || ''} onChange={e => updateDestination(dest.id, 'date', e.target.value)} />
                                  </div>
                                  <div>
                                      <label className="text-[10px] font-black text-slate-400 uppercase mb-1 block">HORA DE LA CITA</label>
                                      <input type="time" className={inputStyle} value={dest.appointment || ''} onChange={e => updateDestination(dest.id, 'appointment', e.target.value)} />
                                  </div>
                              </div>
                          </div>

                          {idx === 0 && (
                            <div className="mt-4 pt-4 border-t border-gray-100">
                                <label className={labelStyle}>Indicaciones Generales (Viaje Principal)</label>
                                <div className="flex gap-2">
                                    <input className={inputStyle} placeholder="Puerta 4, EPP obligatorio..." value={newTrip.instructions} onChange={e => setNewTrip({...newTrip, instructions: e.target.value})} />
                                    <label className="shrink-0 bg-slate-100 border border-gray-300 p-3 rounded-lg cursor-pointer hover:bg-slate-200 transition-colors flex items-center justify-center">
                                    <Paperclip className={`h-5 w-5 ${newTrip.indicaciones_pdf_url ? 'text-green-600' : 'text-gray-500'}`} />
                                    <input type="file" accept="application/pdf" className="hidden" onChange={(e) => handlePdfUpload(e, 'GENERAL')} />
                                    </label>
                                </div>
                                {uploadingPdfId === 'GENERAL' && <p className="text-[10px] text-blue-600 font-bold mt-1 animate-pulse">Subiendo PDF...</p>}
                                {newTrip.indicaciones_pdf_url && <p className="text-[10px] text-green-600 font-bold mt-1 flex items-center"><Check className="h-3 w-3 mr-1" /> PDF Adjuntado Correctamente</p>}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    <button
                        type="button"
                        onClick={handleAddDestination}
                        className="w-full mt-4 py-3 rounded-xl border-2 border-dashed border-blue-200 text-blue-600 font-bold hover:bg-blue-50 hover:border-blue-400 transition-all flex items-center justify-center"
                    >
                        <Plus className="h-5 w-5 mr-2" /> AGREGAR DESTINO
                    </button>

                  </div>

                  <div className="space-y-4 pt-4 border-t border-gray-100">
                    <div className="bg-slate-50 -mx-6 px-6 py-3 border-y border-gray-100">
                      <h4 className="text-sm font-black text-slate-800 uppercase tracking-wider flex items-center">
                        <DollarSign className="h-4 w-4 mr-2 text-green-600" /> GASTOS
                      </h4>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="text-[10px] font-black text-slate-400 uppercase mb-1 block">GASTOS DEPOSITADOS</label>
                            <div className="relative">
                                <span className="absolute left-3 top-3 text-gray-500 font-bold">$</span>
                                <input type="number" className={`${inputStyle} pl-8`} placeholder="0.00" value={newTrip.gastosDepositados} onChange={e => setNewTrip({...newTrip, gastosDepositados: e.target.value})} />
                            </div>
                        </div>
                        <div>
                            <label className="text-[10px] font-black text-slate-400 uppercase mb-1 block">KM ESTIMADOS</label>
                            <div className="relative">
                                <input type="number" className={`${inputStyle} pr-12`} placeholder="0" value={newTrip.kmEstimados} onChange={e => setNewTrip({...newTrip, kmEstimados: e.target.value})} />
                                <span className="absolute right-3 top-3 text-gray-500 text-xs font-bold">kms</span>
                            </div>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                        <div>
                            <label className="text-[10px] font-black text-slate-400 uppercase mb-1 block">COMBUSTIBLE ASIGNADO</label>
                            <div className="relative">
                                <input type="number" className={`${inputStyle} pr-12`} placeholder="0" value={newTrip.combustibleAsignado} onChange={e => setNewTrip({...newTrip, combustibleAsignado: e.target.value})} />
                                <span className="absolute right-3 top-3 text-gray-500 text-xs font-bold">litros</span>
                            </div>
                        </div>
                        <div>
                            <label className="text-[10px] font-black text-slate-400 uppercase mb-1 block">PRECIO POR LITRO</label>
                            <div className="relative">
                                <span className="absolute left-3 top-3 text-gray-500 font-bold">$</span>
                                <input type="number" className={`${inputStyle} pl-8`} placeholder="0.00" value={newTrip.precioPorLitro} onChange={e => setNewTrip({...newTrip, precioPorLitro: e.target.value})} />
                            </div>
                        </div>
                        <div>
                            <label className="text-[10px] font-black text-slate-400 uppercase mb-1 block">COSTO TOTAL</label>
                            <div className="relative">
                                <span className="absolute left-3 top-3 text-gray-500 font-bold">$</span>
                                <input type="number" disabled className={`${inputStyle} pl-8 bg-slate-100 cursor-not-allowed`} placeholder="0.00" value={(parseFloat(newTrip.combustibleAsignado || '0') * parseFloat(newTrip.precioPorLitro || '0')).toFixed(2)} />
                            </div>
                        </div>
                    </div>
                  </div>

                  <div className="pt-5 border-t border-gray-100 grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                        <label className={labelStyle}>Asignación de Operador</label>
                        <select required className={inputStyle} value={newTrip.operator_id} onChange={e => {
                            setNewTrip({ ...newTrip, operator_id: e.target.value });
                        }}>
                            <option value="">Seleccionar Operador</option>
                            {operatorsList.filter(op => op.role !== 'ADMIN').map(op => (
                                <option key={op.id} value={op.id}>
                                    {op.name} {op.unit_number || op.plate ? `(Unidad: ${op.unit_number || op.plate})` : ''}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className={labelStyle}>Asignación de Unidad</label>
                        <select required className={inputStyle} value={newTrip.plate} onChange={e => handleUnitSelection(e.target.value)}>
                            <option value="">Seleccionar Unidad</option>
                            {unitsList.map(u => (
                                <option key={u.id} value={u.plate}>
                                    ECO: {u.eco} | Placas: {u.plate}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className={labelStyle}>Odómetro Anterior (Último Viaje)</label>
                        <input
                            type="text"
                            disabled
                            className={`${inputStyle} bg-slate-100 cursor-not-allowed text-slate-500 font-bold`}
                            placeholder="Se llenará al elegir unidad"
                            value={newTrip.odometerAnterior ? `${newTrip.odometerAnterior} KM` : ''}
                        />
                    </div>
                  </div>
                  <div className="flex gap-3 mt-2">
                    {editingTripId && (
                        <button type="button" onClick={handleCancelEditTrip} className="flex-1 bg-slate-100 text-slate-500 font-bold py-4 rounded-xl hover:bg-slate-200 transition-all">CANCELAR</button>
                    )}
                    <button type="submit" disabled={isSubmitting} className={`flex-1 text-white font-bold py-4 rounded-xl shadow-lg flex justify-center items-center transition-transform active:scale-[0.99] ${isSubmitting ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800'}`}>
                      {isSubmitting ? <Loader className="h-5 w-5 animate-spin mr-2" /> : <Save className="h-5 w-5 mr-2" />}
                      {isSubmitting ? 'PROCESANDO...' : editingTripId ? 'ACTUALIZAR VIAJE' : 'CREAR ORDEN Y NOTIFICAR'}
                    </button>
                  </div>
              </form>
          </div>
      )}

      {activeTab === 'HISTORY' && (
          <div className="space-y-6">
              <div className="bg-emerald-700 rounded-xl p-6 text-white shadow-lg flex flex-col md:flex-row justify-between items-start md:items-center gap-4 animate-in slide-in-from-top-4">
                  <div className="flex items-center space-x-3">
                    <div className="bg-emerald-600 p-3 rounded-full shadow-inner"><Archive className="h-8 w-8" /></div>
                    <div>
                      <h3 className="text-2xl font-black mb-1">Historial de Viajes</h3>
                      <p className="text-emerald-100 font-medium text-xs sm:text-sm">Consulta, auditoría y descarga consolidada de bitácoras archivadas por fecha o período.</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                      <button
                          type="button"
                          onClick={() => exportHistoryExcel(filteredHistoryTrips, operatorsList, activeDateRange.label)}
                          className="flex items-center gap-1.5 px-4 py-2 bg-white text-emerald-800 hover:bg-emerald-50 text-xs sm:text-sm font-black rounded-xl shadow transition active:scale-95"
                          title="Descargar Historial filtrado en Excel"
                      >
                          <FileSpreadsheet className="h-4 w-4 text-emerald-700" />
                          <span>Descargar Excel</span>
                      </button>
                      <button
                          type="button"
                          onClick={() => exportHistoryPDF(filteredHistoryTrips, operatorsList, activeDateRange.label)}
                          className="flex items-center gap-1.5 px-4 py-2 bg-emerald-950/80 hover:bg-emerald-950 text-white text-xs sm:text-sm font-black rounded-xl shadow transition border border-emerald-500/30 active:scale-95"
                          title="Descargar Historial filtrado en PDF"
                      >
                          <FileText className="h-4 w-4 text-emerald-300" />
                          <span>Descargar PDF</span>
                      </button>
                  </div>
              </div>

              {/* Selector de Rango de Fechas */}
              {renderDateFilterToolbar(`Filtro: ${activeDateRange.label} (${filteredHistoryTrips.length} de ${trips.length} viajes)`)}

              <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-4 text-left text-xs font-black text-gray-500 uppercase tracking-wider">Fecha / Folio</th>
                            <th className="px-6 py-4 text-left text-xs font-black text-gray-500 uppercase tracking-wider">Cliente</th>
                            <th className="px-6 py-4 text-left text-xs font-black text-gray-500 uppercase tracking-wider">Ruta</th>
                            <th className="px-6 py-4 text-left text-xs font-black text-gray-500 uppercase tracking-wider">Unidad</th>
                            <th className="px-6 py-4 text-right text-xs font-black text-gray-500 uppercase tracking-wider">Descargas</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {filteredHistoryTrips.length === 0 ? (
                             <tr><td colSpan={5} className="px-6 py-10 text-center text-gray-400 font-bold">No hay registros en el historial para la fecha o período seleccionado</td></tr>
                        ) : (
                            [...filteredHistoryTrips].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(trip => (
                                <tr key={trip.id} className="hover:bg-slate-50">
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="text-sm font-bold text-gray-900">{trip.date}</div>
                                        <div className="text-xs text-gray-500 font-medium">{trip.code}</div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="text-sm font-bold text-gray-900">{trip.client}</div>
                                        <div className="text-xs text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded-full inline-block mt-1">{trip.project}</div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="text-xs font-medium text-gray-500 flex items-center"><MapPin className="h-3 w-3 mr-1 text-red-400"/> {trip.origin}</div>
                                        <div className="h-4 border-l border-dashed border-gray-300 ml-1.5 my-0.5"></div>
                                        <div className="text-xs font-medium text-gray-900 flex items-center"><MapPin className="h-3 w-3 mr-1 text-blue-600"/> {trip.destination}</div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="flex items-center">
                                            <div className="h-8 w-8 bg-slate-100 rounded-full flex items-center justify-center mr-3">
                                                <Truck className="h-4 w-4 text-slate-600" />
                                            </div>
                                            <div>
                                                <div className="text-sm font-bold text-slate-700">{unitsList.find(u => u.plate === trip.plate)?.eco || trip.plate}</div>
                                                <div className="text-xs text-blue-600 font-bold">{operatorsList.find(op => op.plate === trip.plate)?.name || 'Sin Asignar'}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right">
                                        <div className="flex items-center justify-end space-x-2">
                                            <button 
                                                onClick={(e) => { e.stopPropagation(); handleEditTrip(trip); }}
                                                className="p-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors"
                                                title="Editar Viaje"
                                            >
                                                <Pencil className="h-4 w-4" />
                                            </button>
                                            <button 
                                                onClick={(e) => handleDeleteClick(e, trip.id)}
                                                className="p-2 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg transition-colors"
                                                title="Eliminar Viaje de la Base de Datos"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </button>
                                            <button 
                                                onClick={() => generateOrderPDF(trip)}
                                                disabled={isGeneratingPdf}
                                                className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-xs font-bold rounded-lg text-white bg-blue-600 hover:bg-blue-700 focus:outline-none active:scale-95 transition-all"
                                            >
                                                {isGeneratingPdf ? <Loader className="h-4 w-4 animate-spin mr-2" /> : <FileJson className="h-4 w-4 mr-2" />}
                                                Orden de Servicio (PDF)
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
              </div>
          </div>
      )}

      {activeTab === 'MONITOR' && (
          <>
            {/* Barra de Filtro por Fechas */}
            {renderDateFilterToolbar(`Filtro: ${activeDateRange.label} (${filteredTrips.length} de ${trips.length} bitácoras)`)}

            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 mb-6 flex flex-col md:flex-row gap-4 items-center justify-between">
                <div className="relative flex-grow w-full">
                    <Search className="absolute left-3 top-3 h-5 w-5 text-gray-500" />
                    <input 
                        type="text" 
                        placeholder="Buscar por Operario, ECO, Cliente..." 
                        value={filterText} 
                        onChange={(e) => setFilterText(e.target.value)} 
                        className="w-full pl-10 pr-4 py-2 bg-gray-100 text-gray-900 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none placeholder-gray-500 font-medium" 
                    />
                </div>
                <div className="flex items-center gap-2 w-full md:w-auto justify-end">
                    <button 
                        type="button"
                        onClick={() => exportBitacorasExcel(filteredTrips, operatorsList, activeDateRange.label)} 
                        className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-sm transition active:scale-95"
                        title="Descargar Bitácoras filtradas en Excel"
                    >
                        <FileSpreadsheet className="h-4 w-4" />
                        <span>Excel</span>
                    </button>
                    <button 
                        type="button"
                        onClick={() => exportBitacorasPDF(filteredTrips, operatorsList, activeDateRange.label)} 
                        className="flex items-center gap-1.5 px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-lg shadow-sm transition active:scale-95"
                        title="Descargar Bitácoras filtradas en PDF"
                    >
                        <FileText className="h-4 w-4" />
                        <span>PDF</span>
                    </button>
                    <button onClick={() => setAudioEnabled(!audioEnabled)} className={`text-xs font-bold px-3 py-2 rounded-lg border ${audioEnabled ? 'bg-green-100 text-green-700 border-green-200' : 'bg-gray-100 text-gray-500 border-gray-200'}`}>Audio: {audioEnabled ? 'ON' : 'OFF'}</button>
                </div>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50"><tr><th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Unidad</th><th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Estatus</th><th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cliente / Destino</th><th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Evidencia</th><th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th></tr></thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {filteredTrips.map((trip) => {
                        const rowColorClass = trip.status === TripStatus.COMPLETED 
                            ? 'bg-white hover:bg-slate-50' 
                            : trip.status === TripStatus.PENDING_ACCEPTANCE 
                                ? 'bg-yellow-200 hover:bg-yellow-300' 
                                : 'bg-blue-300 hover:bg-blue-400';
                        
                        const unitEco = unitsList.find(u => u.plate === trip.plate)?.eco || trip.plate;

                        return (
                        <tr key={trip.id} className={`${rowColorClass} transition-colors cursor-pointer`} onClick={() => setSelectedTripForMonitor(trip)}>
                          <td className="px-6 py-4 whitespace-nowrap"><div className="flex items-center"><div className="flex-shrink-0 h-10 w-10 bg-white/50 rounded-full flex items-center justify-center"><Truck className="h-6 w-6 text-slate-700" /></div><div className="ml-4"><div className="text-sm font-bold text-gray-900">{unitEco}</div><div className="text-xs text-blue-900 font-bold">{operatorsList.find(op => op.plate === trip.plate)?.name || 'Sin Asignar'}</div><div className="text-xs text-gray-700">{trip.code}</div></div></div></td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full 
                              ${trip.status === TripStatus.COMPLETED ? 'bg-gray-100 text-gray-800' :
                                (trip.hasIncident || trip.status === TripStatus.INCIDENT) ? 'bg-red-100 text-red-800 animate-pulse' : 
                                trip.status === TripStatus.PENDING_ACCEPTANCE ? 'bg-amber-100 text-amber-800' : 
                                trip.status === TripStatus.ACCEPTED ? 'bg-blue-100 text-blue-800' :
                                trip.status === TripStatus.IN_TRANSIT ? 'bg-indigo-100 text-indigo-800' :
                                'bg-green-100 text-green-800'}`}>
                                {trip.status === TripStatus.COMPLETED ? trip.status : (trip.hasIncident || trip.status === TripStatus.INCIDENT ? 'En Curso (Atención)' : trip.status)}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap"><div className="text-sm text-gray-900 font-medium">{trip.client}</div><div className="text-xs text-gray-500 max-w-[150px] truncate">{trip.destination}</div></td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {trip.evidenceStatus === 'PENDING' ? (
                                <button 
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedTripForMonitor(trip);
                                    }}
                                    className="flex items-center text-xs font-bold text-yellow-600 bg-yellow-50 px-2 py-1 rounded-full animate-pulse border border-yellow-200 hover:bg-yellow-100 hover:shadow-sm transition-all"
                                >
                                    <Camera className="h-3 w-3 mr-1" /> REVISIÓN
                                </button>
                            ) : trip.evidenceStatus === 'REJECTED' ? (
                                <span className="flex items-center text-xs font-bold text-red-600 bg-red-50 px-2 py-1 rounded-full border border-red-200"><X className="h-3 w-3 mr-1" /> RECHAZADO</span>
                            ) : (<span className="text-xs text-gray-400">---</span>)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                            <div className="flex items-center justify-end space-x-3">
                              <button 
                                onClick={(e) => { e.stopPropagation(); handleEditTrip(trip); }}
                                className="text-blue-500 hover:text-blue-700 hover:bg-blue-50 p-2 rounded-lg transition-colors"
                                title="Editar Viaje"
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                              <button 
                                onClick={(e) => handleDeleteClick(e, trip.id)}
                                className="text-red-500 hover:text-red-700 hover:bg-red-50 p-2 rounded-lg transition-colors"
                                title="Eliminar Viaje"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                              <button onClick={(e) => { e.stopPropagation(); setSelectedTripForMonitor(trip); }} className="text-blue-600 hover:text-blue-900 flex items-center"><Eye className="h-4 w-4 mr-1" /> Monitor</button>
                            </div>
                          </td>
                        </tr>
                      );
                      })}
                    </tbody>
                </table>
            </div>
          </>
      )}

      {activeTab === 'DATABASE' && (
          <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
              {/* Tarjeta Principal de Supabase */}
              <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden">
                  <div className="bg-gradient-to-r from-cyan-800 via-teal-800 to-slate-900 p-6 text-white flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                      <div>
                          <div className="flex items-center space-x-3 mb-2">
                              <div className="p-2.5 bg-white/10 rounded-xl backdrop-blur-sm border border-white/20">
                                  <Database className="h-7 w-7 text-cyan-300" />
                              </div>
                              <div>
                                  <h2 className="text-2xl font-black tracking-tight">Base de Datos</h2>
                                  <p className="text-cyan-100 text-sm">Panel de administración de Supabase (Acceso exclusivo Administrador)</p>
                              </div>
                          </div>
                      </div>
                      <a 
                          href="https://supabase.com" 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="flex items-center space-x-2 px-5 py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl shadow-lg hover:shadow-emerald-500/25 transition-all transform hover:-translate-y-0.5 active:translate-y-0 whitespace-nowrap"
                      >
                          <span>Entrar a Supabase</span>
                          <ExternalLink className="h-4 w-4" />
                      </a>
                  </div>
                  <div className="p-6 sm:p-8 space-y-6">
                      <div className="bg-cyan-50 border border-cyan-200 rounded-xl p-4 flex items-start space-x-3">
                          <CheckCircle2 className="h-5 w-5 text-cyan-700 shrink-0 mt-0.5" />
                          <div className="text-sm text-cyan-950 leading-relaxed">
                              <p className="font-bold mb-1">Acceso Directo al Dashboard de Supabase</p>
                              <p>Utiliza estas credenciales oficiales para iniciar sesión en Supabase y gestionar la base de datos de TLS (viajes, operadores, unidades, notificaciones y almacenamiento de evidencias).</p>
                          </div>
                      </div>

                      {/* Credenciales */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                          {/* Correo / Usuario */}
                          <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 hover:border-slate-300 transition-colors">
                              <div className="flex items-center justify-between mb-2">
                                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                                      <User className="h-4 w-4 text-slate-400" /> Usuario / Correo
                                  </label>
                                  {copiedDbText === 'user' && (
                                      <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 animate-in fade-in">
                                          ¡Copiado!
                                      </span>
                                  )}
                              </div>
                              <div className="flex items-center gap-2">
                                  <input 
                                      type="text" 
                                      readOnly 
                                      value="tbs@appdesignmex.com" 
                                      className="w-full font-mono text-sm font-semibold bg-white border border-slate-300 rounded-lg px-3 py-2.5 text-slate-900 select-all outline-none" 
                                  />
                                  <button 
                                      type="button"
                                      onClick={() => handleCopyDb('tbs@appdesignmex.com', 'user')}
                                      className="p-2.5 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg text-slate-700 hover:text-slate-950 transition-colors shrink-0 shadow-sm"
                                      title="Copiar correo"
                                  >
                                      <Copy className="h-4 w-4" />
                                  </button>
                              </div>
                          </div>

                          {/* Clave / Contraseña */}
                          <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 hover:border-slate-300 transition-colors">
                              <div className="flex items-center justify-between mb-2">
                                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                                      <Lock className="h-4 w-4 text-slate-400" /> Clave / Contraseña
                                  </label>
                                  {copiedDbText === 'pass' && (
                                      <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 animate-in fade-in">
                                          ¡Copiado!
                                      </span>
                                  )}
                              </div>
                              <div className="flex items-center gap-2">
                                  <div className="relative w-full">
                                      <input 
                                          type={showDbPassword ? "text" : "password"} 
                                          readOnly 
                                          value="Chevropar#1970" 
                                          className="w-full font-mono text-sm font-semibold bg-white border border-slate-300 rounded-lg px-3 py-2.5 text-slate-900 select-all outline-none pr-10" 
                                      />
                                      <button 
                                          type="button"
                                          onClick={() => setShowDbPassword(!showDbPassword)}
                                          className="absolute right-2 top-2.5 text-slate-400 hover:text-slate-600 p-1 rounded"
                                          title={showDbPassword ? "Ocultar clave" : "Mostrar clave"}
                                      >
                                          {showDbPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                      </button>
                                  </div>
                                  <button 
                                      type="button"
                                      onClick={() => handleCopyDb('Chevropar#1970', 'pass')}
                                      className="p-2.5 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg text-slate-700 hover:text-slate-950 transition-colors shrink-0 shadow-sm"
                                      title="Copiar clave"
                                  >
                                      <Copy className="h-4 w-4" />
                                  </button>
                              </div>
                          </div>
                      </div>

                      {/* Enlace oficial de Supabase */}
                      <div className="bg-slate-900 rounded-xl p-6 text-white flex flex-col md:flex-row items-center justify-between gap-4">
                          <div className="space-y-1 text-center md:text-left">
                              <p className="font-bold text-base flex items-center justify-center md:justify-start gap-2">
                                  <Link className="h-4 w-4 text-emerald-400" /> Link de Supabase
                              </p>
                              <a 
                                  href="https://supabase.com" 
                                  target="_blank" 
                                  rel="noopener noreferrer" 
                                  className="text-emerald-400 hover:text-emerald-300 font-mono text-sm underline inline-flex items-center gap-1"
                              >
                                  https://supabase.com <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                          </div>
                          <div className="flex gap-2 w-full md:w-auto justify-center">
                              <button 
                                  type="button"
                                  onClick={() => handleCopyDb('https://supabase.com', 'url')}
                                  className="px-4 py-2.5 bg-white/10 hover:bg-white/20 border border-white/20 rounded-xl text-sm font-bold transition flex items-center gap-2"
                              >
                                  <Copy className="h-4 w-4" />
                                  <span>{copiedDbText === 'url' ? '¡Link Copiado!' : 'Copiar Link'}</span>
                              </button>
                              <a 
                                  href="https://supabase.com" 
                                  target="_blank" 
                                  rel="noopener noreferrer" 
                                  className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-xl text-sm font-black transition flex items-center gap-2 shadow-lg"
                              >
                                  <span>Ir al Dashboard</span>
                                  <ExternalLink className="h-4 w-4" />
                              </a>
                          </div>
                      </div>

                      {/* Instrucciones sencillas para actualizar a plan de pago */}
                      <div className="bg-gradient-to-br from-amber-50 via-orange-50 to-amber-100/60 border-2 border-amber-300/80 rounded-2xl p-6 sm:p-7 shadow-sm">
                          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-5 border-b border-amber-200">
                              <div className="flex items-center gap-3">
                                  <div className="p-3 bg-amber-500 text-white rounded-xl shadow-md">
                                      <CreditCard className="h-6 w-6" />
                                  </div>
                                  <div>
                                      <h3 className="text-lg font-black text-slate-900 tracking-tight">
                                          ¿Cómo pagar y activar el Plan Básico de Supabase?
                                      </h3>
                                      <p className="text-xs sm:text-sm text-slate-600">
                                          Guía de 4 pasos rápidos para cambiar de plan gratuito a <span className="font-bold text-amber-900">Plan Pro ($25 USD/mes)</span> y desbloquear el servicio al instante.
                                      </p>
                                  </div>
                              </div>
                              <a
                                  href="https://supabase.com/dashboard/project/vkzzfccktctoljvkmwsz/settings/billing"
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white text-xs sm:text-sm font-bold rounded-xl shadow transition shrink-0"
                              >
                                  <span>Ir Directo a Facturación</span>
                                  <ExternalLink className="h-4 w-4" />
                              </a>
                          </div>

                          {/* Pasos Numerados */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-5">
                              {/* Paso 1 */}
                              <div className="bg-white rounded-xl p-4 border border-amber-200 shadow-sm flex items-start gap-3">
                                  <div className="h-8 w-8 rounded-full bg-amber-600 text-white font-black text-sm flex items-center justify-center shrink-0 shadow">
                                      1
                                  </div>
                                  <div className="text-xs sm:text-sm text-slate-700 space-y-1">
                                      <p className="font-bold text-slate-900">Inicia Sesión en Supabase</p>
                                      <p className="text-slate-600">
                                          Haz clic en el botón verde superior <strong>"Ir al Dashboard"</strong> o ingresa a <a href="https://supabase.com" target="_blank" rel="noopener noreferrer" className="text-emerald-700 font-semibold underline">supabase.com</a> con el usuario y clave indicados arriba.
                                      </p>
                                  </div>
                              </div>

                              {/* Paso 2 */}
                              <div className="bg-white rounded-xl p-4 border border-amber-200 shadow-sm flex items-start gap-3">
                                  <div className="h-8 w-8 rounded-full bg-amber-600 text-white font-black text-sm flex items-center justify-center shrink-0 shadow">
                                      2
                                  </div>
                                  <div className="text-xs sm:text-sm text-slate-700 space-y-1">
                                      <p className="font-bold text-slate-900">Entra a Facturación (Billing)</p>
                                      <p className="text-slate-600">
                                          Selecciona el proyecto <strong>vkzzfccktctoljvkmwsz</strong>, haz clic en el engranaje <strong>Project Settings (⚙️)</strong> abajo a la izquierda y elige <strong>Billing</strong>.
                                      </p>
                                  </div>
                              </div>

                              {/* Paso 3 */}
                              <div className="bg-white rounded-xl p-4 border border-amber-200 shadow-sm flex items-start gap-3">
                                  <div className="h-8 w-8 rounded-full bg-amber-600 text-white font-black text-sm flex items-center justify-center shrink-0 shadow">
                                      3
                                  </div>
                                  <div className="text-xs sm:text-sm text-slate-700 space-y-1">
                                      <p className="font-bold text-slate-900">Selecciona el Plan Básico (Pro)</p>
                                      <p className="text-slate-600">
                                          En el bloque de suscripción (Subscription Plan), pulsa en <strong>"Upgrade to Pro"</strong> ($25 USD al mes). Es el plan de pago más básico y recomendado.
                                      </p>
                                  </div>
                              </div>

                              {/* Paso 4 */}
                              <div className="bg-white rounded-xl p-4 border border-amber-200 shadow-sm flex items-start gap-3">
                                  <div className="h-8 w-8 rounded-full bg-emerald-600 text-white font-black text-sm flex items-center justify-center shrink-0 shadow">
                                      4
                                  </div>
                                  <div className="text-xs sm:text-sm text-slate-700 space-y-1">
                                      <p className="font-bold text-slate-900">Paga con Tarjeta y ¡Listo!</p>
                                      <p className="text-slate-600">
                                          Coloca los datos de tu tarjeta bancaria y presiona <strong>"Confirm / Upgrade"</strong>. La cuota bloqueada se elimina y el servicio se reanuda de inmediato.
                                      </p>
                                  </div>
                              </div>
                          </div>

                          {/* Notas importantes */}
                          <div className="mt-5 p-3.5 bg-amber-100/70 border border-amber-300 rounded-xl text-xs text-amber-950 flex items-start gap-2.5">
                              <AlertCircle className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
                              <div>
                                  <p className="font-bold">Nota técnica para el Administrador:</p>
                                  <p>
                                      <strong>No es necesario ejecutar ningún código SQL</strong> para el cambio de plan: Supabase gestiona la actualización y facturación directamente. Todos los viajes, operadores, unidades y fotos se mantienen 100% seguros e intactos.
                                  </p>
                              </div>
                          </div>
                      </div>

                      {/* Información de ayuda para el administrador */}
                      <div className="border border-slate-200 rounded-xl p-5 bg-slate-50">
                          <h4 className="font-bold text-slate-800 text-sm mb-3 flex items-center gap-2">
                              <Building2 className="h-4 w-4 text-slate-600" /> Otras acciones disponibles en Supabase:
                          </h4>
                          <ul className="text-xs text-slate-600 space-y-2 list-disc list-inside">
                              <li><span className="font-semibold text-slate-800">Table Editor:</span> Consulta y edición manual de viajes, unidades y usuarios.</li>
                              <li><span className="font-semibold text-slate-800">Billing / Settings:</span> Verificar el estado del consumo de cuotas de transferencia (egress) o facturas descargables.</li>
                              <li><span className="font-semibold text-slate-800">SQL Editor:</span> Ejecutar sentencias SQL, consultas avanzadas y respaldos periódicos si es necesario.</li>
                          </ul>
                      </div>
                  </div>
              </div>
          </div>
      )}

      {/* MÓDULO DE GASTOS Y CENTRO DE COSTOS (NUEVO) */}
      {activeTab === 'EXPENSES' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
              {/* Banner de Cabecera con Métricas y Descargas */}
              <div className="bg-gradient-to-r from-amber-600 via-amber-700 to-slate-900 rounded-2xl p-6 text-white shadow-lg flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <div>
                      <div className="flex items-center space-x-3 mb-2">
                          <div className="p-2.5 bg-white/10 rounded-xl backdrop-blur-sm border border-white/20">
                              <Wallet className="h-7 w-7 text-amber-300" />
                          </div>
                          <div>
                              <h2 className="text-2xl font-black tracking-tight">Centro de Costos y Gastos</h2>
                              <p className="text-amber-100 text-sm">Auditoría, edición y descarga de gastos reportados por operadores</p>
                          </div>
                      </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2.5">
                      <button
                          type="button"
                          onClick={() => exportExpensesExcel(filteredFlatExpenses, activeDateRange.label)}
                          className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl shadow-lg transition text-xs sm:text-sm active:scale-95"
                          title="Descargar gastos filtrados en archivo Excel"
                      >
                          <FileSpreadsheet className="h-4 w-4" />
                          <span>Descargar Excel</span>
                      </button>
                      <button
                          type="button"
                          onClick={() => exportExpensesPDF(filteredFlatExpenses, activeDateRange.label)}
                          className="flex items-center gap-2 px-4 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl shadow-lg transition text-xs sm:text-sm active:scale-95"
                          title="Descargar reporte formal de gastos filtrado en PDF"
                      >
                          <FileText className="h-4 w-4" />
                          <span>Descargar PDF</span>
                      </button>
                  </div>
              </div>

              {/* Selector de Rango de Fechas para Gastos */}
              {renderDateFilterToolbar(`Filtro: ${activeDateRange.label} (${filteredFlatExpenses.length} de ${allFlatExpenses.length} conceptos)`)}

              {/* Tarjetas de Resumen Financiero Filtradas */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                      <p className="text-xs font-bold text-slate-500 uppercase">Total Acumulado</p>
                      <p className="text-xl sm:text-2xl font-black text-slate-900 mt-1">
                          ${filteredFlatExpenses.reduce((s, e) => s + e.amount, 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                      <p className="text-[11px] text-slate-400 mt-1">{filteredFlatExpenses.length} conceptos en el período</p>
                  </div>
                  <div className="bg-white p-4 rounded-xl border border-indigo-100 shadow-sm">
                      <p className="text-xs font-bold text-indigo-600 uppercase">Operativo (Casetas/Maniobras)</p>
                      <p className="text-xl sm:text-2xl font-black text-indigo-900 mt-1">
                          ${filteredFlatExpenses.filter(e => e.category === 'OPERATIVO').reduce((s, e) => s + e.amount, 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                      <span className="text-[10px] font-bold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded mt-1 inline-block">Operativo</span>
                  </div>
                  <div className="bg-white p-4 rounded-xl border border-emerald-100 shadow-sm">
                      <p className="text-xs font-bold text-emerald-600 uppercase">Gastos de Viaje (Viáticos)</p>
                      <p className="text-xl sm:text-2xl font-black text-emerald-900 mt-1">
                          ${filteredFlatExpenses.filter(e => e.category === 'GASTOS').reduce((s, e) => s + e.amount, 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                      <span className="text-[10px] font-bold bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded mt-1 inline-block">Viáticos / Comidas</span>
                  </div>
                  <div className="bg-white p-4 rounded-xl border border-orange-100 shadow-sm">
                      <p className="text-xs font-bold text-orange-600 uppercase">Mantenimiento / Taller</p>
                      <p className="text-xl sm:text-2xl font-black text-orange-900 mt-1">
                          ${filteredFlatExpenses.filter(e => e.category === 'MANTENIMIENTO').reduce((s, e) => s + e.amount, 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                      <span className="text-[10px] font-bold bg-orange-50 text-orange-700 px-2 py-0.5 rounded mt-1 inline-block">Mantenimiento</span>
                  </div>
              </div>

              {/* Filtros y Buscador */}
              <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col sm:flex-row gap-3 items-center justify-between">
                  <div className="relative w-full sm:w-80">
                      <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                      <input
                          type="text"
                          placeholder="Buscar por viaje, operador, concepto..."
                          value={expenseSearch}
                          onChange={(e) => setExpenseSearch(e.target.value)}
                          className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-800 placeholder-slate-400 focus:bg-white focus:ring-2 focus:ring-amber-500 outline-none"
                      />
                  </div>
                  <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
                      {(['ALL', 'OPERATIVO', 'GASTOS', 'MANTENIMIENTO'] as const).map((cat) => (
                          <button
                              key={cat}
                              type="button"
                              onClick={() => setExpenseCategoryFilter(cat)}
                              className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors ${
                                  expenseCategoryFilter === cat
                                      ? 'bg-slate-900 text-white'
                                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                              }`}
                          >
                              {cat === 'ALL' ? 'Todos' : cat === 'GASTOS' ? 'Gastos Viaje' : cat}
                          </button>
                      ))}
                  </div>
              </div>

              {/* Tabla de Gastos con Opciones de Edición y Borrado */}
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                  <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-slate-200">
                          <thead className="bg-slate-50">
                              <tr>
                                  <th className="px-5 py-3.5 text-left text-xs font-black text-slate-500 uppercase tracking-wider">Viaje / Fecha</th>
                                  <th className="px-5 py-3.5 text-left text-xs font-black text-slate-500 uppercase tracking-wider">Operador / Unidad</th>
                                  <th className="px-5 py-3.5 text-left text-xs font-black text-slate-500 uppercase tracking-wider">Categoría</th>
                                  <th className="px-5 py-3.5 text-left text-xs font-black text-slate-500 uppercase tracking-wider">Concepto y Detalle</th>
                                  <th className="px-5 py-3.5 text-right text-xs font-black text-slate-500 uppercase tracking-wider">Monto</th>
                                  <th className="px-5 py-3.5 text-center text-xs font-black text-slate-500 uppercase tracking-wider">Evidencia</th>
                                  <th className="px-5 py-3.5 text-right text-xs font-black text-slate-500 uppercase tracking-wider">Acciones</th>
                              </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-slate-100">
                              {filteredFlatExpenses.length === 0 ? (
                                  <tr>
                                      <td colSpan={7} className="px-6 py-12 text-center text-slate-400 font-medium">
                                          <Wallet className="h-10 w-10 mx-auto text-slate-300 mb-2" />
                                          No se encontraron gastos con los filtros seleccionados
                                      </td>
                                  </tr>
                              ) : (
                                  filteredFlatExpenses.map((expense, idx) => (
                                      <tr key={`${expense.recordId}_${idx}`} className="hover:bg-slate-50/80 transition-colors">
                                          <td className="px-5 py-3.5 whitespace-nowrap">
                                              <span className="font-bold text-slate-900 text-sm">{expense.tripCode}</span>
                                              <p className="text-xs text-slate-500">{expense.dateStr}</p>
                                          </td>
                                          <td className="px-5 py-3.5 whitespace-nowrap">
                                              <p className="text-sm font-bold text-slate-800">{expense.operatorName}</p>
                                              <p className="text-xs text-slate-500 font-mono">Unidad: {expense.plate}</p>
                                          </td>
                                          <td className="px-5 py-3.5 whitespace-nowrap">
                                              <span className={`text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-wider ${
                                                  expense.category === 'OPERATIVO' ? 'bg-indigo-100 text-indigo-700 border border-indigo-200' :
                                                  expense.category === 'GASTOS' ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' :
                                                  'bg-orange-100 text-orange-700 border border-orange-200'
                                              }`}>
                                                  {expense.category}
                                              </span>
                                          </td>
                                          <td className="px-5 py-3.5">
                                              <p className="text-sm font-semibold text-slate-900">{expense.concept}</p>
                                              {(expense.liters || expense.odometer) && (
                                                  <p className="text-xs text-slate-500 mt-0.5">
                                                      {expense.liters && `${expense.liters} L ${expense.pricePerLiter ? `@ $${expense.pricePerLiter}/L` : ''}`}
                                                      {expense.odometer && ` • Odom: ${expense.odometer.toLocaleString()} km`}
                                                  </p>
                                              )}
                                          </td>
                                          <td className="px-5 py-3.5 whitespace-nowrap text-right">
                                              <span className="font-black text-slate-900 text-sm">
                                                  ${Number(expense.amount).toFixed(2)}
                                              </span>
                                          </td>
                                          <td className="px-5 py-3.5 whitespace-nowrap text-center">
                                              {expense.evidenceUrl ? (
                                                  <button
                                                      type="button"
                                                      onClick={() => setSelectedImage(expense.evidenceUrl!)}
                                                      className="relative inline-block group"
                                                      title="Ver foto del ticket"
                                                  >
                                                      <img
                                                          src={expense.evidenceUrl}
                                                          alt="Ticket"
                                                          className="h-10 w-10 object-cover rounded-lg border border-slate-200 group-hover:scale-105 transition shadow-sm mx-auto"
                                                      />
                                                  </button>
                                              ) : (
                                                  <span className="text-xs text-slate-400">Sin foto</span>
                                              )}
                                          </td>
                                          <td className="px-5 py-3.5 whitespace-nowrap text-right">
                                              <div className="flex items-center justify-end gap-1.5">
                                                  <button
                                                      type="button"
                                                      onClick={() => {
                                                          const tr = trips.find(t => t.id === expense.tripId);
                                                          const rec = tr?.extraCosts?.find(r => r.id === expense.recordId);
                                                          if (rec) handleOpenEditExpense(expense.tripId, rec);
                                                      }}
                                                      className="p-2 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg transition"
                                                      title="Editar Gasto"
                                                  >
                                                      <Pencil className="h-4 w-4" />
                                                  </button>
                                                  <button
                                                      type="button"
                                                      onClick={() => handleDeleteExpense(expense.tripId, expense.recordId)}
                                                      className="p-2 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg transition"
                                                      title="Borrar Gasto"
                                                  >
                                                      <Trash2 className="h-4 w-4" />
                                                  </button>
                                              </div>
                                          </td>
                                      </tr>
                                  ))
                              )}
                          </tbody>
                      </table>
                  </div>
              </div>
          </div>
      )}

      {/* MODAL DE EDICIÓN DE GASTO */}
      {editingExpense && (
          <div className="fixed inset-0 z-[2200] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
              <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-xl w-full overflow-hidden animate-in zoom-in-95 duration-200">
                  <div className="bg-slate-900 p-4 text-white flex justify-between items-center">
                      <div className="flex items-center gap-2">
                          <Pencil className="h-5 w-5 text-amber-400" />
                          <h3 className="font-bold text-base">Editar Gasto Registrado ({editingExpense.tripCode})</h3>
                      </div>
                      <button onClick={handleCancelEditExpense} className="hover:bg-white/20 rounded p-1 transition">
                          <X className="h-5 w-5" />
                      </button>
                  </div>

                  <form onSubmit={handleSaveEditedExpense} className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
                      <div>
                          <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Categoría del Gasto</label>
                          <select
                              value={editingExpense.category}
                              onChange={(e) => setEditingExpense({ ...editingExpense, category: e.target.value as any })}
                              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:bg-white focus:ring-2 focus:ring-amber-500"
                          >
                              <option value="OPERATIVO">OPERATIVO (Casetas, Maniobras, Permisos)</option>
                              <option value="GASTOS">GASTOS (Viáticos, Comidas, Hotel)</option>
                              <option value="MANTENIMIENTO">MANTENIMIENTO (Taller, Refacciones, Lavado)</option>
                          </select>
                      </div>

                      <div className="space-y-3">
                          <div className="flex justify-between items-center">
                              <label className="text-xs font-bold text-slate-600 uppercase">Conceptos y Montos</label>
                              <button
                                  type="button"
                                  onClick={handleAddExpenseItemRow}
                                  className="text-xs font-bold text-amber-600 hover:text-amber-800 flex items-center gap-1"
                              >
                                  <Plus className="h-3.5 w-3.5" /> Agregar Concepto
                              </button>
                          </div>

                          {editingExpense.items.map((item, idx) => (
                              <div key={idx} className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2">
                                  <div className="flex items-center gap-2">
                                      <input
                                          type="text"
                                          placeholder="Descripción del concepto (ej. Caseta Palmillas)"
                                          value={item.concept}
                                          onChange={(e) => handleExpenseItemChange(idx, 'concept', e.target.value)}
                                          className="flex-1 bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-amber-500 font-medium"
                                          required
                                      />
                                      <div className="relative w-32 shrink-0">
                                          <DollarSign className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                                          <input
                                              type="number"
                                              step="0.01"
                                              placeholder="0.00"
                                              value={item.amount}
                                              onChange={(e) => handleExpenseItemChange(idx, 'amount', e.target.value)}
                                              className="w-full pl-7 pr-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 font-mono font-bold outline-none focus:ring-2 focus:ring-amber-500"
                                              required
                                          />
                                      </div>
                                      {editingExpense.items.length > 1 && (
                                          <button
                                              type="button"
                                              onClick={() => handleRemoveExpenseItemRow(idx)}
                                              className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition"
                                              title="Eliminar fila"
                                          >
                                              <Trash2 className="h-4 w-4" />
                                          </button>
                                      )}
                                  </div>
                              </div>
                          ))}
                      </div>

                      {/* Total calculado */}
                      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex justify-between items-center">
                          <span className="text-xs font-bold text-amber-900 uppercase">Total Actualizado:</span>
                          <span className="text-lg font-black text-amber-950 font-mono">
                              ${editingExpense.items.reduce((s, it) => s + (Number(it.amount) || 0), 0).toFixed(2)}
                          </span>
                      </div>

                      <div className="flex gap-3 pt-2">
                          <button
                              type="button"
                              onClick={handleCancelEditExpense}
                              className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 rounded-xl transition text-sm"
                          >
                              Cancelar
                          </button>
                          <button
                              type="submit"
                              disabled={isSavingExpenseEdit}
                              className="flex-1 bg-amber-600 hover:bg-amber-700 text-white font-bold py-2.5 rounded-xl shadow transition text-sm flex items-center justify-center gap-2"
                          >
                              {isSavingExpenseEdit ? <Loader className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                              <span>{isSavingExpenseEdit ? 'Guardando...' : 'Guardar Cambios'}</span>
                          </button>
                      </div>
                  </form>
              </div>
          </div>
      )}

      {selectedImage && (
          <div className="fixed inset-0 z-[2100] bg-black/90 flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={() => setSelectedImage(null)}><button className="absolute top-4 right-4 text-white p-2 hover:bg-white/10 rounded-full"><X className="h-8 w-8" /></button><img src={selectedImage} className="max-w-full max-h-full object-contain rounded shadow-2xl" alt="Full screen" onClick={(e) => e.stopPropagation()} /></div>
      )}

      {selectedTripForMonitor && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[2000] flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-lg max-h-[85vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
                <div className="bg-slate-900 text-white px-5 py-4 flex justify-between items-center shrink-0">
                    <div>
                        <div className="flex items-center space-x-2">
                            <h2 className="text-lg font-bold tracking-tight">{selectedTripForMonitor.plate}</h2>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                selectedTripForMonitor.status === TripStatus.COMPLETED ? 'bg-gray-500' :
                                (selectedTripForMonitor.hasIncident || selectedTripForMonitor.status === TripStatus.INCIDENT) ? 'bg-red-500' : 
                                'bg-blue-600'
                            }`}>
                                {selectedTripForMonitor.status === TripStatus.COMPLETED 
                                    ? selectedTripForMonitor.status 
                                    : (selectedTripForMonitor.hasIncident || selectedTripForMonitor.status === TripStatus.INCIDENT ? 'En Curso (Atención)' : selectedTripForMonitor.status)}
                            </span>
                        </div>
                        <p className="text-slate-400 text-xs">{selectedTripForMonitor.client}</p>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                        <button 
                            type="button"
                            onClick={() => handleShareEvidence(selectedTripForMonitor)} 
                            className="p-2 bg-white/10 hover:bg-blue-500 rounded-full transition-colors"
                            title="Compartir Evidencias"
                        >
                            <Share2 className="h-4 w-4" />
                        </button>
                        <button 
                            type="button"
                            onClick={(e) => handleDeleteClick(e, selectedTripForMonitor.id)} 
                            className="p-2 bg-white/10 hover:bg-red-600 text-red-300 hover:text-white rounded-full transition-colors"
                            title="Eliminar Viaje de la Base de Datos"
                        >
                            <Trash2 className="h-4 w-4" />
                        </button>
                        <button 
                            type="button"
                            onClick={() => setSelectedTripForMonitor(null)} 
                            className="p-2 bg-white/10 hover:bg-red-500 rounded-full transition-colors"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                </div>
                
                <div className="bg-slate-800 px-5 py-2 flex justify-between items-center border-t border-slate-700">
                    <div className="flex items-center space-x-2 text-xs text-slate-300">
                        <Gauge className="h-4 w-4 text-emerald-400" />
                        <span>Inicio: <strong className="text-white">{selectedTripForMonitor.odometerStart ? `${selectedTripForMonitor.odometerStart} KM` : '---'}</strong></span>
                    </div>
                    <div className="flex items-center space-x-2 text-xs text-slate-300">
                         <Gauge className="h-4 w-4 text-red-400" />
                        <span>Fin: <strong className="text-white">{selectedTripForMonitor.odometerEnd ? `${selectedTripForMonitor.odometerEnd} KM` : '---'}</strong></span>
                    </div>
                </div>

                {lastLocation && (
                    <div className="bg-blue-50 border-b border-blue-100 px-5 py-3 flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                            <div className="bg-blue-200 p-2 rounded-full">
                                <Share2 className="h-4 w-4 text-blue-800" />
                            </div>
                            <div>
                                <p className="text-[10px] font-bold text-blue-400 uppercase tracking-wider">Última Ubicación Compartida</p>
                                <p className="text-xs font-bold text-slate-700">
                                    {new Date(lastLocation.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} - {lastLocation.label || 'Reporte Manual'}
                                </p>
                            </div>
                        </div>
                        <a 
                            href={`https://www.google.com/maps/search/?api=1&query=${lastLocation.lat},${lastLocation.lng}`} 
                            target="_blank" 
                            rel="noreferrer"
                            className="text-[10px] font-bold text-blue-600 bg-white border border-blue-200 px-3 py-1.5 rounded-lg hover:bg-blue-600 hover:text-white transition-colors"
                        >
                            VER MAPA
                        </a>
                    </div>
                )}
                
                <div className="flex-1 overflow-y-auto bg-slate-50 relative">
                    {selectedTripForMonitor.evidenceStatus === 'PENDING' && (
                        <div className="bg-white border-b border-yellow-200 p-4 sticky top-0 z-10 shadow-sm">
                            <div className="flex items-center mb-2 text-yellow-700 font-bold uppercase text-xs">
                                <AlertCircle className="h-4 w-4 mr-2" /> Validación Requerida
                            </div>
                            <div className="grid grid-cols-2 gap-2 mb-3">
                                {(selectedTripForMonitor.evidence || [])
                                    .filter(e => e.stageIndex === selectedTripForMonitor.currentStageIndex) 
                                    .map(e => (<SafeImage key={e.id} src={e.url} alt="review" className="w-full h-24 rounded-lg border border-slate-200 object-cover" onClick={() => setSelectedImage(e.url)} />))
                                }
                            </div>
                            <div className="flex gap-2">
                                <button onClick={() => setShowRejectionMenu(true)} className="flex-1 bg-white border border-red-200 text-red-600 text-xs font-bold py-2 rounded-lg hover:bg-red-50">RECHAZAR</button>
                                <button onClick={() => handleApproveEvidence(selectedTripForMonitor)} className="flex-1 bg-green-600 text-white text-xs font-bold py-2 rounded-lg hover:bg-green-700 active:scale-95 transition-transform">APROBAR</button>
                            </div>
                             {showRejectionMenu && (
                                <div className="mt-2 bg-slate-50 p-2 rounded border border-slate-200">
                                    <div className="space-y-1">
                                        {REJECTION_REASONS.map(reason => (
                                            <button key={reason} onClick={() => handleRejectEvidence(selectedTripForMonitor, reason)} className="w-full text-left text-xs px-2 py-1.5 bg-white rounded hover:bg-red-50 text-slate-700 hover:text-red-700 border border-transparent hover:border-red-100 block">
                                                {reason}
                                            </button>
                                        ))}
                                    </div>
                                    <button onClick={() => setShowRejectionMenu(false)} className="w-full text-center text-[10px] text-slate-400 mt-2 underline">Cancelar</button>
                                </div>
                            )}
                        </div>
                    )}

                    {/* SECCIÓN DE GASTOS Y COSTOS */}
                    {selectedTripForMonitor.extraCosts && selectedTripForMonitor.extraCosts.length > 0 && (
                        <div className="bg-white m-5 rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                            <div className="bg-slate-100 px-4 py-2 border-b border-slate-200">
                                <h3 className="text-xs font-black text-slate-600 uppercase">Centro de Costos</h3>
                            </div>
                            <div className="divide-y divide-slate-100">
                                {(selectedTripForMonitor.extraCosts || []).map((record, idx) => (
                                    <div key={idx} className="p-3">
                                        <div className="flex justify-between items-center mb-1">
                                            <div className="flex items-center gap-2">
                                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                                                    record.category === 'OPERATIVO' ? 'bg-indigo-100 text-indigo-700' :
                                                    record.category === 'GASTOS' ? 'bg-emerald-100 text-emerald-700' : 'bg-orange-100 text-orange-700'
                                                }`}>
                                                    {record.category}
                                                </span>
                                                <span className="text-xs text-slate-400">{new Date(record.timestamp).toLocaleDateString()}</span>
                                            </div>
                                            <div className="flex items-center gap-1">
                                                <button
                                                    type="button"
                                                    onClick={() => handleOpenEditExpense(selectedTripForMonitor.id, record)}
                                                    className="p-1 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded transition"
                                                    title="Editar este gasto"
                                                >
                                                    <Pencil className="h-3.5 w-3.5" />
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => handleDeleteExpense(selectedTripForMonitor.id, record.id)}
                                                    className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded transition"
                                                    title="Borrar este gasto"
                                                >
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </button>
                                            </div>
                                        </div>
                                        <div className="pl-1 border-l-2 border-slate-200 space-y-1 mt-2">
                                            {record.items.map((item, i) => (
                                                <div key={i} className="flex justify-between text-xs">
                                                    <span className="text-slate-600">
                                                        {item.concept}
                                                        {item.liters && ` (${item.liters}L @ $${item.pricePerLiter})`}
                                                    </span>
                                                    {/* FIX: Force Number conversion to prevent crash on string values */}
                                                    <span className="font-bold text-slate-900">${Number(item.amount).toFixed(2)}</span>
                                                </div>
                                            ))}
                                        </div>
                                        
                                        {/* EVIDENCIA FOTOGRÁFICA DEL GASTO */}
                                        {record.evidence && record.evidence.length > 0 && (
                                            <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                                                {record.evidence.map((ev, evIdx) => (
                                                    <SafeImage key={evIdx} src={ev.url} alt="Evidencia Gasto" className="h-10 w-10 rounded-lg border border-slate-200 flex-shrink-0" onClick={() => setSelectedImage(ev.url)} />
                                                ))}
                                            </div>
                                        )}

                                        <div className="mt-2 text-right border-t border-slate-50 pt-1">
                                            {/* FIX: Force Number conversion for total */}
                                            <span className="text-xs font-black text-slate-800">Total: ${Number(record.total).toFixed(2)}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="p-5">
                        <div className="relative pl-2 space-y-0">
                            <div className="absolute left-[19px] top-2 bottom-2 w-0.5 bg-slate-200 rounded-full -z-10"></div>
                            {TRIP_STAGES.map((stage, index) => {
                                const isCompleted = index < selectedTripForMonitor.currentStageIndex;
                                const isCurrent = index === selectedTripForMonitor.currentStageIndex;

                                return (
                                    <div key={stage.key} className="flex items-center py-2 group">
                                        <div className={`
                                            h-10 w-10 rounded-full flex items-center justify-center border-2 z-10 shrink-0 mr-4 transition-colors duration-300 bg-white
                                            ${isCompleted ? 'border-slate-800 text-slate-800' : 
                                              isCurrent ? 'border-amber-400 text-amber-500 ring-2 ring-amber-100' : 
                                              'border-slate-200 text-slate-300'}
                                        `}>
                                            {isCompleted ? <CheckCircle2 className="h-5 w-5" /> : 
                                             isCurrent ? <div className="h-2.5 w-2.5 bg-amber-500 rounded-full animate-pulse" /> :
                                             <Circle className="h-4 w-4" />}
                                        </div>

                                        <div className={`flex-1 px-4 py-2 rounded-lg border transition-all duration-200 ${
                                            isCurrent ? 'bg-white border-amber-200 shadow-sm translate-x-1' : 'border-transparent'
                                        }`}>
                                            <div className="flex justify-between items-center">
                                                <span className={`text-sm font-bold uppercase tracking-tight ${isCurrent ? 'text-slate-900' : isCompleted ? 'text-slate-500' : 'text-slate-300'}`}>
                                                    {stage.label}
                                                </span>
                                                {isCurrent && <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-100">En curso</span>}
                                            </div>
                                            
                                            {/* Evidencia de esta etapa */}
                                            {selectedTripForMonitor.evidence && selectedTripForMonitor.evidence.filter(ev => ev.stageIndex === index).length > 0 && (
                                                <div className="mt-3 grid grid-cols-3 sm:grid-cols-4 gap-2">
                                                    {selectedTripForMonitor.evidence.filter(ev => ev.stageIndex === index).map((ev, idx) => (
                                                        <div key={ev.id || idx} className="relative group aspect-square shadow-sm rounded-lg overflow-hidden border border-slate-200">
                                                            <SafeImage 
                                                                src={ev.url} 
                                                                alt={`Evidencia ${stage.label} ${idx + 1}`} 
                                                                className="w-full h-full object-cover cursor-pointer hover:scale-110 transition-transform duration-300" 
                                                                onClick={() => setSelectedImage(ev.url)} 
                                                            />
                                                            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent text-white p-1 pt-4">
                                                                <div className="flex justify-between items-center text-[8px] font-bold px-1">
                                                                    <span>{new Date(ev.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};
