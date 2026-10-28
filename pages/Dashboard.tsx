
import React from 'react';
import { Trip, User, TripStatus } from '../types';
import { MapPin, Truck, ArrowRight, Clock, Briefcase, Bell } from 'lucide-react';

interface DashboardProps {
  trips: Trip[];
  onSelectTrip: (trip: Trip) => void;
  user: User | null;
  onAcceptAndStart: (trip: Trip) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ trips, onSelectTrip, user, onAcceptAndStart }) => {
  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Bitácoras Asignadas</h2>
        <p className="text-gray-500 font-medium">TBS Logistics Services | Bienvenido, {user?.name}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-2">
        {trips.map((trip) => (
          <div 
            key={trip.id}
            onClick={() => {
              if (trip.status !== TripStatus.PENDING_ACCEPTANCE) {
                onSelectTrip(trip);
              }
            }}
            className={`bg-white rounded-xl shadow-sm border border-gray-100 p-5 hover:shadow-md transition-all group relative overflow-hidden ${
              trip.status === TripStatus.PENDING_ACCEPTANCE ? 'cursor-default' : 'cursor-pointer'
            }`}
          >
            {/* Status Indicator Bar */}
            <div className={`absolute left-0 top-0 bottom-0 w-1.5 
              ${trip.status === TripStatus.IN_TRANSIT ? 'bg-indigo-500' : 
                trip.status === TripStatus.COMPLETED ? 'bg-slate-400' :
                trip.status === TripStatus.INCIDENT ? 'bg-red-500' : 
                trip.status === TripStatus.PENDING_ACCEPTANCE ? 'bg-amber-400' : 'bg-blue-500'}`} 
            />

            <div className="flex justify-between items-start mb-4 pl-3">
              <div>
                <span className="inline-block px-2 py-1 bg-gray-100 text-gray-600 text-xs font-semibold rounded mb-1">
                  {trip.code}
                </span>
                <h3 className="font-bold text-lg text-gray-900 leading-tight">{trip.client}</h3>
                <div className="flex items-center text-xs text-blue-600 mt-1 font-medium">
                    <Briefcase className="h-3 w-3 mr-1" />
                    {trip.project}
                </div>
              </div>
              <span className={`px-3 py-1 rounded-full text-xs font-medium border flex items-center
                ${trip.status === TripStatus.IN_TRANSIT 
                  ? 'bg-indigo-50 text-indigo-700 border-indigo-200' 
                  : trip.status === TripStatus.COMPLETED
                    ? 'bg-slate-100 text-slate-600 border-slate-200'
                  : trip.status === TripStatus.INCIDENT
                    ? 'bg-red-50 text-red-700 border-red-200 animate-pulse'
                  : trip.status === TripStatus.PENDING_ACCEPTANCE
                        ? 'bg-amber-50 text-amber-700 border-amber-200 animate-bounce'
                        : 'bg-blue-50 text-blue-700 border-blue-200'}`}>
                {trip.status === TripStatus.PENDING_ACCEPTANCE && <Bell className="h-3 w-3 mr-1" />}
                {trip.status === TripStatus.INCIDENT ? 'En Curso' : trip.status}
              </span>
            </div>

            <div className="space-y-3 pl-3">
              <div className="flex items-center text-gray-600">
                <div className="w-8 flex justify-center mr-2">
                    <div className="h-2 w-2 rounded-full bg-blue-500"></div>
                </div>
                <span className="text-sm font-medium">{trip.origin}</span>
              </div>
              
              {/* Dotted line connector */}
              <div className="absolute left-[26px] top-[110px] h-6 border-l border-dashed border-gray-300"></div>

              <div className="flex items-center text-gray-600">
                <div className="w-8 flex justify-center mr-2">
                    <MapPin className="h-4 w-4 text-red-500" />
                </div>
                <span className="text-sm font-medium">{trip.destination}</span>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-gray-50 flex justify-between items-center pl-3">
              <div className="flex space-x-4 text-xs text-gray-500">
                <div className="flex items-center">
                  <Clock className="h-3 w-3 mr-1" />
                  {trip.appointment}
                </div>
                <div className="flex items-center">
                  <Truck className="h-3 w-3 mr-1" />
                  {trip.plate}
                </div>
              </div>
              {trip.status !== TripStatus.PENDING_ACCEPTANCE && (
                <ArrowRight className="h-5 w-5 text-gray-300 group-hover:text-blue-600 group-hover:translate-x-1 transition-all" />
              )}
            </div>
            
            {/* BOTÓN DE ACEPTACIÓN CONDICIONAL */}
            {trip.status === TripStatus.PENDING_ACCEPTANCE && (
              <div className="mt-4 pt-4 border-t border-gray-100 pl-3">
                <button
                  onClick={(e) => {
                    e.stopPropagation(); // Previene que el click en la tarjeta navegue
                    onAcceptAndStart(trip);
                  }}
                  className="w-full bg-yellow-400 text-black font-bold py-4 px-4 rounded-xl shadow-lg border-b-4 border-yellow-600 hover:bg-yellow-300 active:translate-y-1 active:border-b-0 transition-all text-sm uppercase tracking-wider"
                >
                  ACEPTAR VIAJE PARA COMENZAR
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
