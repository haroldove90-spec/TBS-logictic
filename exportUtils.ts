import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Trip, Unit, Operator, ExpenseRecord, TripStatus } from './types';
import { formatFullDateTime, buildFullTripEventLog, getStageFormattedDate } from './utils';

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

// Obtiene el nombre del operador por ID (con respaldo automático por placa)
const getOperatorName = (operatorId: string | undefined, operators: Operator[], plate?: string): string => {
  if (operatorId) {
    const op = operators.find(o => o.id === operatorId || o.username === operatorId);
    if (op) return op.name;
    return operatorId;
  }
  if (plate) {
    const cleanPlate = plate.trim().toLowerCase();
    const opByPlate = operators.find(o => o.plate && o.plate.trim().toLowerCase() === cleanPlate);
    if (opByPlate) return opByPlate.name;
  }
  return 'Sin asignar';
};

// Obtiene el número económico (ECO) de la unidad según la placa o identificador
export const getUnitEco = (plate: string | undefined, units: Unit[] = []): string => {
  if (!plate) return 'N/A';
  const cleanPlate = plate.trim().toLowerCase();
  const unit = units.find(u => 
    (u.plate && u.plate.trim().toLowerCase() === cleanPlate) ||
    (u.eco && u.eco.trim().toLowerCase() === cleanPlate)
  );
  return unit?.eco || plate;
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

// Helper universal para dar formato limpio y ancho suficiente a cualquier hoja Excel (evita celdas encimadas)
const formatExcelWorksheet = (
  worksheet: XLSX.WorkSheet,
  data: Record<string, any>[],
  extraCurrencyCols: Set<string> = new Set()
) => {
  if (!data || data.length === 0) return;
  const headers = Object.keys(data[0] || {});
  const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');

  for (let R = 1; R <= range.e.r; R++) {
    for (let C = 0; C <= range.e.c; C++) {
      const header = headers[C];
      const isCurrency = header && (header.includes('($)') || extraCurrencyCols.has(header));
      if (isCurrency) {
        const cellRef = XLSX.utils.encode_cell({ r: R, c: C });
        const cell = worksheet[cellRef];
        if (cell && cell.t === 'n') {
          cell.z = '$#,##0.00;-$#,##0.00;"$ -"';
        }
      }
    }
  }

  worksheet['!cols'] = headers.map(key => {
    const isUrlCol = key.toLowerCase().includes('evidencia') || key.toLowerCase().includes('ticket') || key.toLowerCase().includes('link');
    const maxValLen = Math.max(
      0,
      ...data.map(row => {
        const v = row[key];
        if (v === null || v === undefined) return 0;
        if (typeof v === 'number') {
          const formattedLen = key.includes('($)') || extraCurrencyCols.has(key)
            ? v.toFixed(2).length + 4
            : String(v).length + 2;
          return formattedLen;
        }
        return String(v).length;
      })
    );
    const headerNeeded = Math.ceil(key.length * 1.2) + 4;
    const contentNeeded = Math.ceil(maxValLen * 1.15) + 6;
    const cap = isUrlCol ? 55 : 100;
    return { wch: Math.min(Math.max(headerNeeded, contentNeeded, 14), cap) };
  });
};

// Función genérica para descargar Excel ajustando anchos de columna
export const exportDataToExcel = (data: Record<string, any>[], filePrefix: string, sheetName: string = 'Datos') => {
  if (!data || data.length === 0) {
    alert('No hay registros disponibles para exportar.');
    return;
  }
  const worksheet = XLSX.utils.json_to_sheet(data);
  formatExcelWorksheet(worksheet, data);

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  const fileName = `${filePrefix}_${getFormattedTimestamp()}.xlsx`;
  XLSX.writeFile(workbook, fileName);
};

// Función para descargar Excel con múltiples hojas (Hojas de Datos + Hoja de Auditoría de Eventos)
export const exportMultiSheetExcel = (
  sheets: { name: string; data: Record<string, any>[] }[],
  filePrefix: string
) => {
  const workbook = XLSX.utils.book_new();
  let addedSheets = 0;

  sheets.forEach(({ name, data }) => {
    if (data && data.length > 0) {
      const worksheet = XLSX.utils.json_to_sheet(data);
      formatExcelWorksheet(worksheet, data);
      XLSX.utils.book_append_sheet(workbook, worksheet, name);
      addedSheets++;
    }
  });

  if (addedSheets === 0) {
    alert('No hay registros para exportar.');
    return;
  }

  const fileName = `${filePrefix}_${getFormattedTimestamp()}.xlsx`;
  XLSX.writeFile(workbook, fileName);
};

// ==========================================
// 1. MÓDULO BITÁCORAS (VIAJES ACTIVOS)
// ==========================================

export const exportBitacorasExcel = (trips: Trip[], operators: Operator[], dateRangeLabel?: string, units: Unit[] = []) => {
  const auditEventsData: Record<string, any>[] = [];

  const data = trips.map(t => {
    const totalExpenses = getTripTotalExpenses(t);
    const destStr = t.destinations && t.destinations.length > 0
      ? t.destinations.map(d => d.name || d.destinationAddress).join(' -> ')
      : t.destination;
    
    const opName = getOperatorName(t.operator_id, operators);
    const unitEco = getUnitEco(t.plate, units);
    const tripEvents = buildFullTripEventLog(t, opName);
    const lastEvent = tripEvents.length > 0 ? tripEvents[tripEvents.length - 1] : null;

    tripEvents.forEach(evt => {
      auditEventsData.push({
        'Código de Viaje': t.code,
        'ECO': unitEco,
        'Placa': t.plate || 'N/A',
        'Fecha y Hora Exacta': evt.dateFormatted || formatFullDateTime(evt.timestamp),
        'Tipo de Evento': evt.eventType,
        'Usuario / Responsable': evt.user,
        'Descripción del Evento': evt.description,
        'Detalles': evt.details || ''
      });
    });

    return {
      'Código': t.code,
      'Fecha Asignación (Día y Hora)': t.created_at ? formatFullDateTime(t.created_at) : (t.date || 'N/A'),
      'Fecha Programada': t.date || 'N/A',
      'Cita / Horario': t.appointment || 'N/A',
      'Cliente': t.client || 'N/A',
      'Proyecto': t.project || 'N/A',
      'Operador': opName,
      'ECO': unitEco,
      'Unidad / Placa': t.plate || 'N/A',
      'Origen': t.origin || 'N/A',
      'Destino': destStr || 'N/A',
      'Estatus': t.status,
      '1. Comenzando Viaje': getStageFormattedDate(t, 0),
      '2. Llegando a Cargar': getStageFormattedDate(t, 1),
      '3. Cargado': getStageFormattedDate(t, 2),
      '4. Iniciar Destino 2': getStageFormattedDate(t, 3),
      '5. Con Cliente': getStageFormattedDate(t, 4),
      '6. Descargado': getStageFormattedDate(t, 5),
      '7. Fin de Viaje': getStageFormattedDate(t, 6),
      'Odómetro Inicial': t.odometerStart || 0,
      'Odómetro Actual': t.odometerEnd || t.odometerStart || 0,
      'Km Estimados': t.kmEstimados || 0,
      'Gastos Depositados ($)': Number(Number(t.gastosDepositados || 0).toFixed(2)),
      'Combustible Asignado ($)': Number(Number(t.combustibleAsignado || 0).toFixed(2)),
      'Gastos Extras ($)': Number(totalExpenses.toFixed(2)),
      'Total Eventos Registrados': tripEvents.length,
      'Último Evento': lastEvent ? `${lastEvent.dateFormatted}: ${lastEvent.description}` : 'Sin actividad registrada'
    };
  });

  const cleanLabel = dateRangeLabel ? `_${dateRangeLabel.replace(/[^a-zA-Z0-9_-]/g, '_')}` : '';
  exportMultiSheetExcel([
    { name: 'Bitacoras', data },
    { name: 'Auditoría de Eventos', data: auditEventsData }
  ], `TLS_Bitacoras_Activas${cleanLabel}`);
};

export const exportBitacorasPDF = (trips: Trip[], operators: Operator[], dateRangeLabel?: string, units: Unit[] = []) => {
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

  // Table Data con Fecha y Hora
  const head = [['Código', 'Fecha / Creación', 'Cliente', 'Operador', 'ECO', 'Placa', 'Ruta', 'Estatus', 'Odom. Inicial', 'Odom. Final', 'Gastos ($)']];
  const body = trips.map(t => {
    const dateTime = t.created_at ? formatFullDateTime(t.created_at) : (t.date || 'N/A');
    return [
      t.code,
      dateTime,
      t.client || 'N/A',
      getOperatorName(t.operator_id, operators),
      getUnitEco(t.plate, units),
      t.plate || 'N/A',
      `${t.origin} -> ${t.destinations && t.destinations.length > 0 ? t.destinations[0].name : t.destination}`,
      t.status,
      t.odometerStart ? `${t.odometerStart} km` : '-',
      t.odometerEnd ? `${t.odometerEnd} km` : '-',
      `$${getTripTotalExpenses(t).toFixed(2)}`
    ];
  });

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

export const exportHistoryExcel = (trips: Trip[], operators: Operator[], dateRangeLabel?: string, units: Unit[] = []) => {
  const auditEventsData: Record<string, any>[] = [];

  const data = trips.map(t => {
    const kmRecorridos = Math.max(0, (t.odometerEnd || 0) - (t.odometerStart || 0));
    const extraCosts = getTripTotalExpenses(t);
    const combustible = Number(t.costoTotalCombustible || 0);
    const totalGeneral = combustible + extraCosts;
    const opName = getOperatorName(t.operator_id, operators);
    const unitEco = getUnitEco(t.plate, units);
    const tripEvents = buildFullTripEventLog(t, opName);

    tripEvents.forEach(evt => {
      auditEventsData.push({
        'Código de Viaje': t.code,
        'ECO': unitEco,
        'Placa': t.plate || 'N/A',
        'Fecha y Hora Exacta': evt.dateFormatted || formatFullDateTime(evt.timestamp),
        'Tipo de Evento': evt.eventType,
        'Usuario / Responsable': evt.user,
        'Descripción del Evento': evt.description,
        'Detalles': evt.details || ''
      });
    });

    return {
      'Código': t.code,
      'Fecha Creación (Día y Hora)': t.created_at ? formatFullDateTime(t.created_at) : (t.date || 'N/A'),
      'Fecha Programada': t.date || 'N/A',
      'Cliente': t.client || 'N/A',
      'Proyecto': t.project || 'N/A',
      'Operador': opName,
      'ECO': unitEco,
      'Placa': t.plate || 'N/A',
      'Origen': t.origin || 'N/A',
      'Destino': t.destination || (t.destinations?.[0]?.name ?? 'N/A'),
      'Odómetro Inicial': t.odometerStart || 0,
      'Odómetro Final': t.odometerEnd || 0,
      'Km Recorridos': kmRecorridos,
      'Costo Combustible ($)': Number(combustible.toFixed(2)),
      'Gastos Extras ($)': Number(extraCosts.toFixed(2)),
      'Costo Total Viaje ($)': Number(totalGeneral.toFixed(2)),
      'Estatus': t.status,
      '1. Comenzando Viaje': getStageFormattedDate(t, 0),
      '2. Llegando a Cargar': getStageFormattedDate(t, 1),
      '3. Cargado': getStageFormattedDate(t, 2),
      '4. Iniciar Destino 2': getStageFormattedDate(t, 3),
      '5. Con Cliente': getStageFormattedDate(t, 4),
      '6. Descargado': getStageFormattedDate(t, 5),
      '7. Fin de Viaje': getStageFormattedDate(t, 6),
      'Total Eventos Auditados': tripEvents.length
    };
  });

  const cleanLabel = dateRangeLabel ? `_${dateRangeLabel.replace(/[^a-zA-Z0-9_-]/g, '_')}` : '';
  exportMultiSheetExcel([
    { name: 'Historial', data },
    { name: 'Auditoría de Eventos', data: auditEventsData }
  ], `TLS_Historial_Viajes${cleanLabel}`);
};

export const exportHistoryPDF = (trips: Trip[], operators: Operator[], dateRangeLabel?: string, units: Unit[] = []) => {
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

  const head = [['Código', 'Fecha / Creación', 'Cliente', 'Operador', 'ECO', 'Placa', 'Ruta', 'Estatus', 'Km', 'Combustible ($)', 'Gastos ($)', 'Total ($)']];
  const body = trips.map(t => {
    const km = Math.max(0, (t.odometerEnd || 0) - (t.odometerStart || 0));
    const gas = Number(t.costoTotalCombustible || 0);
    const extras = getTripTotalExpenses(t);
    return [
      t.code,
      t.created_at ? formatFullDateTime(t.created_at) : (t.date || 'N/A'),
      t.client || 'N/A',
      getOperatorName(t.operator_id, operators),
      getUnitEco(t.plate, units),
      t.plate || 'N/A',
      `${t.origin} -> ${t.destination}`,
      t.status,
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
  eco: string;
  plate: string;
  dateStr: string;
  dateTimeStr: string;
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
export const extractFlatExpenses = (trips: Trip[], operators: Operator[], units: Unit[] = []): FlatExpenseRow[] => {
  const rows: FlatExpenseRow[] = [];

  trips.forEach(t => {
    if (!t.extraCosts || !Array.isArray(t.extraCosts)) return;
    const opName = getOperatorName(t.operator_id, operators);
    const unitEco = getUnitEco(t.plate, units);

    t.extraCosts.forEach(record => {
      const dateStr = record.timestamp ? new Date(record.timestamp).toLocaleDateString('es-MX') : t.date || 'N/A';
      const dateTimeStr = record.timestamp ? formatFullDateTime(record.timestamp) : (t.date || 'N/A');
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
            eco: unitEco,
            plate: t.plate || 'N/A',
            dateStr,
            dateTimeStr,
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
          eco: unitEco,
          plate: t.plate || 'N/A',
          dateStr,
          dateTimeStr,
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
  const bucketLabels: Record<ExpenseBucket, string> = {
    COMBUSTIBLE: 'COMBUSTIBLE',
    VIATICOS: 'VIÁTICOS',
    MANIOBRAS: 'MANIOBRAS',
    CASETAS: 'CASETAS',
    CASETAS_IAVE: 'CASETAS IAVE / TAG',
    TRANSITO: 'TRÁNSITO',
    ESTACIONAMIENTO: 'ESTACIONAMIENTO',
    PERMISO_FITO: 'PERMISO / FITOSANITARIA',
    HOTEL_PENSION: 'HOTEL O PENSIÓN',
    TALACHA: 'TALACHA',
    ESTADIAS: 'ESTADÍAS',
    OTROS: 'OTROS GASTOS'
  };

  const data = expenses.map(e => {
    const bucket = classifyExpenseBucket(e.concept, e.liters);
    return {
      'Código de Viaje': e.tripCode,
      'Fecha y Hora de Registro (Captura)': e.dateTimeStr || e.dateStr,
      'Fecha Contable': e.dateStr,
      'Operador': e.operatorName,
      'ECO': e.eco || 'N/A',
      'Placa': e.plate,
      'Categoría': e.category,
      'Rubro / Subcategoría': bucketLabels[bucket] || 'OTROS GASTOS',
      'Concepto': e.concept,
      'Monto ($)': Number(Number(e.amount || 0).toFixed(2)),
      'Litros': e.liters ? Number(e.liters) : '',
      'Precio x Litro ($)': e.pricePerLiter ? Number(Number(e.pricePerLiter).toFixed(2)) : '',
      'Odómetro (km)': e.odometer ? Number(e.odometer) : '',
      'Evidencia / Ticket': e.evidenceUrl ? e.evidenceUrl : 'Sin foto'
    };
  });

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

  const head = [['Viaje', 'Fecha y Hora Registro', 'Operador', 'ECO', 'Placa', 'Categoría', 'Concepto', 'Detalle Odom/Litros', 'Monto ($)', 'Evidencia']];
  const body = expenses.map(e => {
    let detalle = '-';
    if (e.liters && e.pricePerLiter) detalle = `${e.liters}L @ $${e.pricePerLiter}`;
    else if (e.odometer) detalle = `Odom: ${e.odometer} km`;

    return [
      e.tripCode,
      e.dateTimeStr || e.dateStr,
      e.operatorName,
      e.eco || 'N/A',
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

// ==========================================
// 6. EXPORTACIÓN MAESTRA DE BASE DE DATOS (1 FILA POR VIAJE)
// ==========================================

const getUnitByPlate = (plate: string | undefined, units: Unit[] = []): Unit | undefined => {
  if (!plate) return undefined;
  const cleanPlate = plate.trim().toLowerCase();
  return units.find(u =>
    (u.plate && u.plate.trim().toLowerCase() === cleanPlate) ||
    (u.eco && u.eco.trim().toLowerCase() === cleanPlate)
  );
};

const formatDateDMY = (val: any): string => {
  if (!val) return '';
  const s = String(val).trim();
  const ymd = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (ymd) return `${ymd[3]}/${ymd[2]}/${ymd[1]}`;
  const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (dmy) return `${dmy[1].padStart(2, '0')}/${dmy[2].padStart(2, '0')}/${dmy[3]}`;
  const d = new Date(val);
  if (!isNaN(d.getTime())) {
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  }
  return s;
};

type ExpenseBucket =
  | 'COMBUSTIBLE'
  | 'VIATICOS'
  | 'MANIOBRAS'
  | 'CASETAS'
  | 'CASETAS_IAVE'
  | 'TRANSITO'
  | 'ESTACIONAMIENTO'
  | 'PERMISO_FITO'
  | 'HOTEL_PENSION'
  | 'TALACHA'
  | 'ESTADIAS'
  | 'OTROS';

const normalizeTextForMatch = (txt: string): string =>
  txt
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

export const classifyExpenseBucket = (concept: string, liters?: number): ExpenseBucket => {
  const c = normalizeTextForMatch(concept || '');

  if (c.includes('carga combustible') || (liters !== undefined && Number(liters) > 0)) {
    return 'COMBUSTIBLE';
  }
  if (c.includes('casetas iave') || c.includes('iave') || c.includes('casetas tag') || c.includes('caseta tag') || /\btag\b/.test(c)) {
    return 'CASETAS_IAVE';
  }
  if (c.includes('[casetas') || c.includes('caseta') || c.includes('peaje')) {
    return 'CASETAS';
  }
  if (c.includes('[viaticos]') || c.includes('viatico') || c.includes('comida') || c.includes('alimento') || c.includes('desayuno') || c.includes('cena') || c.includes('despensa')) {
    return 'VIATICOS';
  }
  if (c.includes('[maniobras]') || c.includes('maniobra')) {
    return 'MANIOBRAS';
  }
  if (c.includes('[hotel') || c.includes('hotel') || c.includes('pension') || c.includes('hospedaje') || c.includes('motel')) {
    return 'HOTEL_PENSION';
  }
  if (c.includes('[talacha]') || c.includes('talacha') || c.includes('llanta') || c.includes('vulcanizadora') || c.includes('ponchadura')) {
    return 'TALACHA';
  }
  if (c.includes('[estadias]') || c.includes('estadia')) {
    return 'ESTADIAS';
  }
  if (c.includes('[permiso') || c.includes('permiso') || c.includes('fitosanitaria') || c.includes('sanidad') || c.includes('fumigacion')) {
    return 'PERMISO_FITO';
  }
  if (c.includes('[estacionamiento]') || c.includes('estacionamiento') || c.includes('parquimetro')) {
    return 'ESTACIONAMIENTO';
  }
  if (c.includes('[transito]') || c.includes('transito') || c.includes('dadiva') || c.includes('infraccion') || c.includes('multa') || c.includes('federal')) {
    return 'TRANSITO';
  }
  return 'OTROS';
};

export const MASTER_DB_COLUMNS = [
  'NO.',
  'FECHA CARGA',
  'HORA CARGA',
  'CLIENTE',
  'PROYECTO',
  'FOLIO CLIENTE',
  'LUGAR DE CARGA O RECOLECCION',
  'DESTINO',
  'CLIENTE DESCARGA',
  'LINEA',
  'OPERADOR',
  'ECO UNIDAD',
  'TIPO UNIDAD CLIENTE',
  'PLACAS UNIDAD',
  'VIATICOS',
  'MANIOBRAS AUTORIZADAS',
  'CASETAS',
  'CASETAS IAVE',
  'TOTAL CASETAS',
  'TRANSITO',
  'ESTACIONAMIENTO',
  'PERMISO / FITOSANITARIA',
  'HOTEL O PENSION',
  'TALACHA',
  'ESTADIAS',
  'OTROS',
  'RENDIMIENTO',
  'ODOMETRO INICIAL',
  'ODOMETRO FINAL',
  'KMS RECORRIDOS',
  'DIESEL REAL CONSUMIDO',
  'RENDIMIENTO REAL',
  'FECHA RECIBO DE BITACORA',
  'OBSERVACIONES'
] as const;

export const MASTER_DB_CURRENCY_COLS = new Set<string>([
  'VIATICOS',
  'MANIOBRAS AUTORIZADAS',
  'CASETAS',
  'CASETAS IAVE',
  'TOTAL CASETAS',
  'TRANSITO',
  'ESTACIONAMIENTO',
  'PERMISO / FITOSANITARIA',
  'HOTEL O PENSION',
  'TALACHA',
  'ESTADIAS',
  'OTROS'
]);

export const MASTER_DB_BLUE_HEADERS = new Set<string>([
  'CASETAS IAVE',
  'TOTAL CASETAS',
  'ODOMETRO INICIAL',
  'ODOMETRO FINAL',
  'KMS RECORRIDOS',
  'RENDIMIENTO REAL'
]);

export const MASTER_DB_RED_HEADERS = new Set<string>(['OBSERVACIONES']);

export interface MasterDatabaseRow {
  tripId: string;
  status: string;
  hasOdomFormula: boolean;
  hasYieldFormula: boolean;
  values: Record<string, string | number>;
}

export const formatAccountingMXN = (val: number | string | undefined): string => {
  const n = Number(val || 0);
  if (!n || Math.abs(n) < 0.005) return '$ -';
  return `$ ${n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

export const buildMasterDatabaseRows = (
  trips: Trip[],
  operators: Operator[],
  units: Unit[] = []
) => {
  const masterRows: MasterDatabaseRow[] = [];
  const detailRows: Record<string, any>[] = [];
  const auditEventsData: Record<string, any>[] = [];

  trips.forEach(t => {
    const unit = getUnitByPlate(t.plate, units);
    const opName = getOperatorName(t.operator_id, operators, t.plate);
    const unitEco = unit?.eco || getUnitEco(t.plate, units);
    const unitType = unit?.type || 'N/A';

    // Totales horizontales por columna de gasto
    const totals = {
      viaticos: 0,
      maniobras: 0,
      casetas: 0,
      casetasIave: Number(t.casetasIave || 0),
      transito: 0,
      estacionamiento: 0,
      permisoFito: 0,
      hotelPension: 0,
      talacha: 0,
      estadias: 0,
      otros: 0
    };

    let dieselRealLiters = 0;
    let fuelDistanceSum = 0;
    const fuelYields: number[] = [];

    if (t.extraCosts && Array.isArray(t.extraCosts)) {
      t.extraCosts.forEach(rec => {
        const recDateStr = rec.timestamp ? formatFullDateTime(rec.timestamp) : (t.date || 'N/A');
        const evidenceUrl = rec.evidence && rec.evidence.length > 0 ? rec.evidence[0].url : 'Sin foto';

        if (rec.items && rec.items.length > 0) {
          rec.items.forEach(item => {
            const amount = Number(item.amount) || 0;
            const liters = Number(item.liters) || 0;
            const bucket = classifyExpenseBucket(item.concept, liters);

            switch (bucket) {
              case 'COMBUSTIBLE':
                dieselRealLiters += liters;
                if (item.odometer && item.initialOdometer && item.odometer > item.initialOdometer) {
                  fuelDistanceSum += (item.odometer - item.initialOdometer);
                }
                if (item.performance && Number(item.performance) > 0) {
                  fuelYields.push(Number(item.performance));
                }
                break;
              case 'VIATICOS':
                totals.viaticos += amount;
                break;
              case 'MANIOBRAS':
                totals.maniobras += amount;
                break;
              case 'CASETAS':
                totals.casetas += amount;
                break;
              case 'CASETAS_IAVE':
                totals.casetasIave += amount;
                break;
              case 'TRANSITO':
                totals.transito += amount;
                break;
              case 'ESTACIONAMIENTO':
                totals.estacionamiento += amount;
                break;
              case 'PERMISO_FITO':
                totals.permisoFito += amount;
                break;
              case 'HOTEL_PENSION':
                totals.hotelPension += amount;
                break;
              case 'TALACHA':
                totals.talacha += amount;
                break;
              case 'ESTADIAS':
                totals.estadias += amount;
                break;
              case 'OTROS':
              default:
                totals.otros += amount;
                break;
            }

            detailRows.push({
              'NO. Viaje': t.code,
              'ECO': unitEco,
              'Placas': t.plate || 'N/A',
              'Operador': opName,
              'Fecha y Hora Registro': recDateStr,
              'Categoría Sistema': rec.category,
              'Columna Base Datos': bucket,
              'Concepto': item.concept,
              'Monto ($)': Number(amount.toFixed(2)),
              'Litros': liters || '',
              'Odómetro': item.odometer || '',
              'Evidencia': evidenceUrl
            });
          });
        } else {
          const recTotal = Number(rec.total) || 0;
          totals.otros += recTotal;
          detailRows.push({
            'NO. Viaje': t.code,
            'ECO': unitEco,
            'Placas': t.plate || 'N/A',
            'Operador': opName,
            'Fecha y Hora Registro': recDateStr,
            'Categoría Sistema': rec.category,
            'Columna Base Datos': 'OTROS',
            'Concepto': 'Gasto registrado',
            'Monto ($)': Number(recTotal.toFixed(2)),
            'Litros': '',
            'Odómetro': '',
            'Evidencia': evidenceUrl
          });
        }
      });
    }

    const totalCasetas = totals.casetas + totals.casetasIave;

    // Destinos y Folio Cliente
    const destNames = t.destinations && t.destinations.length > 0
      ? t.destinations.map(d => d.name).filter(Boolean).join(', ')
      : (t.destination || '');
    const clienteDescargaStr = t.clienteDescarga?.trim()
      ? t.clienteDescarga
      : (t.destinations && t.destinations.length > 0
          ? t.destinations.map(d => d.destinationAddress || d.client || d.name).filter(Boolean).join(' | ')
          : (t.destination || ''));

    const extraTripNumbers = t.destinations
      ? t.destinations.map(d => d.tripNumber).filter(Boolean).join(', ')
      : '';
    const folioClienteStr = t.folioCliente?.trim()
      ? t.folioCliente
      : (extraTripNumbers || '');

    // Odómetros, KMs y Rendimiento
    const odomInicial = Number(t.odometerStart || 0);
    const odomFinal = Number(t.odometerEnd || 0);
    const hasOdomFormula = odomFinal > 0 && odomInicial > 0 && odomFinal >= odomInicial;
    const kmsRecorridos = hasOdomFormula
      ? (odomFinal - odomInicial)
      : (fuelDistanceSum > 0 ? fuelDistanceSum : 0);

    const rendimientoEsperado = t.rendimientoEsperado ?? unit?.expected_yield ?? '';
    const hasYieldFormula = kmsRecorridos > 0 && dieselRealLiters > 0;
    let rendimientoReal: number | string = '';
    if (hasYieldFormula) {
      rendimientoReal = Number((kmsRecorridos / dieselRealLiters).toFixed(2));
    } else if (fuelYields.length > 0) {
      const avg = fuelYields.reduce((a, b) => a + b, 0) / fuelYields.length;
      rendimientoReal = Number(avg.toFixed(2));
    }

    // Fecha Recibo de Bitácora (Fin de Viaje o Revisado)
    let fechaReciboBitacora = '';
    const reviewedEvt = (t.event_log || []).slice().reverse().find(e =>
      e.description?.toLowerCase().includes('revisado') ||
      e.description?.toLowerCase().includes('evidencias aprobadas')
    );
    if (t.stage_dates && t.stage_dates[6]) {
      fechaReciboBitacora = formatDateDMY(t.stage_dates[6]);
    } else if (t.stage_timestamps && t.stage_timestamps[6]) {
      fechaReciboBitacora = formatDateDMY(t.stage_timestamps[6]);
    } else if (reviewedEvt) {
      fechaReciboBitacora = formatDateDMY(reviewedEvt.timestamp || reviewedEvt.dateFormatted);
    }

    // Observaciones consolidadas
    const obsParts: string[] = [];
    if (t.observaciones?.trim()) obsParts.push(t.observaciones.trim());
    if (t.rejectionReason?.trim()) obsParts.push(`Motivo rechazo: ${t.rejectionReason.trim()}`);
    if (t.instructions?.trim()) obsParts.push(t.instructions.trim());
    const observacionesStr = obsParts.join(' | ');

    // Eventos para Hoja 3
    const tripEvents = buildFullTripEventLog(t, opName);
    tripEvents.forEach(evt => {
      auditEventsData.push({
        'Código de Viaje': t.code,
        'ECO': unitEco,
        'Placa': t.plate || 'N/A',
        'Fecha y Hora Exacta': evt.dateFormatted || formatFullDateTime(evt.timestamp),
        'Tipo de Evento': evt.eventType,
        'Usuario / Responsable': evt.user,
        'Descripción del Evento': evt.description,
        'Detalles': evt.details || ''
      });
    });

    masterRows.push({
      tripId: t.id,
      status: t.status,
      hasOdomFormula,
      hasYieldFormula,
      values: {
        'NO.': t.code,
        'FECHA CARGA': formatDateDMY(t.date || t.created_at),
        'HORA CARGA': t.appointment || '00:00',
        'CLIENTE': t.client || '',
        'PROYECTO': t.project || '',
        'FOLIO CLIENTE': folioClienteStr,
        'LUGAR DE CARGA O RECOLECCION': t.origin || '',
        'DESTINO': destNames,
        'CLIENTE DESCARGA': clienteDescargaStr,
        'LINEA': t.linea || 'TBS',
        'OPERADOR': opName,
        'ECO UNIDAD': unitEco,
        'TIPO UNIDAD CLIENTE': unitType,
        'PLACAS UNIDAD': t.plate || '',
        'VIATICOS': Number(totals.viaticos.toFixed(2)),
        'MANIOBRAS AUTORIZADAS': Number(totals.maniobras.toFixed(2)),
        'CASETAS': Number(totals.casetas.toFixed(2)),
        'CASETAS IAVE': Number(totals.casetasIave.toFixed(2)),
        'TOTAL CASETAS': Number(totalCasetas.toFixed(2)),
        'TRANSITO': Number(totals.transito.toFixed(2)),
        'ESTACIONAMIENTO': Number(totals.estacionamiento.toFixed(2)),
        'PERMISO / FITOSANITARIA': Number(totals.permisoFito.toFixed(2)),
        'HOTEL O PENSION': Number(totals.hotelPension.toFixed(2)),
        'TALACHA': Number(totals.talacha.toFixed(2)),
        'ESTADIAS': Number(totals.estadias.toFixed(2)),
        'OTROS': Number(totals.otros.toFixed(2)),
        'RENDIMIENTO': rendimientoEsperado !== '' ? Number(rendimientoEsperado) : '',
        'ODOMETRO INICIAL': odomInicial > 0 ? odomInicial : '',
        'ODOMETRO FINAL': odomFinal > 0 ? odomFinal : '',
        'KMS RECORRIDOS': kmsRecorridos > 0 ? Number(kmsRecorridos.toFixed(1)) : '',
        'DIESEL REAL CONSUMIDO': dieselRealLiters > 0 ? Number(dieselRealLiters.toFixed(2)) : '',
        'RENDIMIENTO REAL': rendimientoReal,
        'FECHA RECIBO DE BITACORA': fechaReciboBitacora,
        'OBSERVACIONES': observacionesStr
      }
    });
  });

  // Totales acumulados para fila final y vista previa
  const columnSums: Record<string, number> = {};
  MASTER_DB_CURRENCY_COLS.forEach(col => {
    columnSums[col] = masterRows.reduce((acc, r) => acc + (Number(r.values[col]) || 0), 0);
  });
  columnSums['KMS RECORRIDOS'] = masterRows.reduce((acc, r) => acc + (Number(r.values['KMS RECORRIDOS']) || 0), 0);
  columnSums['DIESEL REAL CONSUMIDO'] = masterRows.reduce((acc, r) => acc + (Number(r.values['DIESEL REAL CONSUMIDO']) || 0), 0);

  return { masterRows, detailRows, auditEventsData, columnSums };
};

export const exportMasterDatabaseExcel = async (
  trips: Trip[],
  operators: Operator[],
  units: Unit[] = [],
  dateRangeLabel?: string
) => {
  if (!trips || trips.length === 0) {
    alert('No hay registros de viajes disponibles para exportar en el período seleccionado.');
    return;
  }

  const { masterRows, detailRows, auditEventsData, columnSums } = buildMasterDatabaseRows(trips, operators, units);
  const cleanLabel = dateRangeLabel ? `_${dateRangeLabel.replace(/[^a-zA-Z0-9_-]/g, '_')}` : '';
  const fileName = `TBS_Base_de_Datos_Maestra${cleanLabel}_${getFormattedTimestamp()}.xlsx`;

  try {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'TBS Logistics Services';
    workbook.created = new Date();

    const thinBorder: Partial<ExcelJS.Borders> = {
      top: { style: 'thin', color: { argb: 'FF334155' } },
      left: { style: 'thin', color: { argb: 'FF334155' } },
      bottom: { style: 'thin', color: { argb: 'FF334155' } },
      right: { style: 'thin', color: { argb: 'FF334155' } }
    };

    const accountingFormat = '$#,##0.00;-$#,##0.00;"$ -"';

    // ==========================================
    // HOJA 1: BASE DE DATOS (34 COLUMNAS EXACTAS DEL FORMATO CLIENTE)
    // ==========================================
    const ws = workbook.addWorksheet('Base de Datos', {
      views: [{ state: 'frozen', ySplit: 1 }]
    });

    const headerRow = ws.addRow([...MASTER_DB_COLUMNS]);
    headerRow.height = 34;
    headerRow.eachCell((cell, colNumber) => {
      const colName = MASTER_DB_COLUMNS[colNumber - 1];
      let fontColor = 'FF0F172A';
      if (MASTER_DB_BLUE_HEADERS.has(colName)) fontColor = 'FF0070C0';
      else if (MASTER_DB_RED_HEADERS.has(colName)) fontColor = 'FFC00000';

      cell.font = { name: 'Arial', size: 9, bold: true, color: { argb: fontColor } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
      cell.border = {
        top: { style: 'medium', color: { argb: 'FF0F172A' } },
        bottom: { style: 'medium', color: { argb: 'FF0F172A' } },
        left: { style: 'thin', color: { argb: 'FF334155' } },
        right: { style: 'thin', color: { argb: 'FF334155' } }
      };
    });

    masterRows.forEach((rowObj, idx) => {
      const excelRowNum = idx + 2;
      const rowValues = MASTER_DB_COLUMNS.map(col => rowObj.values[col]);
      const dataRow = ws.addRow(rowValues);
      dataRow.height = 20;

      // Fórmulas vivas de Excel (TOTAL CASETAS = Q + R, KMS RECORRIDOS = AC - AB, RENDIMIENTO REAL = AD / AE)
      const totalCasetasVal = Number(rowObj.values['TOTAL CASETAS']) || 0;
      dataRow.getCell(19).value = {
        formula: `Q${excelRowNum}+R${excelRowNum}`,
        result: totalCasetasVal
      };

      if (rowObj.hasOdomFormula) {
        dataRow.getCell(30).value = {
          formula: `AC${excelRowNum}-AB${excelRowNum}`,
          result: Number(rowObj.values['KMS RECORRIDOS']) || 0
        };
      }

      if (rowObj.hasYieldFormula) {
        dataRow.getCell(32).value = {
          formula: `IF(AE${excelRowNum}>0,ROUND(AD${excelRowNum}/AE${excelRowNum},2),"")`,
          result: Number(rowObj.values['RENDIMIENTO REAL']) || 0
        };
      }

      dataRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        const colName = MASTER_DB_COLUMNS[colNumber - 1];
        const isCurrency = MASTER_DB_CURRENCY_COLS.has(colName);
        const isNumericCenter =
          colName === 'NO.' ||
          colName === 'FECHA CARGA' ||
          colName === 'HORA CARGA' ||
          colName === 'LINEA' ||
          colName === 'ECO UNIDAD' ||
          colName === 'PLACAS UNIDAD' ||
          colName === 'RENDIMIENTO' ||
          colName === 'ODOMETRO INICIAL' ||
          colName === 'ODOMETRO FINAL' ||
          colName === 'KMS RECORRIDOS' ||
          colName === 'DIESEL REAL CONSUMIDO' ||
          colName === 'RENDIMIENTO REAL' ||
          colName === 'FECHA RECIBO DE BITACORA';

        cell.font = { name: 'Arial', size: 9, color: { argb: 'FF0F172A' } };
        cell.border = thinBorder;

        if (isCurrency) {
          cell.numFmt = accountingFormat;
          cell.alignment = { horizontal: 'right', vertical: 'middle' };
        } else if (isNumericCenter) {
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        } else {
          cell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: false };
        }

        if (idx % 2 === 1) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDFEFF' } };
        }
      });
    });

    // Fila de TOTALES al pie con fórmulas SUM()
    const lastDataRow = masterRows.length + 1;
    const totalsRowValues = MASTER_DB_COLUMNS.map(col => (col === 'PLACAS UNIDAD' ? 'TOTALES' : ''));
    const totalsRow = ws.addRow(totalsRowValues);
    totalsRow.height = 24;

    const sumColLetters: { colIdx: number; letter: string; key: string; isCurrency: boolean }[] = [
      { colIdx: 15, letter: 'O', key: 'VIATICOS', isCurrency: true },
      { colIdx: 16, letter: 'P', key: 'MANIOBRAS AUTORIZADAS', isCurrency: true },
      { colIdx: 17, letter: 'Q', key: 'CASETAS', isCurrency: true },
      { colIdx: 18, letter: 'R', key: 'CASETAS IAVE', isCurrency: true },
      { colIdx: 19, letter: 'S', key: 'TOTAL CASETAS', isCurrency: true },
      { colIdx: 20, letter: 'T', key: 'TRANSITO', isCurrency: true },
      { colIdx: 21, letter: 'U', key: 'ESTACIONAMIENTO', isCurrency: true },
      { colIdx: 22, letter: 'V', key: 'PERMISO / FITOSANITARIA', isCurrency: true },
      { colIdx: 23, letter: 'W', key: 'HOTEL O PENSION', isCurrency: true },
      { colIdx: 24, letter: 'X', key: 'TALACHA', isCurrency: true },
      { colIdx: 25, letter: 'Y', key: 'ESTADIAS', isCurrency: true },
      { colIdx: 26, letter: 'Z', key: 'OTROS', isCurrency: true },
      { colIdx: 30, letter: 'AD', key: 'KMS RECORRIDOS', isCurrency: false },
      { colIdx: 31, letter: 'AE', key: 'DIESEL REAL CONSUMIDO', isCurrency: false }
    ];

    sumColLetters.forEach(({ colIdx, letter, key, isCurrency }) => {
      const cell = totalsRow.getCell(colIdx);
      cell.value = {
        formula: `SUM(${letter}2:${letter}${lastDataRow})`,
        result: Number((columnSums[key] || 0).toFixed(2))
      };
      if (isCurrency) {
        cell.numFmt = accountingFormat;
      } else {
        cell.numFmt = '#,##0.00';
      }
    });

    totalsRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const colName = MASTER_DB_COLUMNS[colNumber - 1];
      cell.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FF0F172A' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
      cell.border = {
        top: { style: 'medium', color: { argb: 'FF0F172A' } },
        bottom: { style: 'medium', color: { argb: 'FF0F172A' } },
        left: { style: 'thin', color: { argb: 'FF334155' } },
        right: { style: 'thin', color: { argb: 'FF334155' } }
      };
      if (MASTER_DB_CURRENCY_COLS.has(colName)) {
        cell.alignment = { horizontal: 'right', vertical: 'middle' };
      } else {
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      }
    });

    // Auto-ajuste generoso de columnas para evitar ### y celdas encimadas
    MASTER_DB_COLUMNS.forEach((colName, i) => {
      const isCurrency = MASTER_DB_CURRENCY_COLS.has(colName);
      const maxContent = Math.max(
        0,
        ...masterRows.map(r => {
          const v = r.values[colName];
          if (v === null || v === undefined) return 0;
          if (isCurrency) return formatAccountingMXN(v).length + 2;
          return String(v).length;
        })
      );
      const minW = isCurrency ? 15 : colName === 'OBSERVACIONES' ? 32 : 14;
      const headerW = Math.min(Math.ceil(colName.length * 1.05) + 4, 24);
      const contentW = Math.ceil(maxContent * 1.15) + 5;
      ws.getColumn(i + 1).width = Math.min(Math.max(minW, headerW, contentW), 65);
    });

    ws.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: MASTER_DB_COLUMNS.length }
    };

    // Helper para Hojas 2 y 3 (Detalle de Gastos y Auditoría)
    const addStyledAuxiliarySheet = (sheetTitle: string, rows: Record<string, any>[]) => {
      if (!rows || rows.length === 0) return;
      const headers = Object.keys(rows[0]);
      const auxWs = workbook.addWorksheet(sheetTitle, {
        views: [{ state: 'frozen', ySplit: 1 }]
      });
      const hRow = auxWs.addRow(headers);
      hRow.height = 26;
      hRow.eachCell(cell => {
        cell.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        cell.border = thinBorder;
      });
      rows.forEach(r => {
        const dRow = auxWs.addRow(headers.map(h => r[h]));
        dRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          const h = headers[colNumber - 1];
          cell.font = { name: 'Arial', size: 9, color: { argb: 'FF0F172A' } };
          cell.border = thinBorder;
          if (h && h.includes('($)') && typeof cell.value === 'number') {
            cell.numFmt = accountingFormat;
            cell.alignment = { horizontal: 'right', vertical: 'middle' };
          } else {
            cell.alignment = { horizontal: 'left', vertical: 'middle' };
          }
        });
      });
      headers.forEach((h, i) => {
        const isUrl = h.toLowerCase().includes('evidencia') || h.toLowerCase().includes('link');
        const maxLen = Math.max(
          h.length + 4,
          ...rows.map(r => (r[h] !== null && r[h] !== undefined ? String(r[h]).length : 0))
        );
        auxWs.getColumn(i + 1).width = Math.min(Math.max(Math.ceil(maxLen * 1.15) + 5, 14), isUrl ? 55 : 90);
      });
      auxWs.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: 1, column: headers.length }
      };
    };

    addStyledAuxiliarySheet('Detalle de Gastos', detailRows);
    addStyledAuxiliarySheet('Auditoría de Eventos', auditEventsData);

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (err) {
    console.error('Error generando Excel con ExcelJS, usando respaldo XLSX:', err);
    const plainRows = masterRows.map(r => r.values);
    const fallbackWb = XLSX.utils.book_new();
    const wsMaster = XLSX.utils.json_to_sheet(plainRows);
    formatExcelWorksheet(wsMaster, plainRows, MASTER_DB_CURRENCY_COLS);
    XLSX.utils.book_append_sheet(fallbackWb, wsMaster, 'Base de Datos');
    if (detailRows.length > 0) {
      const wsDetail = XLSX.utils.json_to_sheet(detailRows);
      formatExcelWorksheet(wsDetail, detailRows);
      XLSX.utils.book_append_sheet(fallbackWb, wsDetail, 'Detalle de Gastos');
    }
    if (auditEventsData.length > 0) {
      const wsAudit = XLSX.utils.json_to_sheet(auditEventsData);
      formatExcelWorksheet(wsAudit, auditEventsData);
      XLSX.utils.book_append_sheet(fallbackWb, wsAudit, 'Auditoría de Eventos');
    }
    XLSX.writeFile(fallbackWb, fileName);
  }
};

export const exportMasterDatabasePDF = (
  trips: Trip[],
  operators: Operator[],
  units: Unit[] = [],
  dateRangeLabel?: string
) => {
  if (!trips || trips.length === 0) {
    alert('No hay registros de viajes disponibles para exportar en el período seleccionado.');
    return;
  }

  const { masterRows, columnSums } = buildMasterDatabaseRows(trips, operators, units);

  // Formato A3 Horizontal (420mm x 297mm) para mostrar las 34 columnas completas sin encimarse
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a3' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // Encabezado institucional compacto
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageWidth, 16, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('TBS LOGISTICS SERVICES — BASE DE DATOS MAESTRA CONSOLIDADA (1 FILA POR VIAJE)', 8, 10);

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  const periodText = dateRangeLabel ? `Filtro: ${dateRangeLabel}  |  ` : '';
  doc.text(
    `${periodText}Generado: ${new Date().toLocaleString('es-MX')}  |  Total Viajes: ${masterRows.length}`,
    pageWidth - 8,
    10,
    { align: 'right' }
  );

  const head = [[...MASTER_DB_COLUMNS]];

  const body = masterRows.map(rowObj =>
    MASTER_DB_COLUMNS.map(col => {
      const val = rowObj.values[col];
      if (MASTER_DB_CURRENCY_COLS.has(col)) {
        return formatAccountingMXN(val);
      }
      return val !== null && val !== undefined ? String(val) : '';
    })
  );

  // Fila de totales al pie
  const totalsFooterRow = MASTER_DB_COLUMNS.map(col => {
    if (col === 'PLACAS UNIDAD') return 'TOTALES';
    if (MASTER_DB_CURRENCY_COLS.has(col)) {
      return formatAccountingMXN(columnSums[col] || 0);
    }
    if (col === 'KMS RECORRIDOS') {
      const v = columnSums['KMS RECORRIDOS'] || 0;
      return v > 0 ? v.toLocaleString('es-MX', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '';
    }
    if (col === 'DIESEL REAL CONSUMIDO') {
      const v = columnSums['DIESEL REAL CONSUMIDO'] || 0;
      return v > 0 ? v.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';
    }
    return '';
  });

  body.push(totalsFooterRow);

  const totalRowIndex = body.length - 1;

  // Anchos proporcionales que suman ~404mm (420mm - 16mm márgenes)
  const columnWidths: Record<number, { cellWidth: number; halign?: 'left' | 'center' | 'right' }> = {
    0: { cellWidth: 10, halign: 'center' },   // NO.
    1: { cellWidth: 11, halign: 'center' },   // FECHA CARGA
    2: { cellWidth: 8, halign: 'center' },    // HORA CARGA
    3: { cellWidth: 14, halign: 'left' },     // CLIENTE
    4: { cellWidth: 12, halign: 'left' },     // PROYECTO
    5: { cellWidth: 16, halign: 'left' },     // FOLIO CLIENTE
    6: { cellWidth: 15, halign: 'left' },     // LUGAR DE CARGA
    7: { cellWidth: 13, halign: 'left' },     // DESTINO
    8: { cellWidth: 16, halign: 'left' },     // CLIENTE DESCARGA
    9: { cellWidth: 7, halign: 'center' },    // LINEA
    10: { cellWidth: 18, halign: 'left' },    // OPERADOR
    11: { cellWidth: 8, halign: 'center' },   // ECO UNIDAD
    12: { cellWidth: 11, halign: 'center' },  // TIPO UNIDAD
    13: { cellWidth: 11, halign: 'center' },  // PLACAS
    14: { cellWidth: 10.5, halign: 'right' }, // VIATICOS
    15: { cellWidth: 11, halign: 'right' },   // MANIOBRAS
    16: { cellWidth: 10, halign: 'right' },   // CASETAS
    17: { cellWidth: 10, halign: 'right' },   // CASETAS IAVE
    18: { cellWidth: 10.5, halign: 'right' }, // TOTAL CASETAS
    19: { cellWidth: 10, halign: 'right' },   // TRANSITO
    20: { cellWidth: 10.5, halign: 'right' }, // ESTACIONAMIENTO
    21: { cellWidth: 10.5, halign: 'right' }, // PERMISO/FITO
    22: { cellWidth: 10, halign: 'right' },   // HOTEL/PENSION
    23: { cellWidth: 10, halign: 'right' },   // TALACHA
    24: { cellWidth: 10, halign: 'right' },   // ESTADIAS
    25: { cellWidth: 10, halign: 'right' },   // OTROS
    26: { cellWidth: 9, halign: 'center' },   // RENDIMIENTO
    27: { cellWidth: 11, halign: 'center' },  // ODOM INICIAL
    28: { cellWidth: 11, halign: 'center' },  // ODOM FINAL
    29: { cellWidth: 11, halign: 'center' },  // KMS RECORRIDOS
    30: { cellWidth: 11, halign: 'center' },  // DIESEL REAL
    31: { cellWidth: 10, halign: 'center' },  // REND REAL
    32: { cellWidth: 12, halign: 'center' },  // FECHA RECIBO
    33: { cellWidth: 26, halign: 'left' }     // OBSERVACIONES
  };

  autoTable(doc, {
    startY: 20,
    head,
    body,
    theme: 'grid',
    margin: { left: 8, right: 8, bottom: 12 },
    styles: {
      fontSize: 5.2,
      cellPadding: 1.1,
      lineColor: [71, 85, 105],
      lineWidth: 0.15,
      textColor: [15, 23, 42],
      overflow: 'linebreak',
      valign: 'middle'
    },
    headStyles: {
      fillColor: [248, 250, 252],
      textColor: [15, 23, 42],
      fontStyle: 'bold',
      fontSize: 4.8,
      halign: 'center',
      valign: 'middle',
      lineColor: [15, 23, 42],
      lineWidth: 0.25
    },
    columnStyles: columnWidths,
    didParseCell: (data) => {
      const colName = MASTER_DB_COLUMNS[data.column.index];
      if (data.section === 'head') {
        if (MASTER_DB_BLUE_HEADERS.has(colName)) {
          data.cell.styles.textColor = [0, 112, 192];
        } else if (MASTER_DB_RED_HEADERS.has(colName)) {
          data.cell.styles.textColor = [192, 0, 0];
        }
      }
      if (data.section === 'body' && data.row.index === totalRowIndex) {
        data.cell.styles.fillColor = [226, 232, 240];
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.lineWidth = 0.25;
      }
    },
    didDrawPage: () => {
      doc.setFontSize(6.5);
      doc.setTextColor(100, 116, 139);
      doc.text(
        `Página ${(doc as any).internal.getCurrentPageInfo().pageNumber}  |  TBS Logistics Services — Base de Datos Maestra`,
        pageWidth / 2,
        pageHeight - 5,
        { align: 'center' }
      );
    }
  });

  const cleanLabel = dateRangeLabel ? `_${dateRangeLabel.replace(/[^a-zA-Z0-9_-]/g, '_')}` : '';
  doc.save(`TBS_Base_de_Datos_Maestra${cleanLabel}_${getFormattedTimestamp()}.pdf`);
};

