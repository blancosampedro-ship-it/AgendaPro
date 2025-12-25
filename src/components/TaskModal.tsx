/**
 * TaskModal Component
 * Modal para crear/editar tareas
 */

'use client';

import { useState, useEffect } from 'react';

interface Subtask {
  id: string;
  title: string;
  done: boolean;
}

interface Task {
  id: string;
  title: string;
  notes: string | null;
  dueDate: string | null;
  completedAt: string | null;
  priority: number;
  isWaitingFor: boolean;
  waitingForNote: string | null;
  projectId: string | null;
  project: { id: string; name: string; color: string } | null;
  tags: string | null;
  isRecurring: boolean;
  recurrenceRule: string | null;
  subtasks: string | null;
  reminders: Array<{
    id: string;
    fireAt: string;
    snoozedUntil: string | null;
  }>;
}

interface Project {
  id: string;
  name: string;
  color: string;
  icon: string | null;
  _count: { tasks: number };
}

interface Tag {
  id: string;
  name: string;
  color: string;
}

interface TaskModalProps {
  task: Task | null;
  projects: Project[];
  defaultProjectId?: string | null;
  onClose: () => void;
  onSave: () => void;
}

export function TaskModal({ task, projects, defaultProjectId, onClose, onSave }: TaskModalProps) {
  // Inicializar fecha y hora con valores actuales
  const getInitialDate = () => {
    if (task?.dueDate) {
      return new Date(task.dueDate).toISOString().split('T')[0];
    }
    return new Date().toISOString().split('T')[0];
  };
  
  const getInitialTime = () => {
    if (task?.dueDate) {
      return new Date(task.dueDate).toTimeString().slice(0, 5);
    }
    return new Date().toTimeString().slice(0, 5);
  };

  const [title, setTitle] = useState(task?.title || '');
  const [notes, setNotes] = useState(task?.notes || '');
  const [dueDate, setDueDate] = useState(getInitialDate);
  const [dueTime, setDueTime] = useState(getInitialTime);
  const [priority, setPriority] = useState(task?.priority || 0);
  const [projectId, setProjectId] = useState<string | null>(task?.projectId || defaultProjectId || null);
  const [isWaitingFor, setIsWaitingFor] = useState(task?.isWaitingFor || false);
  const [waitingForNote, setWaitingForNote] = useState(task?.waitingForNote || '');
  const [addReminder, setAddReminder] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // Fase 4: Recurrencia
  const [isRecurring, setIsRecurring] = useState(task?.isRecurring || false);
  const [recurrenceRule, setRecurrenceRule] = useState(task?.recurrenceRule || 'daily');
  
  // Fase 4: Subtareas
  const [subtasks, setSubtasks] = useState<Subtask[]>(() => {
    if (task?.subtasks) {
      try {
        return JSON.parse(task.subtasks);
      } catch {
        return [];
      }
    }
    return [];
  });
  const [newSubtask, setNewSubtask] = useState('');
  
  // Fase 4: Etiquetas
  const [tags, setTags] = useState<string[]>(() => {
    if (task?.tags) {
      try {
        return JSON.parse(task.tags);
      } catch {
        return [];
      }
    }
    return [];
  });
  const [tagInput, setTagInput] = useState('');
  const [availableTags, setAvailableTags] = useState<Tag[]>([]);

  useEffect(() => {
    // Cargar etiquetas disponibles
    const loadTags = async () => {
      try {
        const api = (window as any).electronAPI;
        if (api?.getAllTags) {
          const fetchedTags = await api.getAllTags();
          setAvailableTags(fetchedTags);
        }
      } catch (error) {
        console.error('Error loading tags:', error);
      }
    };
    loadTags();
  }, []);

  // Funciones para subtareas
  const addSubtask = () => {
    if (!newSubtask.trim()) return;
    setSubtasks([...subtasks, { id: Date.now().toString(), title: newSubtask.trim(), done: false }]);
    setNewSubtask('');
  };

  const removeSubtask = (id: string) => {
    setSubtasks(subtasks.filter(s => s.id !== id));
  };

  const toggleSubtaskDone = (id: string) => {
    setSubtasks(subtasks.map(s => s.id === id ? { ...s, done: !s.done } : s));
  };

  // Funciones para etiquetas
  const addTag = (tagName: string) => {
    const normalizedTag = tagName.toLowerCase().trim();
    if (normalizedTag && !tags.includes(normalizedTag)) {
      setTags([...tags, normalizedTag]);
    }
    setTagInput('');
  };

  const removeTag = (tagName: string) => {
    setTags(tags.filter(t => t !== tagName));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setSaving(true);

    try {
      const api = (window as any).electronAPI;
      if (!api) {
        console.error('electronAPI not available');
        return;
      }

      const dueDateFull = dueDate 
        ? new Date(`${dueDate}T${dueTime}:00`).toISOString()
        : null;

      const taskData = {
        title: title.trim(),
        notes: notes.trim() || null,
        dueDate: dueDateFull,
        priority,
        projectId,
        isWaitingFor,
        waitingForNote: isWaitingFor ? waitingForNote.trim() || null : null,
        addReminder: addReminder && !!dueDateFull,
        // Fase 4
        isRecurring: isRecurring && !!dueDateFull,
        recurrenceRule: isRecurring && dueDateFull ? recurrenceRule : null,
        tags: tags.length > 0 ? tags : null,
        subtasks: subtasks.length > 0 ? subtasks : null,
      };

      if (task) {
        await api.updateTask(task.id, taskData);
      } else {
        await api.createTask(taskData);
      }

      onSave();
    } catch (error) {
      console.error('Error saving task:', error);
      alert('Error al guardar la tarea');
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={onClose}
      onKeyDown={handleKeyDown}
    >
      <div
        className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {task ? 'Editar Tarea' : 'Nueva Tarea'}
          </h2>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form - Scrollable */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Title */}
          <div>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="¿Qué necesitas hacer?"
              className="w-full px-4 py-3 text-lg border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              autoFocus
            />
          </div>

          {/* Notes */}
          <div>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Notas adicionales..."
              rows={2}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            />
          </div>

          {/* Due Date & Time */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                📅 Fecha
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div className="w-28">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                🕐 Hora
              </label>
              <input
                type="time"
                value={dueTime}
                onChange={e => setDueTime(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Reminder toggle */}
          {dueDate && (
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={addReminder}
                onChange={e => setAddReminder(e.target.checked)}
                className="w-4 h-4 text-blue-500 rounded border-gray-300 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">
                🔔 Recordarme a la hora
              </span>
            </label>
          )}

          {/* Project selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              📁 Proyecto
            </label>
            <select
              value={projectId || ''}
              onChange={e => setProjectId(e.target.value || null)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">📥 Sin proyecto (Inbox)</option>
              {projects.map(project => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </div>

          {/* Priority */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Prioridad
            </label>
            <div className="flex gap-2">
              {[
                { value: 0, label: 'Ninguna', color: 'bg-gray-200 dark:bg-gray-600' },
                { value: 1, label: '🟢 Baja', color: 'bg-green-100 text-green-700 border-green-300' },
                { value: 2, label: '🟡 Media', color: 'bg-yellow-100 text-yellow-700 border-yellow-300' },
                { value: 3, label: '🔴 Alta', color: 'bg-red-100 text-red-700 border-red-300' },
              ].map(p => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setPriority(p.value)}
                  className={`px-3 py-1.5 rounded-lg text-sm border transition-all ${
                    priority === p.value
                      ? `${p.color} border-2`
                      : 'bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:bg-gray-100'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Recurrence (Fase 4) */}
          {dueDate && (
            <div className="border border-gray-200 dark:border-gray-600 rounded-lg p-3">
              <label className="flex items-center gap-2 mb-2">
                <input
                  type="checkbox"
                  checked={isRecurring}
                  onChange={e => setIsRecurring(e.target.checked)}
                  className="w-4 h-4 text-purple-500 rounded border-gray-300 focus:ring-purple-500"
                />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  🔄 Repetir tarea
                </span>
              </label>
              {isRecurring && (
                <select
                  value={recurrenceRule}
                  onChange={e => setRecurrenceRule(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                >
                  <option value="daily">📅 Cada día</option>
                  <option value="weekdays">💼 Días laborables (L-V)</option>
                  <option value="weekly">📆 Cada semana</option>
                  <option value="monthly">🗓️ Cada mes</option>
                  <option value="yearly">🎂 Cada año</option>
                </select>
              )}
            </div>
          )}

          {/* Subtasks (Fase 4) */}
          <div className="border border-gray-200 dark:border-gray-600 rounded-lg p-3">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              ☑️ Subtareas
            </label>
            
            {/* Lista de subtareas */}
            {subtasks.length > 0 && (
              <div className="space-y-1 mb-2">
                {subtasks.map(subtask => (
                  <div key={subtask.id} className="flex items-center gap-2 group">
                    <input
                      type="checkbox"
                      checked={subtask.done}
                      onChange={() => toggleSubtaskDone(subtask.id)}
                      className="w-4 h-4 text-blue-500 rounded border-gray-300"
                    />
                    <span className={`flex-1 text-sm ${subtask.done ? 'line-through text-gray-400' : 'text-gray-700 dark:text-gray-300'}`}>
                      {subtask.title}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeSubtask(subtask.id)}
                      className="p-1 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
            
            {/* Añadir subtarea */}
            <div className="flex gap-2">
              <input
                type="text"
                value={newSubtask}
                onChange={e => setNewSubtask(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addSubtask())}
                placeholder="Nueva subtarea..."
                className="flex-1 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400"
              />
              <button
                type="button"
                onClick={addSubtask}
                disabled={!newSubtask.trim()}
                className="px-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-600 hover:bg-gray-200 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-300 rounded-lg disabled:opacity-50"
              >
                +
              </button>
            </div>
          </div>

          {/* Tags (Fase 4) */}
          <div className="border border-gray-200 dark:border-gray-600 rounded-lg p-3">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              🏷️ Etiquetas
            </label>
            
            {/* Tags actuales */}
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-2">
                {tags.map(tag => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full"
                  >
                    #{tag}
                    <button
                      type="button"
                      onClick={() => removeTag(tag)}
                      className="hover:text-red-500"
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            )}
            
            {/* Input de etiqueta */}
            <div className="flex gap-2">
              <input
                type="text"
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addTag(tagInput))}
                placeholder="trabajo, personal, urgente..."
                className="flex-1 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400"
              />
              <button
                type="button"
                onClick={() => addTag(tagInput)}
                disabled={!tagInput.trim()}
                className="px-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-600 hover:bg-gray-200 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-300 rounded-lg disabled:opacity-50"
              >
                +
              </button>
            </div>
            
            {/* Sugerencias de etiquetas existentes */}
            {availableTags.length > 0 && tagInput && (
              <div className="mt-2 flex flex-wrap gap-1">
                {availableTags
                  .filter(t => t.name.includes(tagInput.toLowerCase()) && !tags.includes(t.name))
                  .slice(0, 5)
                  .map(tag => (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() => addTag(tag.name)}
                      className="px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-full hover:bg-gray-200"
                    >
                      #{tag.name}
                    </button>
                  ))}
              </div>
            )}
          </div>

          {/* Waiting For */}
          <div>
            <label className="flex items-center gap-2 mb-2">
              <input
                type="checkbox"
                checked={isWaitingFor}
                onChange={e => setIsWaitingFor(e.target.checked)}
                className="w-4 h-4 text-orange-500 rounded border-gray-300 focus:ring-orange-500"
              />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                ⏳ Esperando respuesta
              </span>
            </label>
            {isWaitingFor && (
              <input
                type="text"
                value={waitingForNote}
                onChange={e => setWaitingForNote(e.target.value)}
                placeholder="¿De quién? (ej: Juan, soporte técnico...)"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              />
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!title.trim() || saving}
              className="flex-1 px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 text-white rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              {saving ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Guardando...</span>
                </>
              ) : (
                <span>{task ? 'Guardar' : 'Crear Tarea'}</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
