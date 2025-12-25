/**
 * ProjectModal Component
 * Modal para crear y editar proyectos
 */

'use client';

import { useState, useEffect } from 'react';

interface Project {
  id: string;
  name: string;
  color: string;
  icon: string | null;
}

interface ProjectModalProps {
  project?: Project | null; // null = crear nuevo, Project = editar
  onClose: () => void;
  onSave: () => void;
}

// Paleta de colores predefinidos
const COLOR_PALETTE = [
  // Azules
  { name: 'Azul', value: '#3B82F6' },
  { name: 'Azul Cielo', value: '#0EA5E9' },
  { name: 'Índigo', value: '#6366F1' },
  { name: 'Cian', value: '#06B6D4' },
  // Verdes
  { name: 'Verde', value: '#22C55E' },
  { name: 'Esmeralda', value: '#10B981' },
  { name: 'Verde Lima', value: '#84CC16' },
  { name: 'Teal', value: '#14B8A6' },
  // Cálidos
  { name: 'Rojo', value: '#EF4444' },
  { name: 'Naranja', value: '#F97316' },
  { name: 'Ámbar', value: '#F59E0B' },
  { name: 'Amarillo', value: '#EAB308' },
  // Otros
  { name: 'Rosa', value: '#EC4899' },
  { name: 'Fucsia', value: '#D946EF' },
  { name: 'Violeta', value: '#8B5CF6' },
  { name: 'Púrpura', value: '#A855F7' },
  // Neutros
  { name: 'Gris', value: '#6B7280' },
  { name: 'Slate', value: '#64748B' },
  { name: 'Zinc', value: '#71717A' },
  { name: 'Stone', value: '#78716C' },
];

// Iconos disponibles
const ICON_OPTIONS = [
  { emoji: '📁', name: 'Carpeta' },
  { emoji: '💼', name: 'Trabajo' },
  { emoji: '🏠', name: 'Casa' },
  { emoji: '💰', name: 'Finanzas' },
  { emoji: '🎯', name: 'Objetivos' },
  { emoji: '📚', name: 'Estudio' },
  { emoji: '🏋️', name: 'Ejercicio' },
  { emoji: '🛒', name: 'Compras' },
  { emoji: '✈️', name: 'Viajes' },
  { emoji: '🎨', name: 'Creatividad' },
  { emoji: '💻', name: 'Tecnología' },
  { emoji: '📱', name: 'Apps' },
  { emoji: '🎮', name: 'Gaming' },
  { emoji: '🎵', name: 'Música' },
  { emoji: '📷', name: 'Fotos' },
  { emoji: '🍽️', name: 'Comida' },
  { emoji: '🚗', name: 'Auto' },
  { emoji: '🏥', name: 'Salud' },
  { emoji: '👨‍👩‍👧', name: 'Familia' },
  { emoji: '🐕', name: 'Mascotas' },
  { emoji: '🌱', name: 'Jardín' },
  { emoji: '📝', name: 'Notas' },
  { emoji: '⭐', name: 'Favoritos' },
  { emoji: '🔧', name: 'Herramientas' },
];

export function ProjectModal({ project, onClose, onSave }: ProjectModalProps) {
  const [name, setName] = useState(project?.name || '');
  const [color, setColor] = useState(project?.color || '#3B82F6');
  const [icon, setIcon] = useState(project?.icon || '📁');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [customColor, setCustomColor] = useState(color);

  const isEditing = !!project;

  // Cerrar con Escape
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name.trim()) {
      setError('El nombre del proyecto es requerido');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const api = (window as any).electronAPI;
      
      if (!api) {
        setError('Error: La aplicación debe ejecutarse desde Electron, no desde el navegador.');
        setSaving(false);
        return;
      }
      
      if (isEditing && project) {
        await api.updateProject(project.id, {
          name: name.trim(),
          color,
          icon,
        });
      } else {
        await api.createProject({
          name: name.trim(),
          color,
          icon,
        });
      }

      onSave();
    } catch (err) {
      console.error('Error saving project:', err);
      setError('Error al guardar el proyecto. Intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4">
      <div 
        className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div 
          className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0"
          style={{ backgroundColor: color + '20' }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-3xl">{icon}</span>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                {isEditing ? 'Editar Proyecto' : 'Nuevo Proyecto'}
              </h2>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Form - Scrollable */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto flex-1">
          {/* Vista previa */}
          <div className="flex justify-center">
            <div 
              className="flex items-center gap-3 px-6 py-3 rounded-xl shadow-lg"
              style={{ backgroundColor: color + '30', borderLeft: `4px solid ${color}` }}
            >
              <span className="text-2xl">{icon}</span>
              <span 
                className="font-semibold text-lg"
                style={{ color: color }}
              >
                {name || 'Mi Proyecto'}
              </span>
            </div>
          </div>

          {/* Nombre */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Nombre del proyecto
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Trabajo, Personal, Vacaciones..."
              className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg"
              autoFocus
            />
          </div>

          {/* Color */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Color
            </label>
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setShowColorPicker(!showColorPicker);
                  setShowIconPicker(false);
                }}
                className="w-full flex items-center gap-3 px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
              >
                <div 
                  className="w-8 h-8 rounded-lg shadow-inner"
                  style={{ backgroundColor: color }}
                />
                <span className="text-gray-700 dark:text-gray-300">
                  {COLOR_PALETTE.find(c => c.value === color)?.name || 'Color personalizado'}
                </span>
                <svg className={`w-5 h-5 ml-auto text-gray-400 transition-transform ${showColorPicker ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* Color picker dropdown */}
              {showColorPicker && (
                <div className="absolute top-full left-0 right-0 mt-2 p-4 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg shadow-xl z-10">
                  <div className="grid grid-cols-5 gap-2 mb-3">
                    {COLOR_PALETTE.map((c) => (
                      <button
                        key={c.value}
                        type="button"
                        onClick={() => {
                          setColor(c.value);
                          setCustomColor(c.value);
                          setShowColorPicker(false);
                        }}
                        className={`w-10 h-10 rounded-lg transition-transform hover:scale-110 ${
                          color === c.value ? 'ring-2 ring-offset-2 ring-blue-500' : ''
                        }`}
                        style={{ backgroundColor: c.value }}
                        title={c.name}
                      />
                    ))}
                  </div>
                  {/* Color personalizado */}
                  <div className="flex items-center gap-2 pt-3 border-t border-gray-200 dark:border-gray-600">
                    <input
                      type="color"
                      value={customColor}
                      onChange={(e) => {
                        setCustomColor(e.target.value);
                        setColor(e.target.value);
                      }}
                      className="w-10 h-10 rounded cursor-pointer"
                    />
                    <span className="text-sm text-gray-500 dark:text-gray-400">Color personalizado</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Icono */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Icono
            </label>
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setShowIconPicker(!showIconPicker);
                  setShowColorPicker(false);
                }}
                className="w-full flex items-center gap-3 px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
              >
                <span className="text-2xl">{icon}</span>
                <span className="text-gray-700 dark:text-gray-300">
                  {ICON_OPTIONS.find(i => i.emoji === icon)?.name || 'Icono'}
                </span>
                <svg className={`w-5 h-5 ml-auto text-gray-400 transition-transform ${showIconPicker ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* Icon picker dropdown */}
              {showIconPicker && (
                <div className="absolute top-full left-0 right-0 mt-2 p-4 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg shadow-xl z-10 max-h-48 overflow-y-auto">
                  <div className="grid grid-cols-6 gap-2">
                    {ICON_OPTIONS.map((i) => (
                      <button
                        key={i.emoji}
                        type="button"
                        onClick={() => {
                          setIcon(i.emoji);
                          setShowIconPicker(false);
                        }}
                        className={`w-10 h-10 flex items-center justify-center text-xl rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors ${
                          icon === i.emoji ? 'bg-blue-100 dark:bg-blue-900 ring-2 ring-blue-500' : ''
                        }`}
                        title={i.name}
                      >
                        {i.emoji}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          {/* Buttons */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors font-medium"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving || !name.trim()}
              className="flex-1 px-4 py-3 rounded-lg text-white font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              style={{ backgroundColor: color }}
            >
              {saving ? (
                <>
                  <span className="animate-spin">⏳</span>
                  Guardando...
                </>
              ) : (
                <>
                  {isEditing ? '💾 Guardar' : '✨ Crear Proyecto'}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
