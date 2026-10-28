import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Trip, Unit, Operator, ExpenseRecord, TripStatus } from './types';

// Utilidad para formatear fechas en nombres de archivo (AAAAMMDD_HHMM)
const getFormattedTimestamp = (): string => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `${year}${month}${day}_${hours}${minutes}`;
};

// Obtiene el nombre del operador por ID
const getOperatorName = (operatorId: string | undefined, operators: Operator[]): string => {
  if (!operatorId) return 'Sin asignar';
  const op = operators.find(o => o.id === operatorId || o.username === operatorId);
  return op ? op.name : operatorId;
};

// Calcula el total de gastos extras de un viaje
const getTripTotalExpenses = (trip: Trip): number => {
  if (!trip.extraCosts || !Array.isArray(trip.extraCosts)) return 0;
  return trip.extraCosts.reduce((acc, rec) => {
    const recTotal = Number(rec.total) || 
      (rec.items ? rec.items.reduce((s, it) => s + (Number(it.amount) || 0), 0) : 0);
    return acc + recTotal;
  }, 0);
};

// ==========================================
// UTILIDADES PARA FILTRADO POR FECHA
// ==========================================
export type DateFilterMode = 'ALL' | 'TODAY' | 'YESTERDAY' | 'WEEK' | 'MONTH' | 'CUSTOM';

export interface DateRangeResult {
  start: string; // YYYY-MM-DD o ''
  end: string;   // YYYY-MM-DD o ''
  label: string;
}

export const normalizeToYMD = (val: any): string => {
  if (!val) return '';
  if (typeof val === 'number') {
    const d = new Date(val);
    if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
  }
  const s = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    return s.slice(0, 10);
  }
  const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (dmy) {
    const day = dmy[1].padStart(2, '0');
    const month = dmy[2].padStart(2, '0');
    const year = dmy[3];
    return `${year}-${month}-${day}`;
  }
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    return d.toISOString().split('T')[0];
  }
  return '';
};

export const getDateRange = (mode: DateFilterMode, customStart: string = '', customEnd: string = ''): DateRangeResult => {
  const now = new Date();
  const today = now.toISOString().split('T')[0];

  if (mode === 'TODAY') {
    return { start: today, end: today, label: `Hoy (${today})` };
  }
  if (mode === 'YESTERDAY') {
    const y = new Date();
    y.setDate(y.getDate() - 1);
    const yesterday = y.toISOString().split('T')[0];
    return { start: yesterday, end: yesterday, label: `Ayer (${yesterday})` };
  }
  if (mode === 'WEEK') {
    const d = new Date(now);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d.setDate(diff)).toISOString().split('T')[0];
    return { start: monday, end: today, label: `Esta semana (${monday} al ${today})` };
  }
  if (mode === 'MONTH') {
    const start = `${today.slice(0, 7)}-01`;
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const end = `${today.slice(0, 7)}-${String(lastDay).padStart(2, '0')}`;
    return { start, end, label: `Este mes (${start} al ${end})` };
  }
  if (mode === 'CUSTOM' || customStart || customEnd) {
    const start = customStart || '';
    const end = customEnd || '';
    let label = 'Personalizado';
    if (start && end) label = `${start} al ${end}`;
    else if (start) label = `Desde ${start}`;
    else if (end) label = `Hasta ${end}`;
    return { start, end, label };
  }
  return { start: '', end: '', label: 'Todos los registros' };
};

export const filterByDateRange = (dateVal: any, range: DateRangeResult): boolean => {
  if (!range.start && !range.end) return true;
  const ymd = normalizeToYMD(dateVal);
  if (!ymd) return false;
  if (range.start && ymd < range.start) return false;
  if (range.end && ymd > range.end) return false;
  return true;
};

// Función genérica para descargar Excel ajustando anchos de columna
export const exportDataToExcel = (data: Record<string, any>[], filePrefix: string, sheetName: string = 'Datos') => {
  if (!data || data.length === 0) {
    alert('No hay registros disponibles para exportar.');
    return;
  }
  const worksheet = XLSX.utils.json_to_sheet(data);
  
  // Calcular auto-width para columnas
  const colWidths = Object.keys(data[0] || {}).map(key => {
    const maxValLen = Math.max(
      key.length,
      ...data.map(row => (row[key] !== null && row[key] !== undefined ? String(row[key]).length : 0))
    );
    return { wch: Math.min(Math.max(maxValLen + 2, 10), 45) };
  });
  worksheet['!cols'] = colWidths;

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  const fileName = `${filePrefix}_${getFormattedTimestamp()}.xlsx`;
  XLSX.writeFile(workbook, fileName);
};

// ==========================================
// 1. MÓDULO BITÁCORAS (VIAJES ACTIVOS)
// ==========================================

export const exportBitacorasExcel = (trips: Trip[], operators: Operator[], dateRangeLabel?: string) => {
  const data = trips.map(t => {
    const totalExpenses = getTripTotalExpenses(t);
    const destStr = t.destinations && t.destinations.length > 0
      ? t.destinations.map(d => d.name || d.destinationAddress).join(' -> ')
      : t.destination;
    
    return {
      'Código': t.code,
      'Fecha': t.date || 'N/A',
      'Cliente': t.client || 'N/A',
      'Proyecto': t.project || 'N/A',
      'Operador': getOperatorName(t.operator_id, operators),
      'Unidad / Placa': t.plate || 'N/A',
      'Origen': t.origin || 'N/A',
      'Destino': destStr || 'N/A',
      'Cita / Horario': t.appointment || 'N/A',
      'Estatus': t.status,
      'Odómetro Inicial': t.odometerStart || 0,
      'Odómetro Actual': t.odometerEnd || t.odometerStart || 0,
      'Km Estimados': t.kmEstimados || 0,
      'Gastos Depositados ($)': Number(t.gastosDepositados || 0).toFixed(2),
      'Combustible Asignado ($)': Number(t.combustibleAsignado || 0).toFixed(2),
      'Gastos Extras ($)': totalExpenses.toFixed(2),
      'Tiene Incidencia': t.hasIncident ? 'SÍ' : 'NO'
    };
  });

  const cleanLabel = dateRangeLabel ? `_${dateRangeLabel.replace(/[^a-zA-Z0-9_-]/g, '_')}` : '';
  exportDataToExcel(data, `TLS_Bitacoras_Activas${cleanLabel}`, 'Bitacoras');
};

export const exportBitacorasPDF = (trips: Trip[], operators: Operator[], dateRangeLabel?: string) => {
  if (!trips || trips.length === 0) {
    alert('No hay bitácoras activas para exportar.');
    return;
  }
  const doc = new jsPDF({ orientation: 'landscape', format: 'letter' });
  const pageWidth = doc.internal.pageSize.getWidth();

  // Header banner
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(0, 0, pageWidth, 22, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('TLS LOGISTICS - REPORTE DE BITÁCORAS ACTIVAS', 14, 14);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  const periodText = dateRangeLabel ? `Filtro Fecha: ${dateRangeLabel} | ` : '';
  doc.text(`${periodText}Generado: ${new Date().toLocaleString('es-MX')} | Total: ${trips.length} viajes`, pageWidth - 14, 14, { align: 'right' });

  // Summary Metrics Bar
  const totalGastos = trips.reduce((acc, t) => acc + getTripTotalExpenses(t), 0);
  const totalIncidencias = trips.filter(t => t.hasIncident).length;
  const enCurso = trips.filter(t => t.status === TripStatus.IN_TRANSIT).length;

  doc.setFillColor(241, 245, 249);
  doc.rect(14, 26, pageWidth - 28, 12, 'F');
  doc.setDrawColor(203, 213, 225);
  doc.rect(14, 26, pageWidth - 28, 12, 'S');

  doc.setTextColor(30, 41, 59);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text(`Total Activas: ${trips.length}`, 20, 34);
  doc.text(`En Curso: ${enCurso}`, 70, 34);
  doc.text(`Incidencias: ${totalIncidencias}`, 120, 34);
  doc.text(`Total Gastos Registrados: $${totalGastos.toFixed(2)}`, 180, 34);

  // Table Data
  const head = [['Código', 'Fecha', 'Cliente', 'Operador', 'Placa', 'Ruta', 'Estatus', 'Odom. Inicial', 'Odom. Final', 'Gastos ($)']];
  const body = trips.map(t => [
    t.code,
    t.date || 'N/A',
    t.client || 'N/A',
    getOperatorName(t.operator_id, operators),
    t.plate || 'N/A',
    `${t.origin} -> ${t.destinations && t.destinations.length > 0 ? t.destinations[0].name : t.destination}`,
    t.status,
    t.odometerStart ? `${t.odometerStart} km` : '-',
    t.odometerEnd ? `${t.odometerEnd} km` : '-',
    `$${getTripTotalExpenses(t).toFixed(2)}`
  ]);

  autoTable(doc, {
    startY: 42,
    head: head,
    body: body,
    theme: 'striped',
    styles: { fontSize: 7, cellPadding: 2 },
    headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    margin: { left: 14, right: 14 },
    didDrawPage: (data) => {
      doc.setFontSize(7);
      doc.setTextColor(148, 163, 184);
      doc.text(
        `Página ${(doc as any).internal.getCurrentPageInfo().pageNumber} | TLS Logistics Control de Bitácoras`,
        pageWidth / 2,
        doc.internal.pageSize.getHeight() - 8,
        { align: 'center' }
      );
    }
  });

  const cleanLabel = dateRangeLabel ? `_${dateRangeLabel.replace(/[^a-zA-Z0-9_-]/g, '_')}` : '';
  doc.save(`TLS_Bitacoras_Activas${cleanLabel}_${getFormattedTimestamp()}.pdf`);
};

// ==========================================
// 2. MÓDULO HISTORIAL (VIAJES ARCHIVADOS)
// ==========================================

export const exportHistoryExcel = (trips: Trip[], operators: Operator[], dateRangeLabel?: string) => {
  const data = trips.map(t => {
    const kmRecorridos = Math.max(0, (t.odometerEnd || 0) - (t.odometerStart || 0));
    const extraCosts = getTripTotalExpenses(t);
    const combustible = Number(t.costoTotalCombustible || 0);
    const totalGeneral = combustible + extraCosts;

    return {
      'Código': t.code,
      'Fecha': t.date || 'N/A',
      'Cliente': t.client || 'N/A',
      'Proyecto': t.project || 'N/A',
      'Operador': getOperatorName(t.operator_id, operators),
      'Placa': t.plate || 'N/A',
      'Origen': t.origin || 'N/A',
      'Destino': t.destination || (t.destinations?.[0]?.name ?? 'N/A'),
      'Odómetro Inicial': t.odometerStart || 0,
      'Odómetro Final': t.odometerEnd || 0,
      'Km Recorridos': kmRecorridos,
      'Costo Combustible ($)': combustible.toFixed(2),
      'Gastos Extras ($)': extraCosts.toFixed(2),
      'Costo Total Viaje ($)': totalGeneral.toFixed(2),
      'Estatus': t.status
    };
  });

  const cleanLabel = dateRangeLabel ? `_${dateRangeLabel.replace(/[^a-zA-Z0-9_-]/g, '_')}` : '';
  exportDataToExcel(data, `TLS_Historial_Viajes${cleanLabel}`, 'Historial');
};

export const exportHistoryPDF = (trips: Trip[], operators: Operator[], dateRangeLabel?: string) => {
  if (!trips || trips.length === 0) {
    alert('No hay viajes en el historial para exportar.');
    return;
  }
  const doc = new jsPDF({ orientation: 'landscape', format: 'letter' });
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFillColor(4, 120, 87); // emerald-700
  doc.rect(0, 0, pageWidth, 22, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('TLS LOGISTICS - HISTORIAL DE VIAJES Y BITÁCORAS COMPLETADAS', 14, 14);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  const periodText = dateRangeLabel ? `Filtro Fecha: ${dateRangeLabel} | ` : '';
  doc.text(`${periodText}Generado: ${new Date().toLocaleString('es-MX')} | Total: ${trips.length} viajes`, pageWidth - 14, 14, { align: 'right' });

  // Métricas
  const totalKm = trips.reduce((acc, t) => acc + Math.max(0, (t.odometerEnd || 0) - (t.odometerStart || 0)), 0);
  const totalCostos = trips.reduce((acc, t) => acc + (Number(t.costoTotalCombustible || 0) + getTripTotalExpenses(t)), 0);

  doc.setFillColor(236, 253, 245);
  doc.rect(14, 26, pageWidth - 28, 12, 'F');
  doc.setDrawColor(167, 243, 208);
  doc.rect(14, 26, pageWidth - 28, 12, 'S');

  doc.setTextColor(6, 78, 59);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text(`Total Viajes: ${trips.length}`, 20, 34);
  doc.text(`Km Totales Acumulados: ${totalKm.toLocaleString()} km`, 80, 34);
  doc.text(`Inversión Total (Combustible + Gastos): $${totalCostos.toFixed(2)}`, 170, 34);

  const head = [['Código', 'Fecha', 'Cliente', 'Operador', 'Placa', 'Ruta', 'Km', 'Combustible ($)', 'Gastos ($)', 'Total ($)']];
  const body = trips.map(t => {
    const km = Math.max(0, (t.odometerEnd || 0) - (t.odometerStart || 0));
    const gas = Number(t.costoTotalCombustible || 0);
    const extras = getTripTotalExpenses(t);
    return [
      t.code,
      t.date || 'N/A',
      t.client || 'N/A',
      getOperatorName(t.operator_id, operators),
      t.plate || 'N/A',
      `${t.origin} -> ${t.destination}`,
      `${km} km`,
      `$${gas.toFixed(2)}`,
      `$${extras.toFixed(2)}`,
      `$${(gas + extras).toFixed(2)}`
    ];
  });

  autoTable(doc, {
    startY: 42,
    head: head,
    body: body,
    theme: 'striped',
    styles: { fontSize: 7, cellPadding: 2 },
    headStyles: { fillColor: [4, 120, 87], textColor: [255, 255, 255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [240, 253, 250] },
    margin: { left: 14, right: 14 },
    didDrawPage: () => {
      doc.setFontSize(7);
      doc.setTextColor(148, 163, 184);
      doc.text(
        `Página ${(doc as any).internal.getCurrentPageInfo().pageNumber} | TLS Logistics Historial de Viajes`,
        pageWidth / 2,
        doc.internal.pageSize.getHeight() - 8,
        { align: 'center' }
      );
    }
  });

  const cleanLabel = dateRangeLabel ? `_${dateRangeLabel.replace(/[^a-zA-Z0-9_-]/g, '_')}` : '';
  doc.save(`TLS_Historial_Viajes${cleanLabel}_${getFormattedTimestamp()}.pdf`);
};

// ==========================================
// 3. MÓDULO FLOTA (UNIDADES)
// ==========================================

export const exportFleetExcel = (units: Unit[]) => {
  const data = units.map(u => ({
    'No. Económico': u.eco || 'N/A',
    'Placas': u.plate || 'N/A',
    'Tipo de Vehículo': u.type || 'N/A',
    'Tipo de Caja': u.box_type || 'N/A',
    'Odómetro Actual (km)': u.current_odometer || 0,
    'Estatus': u.status === 'AVAILABLE' ? 'Disponible' : u.status === 'BUSY' ? 'En Ruta' : 'Mantenimiento'
  }));

  exportDataToExcel(data, 'TLS_Flota_Unidades', 'Flota');
};

export const exportFleetPDF = (units: Unit[]) => {
  if (!units || units.length === 0) {
    alert('No hay unidades en la flota para exportar.');
    return;
  }
  const doc = new jsPDF({ orientation: 'portrait', format: 'letter' });
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFillColor(234, 88, 12); // orange-600
  doc.rect(0, 0, pageWidth, 22, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('TLS LOGISTICS - INVENTARIO DE FLOTA VEHICULAR', 14, 14);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text(`Generado: ${new Date().toLocaleString('es-MX')} | Total: ${units.length} unidades`, pageWidth - 14, 14, { align: 'right' });

  // Métricas
  const disponibles = units.filter(u => u.status === 'AVAILABLE').length;
  const enRuta = units.filter(u => u.status === 'BUSY').length;
  const mantenimiento = units.filter(u => u.status === 'MAINTENANCE').length;

  doc.setFillColor(255, 247, 237);
  doc.rect(14, 26, pageWidth - 28, 12, 'F');
  doc.setDrawColor(254, 215, 170);
  doc.rect(14, 26, pageWidth - 28, 12, 'S');

  doc.setTextColor(154, 52, 18);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text(`Total: ${units.length}`, 20, 34);
  doc.text(`Disponibles: ${disponibles}`, 65, 34);
  doc.text(`En Ruta: ${enRuta}`, 115, 34);
  doc.text(`En Mantenimiento: ${mantenimiento}`, 155, 34);

  const head = [['No. Económico', 'Placas', 'Tipo de Unidad', 'Tipo de Caja', 'Odómetro Actual', 'Estatus']];
  const body = units.map(u => [
    u.eco || 'N/A',
    u.plate || 'N/A',
    u.type || 'N/A',
    u.box_type || 'N/A',
    u.current_odometer ? `${u.current_odometer.toLocaleString()} km` : '0 km',
    u.status === 'AVAILABLE' ? 'Disponible' : u.status === 'BUSY' ? 'En Ruta' : 'Mantenimiento'
  ]);

  autoTable(doc, {
    startY: 42,
    head: head,
    body: body,
    theme: 'striped',
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: [234, 88, 12], textColor: [255, 255, 255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [255, 247, 237] },
    margin: { left: 14, right: 14 },
    didDrawPage: () => {
      doc.setFontSize(7);
      doc.setTextColor(148, 163, 184);
      doc.text(
        `Página ${(doc as any).internal.getCurrentPageInfo().pageNumber} | TLS Logistics Control de Flota`,
        pageWidth / 2,
        doc.internal.pageSize.getHeight() - 8,
        { align: 'center' }
      );
    }
  });

  doc.save(`TLS_Flota_Unidades_${getFormattedTimestamp()}.pdf`);
};

// ==========================================
// 4. MÓDULO USUARIOS (OPERADORES Y ADMINS)
// ==========================================

export const exportOperatorsExcel = (operators: Operator[]) => {
  const data = operators.map(op => ({
    'Nombre Completo': op.name,
    'Usuario / Teléfono': op.username || 'N/A',
    'Rol': op.role || 'OPERATOR',
    'No. Licencia': op.license_number || 'N/A',
    'No. Económico': op.unit_number || 'N/A',
    'Placa Asignada': op.plate || 'N/A',
    'Estatus': op.status === 'AVAILABLE' ? 'Disponible' : op.status === 'BUSY' ? 'En Ruta' : 'Mantenimiento'
  }));

  exportDataToExcel(data, 'TLS_Directorio_Usuarios', 'Usuarios');
};

export const exportOperatorsPDF = (operators: Operator[]) => {
  if (!operators || operators.length === 0) {
    alert('No hay usuarios para exportar.');
    return;
  }
  const doc = new jsPDF({ orientation: 'portrait', format: 'letter' });
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFillColor(79, 70, 229); // indigo-600
  doc.rect(0, 0, pageWidth, 22, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('TLS LOGISTICS - DIRECTORIO DE USUARIOS Y OPERADORES', 14, 14);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text(`Generado: ${new Date().toLocaleString('es-MX')} | Total: ${operators.length} usuarios`, pageWidth - 14, 14, { align: 'right' });

  // Métricas
  const totalOps = operators.filter(o => o.role !== 'ADMIN').length;
  const totalAdmins = operators.filter(o => o.role === 'ADMIN').length;

  doc.setFillColor(238, 242, 255);
  doc.rect(14, 26, pageWidth - 28, 12, 'F');
  doc.setDrawColor(199, 210, 254);
  doc.rect(14, 26, pageWidth - 28, 12, 'S');

  doc.setTextColor(49, 46, 129);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text(`Total Registrados: ${operators.length}`, 20, 34);
  doc.text(`Operadores: ${totalOps}`, 80, 34);
  doc.text(`Administradores: ${totalAdmins}`, 140, 34);

  const head = [['Nombre Completo', 'Usuario / Cel', 'Rol', 'Licencia', 'No. Eco', 'Placa', 'Estatus']];
  const body = operators.map(op => [
    op.name,
    op.username || 'N/A',
    op.role === 'ADMIN' ? 'ADMINISTRADOR' : 'OPERADOR',
    op.license_number || 'N/A',
    op.unit_number || 'N/A',
    op.plate || 'N/A',
    op.status === 'AVAILABLE' ? 'Disponible' : op.status === 'BUSY' ? 'En Ruta' : 'Mantenimiento'
  ]);

  autoTable(doc, {
    startY: 42,
    head: head,
    body: body,
    theme: 'striped',
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: [79, 70, 229], textColor: [255, 255, 255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [245, 247, 255] },
    margin: { left: 14, right: 14 },
    didDrawPage: () => {
      doc.setFontSize(7);
      doc.setTextColor(148, 163, 184);
      doc.text(
        `Página ${(doc as any).internal.getCurrentPageInfo().pageNumber} | TLS Logistics Directorio de Usuarios`,
        pageWidth / 2,
        doc.internal.pageSize.getHeight() - 8,
        { align: 'center' }
      );
    }
  });

  doc.save(`TLS_Directorio_Usuarios_${getFormattedTimestamp()}.pdf`);
};

// ==========================================
// 5. MÓDULO GASTOS (CENTRO DE COSTOS)
// ==========================================

export interface FlatExpenseRow {
  tripId: string;
  tripCode: string;
  recordId: string;
  operatorName: string;
  plate: string;
  dateStr: string;
  timestamp: number;
  category: string;
  concept: string;
  amount: number;
  liters?: number;
  pricePerLiter?: number;
  odometer?: number;
  evidenceUrl?: string;
  recordTotal: number;
  itemsCount: number;
}

// Extrae todos los gastos planos de una lista de viajes
export const extractFlatExpenses = (trips: Trip[], operators: Operator[]): FlatExpenseRow[] => {
  const rows: FlatExpenseRow[] = [];

  trips.forEach(t => {
    if (!t.extraCosts || !Array.isArray(t.extraCosts)) return;
    const opName = getOperatorName(t.operator_id, operators);

    t.extraCosts.forEach(record => {
      const dateStr = record.timestamp ? new Date(record.timestamp).toLocaleDateString('es-MX') : t.date || 'N/A';
      const evidenceUrl = record.evidence && record.evidence.length > 0 ? record.evidence[0].url : undefined;
      const recTotal = Number(record.total) || 
        (record.items ? record.items.reduce((s, it) => s + (Number(it.amount) || 0), 0) : 0);

      if (record.items && record.items.length > 0) {
        record.items.forEach(item => {
          rows.push({
            tripId: t.id,
            tripCode: t.code,
            recordId: record.id,
            operatorName: opName,
            plate: t.plate || 'N/A',
            dateStr,
            timestamp: record.timestamp || 0,
            category: record.category,
            concept: item.concept,
            amount: Number(item.amount) || 0,
            liters: item.liters,
            pricePerLiter: item.pricePerLiter,
            odometer: item.odometer,
            evidenceUrl,
            recordTotal: recTotal,
            itemsCount: record.items.length
          });
        });
      } else {
        // En caso de registro sin items detallados
        rows.push({
          tripId: t.id,
          tripCode: t.code,
          recordId: record.id,
          operatorName: opName,
          plate: t.plate || 'N/A',
          dateStr,
          timestamp: record.timestamp || 0,
          category: record.category,
          concept: 'Gasto registrado',
          amount: recTotal,
          evidenceUrl,
          recordTotal: recTotal,
          itemsCount: 0
        });
      }
    });
  });

  return rows.sort((a, b) => b.timestamp - a.timestamp);
};

export const exportExpensesExcel = (expenses: FlatExpenseRow[], dateRangeLabel?: string) => {
  const data = expenses.map(e => ({
    'Código de Viaje': e.tripCode,
    'Fecha': e.dateStr,
    'Operador': e.operatorName,
    'Placa': e.plate,
    'Categoría': e.category,
    'Concepto': e.concept,
    'Monto ($)': Number(e.amount).toFixed(2),
    'Litros': e.liters || '',
    'Precio x Litro ($)': e.pricePerLiter ? Number(e.pricePerLiter).toFixed(2) : '',
    'Odómetro (km)': e.odometer || '',
    'Evidencia / Ticket': e.evidenceUrl ? e.evidenceUrl : 'Sin foto'
  }));

  const cleanLabel = dateRangeLabel ? `_${dateRangeLabel.replace(/[^a-zA-Z0-9_-]/g, '_')}` : '';
  exportDataToExcel(data, `TLS_Gastos_Operadores${cleanLabel}`, 'Gastos');
};

export const exportExpensesPDF = (expenses: FlatExpenseRow[], dateRangeLabel?: string) => {
  if (!expenses || expenses.length === 0) {
    alert('No hay gastos registrados para exportar.');
    return;
  }
  const doc = new jsPDF({ orientation: 'landscape', format: 'letter' });
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFillColor(217, 119, 6); // amber-600
  doc.rect(0, 0, pageWidth, 22, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('TLS LOGISTICS - CONTROL Y AUDITORÍA DE GASTOS DE OPERADORES', 14, 14);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  const periodText = dateRangeLabel ? `Filtro Fecha: ${dateRangeLabel} | ` : '';
  doc.text(`${periodText}Generado: ${new Date().toLocaleString('es-MX')} | Total: ${expenses.length} conceptos`, pageWidth - 14, 14, { align: 'right' });

  // Métricas financieras
  const totalGeneral = expenses.reduce((s, e) => s + e.amount, 0);
  const totalOperativo = expenses.filter(e => e.category === 'OPERATIVO').reduce((s, e) => s + e.amount, 0);
  const totalViaje = expenses.filter(e => e.category === 'GASTOS').reduce((s, e) => s + e.amount, 0);
  const totalMant = expenses.filter(e => e.category === 'MANTENIMIENTO').reduce((s, e) => s + e.amount, 0);

  doc.setFillColor(254, 243, 199);
  doc.rect(14, 26, pageWidth - 28, 12, 'F');
  doc.setDrawColor(252, 211, 77);
  doc.rect(14, 26, pageWidth - 28, 12, 'S');

  doc.setTextColor(120, 53, 15);
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.text(`Total Acumulado: $${totalGeneral.toFixed(2)}`, 20, 34);
  doc.text(`Operativo: $${totalOperativo.toFixed(2)}`, 85, 34);
  doc.text(`Gastos de Viaje: $${totalViaje.toFixed(2)}`, 140, 34);
  doc.text(`Mantenimiento: $${totalMant.toFixed(2)}`, 205, 34);

  const head = [['Viaje', 'Fecha', 'Operador', 'Placa', 'Categoría', 'Concepto', 'Detalle Odom/Litros', 'Monto ($)', 'Evidencia']];
  const body = expenses.map(e => {
    let detalle = '-';
    if (e.liters && e.pricePerLiter) detalle = `${e.liters}L @ $${e.pricePerLiter}`;
    else if (e.odometer) detalle = `Odom: ${e.odometer} km`;

    return [
      e.tripCode,
      e.dateStr,
      e.operatorName,
      e.plate,
      e.category,
      e.concept,
      detalle,
      `$${Number(e.amount).toFixed(2)}`,
      e.evidenceUrl ? 'Adjunta' : 'Sin foto'
    ];
  });

  autoTable(doc, {
    startY: 42,
    head: head,
    body: body,
    theme: 'striped',
    styles: { fontSize: 7, cellPadding: 2 },
    headStyles: { fillColor: [217, 119, 6], textColor: [255, 255, 255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [255, 251, 235] },
    margin: { left: 14, right: 14 },
    didDrawPage: () => {
      doc.setFontSize(7);
      doc.setTextColor(148, 163, 184);
      doc.text(
        `Página ${(doc as any).internal.getCurrentPageInfo().pageNumber} | TLS Logistics Auditoría de Gastos`,
        pageWidth / 2,
        doc.internal.pageSize.getHeight() - 8,
        { align: 'center' }
      );
    }
  });

  const cleanLabel = dateRangeLabel ? `_${dateRangeLabel.replace(/[^a-zA-Z0-9_-]/g, '_')}` : '';
  doc.save(`TLS_Gastos_Operadores${cleanLabel}_${getFormattedTimestamp()}.pdf`);
};
