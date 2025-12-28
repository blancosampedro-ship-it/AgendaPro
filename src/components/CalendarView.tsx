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

type ViewMode = 'month' | 'week' | 'day';

interface CalendarViewProps {
  onTaskClick?: (task: Task) => void;
  onDateClick?: (date: Date) => void;
  onClose?: () => void;
  onTaskComplete?: (taskId: string) => void;
}

export default function CalendarView({ onTaskClick, onDateClick, onClose, onTaskComplete }: CalendarViewProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [previousView, setPreviousView] = useState<'month' | 'week'>('month');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
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
    if (viewMode === 'day') {
      const newDate = new Date(selectedDate);
      newDate.setDate(newDate.getDate() - 1);
      setSelectedDate(newDate);
      return;
    }
    const newDate = new Date(currentDate);
    if (viewMode === 'month') {
      newDate.setMonth(newDate.getMonth() - 1);
    } else {
      newDate.setDate(newDate.getDate() - 7);
    }
    setCurrentDate(newDate);
  };

  const goToNext = () => {
    if (viewMode === 'day') {
      const newDate = new Date(selectedDate);
      newDate.setDate(newDate.getDate() + 1);
      setSelectedDate(newDate);
      return;
    }
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
    if (viewMode === 'day') {
      setSelectedDate(new Date());
    }
  };

  // Ir a vista de día
  const goToDayView = (date: Date) => {
    setPreviousView(viewMode === 'day' ? previousView : viewMode as 'month' | 'week');
    setSelectedDate(date);
    setViewMode('day');
    // No llamamos onDateClick aquí - eso es para crear tarea nueva, no para navegar
  };

  // Volver a vista anterior
  const goBackFromDayView = () => {
    setViewMode(previousView);
    setCurrentDate(selectedDate); // Mantener el mes/semana del día seleccionado
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

  const formatDayDate = (date: Date): string => {
    return date.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  };

  const dayNames = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

  const days = viewMode === 'month' ? getMonthDays(currentDate) : viewMode === 'week' ? getWeekDays(currentDate) : [];
  const dayTasks = viewMode === 'day' ? getTasksForDate(selectedDate) : [];

  const getPriorityColor = (priority: number): string => {
    switch (priority) {
      case 3: return 'bg-red-500';
      case 2: return 'bg-yellow-500';
      case 1: return 'bg-blue-500';
      default: return 'bg-gray-400';
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-4">
            {/* Botón Volver (solo en vista día) */}
            {viewMode === 'day' ? (
              <button
                onClick={goBackFromDayView}
                className="flex items-center gap-1 px-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                ← Volver
              </button>
            ) : null}
            
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
              📅 {viewMode === 'day' ? 'Vista de Día' : 'Calendario'}
            </h2>
            
            {/* View mode toggle (oculto en vista día) */}
            {viewMode !== 'day' && (
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
            )}

            {/* Leyenda de carga (oculta en vista día) */}
            {viewMode !== 'day' && (
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
            )}
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
            <span className="text-lg font-medium text-gray-900 dark:text-white min-w-[200px] text-center capitalize">
              {viewMode === 'month' ? formatMonthYear(currentDate) : viewMode === 'week' ? formatWeekRange(currentDate) : formatDayDate(selectedDate)}
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
        <div className="flex-1 overflow-auto p-4 relative">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
            </div>
          ) : viewMode === 'day' ? (
            /* Vista de Día - Diseño por bloques horarios */
            <div className="space-y-6 pb-16">
              {(() => {
                // Clasificar tareas por bloque horario
                const getTimeBlock = (task: Task): 'morning' | 'afternoon' | 'night' | 'notime' => {
                  if (!task.dueDate) return 'notime';
                  const hour = new Date(task.dueDate).getHours();
                  if (hour >= 6 && hour < 12) return 'morning';
                  if (hour >= 12 && hour < 18) return 'afternoon';
                  if (hour >= 18 && hour < 24) return 'night';
                  return 'morning'; // 0-5 se considera mañana temprana
                };

                const sortByTime = (a: Task, b: Task) => {
                  if (!a.dueDate && !b.dueDate) return 0;
                  if (!a.dueDate) return 1;
                  if (!b.dueDate) return -1;
                  return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
                };

                const blocks = [
                  { key: 'morning', icon: '☀️', label: 'Mañana', sublabel: '6:00 - 11:59', tasks: dayTasks.filter(t => getTimeBlock(t) === 'morning').sort(sortByTime) },
                  { key: 'afternoon', icon: '🌤️', label: 'Tarde', sublabel: '12:00 - 17:59', tasks: dayTasks.filter(t => getTimeBlock(t) === 'afternoon').sort(sortByTime) },
                  { key: 'night', icon: '🌙', label: 'Noche', sublabel: '18:00 - 23:59', tasks: dayTasks.filter(t => getTimeBlock(t) === 'night').sort(sortByTime) },
                  { key: 'notime', icon: '📭', label: 'Sin hora asignada', sublabel: '', tasks: dayTasks.filter(t => getTimeBlock(t) === 'notime').sort(sortByTime) },
                ];

                // Filtrar bloques que tienen tareas o mostrar todos si no hay ninguna
                const hasAnyTasks = dayTasks.length > 0;

                return blocks.map(block => (
                  <div key={block.key} className="space-y-2">
                    {/* Header del bloque */}
                    <div className="flex items-center gap-2 pb-2 border-b border-gray-200 dark:border-gray-700">
                      <span className="text-xl">{block.icon}</span>
                      <span className="font-semibold text-gray-900 dark:text-white">{block.label}</span>
                      {block.sublabel && (
                        <span className="text-xs text-gray-500 dark:text-gray-400">({block.sublabel})</span>
                      )}
                      <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400">
                        {block.tasks.length}
                      </span>
                    </div>

                    {/* Tareas del bloque */}
                    {block.tasks.length === 0 ? (
                      <div className="text-center py-4 text-gray-400 dark:text-gray-500 text-sm italic">
                        Sin tareas programadas
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {block.tasks.map(task => (
                          <div
                            key={task.id}
                            onClick={() => onTaskClick?.(task)}
                            className="flex gap-3 p-3 rounded-lg cursor-pointer transition-all hover:shadow-md hover:scale-[1.01]"
                            style={{ 
                              backgroundColor: task.project?.color ? task.project.color + '15' : 'rgb(249 250 251)',
                              borderLeft: `4px solid ${task.project?.color || '#9CA3AF'}`
                            }}
                          >
                            {/* Hora */}
                            <div className="flex-shrink-0 w-12 text-center">
                              {task.dueDate ? (
                                <span className="text-sm font-mono font-medium text-gray-700 dark:text-gray-300">
                                  {new Date(task.dueDate).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              ) : (
                                <span className="text-xs text-gray-400">--:--</span>
                              )}
                            </div>

                            {/* Checkbox */}
                            <button
                              onClick={(e) => handleCompleteTask(task.id, e)}
                              className="flex-shrink-0 w-5 h-5 mt-0.5 rounded-full border-2 border-gray-400 dark:border-gray-500 hover:border-green-500 hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors flex items-center justify-center group"
                              title="Marcar como completada"
                            >
                              <span className="opacity-0 group-hover:opacity-100 text-green-500 text-xs">✓</span>
                            </button>

                            {/* Contenido */}
                            <div className="flex-1 min-w-0">
                              {/* Título */}
                              <div className="font-medium text-gray-900 dark:text-white">
                                {task.title}
                              </div>
                              
                              {/* Prioridad + Proyecto */}
                              <div className="flex items-center gap-2 mt-1">
                                <span className={`w-2 h-2 rounded-full ${getPriorityColor(task.priority)}`}></span>
                                <span className="text-xs text-gray-500 dark:text-gray-400">
                                  {task.priority === 3 ? 'Alta' : task.priority === 2 ? 'Media' : task.priority === 1 ? 'Baja' : 'Sin prioridad'}
                                </span>
                                {task.project && (
                                  <>
                                    <span className="text-gray-300 dark:text-gray-600">•</span>
                                    <span 
                                      className="text-xs font-medium"
                                      style={{ color: task.project.color }}
                                    >
                                      {task.project.name}
                                    </span>
                                  </>
                                )}
                              </div>

                              {/* Notas */}
                              {task.notes && (
                                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">
                                  {task.notes}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ));
              })()}

              {/* Botón flotante para crear tarea */}
              <button
                onClick={() => onDateClick?.(selectedDate)}
                className="absolute bottom-4 right-4 w-12 h-12 bg-blue-500 hover:bg-blue-600 text-white rounded-full shadow-lg hover:shadow-xl transition-all flex items-center justify-center text-2xl"
                title="Nueva tarea en este día"
              >
                +
              </button>
            </div>
          ) : (
            /* Vista de Mes/Semana */
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
                  const cellTasks = getTasksForDate(day);
                  const isOtherMonth = !isCurrentMonth(day);
                  const past = isPastDate(day) && !isToday(day);
                  const loadLevel = getDayLoadLevel(cellTasks.length);
                  const loadIndicator = getDayLoadIndicator(cellTasks.length);
                  const loadBorder = !isToday(day) && cellTasks.length > 0 ? getDayLoadBorder(cellTasks.length) : '';
                  
                  return (
                    <div
                      key={index}
                      onClick={() => goToDayView(day)}
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
                             title={`${cellTasks.length} tareas - ${loadLevel === 'heavy' ? 'Muy cargado' : loadLevel === 'moderate' ? 'Moderado' : 'Ligero'}`}
                        />
                      )}
                      
                      {/* Day number */}
                      <div className={`
                        text-sm font-medium mb-1 flex items-center gap-1
                        ${isToday(day) ? 'text-blue-600 dark:text-blue-400' : ''}
                        ${isOtherMonth ? 'text-gray-400 dark:text-gray-600' : 'text-gray-700 dark:text-gray-300'}
                      `}>
                        {day.getDate()}
                        {cellTasks.length > 0 && (
                          <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                            loadLevel === 'heavy' ? 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300' :
                            loadLevel === 'moderate' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300' :
                            'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300'
                          }`}>
                            {cellTasks.length}
                          </span>
                        )}
                      </div>
                      
                      {/* Tasks (solo visual, sin onClick - el clic va a la celda del día) */}
                      <div className="space-y-1 pointer-events-none">
                        {cellTasks.slice(0, viewMode === 'month' ? 3 : 10).map(task => (
                          <div
                            key={task.id}
                            className={`
                              text-xs p-1 rounded flex items-center gap-1
                              ${task.project?.color ? '' : 'bg-gray-100 dark:bg-gray-700'}
                            `}
                            style={task.project?.color ? { backgroundColor: task.project.color + '30' } : {}}
                            title={task.title}
                          >
                            <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${getPriorityColor(task.priority)}`}></span>
                            <span className="truncate">{task.title}</span>
                          </div>
                        ))}
                        {cellTasks.length > (viewMode === 'month' ? 3 : 10) && (
                          <div className="text-xs text-gray-500 dark:text-gray-400 text-center">
                            +{cellTasks.length - (viewMode === 'month' ? 3 : 10)} más
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
