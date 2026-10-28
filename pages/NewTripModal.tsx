import React from 'react';
import { Trip } from '../types';
import { Bell } from 'lucide-react';

interface NewTripModalProps {
  trip: Trip;
  onAccept: (trip: Trip) => void;
}

export const NewTripModal: React.FC<NewTripModalProps> = ({ trip, onAccept }) => {
  return (
    <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center p-4 animate-in fade-in duration-300">
      <div className="w-full max-w-sm mx-auto text-center animate-in zoom-in-95 duration-300">
        <Bell className="h-16 w-16 text-yellow-400 mx-auto mb-6 animate-pulse" />
        <h1 className="text-4xl font-black text-white uppercase tracking-tight leading-none mb-8">
          NUEVO VIAJE DETECTADO
        </h1>
        <button
          onClick={() => onAccept(trip)}
          className="w-full bg-yellow-400 text-black font-bold text-xl py-5 rounded-xl shadow-2xl border-b-4 border-yellow-600 active:translate-y-1 active:border-b-0 transition-all"
        >
          ACEPTAR Y COMENZAR MONITOR
        </button>
      </div>
    </div>
  );
};
