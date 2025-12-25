/**
 * AppSettings - Panel de configuración general
 * Fase 6: Temas, Atajos globales, Export/Import
 */

'use client';

import { useState, useEffect } from 'react';

interface ThemeInfo {
  mode: 'light' | 'dark' | 'system';
  isDark: boolean;
  systemPrefersDark: boolean;
}

interface ShortcutConfig {
  accelerator: string;
  action: string;
  description: string;
  enabled: boolean;
}

interface DataStats {
  projects: number;
  tasks: number;
  completedTasks: number;
  tags: number;
  reminders: number;
}

export default function AppSettings() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'general' | 'shortcuts' | 'data'>('general');
  const [theme, setTheme] = useState<ThemeInfo | null>(null);
  const [shortcuts, setShortcuts] = useState<ShortcutConfig[]>([]);
  const [dataStats, setDataStats] = useState<DataStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadSettings();
    }
  }, [isOpen]);

  // Escuchar cambios de tema
  useEffect(() => {
    const handleThemeChange = (themeInfo: unknown) => {
      setTheme(themeInfo as ThemeInfo);
    };
    
    window.electronAPI?.on('theme:changed', handleThemeChange);
    
    return () => {
      window.electronAPI?.removeListener('theme:changed', handleThemeChange);
    };
  }, []);

  const loadSettings = async () => {
    try {
      // Cargar tema
      const themeInfo = await window.electronAPI?.theme.get();
      setTheme(themeInfo);

      // Cargar atajos
      const shortcutsData = await window.electronAPI?.shortcuts.getAll();
      setShortcuts(shortcutsData?.defaults || []);

      // Cargar estadísticas
      const stats = await window.electronAPI?.export.getStats();
      setDataStats(stats);
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  };

  const handleThemeChange = async (newMode: 'light' | 'dark' | 'system') => {
    try {
      await window.electronAPI?.theme.set(newMode);
      setTheme(prev => prev ? { ...prev, mode: newMode } : null);
      showMessage('success', `Tema cambiado a ${newMode === 'system' ? 'automático' : newMode === 'dark' ? 'oscuro' : 'claro'}`);
    } catch (error) {
      showMessage('error', 'Error al cambiar el tema');
    }
  };

  const handleShortcutToggle = async (accelerator: string, enabled: boolean) => {
    try {
      await window.electronAPI?.shortcuts.toggle(accelerator, enabled);
      setShortcuts(prev => 
        prev.map(s => s.accelerator === accelerator ? { ...s, enabled } : s)
      );
    } catch (error) {
      showMessage('error', 'Error al cambiar el atajo');
    }
  };

  const handleExport = async (includeCompleted: boolean) => {
    setLoading(true);
    try {
      const result = await window.electronAPI?.export.toJSON({ includeCompleted });
      if (result?.success) {
        showMessage('success', `Datos exportados a: ${result.filePath}`);
      } else {
        showMessage('error', result?.error || 'Error al exportar');
      }
    } catch (error: any) {
      showMessage('error', error.message || 'Error al exportar');
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async (merge: boolean) => {
    setLoading(true);
    try {
      const result = await window.electronAPI?.import.fromJSON({ merge });
      if (result?.success) {
        const stats = result.imported;
        showMessage('success', 
          `Importado: ${stats?.tasks || 0} tareas, ${stats?.projects || 0} proyectos, ${stats?.tags || 0} etiquetas`
        );
        await loadSettings(); // Recargar estadísticas
      } else {
        showMessage('error', result?.message || 'Error al importar');
      }
    } catch (error: any) {
      showMessage('error', error.message || 'Error al importar');
    } finally {
      setLoading(false);
    }
  };

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 4000);
  };

  const formatAccelerator = (acc: string) => {
    return acc
      .replace('CommandOrControl', '⌘')
      .replace('Shift', '⇧')
      .replace('+', ' + ');
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        title="Ajustes"
      >
        <svg className="w-5 h-5 text-gray-600 dark:text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Ajustes
          </h2>
          <button
            onClick={() => setIsOpen(false)}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 dark:border-gray-700">
          {[
            { id: 'general', label: 'General', icon: '⚙️' },
            { id: 'shortcuts', label: 'Atajos', icon: '⌨️' },
            { id: 'data', label: 'Datos', icon: '💾' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex-1 py-3 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'
              }`}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Message */}
          {message && (
            <div className={`mb-4 p-3 rounded-lg text-sm ${
              message.type === 'success' 
                ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' 
                : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
            }`}>
              {message.text}
            </div>
          )}

          {/* General Tab */}
          {activeTab === 'general' && (
            <div className="space-y-6">
              {/* Theme Section */}
              <section>
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                  Tema de la aplicación
                </h3>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { mode: 'light', label: 'Claro', icon: '☀️' },
                    { mode: 'dark', label: 'Oscuro', icon: '🌙' },
                    { mode: 'system', label: 'Sistema', icon: '💻' },
                  ].map(option => (
                    <button
                      key={option.mode}
                      onClick={() => handleThemeChange(option.mode as any)}
                      className={`p-3 rounded-lg border-2 transition-all ${
                        theme?.mode === option.mode
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30'
                          : 'border-gray-200 dark:border-gray-600 hover:border-gray-300'
                      }`}
                    >
                      <div className="text-2xl mb-1">{option.icon}</div>
                      <div className="text-sm font-medium">{option.label}</div>
                    </button>
                  ))}
                </div>
                {theme?.mode === 'system' && (
                  <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                    Actualmente usando tema {theme.systemPrefersDark ? 'oscuro' : 'claro'} según el sistema
                  </p>
                )}
              </section>

              {/* App Info */}
              <section>
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                  Información
                </h3>
                <div className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                  <p>AgendaPro v0.1.0</p>
                  <p>© 2025 - Tu secretaria virtual</p>
                </div>
              </section>
            </div>
          )}

          {/* Shortcuts Tab */}
          {activeTab === 'shortcuts' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Atajos globales que funcionan incluso cuando la app está en segundo plano.
              </p>
              
              {shortcuts.map(shortcut => (
                <div key={shortcut.accelerator} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">
                      {shortcut.description}
                    </p>
                    <code className="text-xs text-gray-500 dark:text-gray-400 bg-gray-200 dark:bg-gray-600 px-2 py-0.5 rounded">
                      {formatAccelerator(shortcut.accelerator)}
                    </code>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={shortcut.enabled}
                      onChange={(e) => handleShortcutToggle(shortcut.accelerator, e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-600 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
                  </label>
                </div>
              ))}

              <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <p className="text-xs text-blue-800 dark:text-blue-300">
                  💡 <strong>Tip:</strong> Usa ⌘ + ⇧ + A para mostrar/ocultar AgendaPro desde cualquier aplicación.
                </p>
              </div>
            </div>
          )}

          {/* Data Tab */}
          {activeTab === 'data' && (
            <div className="space-y-6">
              {/* Stats */}
              {dataStats && (
                <section>
                  <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                    Estadísticas actuales
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg text-center">
                      <div className="text-2xl font-bold text-blue-600">{dataStats.tasks}</div>
                      <div className="text-xs text-gray-500">Tareas ({dataStats.completedTasks} completadas)</div>
                    </div>
                    <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg text-center">
                      <div className="text-2xl font-bold text-green-600">{dataStats.projects}</div>
                      <div className="text-xs text-gray-500">Proyectos</div>
                    </div>
                    <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg text-center">
                      <div className="text-2xl font-bold text-purple-600">{dataStats.tags}</div>
                      <div className="text-xs text-gray-500">Etiquetas</div>
                    </div>
                    <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg text-center">
                      <div className="text-2xl font-bold text-orange-600">{dataStats.reminders}</div>
                      <div className="text-xs text-gray-500">Recordatorios</div>
                    </div>
                  </div>
                </section>
              )}

              {/* Export */}
              <section>
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                  Exportar datos
                </h3>
                <div className="space-y-2">
                  <button
                    onClick={() => handleExport(false)}
                    disabled={loading}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                    Exportar tareas activas
                  </button>
                  <button
                    onClick={() => handleExport(true)}
                    disabled={loading}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors"
                  >
                    Exportar todo (incluyendo completadas)
                  </button>
                </div>
              </section>

              {/* Import */}
              <section>
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                  Importar datos
                </h3>
                <div className="space-y-2">
                  <button
                    onClick={() => handleImport(true)}
                    disabled={loading}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Importar (combinar con existentes)
                  </button>
                  <button
                    onClick={() => {
                      if (confirm('⚠️ Esto eliminará todos tus datos actuales. ¿Continuar?')) {
                        handleImport(false);
                      }
                    }}
                    disabled={loading}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border border-red-300 dark:border-red-600 text-red-600 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 transition-colors"
                  >
                    Importar (reemplazar todo)
                  </button>
                </div>
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  Formato soportado: JSON exportado desde AgendaPro
                </p>
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
