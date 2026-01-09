/**
 * ConflictModal Component
 * Modal que muestra conflictos de horario y sugerencias alternativas
 */

'use client';

import { useState } from 'react';

interface TaskSummary {
  id: string;
  title: string;
  dueDate: string;
  priority: number;
}

interface SuggestedSlot {
  date: string;
  reason: string;
  dayLoad: 'light' | 'moderate' | 'heavy';
}

interface DayLoad {
  date: string;
  taskCount: number;
  level: 'light' | 'moderate' | 'heavy';
  tasks: TaskSummary[];
}

interface ScheduleAnalysis {
  conflicts: {
    hasConflicts: boolean;
    conflicts: TaskSummary[];
  };
  dayLoad: DayLoad;
  suggestions: SuggestedSlot[];
  warning: string | null;
  nonWorkingDayWarning: string | null;
}

interface ConflictModalProps {
  analysis: ScheduleAnalysis;
  originalDate: string;
  onSelectDate: (date: string) => void;
  onKeepOriginal: () => void;
  onCancel: () => void;
}

export function ConflictModal({
  analysis,
  originalDate,
  onSelectDate,
  onKeepOriginal,
  onCancel,
}: ConflictModalProps) {
  const [selectedSuggestion, setSelectedSuggestion] = useState<string | null>(null);

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('es-ES', { 
      weekday: 'long', 
      day: 'numeric', 
      month: 'short' 
    });
  };

  const formatDateTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('es-ES', { 
      weekday: 'short', 
      day: 'numeric', 
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getDayLoadColor = (level: 'light' | 'moderate' | 'heavy') => {
    switch (level) {
      case 'light': return 'text-green-400';
      case 'moderate': return 'text-amber-400';
      case 'heavy': return 'text-red-400';
    }
  };

  const getDayLoadBg = (level: 'light' | 'moderate' | 'heavy') => {
    switch (level) {
      case 'light': return 'bg-green-900/50 border-green-500/50 hover:bg-green-800/50';
      case 'moderate': return 'bg-amber-900/50 border-amber-500/50 hover:bg-amber-800/50';
      case 'heavy': return 'bg-red-900/50 border-red-500/50 hover:bg-red-800/50';
    }
  };

  const getDayLoadIcon = (level: 'light' | 'moderate' | 'heavy') => {
    switch (level) {
      case 'light': return '✓';
      case 'moderate': return '⚠';
      case 'heavy': return '✕';
    }
  };

  const handleApplySuggestion = () => {
    if (selectedSuggestion) {
      onSelectDate(selectedSuggestion);
    }
  };

  const hasConflicts = analysis.conflicts.hasConflicts;
  const isHeavyDay = analysis.dayLoad.level === 'heavy';
  const isNonWorkingDay = !!analysis.nonWorkingDayWarning;

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-[110]"
      onClick={onCancel}
    >
      <div
        className="bg-gray-700 rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden border border-gray-600"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`px-5 py-4 ${hasConflicts ? 'bg-red-600' : isNonWorkingDay ? 'bg-orange-600' : isHeavyDay ? 'bg-amber-600' : 'bg-blue-600'}`}>
          <div className="flex items-center gap-3">
            <span className="text-2xl">
              {hasConflicts ? '⚠️' : isNonWorkingDay ? '🚫' : isHeavyDay ? '📅' : 'ℹ️'}
            </span>
            <div>
              <h3 className="font-bold text-white text-lg">
                {hasConflicts ? 'Conflicto de horario' : isNonWorkingDay ? 'Día no laborable' : isHeavyDay ? 'Día muy cargado' : 'Análisis de agenda'}
              </h3>
              <p className="text-sm text-white/90">
                {formatDate(originalDate)} a las {formatTime(originalDate)}
              </p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          {/* Non-working day warning */}
          {isNonWorkingDay && (
            <div className="p-3 rounded-lg bg-orange-900/60 border border-orange-500">
              <p className="text-sm text-white font-medium">
                🚫 {analysis.nonWorkingDayWarning}
              </p>
              <p className="text-xs text-orange-200 mt-1">
                Has seleccionado un día no laborable. ¿Quieres continuar de todas formas?
              </p>
            </div>
          )}

          {/* Warning message */}
          {analysis.warning && (
            <div className={`p-3 rounded-lg ${hasConflicts ? 'bg-red-900/60 border border-red-500' : 'bg-amber-900/60 border border-amber-500'}`}>
              <p className="text-sm text-white">
                {analysis.warning}
              </p>
            </div>
          )}

          {/* Conflicting tasks */}
          {hasConflicts && (
            <div>
              <h4 className="text-sm font-semibold text-gray-200 mb-2">Tareas en conflicto:</h4>
              <div className="space-y-2">
                {analysis.conflicts.conflicts.map((task) => (
                  <div 
                    key={task.id}
                    className="flex items-center gap-2 p-3 bg-gray-600 rounded-lg border border-gray-500"
                  >
                    <span className="text-red-400 text-lg">●</span>
                    <span className="flex-1 text-sm truncate text-white">{task.title}</span>
                    <span className="text-sm text-gray-300 font-medium">{formatTime(task.dueDate)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Day overview */}
          {!hasConflicts && analysis.dayLoad.tasks.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-gray-200 mb-2">
                Tareas del día ({analysis.dayLoad.taskCount}):
              </h4>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {analysis.dayLoad.tasks.slice(0, 5).map((task) => (
                  <div 
                    key={task.id}
                    className="flex items-center gap-2 p-2 bg-gray-600 rounded text-sm"
                  >
                    <span className="text-gray-300">{formatTime(task.dueDate)}</span>
                    <span className="flex-1 truncate text-white">{task.title}</span>
                  </div>
                ))}
                {analysis.dayLoad.taskCount > 5 && (
                  <p className="text-xs text-gray-400 pl-2">
                    +{analysis.dayLoad.taskCount - 5} más...
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Suggestions */}
          {analysis.suggestions.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-gray-200 mb-2">Sugerencias:</h4>
              <div className="space-y-2">
                {analysis.suggestions.map((suggestion, index) => (
                  <label
                    key={index}
                    className={`flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all ${
                      selectedSuggestion === suggestion.date
                        ? 'bg-blue-600/40 border-blue-400'
                        : `${getDayLoadBg(suggestion.dayLoad)}`
                    }`}
                  >
                    <input
                      type="radio"
                      name="suggestion"
                      className="hidden"
                      checked={selectedSuggestion === suggestion.date}
                      onChange={() => setSelectedSuggestion(suggestion.date)}
                    />
                    <span className={`text-xl ${getDayLoadColor(suggestion.dayLoad)}`}>
                      {getDayLoadIcon(suggestion.dayLoad)}
                    </span>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-white">
                        {formatDateTime(suggestion.date)}
                      </p>
                      <p className="text-xs text-gray-300">{suggestion.reason}</p>
                    </div>
                    {selectedSuggestion === suggestion.date && (
                      <span className="text-blue-300 text-xl">✓</span>
                    )}
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 bg-gray-800 flex gap-3 border-t border-gray-600">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 bg-gray-600 hover:bg-gray-500 rounded-lg transition-colors text-sm font-medium text-white"
          >
            Cancelar
          </button>
          <button
            onClick={onKeepOriginal}
            className={`flex-1 px-4 py-2.5 rounded-lg transition-colors text-sm font-medium text-white ${
              hasConflicts 
                ? 'bg-red-600 hover:bg-red-500' 
                : isNonWorkingDay
                ? 'bg-orange-600 hover:bg-orange-500'
                : 'bg-amber-600 hover:bg-amber-500'
            }`}
          >
            {isNonWorkingDay ? 'Usar de todos modos' : 'Mantener'}
          </button>
          {selectedSuggestion && (
            <button
              onClick={handleApplySuggestion}
              className="flex-1 px-4 py-2.5 bg-blue-500 hover:bg-blue-400 rounded-lg transition-colors text-sm font-bold text-white"
            >
              Aplicar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
