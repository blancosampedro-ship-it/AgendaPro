/**
 * AppSettings - Panel de configuración general
 * Fase 6: Temas, Atajos globales, Export/Import
 * + IA: Configuración de OpenAI
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

interface AIConfig {
  model: string;
  enabled: boolean;
  hasApiKey: boolean;
}

interface Contact {
  id: string;
  name: string;
  email: string | null;
  color: string;
  _count: { tasks: number };
}

export default function AppSettings() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'general' | 'shortcuts' | 'data' | 'ai' | 'team'>('general');
  const [theme, setTheme] = useState<ThemeInfo | null>(null);
  const [shortcuts, setShortcuts] = useState<ShortcutConfig[]>([]);
  const [dataStats, setDataStats] = useState<DataStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  
  // AI Config
  const [aiConfig, setAIConfig] = useState<AIConfig | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [validatingKey, setValidatingKey] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  
  // Team / Contacts
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [newContactName, setNewContactName] = useState('');
  const [newContactEmail, setNewContactEmail] = useState('');
  const [editingContact, setEditingContact] = useState<Contact | null>(null);

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
      
      // Cargar config de IA
      const aiCfg = await window.electronAPI?.ai?.getConfig();
      setAIConfig(aiCfg || { model: 'gpt-4o-mini', enabled: false, hasApiKey: false });
      
      // Cargar contactos/equipo
      const contactsList = await window.electronAPI?.contacts?.getAll();
      setContacts(contactsList || []);
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

  // AI Functions
  const handleValidateAndSaveApiKey = async () => {
    if (!apiKeyInput.trim()) {
      showMessage('error', 'Ingresa una API Key');
      return;
    }
    
    setValidatingKey(true);
    try {
      const result = await window.electronAPI?.ai?.validateKey(apiKeyInput.trim());
      
      if (result?.valid) {
        await window.electronAPI?.ai?.saveConfig({ 
          apiKey: apiKeyInput.trim(),
          enabled: true 
        });
        setAIConfig(prev => prev ? { ...prev, hasApiKey: true, enabled: true } : null);
        setApiKeyInput('');
        showMessage('success', '✅ API Key válida y guardada');
      } else {
        showMessage('error', result?.error || 'API Key inválida');
      }
    } catch (error: any) {
      showMessage('error', error.message || 'Error al validar');
    } finally {
      setValidatingKey(false);
    }
  };

  const handleToggleAI = async (enabled: boolean) => {
    try {
      await window.electronAPI?.ai?.saveConfig({ enabled });
      setAIConfig(prev => prev ? { ...prev, enabled } : null);
      showMessage('success', enabled ? 'IA activada' : 'IA desactivada');
    } catch (error) {
      showMessage('error', 'Error al cambiar estado de IA');
    }
  };

  const handleModelChange = async (model: string) => {
    try {
      await window.electronAPI?.ai?.saveConfig({ model });
      setAIConfig(prev => prev ? { ...prev, model } : null);
    } catch (error) {
      showMessage('error', 'Error al cambiar modelo');
    }
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
            { id: 'team', label: 'Equipo', icon: '👥' },
            { id: 'ai', label: 'IA', icon: '🤖' },
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

          {/* Team Tab */}
          {activeTab === 'team' && (
            <div className="space-y-6">
              <section>
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                  Compañeros de equipo
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                  Añade personas a las que puedas asignar tareas.
                </p>
                
                {/* Add new contact */}
                <div className="flex gap-2 mb-4">
                  <input
                    type="text"
                    value={newContactName}
                    onChange={(e) => setNewContactName(e.target.value)}
                    placeholder="Nombre"
                    className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 text-sm"
                  />
                  <input
                    type="email"
                    value={newContactEmail}
                    onChange={(e) => setNewContactEmail(e.target.value)}
                    placeholder="Email (opcional)"
                    className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 text-sm"
                  />
                  <button
                    onClick={async () => {
                      if (!newContactName.trim()) return;
                      try {
                        await window.electronAPI?.contacts.create({
                          name: newContactName.trim(),
                          email: newContactEmail.trim() || undefined,
                        });
                        setNewContactName('');
                        setNewContactEmail('');
                        const list = await window.electronAPI?.contacts.getAll();
                        setContacts(list || []);
                        showMessage('success', 'Contacto añadido');
                      } catch (error) {
                        showMessage('error', 'Error al añadir contacto');
                      }
                    }}
                    disabled={!newContactName.trim()}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                  >
                    Añadir
                  </button>
                </div>
                
                {/* Contact list */}
                <div className="space-y-2">
                  {contacts.length === 0 ? (
                    <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">
                      No hay compañeros añadidos
                    </p>
                  ) : (
                    contacts.map(contact => (
                      <div 
                        key={contact.id}
                        className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg"
                      >
                        {/* Avatar */}
                        <div 
                          className="w-10 h-10 rounded-full flex items-center justify-center text-white font-medium"
                          style={{ backgroundColor: contact.color }}
                        >
                          {contact.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                        </div>
                        
                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          {editingContact?.id === contact.id ? (
                            <div className="flex gap-2">
                              <input
                                type="text"
                                value={editingContact.name}
                                onChange={(e) => setEditingContact({ ...editingContact, name: e.target.value })}
                                className="flex-1 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700"
                              />
                              <input
                                type="email"
                                value={editingContact.email || ''}
                                onChange={(e) => setEditingContact({ ...editingContact, email: e.target.value })}
                                placeholder="Email"
                                className="flex-1 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700"
                              />
                              <button
                                onClick={async () => {
                                  try {
                                    await window.electronAPI?.contacts.update(editingContact.id, {
                                      name: editingContact.name,
                                      email: editingContact.email || undefined,
                                    });
                                    setEditingContact(null);
                                    const list = await window.electronAPI?.contacts.getAll();
                                    setContacts(list || []);
                                    showMessage('success', 'Contacto actualizado');
                                  } catch (error) {
                                    showMessage('error', 'Error al actualizar');
                                  }
                                }}
                                className="px-2 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700"
                              >
                                ✓
                              </button>
                              <button
                                onClick={() => setEditingContact(null)}
                                className="px-2 py-1 text-sm bg-gray-500 text-white rounded hover:bg-gray-600"
                              >
                                ✕
                              </button>
                            </div>
                          ) : (
                            <>
                              <p className="font-medium text-gray-900 dark:text-white truncate">
                                {contact.name}
                              </p>
                              {contact.email && (
                                <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                                  {contact.email}
                                </p>
                              )}
                              <p className="text-xs text-gray-400">
                                {contact._count.tasks} tarea{contact._count.tasks !== 1 ? 's' : ''} asignada{contact._count.tasks !== 1 ? 's' : ''}
                              </p>
                            </>
                          )}
                        </div>
                        
                        {/* Actions */}
                        {editingContact?.id !== contact.id && (
                          <div className="flex gap-1">
                            <button
                              onClick={() => setEditingContact(contact)}
                              className="p-2 text-gray-400 hover:text-blue-600"
                              title="Editar"
                            >
                              ✏️
                            </button>
                            <button
                              onClick={async () => {
                                if (confirm(`¿Eliminar a ${contact.name}?`)) {
                                  try {
                                    await window.electronAPI?.contacts.delete(contact.id);
                                    const list = await window.electronAPI?.contacts.getAll();
                                    setContacts(list || []);
                                    showMessage('success', 'Contacto eliminado');
                                  } catch (error) {
                                    showMessage('error', 'Error al eliminar');
                                  }
                                }
                              }}
                              className="p-2 text-gray-400 hover:text-red-600"
                              title="Eliminar"
                            >
                              🗑️
                            </button>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </section>
            </div>
          )}

          {/* AI Tab */}
          {activeTab === 'ai' && (
            <div className="space-y-6">
              {/* Status */}
              <div className={`p-4 rounded-lg ${
                aiConfig?.enabled && aiConfig?.hasApiKey
                  ? 'bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800'
                  : 'bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600'
              }`}>
                <div className="flex items-center gap-3">
                  <span className="text-2xl">
                    {aiConfig?.enabled && aiConfig?.hasApiKey ? '🟢' : '⚪'}
                  </span>
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">
                      {aiConfig?.enabled && aiConfig?.hasApiKey 
                        ? 'IA activa' 
                        : aiConfig?.hasApiKey 
                          ? 'IA configurada pero desactivada'
                          : 'IA no configurada'}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {aiConfig?.hasApiKey 
                        ? `Modelo: ${aiConfig.model}`
                        : 'Necesitas agregar tu API Key de OpenAI'}
                    </p>
                  </div>
                </div>
              </div>

              {/* API Key Input */}
              <section>
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                  API Key de OpenAI
                </h3>
                <div className="space-y-3">
                  <div className="relative">
                    <input
                      type={showApiKey ? 'text' : 'password'}
                      value={apiKeyInput}
                      onChange={(e) => setApiKeyInput(e.target.value)}
                      placeholder={aiConfig?.hasApiKey ? '••••••••••••••••••••' : 'sk-...'}
                      className="w-full px-4 py-2.5 pr-20 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400"
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiKey(!showApiKey)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-gray-400 hover:text-gray-600"
                    >
                      {showApiKey ? '🙈' : '👁️'}
                    </button>
                  </div>
                  
                  <button
                    onClick={handleValidateAndSaveApiKey}
                    disabled={validatingKey || !apiKeyInput.trim()}
                    className="w-full px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                  >
                    {validatingKey ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        Validando...
                      </>
                    ) : (
                      <>✓ Validar y guardar</>
                    )}
                  </button>
                  
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Obtén tu API Key en{' '}
                    <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" 
                       className="text-blue-500 hover:underline">
                      platform.openai.com/api-keys
                    </a>
                  </p>
                </div>
              </section>

              {/* Model Selection */}
              {aiConfig?.hasApiKey && (
                <section>
                  <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                    Modelo
                  </h3>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', desc: 'Rápido y económico' },
                      { id: 'gpt-4o', name: 'GPT-4o', desc: 'Más potente' },
                    ].map(model => (
                      <button
                        key={model.id}
                        onClick={() => handleModelChange(model.id)}
                        className={`p-3 rounded-lg border-2 text-left transition-all ${
                          aiConfig.model === model.id
                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30'
                            : 'border-gray-200 dark:border-gray-600 hover:border-gray-300'
                        }`}
                      >
                        <div className="font-medium text-sm">{model.name}</div>
                        <div className="text-xs text-gray-500">{model.desc}</div>
                      </button>
                    ))}
                  </div>
                </section>
              )}

              {/* Enable/Disable Toggle */}
              {aiConfig?.hasApiKey && (
                <section>
                  <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">Activar asistente IA</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        Sugerencias inteligentes al crear tareas
                      </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={aiConfig.enabled}
                        onChange={(e) => handleToggleAI(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-600 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
                    </label>
                  </div>
                </section>
              )}

              {/* Features Info */}
              <section className="border-t border-gray-200 dark:border-gray-700 pt-4">
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                  Funciones de IA
                </h3>
                <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-2">
                  <li className="flex items-center gap-2">
                    <span>🔍</span> Detección automática de conflictos de horario
                  </li>
                  <li className="flex items-center gap-2">
                    <span>💡</span> Sugerencias de mejor momento para tareas
                  </li>
                  <li className="flex items-center gap-2">
                    <span>📋</span> Generación de subtareas automáticas
                  </li>
                  <li className="flex items-center gap-2">
                    <span>⚡</span> Priorización inteligente
                  </li>
                </ul>
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
