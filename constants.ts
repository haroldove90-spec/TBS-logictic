
import { ReportOption, Trip, TripStatus, TripStageDef, Operator } from './types';

export const TRIP_STAGES: TripStageDef[] = [
  { key: 'START_TRIP', label: 'Comenzando viaje', order: 1 },
  { key: 'ARRIVING_LOAD', label: 'Llegando a cargar', order: 2 },
  { key: 'LOADED', label: 'Cargado', order: 3 },
  { key: 'START_DEST_2', label: 'INICIAR DESTINO 2', order: 4 },
  { key: 'WITH_CLIENT', label: 'Con cliente', order: 5 },
  { key: 'UNLOADED', label: 'Descargado', order: 6 },
  { key: 'END_TRIP', label: 'Fin de viaje', order: 7 },
];

export const DESTINATION_STAGES: TripStageDef[] = [
  { key: 'DEST_ARRIVING', label: 'Llegando', order: 1 },
  { key: 'DEST_LOADED', label: 'Cargado', order: 2 },
  { key: 'DEST_IN_TRANSIT', label: 'En Tránsito', order: 3 },
  { key: 'DEST_DELIVERED', label: 'Entregado', order: 4 },
];

export const MOCK_OPERATORS: Operator[] = [
  { id: 'OP-01', name: 'Roberto Flores', plate: '52-AK-8F', status: 'AVAILABLE' },
  { id: 'OP-02', name: 'Juan Pérez', plate: '88-UE-1A', status: 'BUSY' },
  { id: 'OP-03', name: 'Carlos Ruiz', plate: 'XA-20-99', status: 'AVAILABLE' },
  { id: 'OP-04', name: 'Miguel Ángel', plate: 'BB-11-22', status: 'MAINTENANCE' },
];

// Se eliminan los registros de prueba para evitar conflictos de UUID (Error 22P02)
// Ahora la aplicación iniciará limpia para registrar datos reales.
export const MOCK_TRIPS: Trip[] = [];

export const REPORT_OPTIONS: ReportOption[] = [
  { id: 'TRAFFIC', label: 'Tráfico Pesado' },
  { id: 'ACCIDENT', label: 'Accidente en Vía' },
  { id: 'WEATHER', label: 'Mal Clima' },
  { id: 'MECHANICAL', label: 'Falla Mecánica' },
  { id: 'FUEL', label: 'Carga de Combustible' },
  { id: 'FOOD', label: 'Alimentos' },
  { id: 'REST', label: 'Descanso' },
  { id: 'POLICE', label: 'Retén / Inspección' },
];
