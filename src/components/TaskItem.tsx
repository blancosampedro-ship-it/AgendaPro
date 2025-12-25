/**
 * TaskItem Component
 * Item individual de tarea en la lista
 */

'use client';

import { useState } from 'react';

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
  // Asignación
  assignedToId: string | null;
  assignedTo: { id: string; name: string; email: string | null; color: string } | null;
  // Fase 4
  isRecurring: boolean;
  recurrenceRule: string | null;
  tags: string | null;
  subtasks: string | null;
  reminders: Array<{
    id: string;
    fireAt: string;
    snoozedUntil: string | null;
  }>;
  // Fase 7: Commitment types
  type?: string;
  status?: string;
  typeData?: string | null;
  endDate?: string | null;
  parentEventId?: string | null;
  // Sub-eventos count (para viajes)
  _count?: { subEvents?: number };
}

interface TaskItemProps {
  task: Task;
  onComplete: (id: string) => void;
  onReopen: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit: (task: Task) => void;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent, task: Task) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent, targetTaskId: string) => void;
}

export function TaskItem({ task, onComplete, onReopen, onDelete, onEdit, draggable = true, onDragStart, onDragOver, onDrop }: TaskItemProps) {
  const [showActions, setShowActions] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  const isCompleted = !!task.completedAt;
  const isOverdue = task.dueDate && !isCompleted && new Date(task.dueDate) < new Date();

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (date.toDateString() === today.toDateString()) {
      return `Hoy, ${date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`;
    }
    if (date.toDateString() === tomorrow.toDateString()) {
      return `Mañana, ${date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`;
    }
    return date.toLocaleDateString('es-ES', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const priorityColors = {
    0: '',
    1: 'border-l-green-400',
    2: 'border-l-yellow-400',
    3: 'border-l-red-400',
  };

  const priorityLabels = {
    0: '',
    1: '🟢',
    2: '🟡',
    3: '🔴',
  };

  return (
    <div
      draggable={draggable}
      onDragStart={(e) => {
        setIsDragging(true);
        onDragStart?.(e, task);
      }}
      onDragEnd={() => setIsDragging(false)}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragOver(true);
        onDragOver?.(e);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragOver(false);
        onDrop?.(e, task.id);
      }}
      className={`group flex items-start gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors border-l-4 ${
        priorityColors[task.priority as keyof typeof priorityColors] || 'border-l-transparent'
      } ${isCompleted ? 'opacity-60' : ''} ${isDragging ? 'opacity-50 scale-95' : ''} ${isDragOver ? 'border-t-2 border-t-blue-500' : ''} cursor-grab active:cursor-grabbing`}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      {/* Checkbox */}
      <button
        onClick={() => isCompleted ? onReopen(task.id) : onComplete(task.id)}
        className={`flex-shrink-0 w-5 h-5 mt-0.5 rounded-full border-2 flex items-center justify-center transition-colors ${
          isCompleted
            ? 'bg-green-500 border-green-500 text-white'
            : 'border-gray-300 dark:border-gray-600 hover:border-blue-500'
        }`}
      >
        {isCompleted && (
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
        )}
      </button>

      {/* Content */}
      <div className="flex-1 min-w-0" onClick={() => onEdit(task)}>
        <div className="flex items-center gap-2">
          {/* Commitment type icon (only if not a regular task) */}
          {task.type && task.type !== 'task' && (
            <span className="text-sm" title={
              task.type === 'call' ? 'Llamada' :
              task.type === 'email' ? 'Email' :
              task.type === 'video' ? 'Videoconferencia' :
              task.type === 'meeting' ? 'Reunión' :
              task.type === 'trip' ? 'Viaje' : ''
            }>
              {task.type === 'call' ? '📞' :
               task.type === 'email' ? '📧' :
               task.type === 'video' ? '📹' :
               task.type === 'meeting' ? '🤝' :
               task.type === 'trip' ? '✈️' : ''}
            </span>
          )}
          <span className={`text-sm ${isCompleted ? 'line-through text-gray-400' : 'text-gray-900 dark:text-white'}`}>
            {task.title}
          </span>
          {task.priority > 0 && (
            <span className="text-xs">{priorityLabels[task.priority as keyof typeof priorityLabels]}</span>
          )}
          {task.isRecurring && (
            <span className="text-xs px-1.5 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded" title="Tarea recurrente">🔄</span>
          )}
          {task.isWaitingFor && (
            <span className="text-xs px-1.5 py-0.5 bg-orange-100 text-orange-700 rounded">⏳</span>
          )}
          {/* Email status badge */}
          {task.type === 'email' && task.status === 'sent' && (
            <span className="text-xs px-1.5 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded">Enviado</span>
          )}
          {task.type === 'email' && task.status === 'waiting' && (
            <span className="text-xs px-1.5 py-0.5 bg-yellow-100 text-yellow-700 rounded">Esperando resp.</span>
          )}
          {/* Trip sub-events badge */}
          {task.type === 'trip' && task._count?.subEvents !== undefined && task._count.subEvents > 0 && (
            <span className="text-xs px-1.5 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded">
              📅 {task._count.subEvents} eventos
            </span>
          )}
          {/* Duration badge for video/meeting */}
          {(task.type === 'video' || task.type === 'meeting') && task.dueDate && task.endDate && (
            <span className="text-xs text-gray-400">
              {(() => {
                const start = new Date(task.dueDate);
                const end = new Date(task.endDate);
                const mins = Math.round((end.getTime() - start.getTime()) / 60000);
                if (mins >= 60) return `${Math.round(mins / 60)}h`;
                return `${mins}min`;
              })()}
            </span>
          )}
        </div>

        {/* Subtasks progress */}
        {task.subtasks && (() => {
          try {
            const subs = JSON.parse(task.subtasks);
            const done = subs.filter((s: {done: boolean}) => s.done).length;
            return (
              <div className="flex items-center gap-1 mt-0.5">
                <span className="text-xs text-gray-500">☑️ {done}/{subs.length}</span>
                <div className="w-16 h-1 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-green-500 rounded-full transition-all" 
                    style={{ width: `${(done / subs.length) * 100}%` }}
                  />
                </div>
              </div>
            );
          } catch { return null; }
        })()}

        {/* Notes preview */}
        {task.notes && (
          <p className="text-xs text-gray-500 truncate mt-0.5">{task.notes}</p>
        )}

        {/* Meta info */}
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          {/* Project badge */}
          {task.project && (
            <span
              className="text-xs px-1.5 py-0.5 rounded"
              style={{ backgroundColor: `${task.project.color}20`, color: task.project.color }}
            >
              {task.project.name}
            </span>
          )}

          {/* Assigned to badge */}
          {task.assignedTo && (
            <span
              className="text-xs px-1.5 py-0.5 rounded flex items-center gap-1"
              style={{ backgroundColor: `${task.assignedTo.color}20`, color: task.assignedTo.color }}
            >
              <span 
                className="w-4 h-4 rounded-full flex items-center justify-center text-[10px] text-white font-medium"
                style={{ backgroundColor: task.assignedTo.color }}
              >
                {task.assignedTo.name.charAt(0).toUpperCase()}
              </span>
              {task.assignedTo.name.split(' ')[0]}
            </span>
          )}

          {/* Due date */}
          {task.dueDate && (
            <span className={`text-xs ${isOverdue ? 'text-red-500 font-medium' : 'text-gray-500'}`}>
              {isOverdue && '⚠️ '}
              {formatDate(task.dueDate)}
            </span>
          )}

          {/* Reminder indicator */}
          {task.reminders.length > 0 && (
            <span className="text-xs text-gray-400">🔔</span>
          )}

          {/* Waiting for note */}
          {task.isWaitingFor && task.waitingForNote && (
            <span className="text-xs text-orange-500 truncate max-w-[150px]">
              → {task.waitingForNote}
            </span>
          )}

          {/* Tags */}
          {task.tags && (() => {
            try {
              const tagList = JSON.parse(task.tags);
              return tagList.slice(0, 3).map((tag: string) => (
                <span key={tag} className="text-xs px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full">
                  #{tag}
                </span>
              ));
            } catch { return null; }
          })()}
        </div>
      </div>

      {/* Actions */}
      <div className={`flex items-center gap-1 transition-opacity ${showActions ? 'opacity-100' : 'opacity-0'}`}>
        {/* Botón Reabrir (solo si está completada) */}
        {isCompleted && (
          <button
            onClick={() => onReopen(task.id)}
            className="p-1.5 text-gray-400 hover:text-orange-500 hover:bg-orange-50 rounded transition-colors"
            title="Reabrir tarea"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        )}
        <button
          onClick={() => onEdit(task)}
          className="p-1.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded transition-colors"
          title="Editar"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
          </svg>
        </button>
        <button
          onClick={() => onDelete(task.id)}
          className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
          title="Eliminar"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>
    </div>
  );
}
