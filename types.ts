

import { LucideIcon } from 'lucide-react';

export interface User {
  id: string;
  name: string;
  role: 'OPERATOR' | 'ADMIN';
  plate?: string; 
}

export interface Operator {
  id: string;
  name: string;
  username?: string;
  password?: string;
  license_number?: string;
  unit_number?: string;
  plate?: string;
  status: 'AVAILABLE' | 'BUSY' | 'MAINTENANCE';
  role?: 'OPERATOR' | 'ADMIN';
}

export type TripStageKey = 
  | 'START_TRIP' 
  | 'ARRIVING_LOAD' 
  | 'LOADED' 
  | 'START_DEST_2'
  | 'WITH_CLIENT' 
  | 'UNLOADED' 
  | 'END_TRIP';

export interface TripStageDef {
  key: string;
  label: string;
  order: number;
}

export enum TripStatus {
  PENDING_ACCEPTANCE = 'Por Aceptar', 
  ACCEPTED = 'Confirmado',
  ASSIGNED = 'Asignado',
  IN_TRANSIT = 'En Curso',
  COMPLETED = 'Completado',
  DELAYED = 'Retrasado',
  INCIDENT = 'Incidencia'
}

export type EvidenceStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'NONE';

export interface Evidence {
  id: string;
  tripId: string;
  destinationId?: string; 
  stageIndex: number;
  url: string; 
  fileName: string; 
  path: string; 
  timestamp: number;
  lat?: number;
  lng?: number;
}

export interface LocationReport {
  id: string;
  lat: number;
  lng: number;
  timestamp: number;
  type: 'CHECKIN' | 'GAS' | 'ARRIVAL' | 'VALIDATION'; 
  label: string; 
  isOutOfRange?: boolean; 
  distanceToTarget?: number; 
}

export interface TripDestination {
  id: string;
  name: string;
  mapsLink?: string;
  destinationAddress?: string;
  currentStageIndex: number; 
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';
  client?: string;
  origin?: string;
  date?: string;
  appointment?: string;
  instructions?: string; 
  instructions_pdf_url?: string;
  tripNumber?: string;
}

// --- TIPOS PARA GASTOS ---
export type ExpenseCategory = 'OPERATIVO' | 'GASTOS' | 'MANTENIMIENTO';

export interface ExpenseItem {
  concept: string;
  amount: number;
  odometer?: number;
  liters?: number;
  pricePerLiter?: number;
  initialOdometer?: number;
  performance?: string;
}

export interface ExpenseRecord {
  id: string;
  category: ExpenseCategory;
  items: ExpenseItem[];
  total: number;
  timestamp: number;
  evidence?: Evidence[];
}
// -------------------------

export interface Trip {
  id: string;
  code: string;
  origin: string;
  originAddress?: string;
  originMapsLink?: string;
  originLat?: number;
  originLng?: number;
  
  destination: string; 
  destinationMapsLink?: string;
  destinations: TripDestination[]; 
  
  destinationLat?: number; 
  destinationLng?: number;

  client: string;
  project: string;
  appointment: string;
  instructions?: string;
  indicaciones_pdf_url?: string; 
  status: TripStatus;
  date: string;
  cargoType: string;
  plate: string;
  operator_id?: string;
  currentStageIndex: number; 
  hasIncident: boolean;
  
  evidence: Evidence[]; 
  evidenceStatus: EvidenceStatus;
  rejectionReason?: string;

  locationHistory: LocationReport[];
  extraCosts: ExpenseRecord[]; 
  
  odometerStart?: number;
  odometerEnd?: number;
  odometerAnterior?: number;
  
  gastosDepositados?: number;
  combustibleAsignado?: number;
  precioPorLitro?: number;
  costoTotalCombustible?: number;
  kmEstimados?: number;
}

export interface ReportOption {
  id: string;
  label: string;
  icon?: string;
}

// --- NOTIFICACIONES ---
export interface AppNotification {
  id: string;
  target_role: 'ADMIN' | 'OPERATOR' | 'ALL';
  target_user_id?: string;
  title: string;
  message: string;
  type: 'success' | 'alert' | 'info';
  is_read: boolean;
  created_at: string;
  metadata?: {
    trip_id?: string;
    image_url?: string;
    extra_info?: string;
    [key: string]: any;
  };
}

export interface Unit {
    id: string;
    eco: string;
    plate: string;
    type: string;
    box_type: string;
    status: 'AVAILABLE' | 'BUSY' | 'MAINTENANCE';
    current_odometer?: number;
}