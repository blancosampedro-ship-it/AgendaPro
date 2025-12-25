/**
 * StatsView Component
 * Dashboard de estadísticas y productividad
 * Fase 7
 */

'use client';

import { useState, useEffect, useCallback } from 'react';

interface TaskStats {
  total: number;
  completed: number;
  pending: number;
  overdue: number;
  completedToday: number;
  completedThisWeek: number;
  completedThisMonth: number;
  byPriority: { [key: number]: number };
  byProject: { name: string; color: string; count: number; completed: number }[];
  completionRate: number;
  averageCompletionTime: number | null;
  streak: number;
  dailyHistory: { date: string; completed: number }[];
}

interface StatsViewProps {
  onClose?: () => void;
}

export default function StatsView({ onClose }: StatsViewProps) {
  const [stats, setStats] = useState<TaskStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<'week' | 'month' | 'year'>('week');

  const fetchStats = useCallback(async () => {
    try {
      setLoading(true);
      const api = (window as any).electronAPI;
      if (!api) return;

      // Obtener todas las tareas
      const allTasks = await api.getAllTasks();
      const completedTasks = allTasks.filter((t: any) => t.completedAt);
      const pendingTasks = allTasks.filter((t: any) => !t.completedAt);
      
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const weekAgo = new Date(today);
      weekAgo.setDate(weekAgo.getDate() - 7);
      const monthAgo = new Date(today);
      monthAgo.setMonth(monthAgo.getMonth() - 1);

      // Tareas vencidas
      const overdue = pendingTasks.filter((t: any) => 
        t.dueDate && new Date(t.dueDate) < now
      ).length;

      // Completadas hoy
      const completedToday = completedTasks.filter((t: any) => {
        const completed = new Date(t.completedAt);
        return completed >= today;
      }).length;

      // Completadas esta semana
      const completedThisWeek = completedTasks.filter((t: any) => {
        const completed = new Date(t.completedAt);
        return completed >= weekAgo;
      }).length;

      // Completadas este mes
      const completedThisMonth = completedTasks.filter((t: any) => {
        const completed = new Date(t.completedAt);
        return completed >= monthAgo;
      }).length;

      // Por prioridad
      const byPriority: { [key: number]: number } = { 0: 0, 1: 0, 2: 0, 3: 0 };
      pendingTasks.forEach((t: any) => {
        byPriority[t.priority] = (byPriority[t.priority] || 0) + 1;
      });

      // Por proyecto
      const projects = await api.getAllProjects();
      const byProject = projects.map((p: any) => {
        const projectTasks = allTasks.filter((t: any) => t.projectId === p.id);
        return {
          name: p.name,
          color: p.color,
          count: projectTasks.length,
          completed: projectTasks.filter((t: any) => t.completedAt).length
        };
      });

      // Inbox (sin proyecto)
      const inboxTasks = allTasks.filter((t: any) => !t.projectId);
      byProject.unshift({
        name: 'Inbox',
        color: '#6B7280',
        count: inboxTasks.length,
        completed: inboxTasks.filter((t: any) => t.completedAt).length
      });

      // Tasa de completado
      const completionRate = allTasks.length > 0 
        ? Math.round((completedTasks.length / allTasks.length) * 100) 
        : 0;

      // Historial diario (últimos 7/30/365 días)
      const daysCount = timeRange === 'week' ? 7 : timeRange === 'month' ? 30 : 365;
      const dailyHistory: { date: string; completed: number }[] = [];
      
      for (let i = daysCount - 1; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];
        
        const count = completedTasks.filter((t: any) => {
          const completed = new Date(t.completedAt);
          return completed.toISOString().split('T')[0] === dateStr;
        }).length;
        
        dailyHistory.push({
          date: date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }),
          completed: count
        });
      }

      // Racha de días consecutivos
      let streak = 0;
      for (let i = 0; i < 365; i++) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];
        
        const hasCompleted = completedTasks.some((t: any) => 
          new Date(t.completedAt).toISOString().split('T')[0] === dateStr
        );
        
        if (hasCompleted) {
          streak++;
        } else if (i > 0) {
          break;
        }
      }

      setStats({
        total: allTasks.length,
        completed: completedTasks.length,
        pending: pendingTasks.length,
        overdue,
        completedToday,
        completedThisWeek,
        completedThisMonth,
        byPriority,
        byProject,
        completionRate,
        averageCompletionTime: null,
        streak,
        dailyHistory
      });
    } catch (error) {
      console.error('Error fetching stats:', error);
    } finally {
      setLoading(false);
    }
  }, [timeRange]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const maxDaily = stats ? Math.max(...stats.dailyHistory.map(d => d.completed), 1) : 1;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">
            📊 Estadísticas
          </h2>
          
          <div className="flex items-center gap-4">
            {/* Time range selector */}
            <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
              {(['week', 'month', 'year'] as const).map(range => (
                <button
                  key={range}
                  onClick={() => setTimeRange(range)}
                  className={`px-3 py-1 rounded text-sm transition-colors ${
                    timeRange === range
                      ? 'bg-white dark:bg-gray-600 shadow text-gray-900 dark:text-white'
                      : 'text-gray-600 dark:text-gray-400'
                  }`}
                >
                  {range === 'week' ? 'Semana' : range === 'month' ? 'Mes' : 'Año'}
                </button>
              ))}
            </div>
            
            {onClose && (
              <button
                onClick={onClose}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
            </div>
          ) : stats ? (
            <div className="space-y-6">
              {/* Key Metrics */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-4 text-white">
                  <div className="text-3xl font-bold">{stats.pending}</div>
                  <div className="text-blue-100 text-sm">Pendientes</div>
                </div>
                <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl p-4 text-white">
                  <div className="text-3xl font-bold">{stats.completedToday}</div>
                  <div className="text-green-100 text-sm">Completadas hoy</div>
                </div>
                <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl p-4 text-white">
                  <div className="text-3xl font-bold">{stats.overdue}</div>
                  <div className="text-orange-100 text-sm">Vencidas</div>
                </div>
                <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl p-4 text-white">
                  <div className="text-3xl font-bold">{stats.streak}🔥</div>
                  <div className="text-purple-100 text-sm">Racha de días</div>
                </div>
              </div>

              {/* Completion Rate */}
              <div className="bg-gray-50 dark:bg-gray-900 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Tasa de completado
                  </span>
                  <span className="text-lg font-bold text-gray-900 dark:text-white">
                    {stats.completionRate}%
                  </span>
                </div>
                <div className="w-full h-4 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-green-400 to-green-600 rounded-full transition-all duration-500"
                    style={{ width: `${stats.completionRate}%` }}
                  />
                </div>
                <div className="flex justify-between mt-2 text-xs text-gray-500">
                  <span>{stats.completed} completadas</span>
                  <span>{stats.total} total</span>
                </div>
              </div>

              {/* Activity Chart */}
              <div className="bg-gray-50 dark:bg-gray-900 rounded-xl p-4">
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-4">
                  Actividad ({timeRange === 'week' ? 'últimos 7 días' : timeRange === 'month' ? 'último mes' : 'último año'})
                </h3>
                <div className="flex items-end gap-1 h-32">
                  {stats.dailyHistory.map((day, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center">
                      <div 
                        className="w-full bg-blue-500 rounded-t transition-all hover:bg-blue-600"
                        style={{ height: `${(day.completed / maxDaily) * 100}%`, minHeight: day.completed > 0 ? '4px' : '0' }}
                        title={`${day.date}: ${day.completed} tareas`}
                      />
                      {(timeRange === 'week' || (timeRange === 'month' && i % 5 === 0)) && (
                        <span className="text-[10px] text-gray-400 mt-1 rotate-[-45deg] origin-top-left whitespace-nowrap">
                          {day.date}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* By Priority & By Project */}
              <div className="grid md:grid-cols-2 gap-4">
                {/* By Priority */}
                <div className="bg-gray-50 dark:bg-gray-900 rounded-xl p-4">
                  <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                    Por prioridad (pendientes)
                  </h3>
                  <div className="space-y-2">
                    {[
                      { key: 3, label: 'Alta', color: 'bg-red-500', emoji: '🔴' },
                      { key: 2, label: 'Media', color: 'bg-yellow-500', emoji: '🟡' },
                      { key: 1, label: 'Baja', color: 'bg-green-500', emoji: '🟢' },
                      { key: 0, label: 'Sin prioridad', color: 'bg-gray-400', emoji: '⚪' },
                    ].map(p => (
                      <div key={p.key} className="flex items-center gap-2">
                        <span>{p.emoji}</span>
                        <span className="text-sm text-gray-600 dark:text-gray-400 flex-1">{p.label}</span>
                        <span className="font-medium text-gray-900 dark:text-white">
                          {stats.byPriority[p.key] || 0}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* By Project */}
                <div className="bg-gray-50 dark:bg-gray-900 rounded-xl p-4">
                  <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                    Por proyecto
                  </h3>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {stats.byProject.map((p, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span 
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: p.color }}
                        />
                        <span className="text-sm text-gray-600 dark:text-gray-400 flex-1 truncate">
                          {p.name}
                        </span>
                        <span className="text-xs text-gray-400">
                          {p.completed}/{p.count}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Summary */}
              <div className="grid grid-cols-3 gap-4 text-center">
                <div className="bg-gray-50 dark:bg-gray-900 rounded-xl p-3">
                  <div className="text-2xl font-bold text-gray-900 dark:text-white">
                    {stats.completedThisWeek}
                  </div>
                  <div className="text-xs text-gray-500">Esta semana</div>
                </div>
                <div className="bg-gray-50 dark:bg-gray-900 rounded-xl p-3">
                  <div className="text-2xl font-bold text-gray-900 dark:text-white">
                    {stats.completedThisMonth}
                  </div>
                  <div className="text-xs text-gray-500">Este mes</div>
                </div>
                <div className="bg-gray-50 dark:bg-gray-900 rounded-xl p-3">
                  <div className="text-2xl font-bold text-gray-900 dark:text-white">
                    {stats.completed}
                  </div>
                  <div className="text-xs text-gray-500">Total completadas</div>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center text-gray-500 py-8">
              No hay datos disponibles
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
