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
  onTaskComplete?: (taskId: string) => void;
}

export default function CalendarView({ onTaskClick, onDateClick, onClose, onTaskComplete }: CalendarViewProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  // Completar tarea
  const handleCompleteTask = async (taskId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const api = (window as any).electronAPI;
      if (!api) return;
      await api.completeTask(taskId);
      // Remover de la lista local
      setTasks(prev => prev.filter(t => t.id !== taskId));
      // Notificar al padre si hay callback
      onTaskComplete?.(taskId);
    } catch (error) {
      console.error('Error completing task:', error);
    }
  };

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

  // Calcular nivel de carga del día
  const getDayLoadLevel = (taskCount: number): 'empty' | 'light' | 'moderate' | 'heavy' => {
    if (taskCount === 0) return 'empty';
    if (taskCount >= 5) return 'heavy';
    if (taskCount >= 3) return 'moderate';
    return 'light';
  };

  // Colores de indicador de carga
  const getDayLoadIndicator = (taskCount: number): string => {
    const level = getDayLoadLevel(taskCount);
    switch (level) {
      case 'heavy': return 'bg-red-500';
      case 'moderate': return 'bg-amber-500';
      case 'light': return 'bg-green-500';
      default: return '';
    }
  };

  // Borde del día según carga
  const getDayLoadBorder = (taskCount: number): string => {
    const level = getDayLoadLevel(taskCount);
    switch (level) {
      case 'heavy': return 'border-red-400 dark:border-red-500';
      case 'moderate': return 'border-amber-400 dark:border-amber-500';
      case 'light': return 'border-green-400 dark:border-green-500';
      default: return 'border-gray-200 dark:border-gray-700';
    }
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

            {/* Leyenda de carga */}
            <div className="hidden sm:flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400 ml-2">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-green-500"></span>
                1-2
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                3-4
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-red-500"></span>
                5+
              </span>
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
                  const loadLevel = getDayLoadLevel(dayTasks.length);
                  const loadIndicator = getDayLoadIndicator(dayTasks.length);
                  const loadBorder = !isToday(day) && dayTasks.length > 0 ? getDayLoadBorder(dayTasks.length) : '';
                  
                  return (
                    <div
                      key={index}
                      onClick={() => onDateClick?.(day)}
                      className={`
                        ${viewMode === 'month' ? 'min-h-[100px]' : 'h-full'}
                        p-2 border-2 rounded-lg relative
                        ${isToday(day) ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-400 dark:border-blue-500' : loadBorder || 'border-gray-200 dark:border-gray-700'}
                        ${isOtherMonth ? 'bg-gray-50 dark:bg-gray-800/50' : 'bg-white dark:bg-gray-800'}
                        ${past ? 'opacity-60' : ''}
                        hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer transition-colors
                      `}
                    >
                      {/* Indicador de carga en esquina */}
                      {loadIndicator && !past && (
                        <div className={`absolute top-1 right-1 w-2.5 h-2.5 rounded-full ${loadIndicator}`} 
                             title={`${dayTasks.length} tareas - ${loadLevel === 'heavy' ? 'Muy cargado' : loadLevel === 'moderate' ? 'Moderado' : 'Ligero'}`}
                        />
                      )}
                      
                      {/* Day number */}
                      <div className={`
                        text-sm font-medium mb-1 flex items-center gap-1
                        ${isToday(day) ? 'text-blue-600 dark:text-blue-400' : ''}
                        ${isOtherMonth ? 'text-gray-400 dark:text-gray-600' : 'text-gray-700 dark:text-gray-300'}
                      `}>
                        {day.getDate()}
                        {dayTasks.length > 0 && (
                          <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                            loadLevel === 'heavy' ? 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300' :
                            loadLevel === 'moderate' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300' :
                            'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300'
                          }`}>
                            {dayTasks.length}
                          </span>
                        )}
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
                              text-xs p-1 rounded cursor-pointer flex items-center gap-1
                              ${task.project?.color ? '' : 'bg-gray-100 dark:bg-gray-700'}
                              hover:opacity-80 transition-opacity group
                            `}
                            style={task.project?.color ? { backgroundColor: task.project.color + '30' } : {}}
                            title={task.title}
                          >
                            {/* Checkbox para completar */}
                            <button
                              onClick={(e) => handleCompleteTask(task.id, e)}
                              className="flex-shrink-0 w-3.5 h-3.5 rounded-full border border-gray-400 dark:border-gray-500 hover:border-green-500 hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors flex items-center justify-center"
                              title="Marcar como completada"
                            >
                              <span className="opacity-0 group-hover:opacity-100 text-green-500 text-[8px]">✓</span>
                            </button>
                            <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${getPriorityColor(task.priority)}`}></span>
                            <span className="truncate">{task.title}</span>
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
