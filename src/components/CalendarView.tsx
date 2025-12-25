/**
 * CalendarView Component
 * Vista de calendario mensual/semanal para visualizar tareas
 * Fase 7
 */

'use client';

import { useState, useEffect, useCallback } from 'react';

interface Task {
  id: string;
  title: string;
  notes: string | null;
  dueDate: string | null;
  completedAt: string | null;
  priority: number;
  isWaitingFor: boolean;
  project: { id: string; name: string; color: string } | null;
}

type ViewMode = 'month' | 'week';

interface CalendarViewProps {
  onTaskClick?: (task: Task) => void;
  onDateClick?: (date: Date) => void;
  onClose?: () => void;
}

export default function CalendarView({ onTaskClick, onDateClick, onClose }: CalendarViewProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  // Cargar todas las tareas
  const fetchTasks = useCallback(async () => {
    try {
      setLoading(true);
      const api = (window as any).electronAPI;
      if (!api) return;
      
      // Obtener todas las tareas (no completadas)
      const allTasks = await api.getAllTasks();
      setTasks(allTasks.filter((t: Task) => !t.completedAt));
    } catch (error) {
      console.error('Error fetching tasks:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  // Helpers de fecha
  const getMonthDays = (date: Date): Date[] => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    
    const days: Date[] = [];
    
    // Días del mes anterior para completar la primera semana
    const startPadding = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1; // Lunes = 0
    for (let i = startPadding; i > 0; i--) {
      days.push(new Date(year, month, 1 - i));
    }
    
    // Días del mes actual
    for (let i = 1; i <= lastDay.getDate(); i++) {
      days.push(new Date(year, month, i));
    }
    
    // Días del mes siguiente para completar la última semana
    const endPadding = 42 - days.length; // 6 semanas x 7 días
    for (let i = 1; i <= endPadding; i++) {
      days.push(new Date(year, month + 1, i));
    }
    
    return days;
  };

  const getWeekDays = (date: Date): Date[] => {
    const days: Date[] = [];
    const dayOfWeek = date.getDay();
    const monday = new Date(date);
    monday.setDate(date.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
    
    for (let i = 0; i < 7; i++) {
      const day = new Date(monday);
      day.setDate(monday.getDate() + i);
      days.push(day);
    }
    
    return days;
  };

  const getTasksForDate = (date: Date): Task[] => {
    return tasks.filter(task => {
      if (!task.dueDate) return false;
      const taskDate = new Date(task.dueDate);
      return (
        taskDate.getFullYear() === date.getFullYear() &&
        taskDate.getMonth() === date.getMonth() &&
        taskDate.getDate() === date.getDate()
      );
    });
  };

  const isToday = (date: Date): boolean => {
    const today = new Date();
    return (
      date.getFullYear() === today.getFullYear() &&
      date.getMonth() === today.getMonth() &&
      date.getDate() === today.getDate()
    );
  };

  const isCurrentMonth = (date: Date): boolean => {
    return date.getMonth() === currentDate.getMonth();
  };

  const isPastDate = (date: Date): boolean => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const compareDate = new Date(date);
    compareDate.setHours(0, 0, 0, 0);
    return compareDate < today;
  };

  // Navegación
  const goToPrevious = () => {
    const newDate = new Date(currentDate);
    if (viewMode === 'month') {
      newDate.setMonth(newDate.getMonth() - 1);
    } else {
      newDate.setDate(newDate.getDate() - 7);
    }
    setCurrentDate(newDate);
  };

  const goToNext = () => {
    const newDate = new Date(currentDate);
    if (viewMode === 'month') {
      newDate.setMonth(newDate.getMonth() + 1);
    } else {
      newDate.setDate(newDate.getDate() + 7);
    }
    setCurrentDate(newDate);
  };

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  // Formato de fecha
  const formatMonthYear = (date: Date): string => {
    return date.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
  };

  const formatWeekRange = (date: Date): string => {
    const days = getWeekDays(date);
    const start = days[0];
    const end = days[6];
    
    if (start.getMonth() === end.getMonth()) {
      return `${start.getDate()} - ${end.getDate()} ${start.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}`;
    }
    return `${start.getDate()} ${start.toLocaleDateString('es-ES', { month: 'short' })} - ${end.getDate()} ${end.toLocaleDateString('es-ES', { month: 'short', year: 'numeric' })}`;
  };

  const dayNames = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

  const days = viewMode === 'month' ? getMonthDays(currentDate) : getWeekDays(currentDate);

  const getPriorityColor = (priority: number): string => {
    switch (priority) {
      case 3: return 'bg-red-500';
      case 2: return 'bg-yellow-500';
      case 1: return 'bg-blue-500';
      default: return 'bg-gray-400';
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-4">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
              📅 Calendario
            </h2>
            
            {/* View mode toggle */}
            <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
              <button
                onClick={() => setViewMode('month')}
                className={`px-3 py-1 rounded text-sm transition-colors ${
                  viewMode === 'month'
                    ? 'bg-white dark:bg-gray-600 shadow text-gray-900 dark:text-white'
                    : 'text-gray-600 dark:text-gray-400'
                }`}
              >
                Mes
              </button>
              <button
                onClick={() => setViewMode('week')}
                className={`px-3 py-1 rounded text-sm transition-colors ${
                  viewMode === 'week'
                    ? 'bg-white dark:bg-gray-600 shadow text-gray-900 dark:text-white'
                    : 'text-gray-600 dark:text-gray-400'
                }`}
              >
                Semana
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={goToToday}
              className="px-3 py-1.5 text-sm bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded-lg hover:bg-blue-200 dark:hover:bg-blue-800 transition-colors"
            >
              Hoy
            </button>
            <button
              onClick={goToPrevious}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              ◀
            </button>
            <span className="text-lg font-medium text-gray-900 dark:text-white min-w-[200px] text-center">
              {viewMode === 'month' ? formatMonthYear(currentDate) : formatWeekRange(currentDate)}
            </span>
            <button
              onClick={goToNext}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              ▶
            </button>
            
            {onClose && (
              <button
                onClick={onClose}
                className="ml-4 p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Calendar Grid */}
        <div className="flex-1 overflow-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
            </div>
          ) : (
            <>
              {/* Day names header */}
              <div className="grid grid-cols-7 gap-1 mb-2">
                {dayNames.map(day => (
                  <div
                    key={day}
                    className="text-center text-sm font-medium text-gray-500 dark:text-gray-400 py-2"
                  >
                    {day}
                  </div>
                ))}
              </div>

              {/* Calendar cells */}
              <div className={`grid grid-cols-7 gap-1 ${viewMode === 'week' ? 'h-[500px]' : ''}`}>
                {days.map((day, index) => {
                  const dayTasks = getTasksForDate(day);
                  const isOtherMonth = !isCurrentMonth(day);
                  const past = isPastDate(day) && !isToday(day);
                  
                  return (
                    <div
                      key={index}
                      onClick={() => onDateClick?.(day)}
                      className={`
                        ${viewMode === 'month' ? 'min-h-[100px]' : 'h-full'}
                        p-2 border border-gray-200 dark:border-gray-700 rounded-lg
                        ${isToday(day) ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700' : ''}
                        ${isOtherMonth ? 'bg-gray-50 dark:bg-gray-800/50' : 'bg-white dark:bg-gray-800'}
                        ${past ? 'opacity-60' : ''}
                        hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer transition-colors
                      `}
                    >
                      {/* Day number */}
                      <div className={`
                        text-sm font-medium mb-1
                        ${isToday(day) ? 'text-blue-600 dark:text-blue-400' : ''}
                        ${isOtherMonth ? 'text-gray-400 dark:text-gray-600' : 'text-gray-700 dark:text-gray-300'}
                      `}>
                        {day.getDate()}
                      </div>
                      
                      {/* Tasks */}
                      <div className="space-y-1">
                        {dayTasks.slice(0, viewMode === 'month' ? 3 : 10).map(task => (
                          <div
                            key={task.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              onTaskClick?.(task);
                            }}
                            className={`
                              text-xs p-1 rounded truncate cursor-pointer
                              ${task.project?.color ? '' : 'bg-gray-100 dark:bg-gray-700'}
                              hover:opacity-80 transition-opacity
                            `}
                            style={task.project?.color ? { backgroundColor: task.project.color + '30' } : {}}
                            title={task.title}
                          >
                            <span className={`inline-block w-2 h-2 rounded-full mr-1 ${getPriorityColor(task.priority)}`}></span>
                            {task.title}
                          </div>
                        ))}
                        {dayTasks.length > (viewMode === 'month' ? 3 : 10) && (
                          <div className="text-xs text-gray-500 dark:text-gray-400 text-center">
                            +{dayTasks.length - (viewMode === 'month' ? 3 : 10)} más
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Footer with legend */}
        <div className="flex items-center justify-between p-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 rounded-b-xl">
          <div className="flex items-center gap-4 text-xs text-gray-600 dark:text-gray-400">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-red-500"></span> Alta
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-yellow-500"></span> Media
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-blue-500"></span> Baja
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-gray-400"></span> Sin prioridad
            </span>
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {tasks.length} tareas pendientes
          </div>
        </div>
      </div>
    </div>
  );
}
