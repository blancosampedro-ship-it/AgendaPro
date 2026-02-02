/**
 * TaskList Component
 * Lista de tareas con filtros y agrupación
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { TaskItem } from './TaskItem';
import { TaskModal } from './TaskModal';
import { ProjectModal } from './ProjectModal';
import SyncSettings from './SyncSettings';
import AppSettings from './AppSettings';
import CalendarView from './CalendarView';
import StatsView from './StatsView';
import RemindersView from './RemindersView';

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
}

interface Project {
  id: string;
  name: string;
  color: string;
  icon: string | null;
  _count: { tasks: number };
}

type FilterType = 'all' | 'today' | 'upcoming' | 'overdue' | 'waiting' | 'completed';

interface TaskListProps {
  initialFilter?: FilterType;
}

export function TaskList({ initialFilter = 'all' }: TaskListProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [filter, setFilter] = useState<FilterType>(initialFilter);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [showCalendar, setShowCalendar] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showReminders, setShowReminders] = useState(false);
  const [upcomingDays, setUpcomingDays] = useState<number>(7); // Rango de días para próximas (7 días por defecto)

  // Cargar proyectos
  const fetchProjects = useCallback(async () => {
    try {
      const api = (window as any).electronAPI;
      if (!api) return;
      const fetchedProjects = await api.getAllProjects();
      setProjects(fetchedProjects);
    } catch (error) {
      console.error('Error fetching projects:', error);
    }
  }, []);

  const fetchTasks = useCallback(async () => {
    try {
      setLoading(true);
      let fetchedTasks: Task[] = [];

      const api = (window as any).electronAPI;
      if (!api) {
        console.error('electronAPI not available');
        return;
      }

      // Si hay búsqueda activa, usar esa
      if (searchQuery.trim()) {
        fetchedTasks = await api.searchTasks(searchQuery);
      }
      // Si hay proyecto seleccionado
      else if (selectedProjectId) {
        fetchedTasks = await api.getTasksByProject(selectedProjectId);
      }
      // Filtros normales
      else {
        switch (filter) {
          case 'today':
            fetchedTasks = await api.getTodayTasks();
            break;
          case 'overdue':
            fetchedTasks = await api.getOverdueTasks();
            break;
          case 'upcoming':
            fetchedTasks = await api.getUpcomingTasks(upcomingDays);
            break;
          case 'waiting':
            fetchedTasks = await api.getWaitingTasks();
            break;
          default:
            fetchedTasks = await api.getAllTasks();
        }
      }

      // Filtrar completados si no es el filtro
      if (filter === 'completed') {
        fetchedTasks = fetchedTasks.filter(t => t.completedAt);
      } else if (filter !== 'all' && !searchQuery.trim()) {
        fetchedTasks = fetchedTasks.filter(t => !t.completedAt);
      }

      console.log('TaskList: setting tasks:', fetchedTasks.length, fetchedTasks);
      setTasks(fetchedTasks);
    } catch (error) {
      console.error('Error fetching tasks:', error);
    } finally {
      setLoading(false);
    }
  }, [filter, selectedProjectId, searchQuery, upcomingDays]);

  // Carga inicial: fetch paralelo de tasks y projects
  useEffect(() => {
    const loadInitialData = async () => {
      await Promise.all([fetchTasks(), fetchProjects()]);
    };
    loadInitialData();
  }, [fetchTasks, fetchProjects]);

  // Escuchar evento de refrescar tareas (cuando se pospone desde el popup)
  useEffect(() => {
    const api = (window as any).electronAPI;
    if (!api?.on) return;
    
    const handleRefresh = () => {
      console.log('TaskList: Received tasks:refresh event');
      fetchTasks();
      fetchProjects();
    };
    
    const handleEditTask = async (taskId: string) => {
      console.log('TaskList: Received task:edit event for', taskId);
      try {
        const task = await api.getTask(taskId);
        if (task) {
          setEditingTask(task);
          setIsModalOpen(true);
        }
      } catch (error) {
        console.error('Error loading task for edit:', error);
      }
    };
    
    const handleNewTask = () => {
      console.log('TaskList: Received new-task event');
      setEditingTask(null);
      setIsModalOpen(true);
    };
    
    const handleNewProject = async () => {
      console.log('TaskList: Received new-project event');
      // Usar el modal en lugar de prompt() que no está soportado en Electron
      setEditingProject(null);
      setShowProjectModal(true);
    };
    
    api.on('tasks:refresh', handleRefresh);
    api.on('task:edit', handleEditTask);
    api.on('new-task', handleNewTask);
    api.on('new-project', handleNewProject);
    
    return () => {
      api.removeListener?.('tasks:refresh', handleRefresh);
      api.removeListener?.('task:edit', handleEditTask);
      api.removeListener?.('new-task', handleNewTask);
      api.removeListener?.('new-project', handleNewProject);
    };
  }, [fetchTasks, fetchProjects]);

  // Debounce para búsqueda
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery.trim()) {
        fetchTasks();
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleComplete = async (taskId: string) => {
    try {
      const api = (window as any).electronAPI;
      await api.completeTask(taskId);
      fetchTasks();
    } catch (error) {
      console.error('Error completing task:', error);
    }
  };

  const handleReopen = async (taskId: string) => {
    try {
      const api = (window as any).electronAPI;
      await api.reopenTask(taskId);
      fetchTasks();
    } catch (error) {
      console.error('Error reopening task:', error);
    }
  };

  const handleDelete = async (taskId: string) => {
    if (!confirm('¿Eliminar esta tarea?')) return;
    try {
      const api = (window as any).electronAPI;
      await api.deleteTask(taskId);
      fetchTasks();
    } catch (error) {
      console.error('Error deleting task:', error);
    }
  };

  const handleEdit = (task: Task) => {
    setEditingTask(task);
    setIsModalOpen(true);
  };

  // Drag & Drop state
  const [draggedTask, setDraggedTask] = useState<Task | null>(null);

  const handleDragStart = (e: React.DragEvent, task: Task) => {
    setDraggedTask(task);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', task.id);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = async (e: React.DragEvent, targetTaskId: string) => {
    e.preventDefault();
    if (!draggedTask || draggedTask.id === targetTaskId) return;
    
    // Reordenar tareas (por ahora solo visual feedback)
    // En el futuro se puede implementar orden persistente
    setDraggedTask(null);
  };

  const handleDropOnProject = async (projectId: string | null) => {
    if (!draggedTask) return;
    
    try {
      const api = (window as any).electronAPI;
      await api.updateTask(draggedTask.id, { projectId });
      await fetchTasks();
      await fetchProjects();
    } catch (error) {
      console.error('Error moving task to project:', error);
    }
    setDraggedTask(null);
  };

  const handleCreateNew = () => {
    setEditingTask(null);
    setIsModalOpen(true);
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    setEditingTask(null);
  };

  const handleModalSave = async () => {
    handleModalClose();
    await fetchTasks();
    await fetchProjects();
    
    // Refrescar popup de tareas vencidas (quita las que ya no están vencidas)
    try {
      const api = (window as unknown as { electronAPI: typeof window.electronAPI }).electronAPI;
      if (api?.overduePopup?.refresh) {
        await api.overduePopup.refresh();
      }
    } catch (error) {
      console.error('Error refreshing overdue popup:', error);
    }
  };

  const handleProjectClick = (projectId: string | null) => {
    setSelectedProjectId(projectId);
    setSearchQuery('');
    if (projectId === null) {
      setFilter('all');
    }
  };

  const handleFilterClick = (newFilter: FilterType) => {
    setFilter(newFilter);
    setSelectedProjectId(null);
    setSearchQuery('');
  };

  const handleCreateProject = () => {
    console.log('handleCreateProject called - opening modal');
    setEditingProject(null);
    setShowProjectModal(true);
  };

  const handleEditProject = (project: Project) => {
    console.log('handleEditProject called for:', project.name);
    setEditingProject(project);
    setShowProjectModal(true);
  };

  const handleProjectSave = async () => {
    setShowProjectModal(false);
    setEditingProject(null);
    await fetchProjects();
  };

  const handleDeleteProject = async (projectId: string) => {
    if (!confirm('¿Eliminar este proyecto? Las tareas no serán eliminadas.')) return;
    try {
      const api = (window as any).electronAPI;
      await api.deleteProject(projectId);
      if (selectedProjectId === projectId) {
        setSelectedProjectId(null);
      }
      await fetchProjects();
      await fetchTasks();
    } catch (error) {
      console.error('Error deleting project:', error);
    }
  };

  const filterButtons: { key: FilterType; label: string; emoji: string }[] = [
    { key: 'all', label: 'Todas', emoji: '📋' },
    { key: 'today', label: 'Hoy', emoji: '📅' },
    { key: 'overdue', label: 'Vencidas', emoji: '⚠️' },
    { key: 'upcoming', label: 'Próximas', emoji: '📆' },
    { key: 'waiting', label: 'Esperando', emoji: '⏳' },
    { key: 'completed', label: 'Completadas', emoji: '✅' },
  ];

  // Agrupar tareas por fecha
  const groupedTasks = tasks.reduce((groups, task) => {
    const date = task.dueDate 
      ? new Date(task.dueDate).toLocaleDateString('es-ES', { 
          weekday: 'long', 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric' 
        })
      : 'Sin fecha';
    
    if (!groups[date]) {
      groups[date] = [];
    }
    groups[date].push(task);
    return groups;
  }, {} as Record<string, Task[]>);

  return (
    <div className="flex h-full">
      {/* Sidebar de Proyectos */}
      <div className="w-56 bg-gray-50 dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 flex flex-col">
        <div className="p-3 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase">
            Proyectos
          </h2>
        </div>
        
        <div className="flex-1 overflow-y-auto p-2">
          {/* Sin proyecto (Inbox) */}
          <button
            onClick={() => handleProjectClick(null)}
            onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('ring-2', 'ring-blue-500'); }}
            onDragLeave={(e) => { e.currentTarget.classList.remove('ring-2', 'ring-blue-500'); }}
            onDrop={(e) => { e.currentTarget.classList.remove('ring-2', 'ring-blue-500'); handleDropOnProject(null); }}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-left transition-colors ${
              selectedProjectId === null && filter === 'all'
                ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
          >
            <span>📥</span>
            <span className="flex-1">Inbox</span>
            {draggedTask && <span className="text-xs text-blue-500">← Soltar aquí</span>}
          </button>
          
          {/* Lista de proyectos */}
          {projects.map(project => (
            <div key={project.id} className="group relative">
              <button
                onClick={() => handleProjectClick(project.id)}
                onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('ring-2', 'ring-blue-500'); }}
                onDragLeave={(e) => { e.currentTarget.classList.remove('ring-2', 'ring-blue-500'); }}
                onDrop={(e) => { e.currentTarget.classList.remove('ring-2', 'ring-blue-500'); handleDropOnProject(project.id); }}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-left transition-colors ${
                  selectedProjectId === project.id
                    ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              >
                {project.icon && <span className="text-sm">{project.icon}</span>}
                <span 
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: project.color }}
                />
                <span className="flex-1 truncate">{project.name}</span>
                <span className="text-xs text-gray-400">{project._count.tasks}</span>
              </button>
              
              {/* Botones editar/eliminar proyecto */}
              <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleEditProject(project);
                  }}
                  className="p-1 text-gray-400 hover:text-blue-500 transition-colors"
                  title="Editar proyecto"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteProject(project.id);
                  }}
                  className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                  title="Eliminar proyecto"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
        
        {/* Botón nuevo proyecto */}
        <div className="p-2 border-t border-gray-200 dark:border-gray-700">
          <button
            type="button"
            onClick={() => {
              console.log('CLICK en Nuevo Proyecto');
              handleCreateProject();
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
          >
            <span>+</span>
            <span>Nuevo Proyecto</span>
          </button>
        </div>
      </div>

      {/* Contenido principal */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header con búsqueda */}
        <div className="flex items-center p-4 border-b border-gray-200 dark:border-gray-700 gap-3">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white shrink-0">
            {selectedProjectId 
              ? projects.find(p => p.id === selectedProjectId)?.name || 'Proyecto'
              : 'Tareas'}
          </h1>
          
          {/* Búsqueda */}
          <div className="relative flex-1 max-w-xs">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar tareas..."
              className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            )}
          </div>
          
          {/* Spacer */}
          <div className="flex-1" />
          
          {/* Refresh button */}
          <button
            onClick={() => { fetchProjects(); fetchTasks(); }}
            className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
            title="Actualizar"
          >
            🔄
          </button>
          
          {/* Calendar Button */}
          <button
            onClick={() => setShowCalendar(true)}
            className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
            title="Calendario"
          >
            📅
          </button>
          
          {/* Reminders Button */}
          <button
            onClick={() => setShowReminders(true)}
            className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
            title="Gestión de Recordatorios"
          >
            🔔
          </button>
          
          {/* Stats Button */}
          <button
            onClick={() => setShowStats(true)}
            className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
            title="Estadísticas"
          >
            📊
          </button>
          
          {/* Sync Settings */}
          <SyncSettings />
          
          {/* App Settings Button */}
          <AppSettings />
          
          {/* BOTÓN NUEVA TAREA */}
          <button
            onClick={handleCreateNew}
            className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors shrink-0"
          >
            <span className="text-lg">+</span>
            <span>Nueva Tarea</span>
          </button>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1 p-2 bg-gray-50 dark:bg-gray-800 overflow-x-auto items-center">
          {filterButtons.map(btn => (
            <div key={btn.key} className="flex items-center">
              <button
                onClick={() => handleFilterClick(btn.key)}
                className={`flex items-center gap-1 px-3 py-1.5 text-sm whitespace-nowrap transition-colors ${
                  filter === btn.key && !selectedProjectId && !searchQuery
                    ? 'bg-blue-500 text-white'
                    : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600'
                } ${btn.key === 'upcoming' && filter === 'upcoming' ? 'rounded-l-lg' : 'rounded-lg'}`}
              >
                <span>{btn.emoji}</span>
                <span>{btn.label}</span>
              </button>
              {/* Selector de rango para Próximas */}
              {btn.key === 'upcoming' && filter === 'upcoming' && !selectedProjectId && !searchQuery && (
                <select
                  value={upcomingDays}
                  onChange={(e) => setUpcomingDays(Number(e.target.value))}
                  className="px-2 py-1.5 text-sm bg-blue-600 text-white border-l border-blue-400 rounded-r-lg cursor-pointer focus:outline-none hover:bg-blue-700"
                >
                  <option value={7}>7 días</option>
                  <option value={14}>14 días</option>
                  <option value={30}>30 días</option>
                  <option value={60}>60 días</option>
                  <option value={90}>90 días</option>
                  <option value={365}>Este año</option>
                  <option value={9999}>Todas</option>
                </select>
              )}
            </div>
          ))}
        </div>

      {/* Task list */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
          </div>
        ) : tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-gray-500">
            <span className="text-4xl mb-2">📝</span>
            <p>{searchQuery ? 'No se encontraron tareas' : 'No hay tareas'}</p>
            {!searchQuery && (
              <button
                onClick={handleCreateNew}
                className="mt-2 text-blue-500 hover:underline"
              >
                Crear una nueva
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {Object.entries(groupedTasks).map(([date, dateTasks]) => (
              <div key={date}>
                <div className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase bg-gray-50 dark:bg-gray-800 sticky top-0">
                  {date}
                </div>
                {dateTasks.map(task => (
                  <TaskItem
                    key={task.id}
                    task={task}
                    onComplete={handleComplete}
                    onReopen={handleReopen}
                    onDelete={handleDelete}
                    onEdit={handleEdit}
                    draggable={true}
                    onDragStart={handleDragStart}
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                  />
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal */}
      {isModalOpen && (
        <TaskModal
          task={editingTask}
          projects={projects}
          defaultProjectId={selectedProjectId}
          onClose={handleModalClose}
          onSave={handleModalSave}
        />
      )}

      {/* Project Modal */}
      {showProjectModal && (
        <ProjectModal
          project={editingProject}
          onClose={() => {
            setShowProjectModal(false);
            setEditingProject(null);
          }}
          onSave={handleProjectSave}
        />
      )}

      {/* Calendar View */}
      {showCalendar && (
        <CalendarView
          onTaskClick={(task) => {
            setShowCalendar(false);
            setEditingTask(task as Task);
            setIsModalOpen(true);
          }}
          onDateClick={(date) => {
            setShowCalendar(false);
            // Crear nueva tarea con la fecha seleccionada
            const newTask = {
              dueDate: date.toISOString(),
            };
            setEditingTask(newTask as Task);
            setIsModalOpen(true);
          }}
          onClose={() => setShowCalendar(false)}
          onTaskComplete={(taskId) => {
            // Actualizar la lista de tareas después de completar
            setTasks(prev => prev.filter(t => t.id !== taskId));
          }}
        />
      )}

      {/* Stats View */}
      {showStats && (
        <StatsView onClose={() => setShowStats(false)} />
      )}

      {/* Reminders View */}
      {showReminders && (
        <RemindersView 
          onClose={() => setShowReminders(false)}
          onEditTask={async (taskId) => {
            setShowReminders(false);
            try {
              const api = (window as any).electronAPI;
              const task = await api.getTask(taskId);
              if (task) {
                setEditingTask(task);
                setIsModalOpen(true);
              }
            } catch (error) {
              console.error('Error loading task for edit:', error);
            }
          }}
        />
      )}
    </div>
    </div>
  );
}
