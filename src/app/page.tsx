'use client';

import { TaskList } from '../components/TaskList';

/**
 * Página principal - Lista de tareas
 * Vista inicial: Próximos 7 días
 */
export default function HomePage() {
  return (
    <div className="h-full">
      <TaskList initialFilter="upcoming" />
    </div>
  );
}interface StatusItemProps {
  label: string;
  value: string;
  status: 'success' | 'error' | 'info';
}

function StatusItem({ label, value, status }: StatusItemProps) {
  const statusColors = {
    success: 'text-green-600 dark:text-green-400',
    error: 'text-red-600 dark:text-red-400',
    info: 'text-blue-600 dark:text-blue-400',
  };

  const statusIcons = {
    success: '✓',
    error: '✗',
    info: '●',
  };

  return (
    <div className="flex justify-between items-center py-2 border-b border-gray-200 dark:border-gray-700 last:border-0">
      <span className="text-gray-600 dark:text-gray-300">{label}</span>
      <span className={`font-medium ${statusColors[status]}`}>
        {statusIcons[status]} {value}
      </span>
    </div>
  );
}
