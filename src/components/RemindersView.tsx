/**
 * RemindersView Component
 * Panel para ver, editar y eliminar todos los recordatorios activos
 */

'use client';

import { useState, useEffect, useCallback } from 'react';

interface ReminderTask {
  id: string;
  title: string;
  dueDate: string | null;
  type: string;
  completedAt: string | null;
  project: { id: string; name: string; color: string } | null;
}

interface Reminder {
  id: string;
  taskId: string;
  fireAt: string;
  advanceMinutes: number;
  advanceLabel: string;
  type: string;
  dismissed: boolean;
  firedAt: string | null;
  snoozedUntil: string | null;
  snoozeCount: number;
  task: ReminderTask | null;
}

interface ReminderOption {
  advanceMinutes: number;
  advanceLabel: string;
}

type FilterType = 'all' | 'today' | 'week' | 'overdue';

interface RemindersViewProps {
  onClose: () => void;
  onEditTask?: (taskId: string) => void;
}

export default function RemindersView({ onClose, onEditTask }: RemindersViewProps) {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [reminderOptions, setReminderOptions] = useState<ReminderOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>('all');
  const [editingReminder, setEditingReminder] = useState<Reminder | null>(null);
  const [editDate, setEditDate] = useState('');
  const [editTime, setEditTime] = useState('');

  // Cargar recordatorios
  const fetchReminders = useCallback(async () => {
    try {
      setLoading(true);
      const api = (window as any).electronAPI;
      if (!api?.reminders?.getAll) return;
      
      const fetched = await api.reminders.getAll();
      setReminders(fetched || []);
    } catch (error) {
      console.error('Error fetching reminders:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Cargar opciones de recordatorio
  const fetchOptions = useCallback(async () => {
    try {
      const api = (window as any).electronAPI;
      if (!api?.reminders?.getOptions) return;
      
      const options = await api.reminders.getOptions();
      setReminderOptions(options || []);
    } catch (error) {
      console.error('Error fetching reminder options:', error);
    }
  }, []);

  useEffect(() => {
    fetchReminders();
    fetchOptions();
  }, [fetchReminders, fetchOptions]);

  // Filtrar recordatorios
  const filteredReminders = reminders.filter(reminder => {
    // Excluir recordatorios de tareas completadas
    if (reminder.task?.completedAt) return false;
    
    const fireAt = new Date(reminder.fireAt);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1);
    const endOfWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
    
    switch (filter) {
      case 'today':
        return fireAt >= today && fireAt <= endOfToday;
      case 'week':
        return fireAt >= today && fireAt <= endOfWeek;
      case 'overdue':
        return fireAt < now;
      default:
        return true;
    }
  });

  // Agrupar por fecha
  const groupedReminders = filteredReminders.reduce((groups, reminder) => {
    const date = new Date(reminder.fireAt);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
    
    let key: string;
    if (date < now) {
      key = '⚠️ Vencidos';
    } else if (date < tomorrow) {
      key = '📅 Hoy';
    } else if (date < new Date(today.getTime() + 2 * 24 * 60 * 60 * 1000)) {
      key = '📆 Mañana';
    } else {
      key = date.toLocaleDateString('es-ES', { 
        weekday: 'long', 
        day: 'numeric', 
        month: 'long' 
      });
    }
    
    if (!groups[key]) groups[key] = [];
    groups[key].push(reminder);
    return groups;
  }, {} as Record<string, Reminder[]>);

  // Ordenar grupos (Vencidos primero, luego Hoy, Mañana, etc.)
  const sortedGroupKeys = Object.keys(groupedReminders).sort((a, b) => {
    const order: Record<string, number> = { '⚠️ Vencidos': 0, '📅 Hoy': 1, '📆 Mañana': 2 };
    return (order[a] ?? 99) - (order[b] ?? 99);
  });

  // Manejar eliminación
  const handleDelete = async (reminderId: string) => {
    if (!confirm('¿Eliminar este recordatorio?')) return;
    
    try {
      const api = (window as any).electronAPI;
      await api.reminders.delete(reminderId);
      fetchReminders();
    } catch (error) {
      console.error('Error deleting reminder:', error);
    }
  };

  // Manejar posponer
  const handleSnooze = async (reminderId: string, minutes: number) => {
    try {
      const api = (window as any).electronAPI;
      await api.snoozeReminder(reminderId, { type: 'minutes', value: minutes });
      fetchReminders();
    } catch (error) {
      console.error('Error snoozing reminder:', error);
    }
  };

  // Abrir editor de recordatorio
  const handleEdit = (reminder: Reminder) => {
    const fireAt = new Date(reminder.fireAt);
    setEditDate(fireAt.toISOString().split('T')[0]);
    setEditTime(fireAt.toTimeString().slice(0, 5));
    setEditingReminder(reminder);
  };

  // Guardar cambios en recordatorio
  const handleSaveEdit = async () => {
    if (!editingReminder) return;
    
    try {
      const newFireAt = new Date(`${editDate}T${editTime}`);
      const api = (window as any).electronAPI;
      await api.reminders.update(editingReminder.id, { 
        fireAt: newFireAt.toISOString() 
      });
      setEditingReminder(null);
      fetchReminders();
    } catch (error) {
      console.error('Error updating reminder:', error);
    }
  };

  // Formatear hora
  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString('es-ES', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  // Icono según tipo de tarea
  const getTaskIcon = (type: string) => {
    const icons: Record<string, string> = {
      task: '📋',
      call: '📞',
      email: '📧',
      video: '📹',
      meeting: '🤝',
      trip: '✈️',
    };
    return icons[type] || '📋';
  };

  const filterButtons: { key: FilterType; label: string; emoji: string }[] = [
    { key: 'all', label: 'Todos', emoji: '🔔' },
    { key: 'today', label: 'Hoy', emoji: '📅' },
    { key: 'week', label: 'Esta semana', emoji: '📆' },
    { key: 'overdue', label: 'Vencidos', emoji: '⚠️' },
  ];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            🔔 Gestión de Recordatorios
          </h2>
          <button
            onClick={onClose}
            className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Filtros */}
        <div className="flex gap-2 p-4 border-b border-gray-200 dark:border-gray-700">
          {filterButtons.map(btn => (
            <button
              key={btn.key}
              onClick={() => setFilter(btn.key)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filter === btn.key
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              {btn.emoji} {btn.label}
            </button>
          ))}
          
          <div className="flex-1" />
          
          <span className="text-sm text-gray-500 dark:text-gray-400 self-center">
            {filteredReminders.length} recordatorio{filteredReminders.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Lista de recordatorios */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
              Cargando recordatorios...
            </div>
          ) : filteredReminders.length === 0 ? (
            <div className="text-center py-12">
              <span className="text-4xl">🔕</span>
              <p className="mt-4 text-gray-500 dark:text-gray-400">
                No hay recordatorios {filter !== 'all' ? 'para este filtro' : 'activos'}
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {sortedGroupKeys.map(group => (
                <div key={group}>
                  <h3 className={`text-sm font-semibold mb-2 ${
                    group === '⚠️ Vencidos' 
                      ? 'text-red-600 dark:text-red-400' 
                      : 'text-gray-500 dark:text-gray-400'
                  }`}>
                    {group}
                  </h3>
                  
                  <div className="space-y-2">
                    {groupedReminders[group].map(reminder => (
                      <div
                        key={reminder.id}
                        className={`p-3 rounded-lg border transition-colors ${
                          new Date(reminder.fireAt) < new Date()
                            ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                            : 'bg-gray-50 dark:bg-gray-700/50 border-gray-200 dark:border-gray-600'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          {/* Icono del tipo de tarea */}
                          <span className="text-xl">
                            {reminder.task ? getTaskIcon(reminder.task.type) : '🔔'}
                          </span>
                          
                          {/* Info del recordatorio */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-gray-900 dark:text-white truncate">
                                {reminder.task?.title || 'Tarea eliminada'}
                              </span>
                              {reminder.task?.project && (
                                <span 
                                  className="px-2 py-0.5 text-xs rounded-full"
                                  style={{ 
                                    backgroundColor: `${reminder.task.project.color}20`,
                                    color: reminder.task.project.color 
                                  }}
                                >
                                  {reminder.task.project.name}
                                </span>
                              )}
                            </div>
                            
                            <div className="flex items-center gap-3 mt-1 text-sm text-gray-500 dark:text-gray-400">
                              <span>🕐 {formatTime(reminder.fireAt)}</span>
                              <span>•</span>
                              <span>{reminder.advanceLabel}</span>
                              {reminder.snoozeCount > 0 && (
                                <>
                                  <span>•</span>
                                  <span className="text-orange-500">
                                    Pospuesto {reminder.snoozeCount}x
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                          
                          {/* Acciones */}
                          <div className="flex items-center gap-1">
                            {/* Ver tarea */}
                            {reminder.task && onEditTask && (
                              <button
                                onClick={() => onEditTask(reminder.task!.id)}
                                className="p-2 text-gray-400 hover:text-blue-500 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                                title="Ver tarea"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                </svg>
                              </button>
                            )}
                            
                            {/* Editar hora */}
                            <button
                              onClick={() => handleEdit(reminder)}
                              className="p-2 text-gray-400 hover:text-green-500 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                              title="Editar hora"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                            </button>
                            
                            {/* Posponer 10 min */}
                            <button
                              onClick={() => handleSnooze(reminder.id, 10)}
                              className="p-2 text-gray-400 hover:text-orange-500 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                              title="Posponer 10 min"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                            </button>
                            
                            {/* Eliminar */}
                            <button
                              onClick={() => handleDelete(reminder.id)}
                              className="p-2 text-gray-400 hover:text-red-500 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                              title="Eliminar recordatorio"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer con resumen */}
        <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 rounded-b-xl">
          <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400">
            <span>
              Total: {reminders.filter(r => !r.task?.completedAt).length} recordatorios activos
            </span>
            <button
              onClick={fetchReminders}
              className="px-3 py-1.5 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
            >
              🔄 Actualizar
            </button>
          </div>
        </div>
      </div>

      {/* Modal de edición de hora */}
      {editingReminder && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-60">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-6 w-full max-w-sm">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
              ⏰ Cambiar hora del recordatorio
            </h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Tarea
                </label>
                <p className="text-gray-900 dark:text-white font-medium">
                  {editingReminder.task?.title || 'Sin título'}
                </p>
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    📅 Fecha
                  </label>
                  <input
                    type="date"
                    value={editDate}
                    onChange={e => setEditDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    🕐 Hora
                  </label>
                  <input
                    type="time"
                    value={editTime}
                    onChange={e => setEditTime(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              
              {/* Atajos rápidos */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Atajos rápidos
                </label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { label: '+10 min', minutes: 10 },
                    { label: '+30 min', minutes: 30 },
                    { label: '+1 hora', minutes: 60 },
                    { label: '+1 día', minutes: 1440 },
                  ].map(opt => (
                    <button
                      key={opt.minutes}
                      onClick={() => {
                        const newDate = new Date(new Date().getTime() + opt.minutes * 60 * 1000);
                        setEditDate(newDate.toISOString().split('T')[0]);
                        setEditTime(newDate.toTimeString().slice(0, 5));
                      }}
                      className="px-3 py-1.5 text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setEditingReminder(null)}
                className="flex-1 px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveEdit}
                className="flex-1 px-4 py-2 text-white bg-blue-500 rounded-lg hover:bg-blue-600 transition-colors"
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
