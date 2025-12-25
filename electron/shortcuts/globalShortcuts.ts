/**
 * GlobalShortcuts - Atajos de teclado globales
 * Fase 6: Atajos que funcionan incluso con la app en segundo plano
 */

import { globalShortcut, BrowserWindow, app } from 'electron';
import { getMainWindow, showMainWindow } from '../windows/mainWindow';
import { showQuickAddWindow } from '../windows/quickAddWindow';
import { logger } from '../utils/logger';

interface ShortcutConfig {
  accelerator: string;
  action: string;
  description: string;
  enabled: boolean;
}

const DEFAULT_SHORTCUTS: ShortcutConfig[] = [
  {
    accelerator: 'CommandOrControl+Shift+A',
    action: 'show-app',
    description: 'Mostrar/Ocultar AgendaPro',
    enabled: true,
  },
  {
    accelerator: 'CommandOrControl+Shift+N',
    action: 'new-task',
    description: 'Nueva tarea rápida',
    enabled: true,
  },
  {
    accelerator: 'CommandOrControl+Shift+S',
    action: 'quick-search',
    description: 'Búsqueda rápida',
    enabled: true,
  },
];

let registeredShortcuts: Map<string, ShortcutConfig> = new Map();
let shortcutHandlers: Map<string, () => void> = new Map();

/**
 * Registrar todos los atajos globales
 */
export function registerGlobalShortcuts(): void {
  logger.info('Registrando atajos globales...');
  
  // Definir handlers para cada acción
  shortcutHandlers.set('show-app', () => {
    const mainWindow = getMainWindow();
    if (mainWindow) {
      if (mainWindow.isVisible() && mainWindow.isFocused()) {
        mainWindow.hide();
      } else {
        showMainWindow();
      }
    }
  });
  
  shortcutHandlers.set('new-task', () => {
    // Abrir ventana de Quick Add
    showQuickAddWindow();
  });
  
  shortcutHandlers.set('quick-search', () => {
    const mainWindow = getMainWindow();
    if (mainWindow) {
      showMainWindow();
      // Enviar evento al renderer para enfocar búsqueda
      mainWindow.webContents.send('shortcut:quick-search');
    }
  });
  
  // Registrar shortcuts por defecto
  for (const shortcut of DEFAULT_SHORTCUTS) {
    if (shortcut.enabled) {
      registerShortcut(shortcut);
    }
  }
  
  logger.info(`${registeredShortcuts.size} atajos globales registrados`);
}

/**
 * Registrar un atajo específico
 */
function registerShortcut(config: ShortcutConfig): boolean {
  try {
    const handler = shortcutHandlers.get(config.action);
    if (!handler) {
      logger.warn(`No hay handler para la acción: ${config.action}`);
      return false;
    }
    
    const success = globalShortcut.register(config.accelerator, handler);
    
    if (success) {
      registeredShortcuts.set(config.accelerator, config);
      logger.debug(`Atajo registrado: ${config.accelerator} -> ${config.action}`);
    } else {
      logger.warn(`No se pudo registrar atajo: ${config.accelerator}`);
    }
    
    return success;
  } catch (error) {
    logger.error(`Error registrando atajo ${config.accelerator}:`, error);
    return false;
  }
}

/**
 * Desregistrar un atajo específico
 */
export function unregisterShortcut(accelerator: string): void {
  if (registeredShortcuts.has(accelerator)) {
    globalShortcut.unregister(accelerator);
    registeredShortcuts.delete(accelerator);
    logger.debug(`Atajo desregistrado: ${accelerator}`);
  }
}

/**
 * Desregistrar todos los atajos
 */
export function unregisterAllShortcuts(): void {
  globalShortcut.unregisterAll();
  registeredShortcuts.clear();
  logger.info('Todos los atajos globales desregistrados');
}

/**
 * Obtener lista de atajos registrados
 */
export function getRegisteredShortcuts(): ShortcutConfig[] {
  return Array.from(registeredShortcuts.values());
}

/**
 * Obtener configuración por defecto de atajos
 */
export function getDefaultShortcuts(): ShortcutConfig[] {
  return [...DEFAULT_SHORTCUTS];
}

/**
 * Verificar si un atajo está disponible
 */
export function isShortcutAvailable(accelerator: string): boolean {
  return !globalShortcut.isRegistered(accelerator);
}

/**
 * Actualizar un atajo (desregistrar viejo, registrar nuevo)
 */
export function updateShortcut(
  oldAccelerator: string,
  newConfig: ShortcutConfig
): boolean {
  // Desregistrar el viejo si existe
  if (registeredShortcuts.has(oldAccelerator)) {
    unregisterShortcut(oldAccelerator);
  }
  
  // Registrar el nuevo si está habilitado
  if (newConfig.enabled) {
    return registerShortcut(newConfig);
  }
  
  return true;
}

/**
 * Habilitar/deshabilitar un atajo
 */
export function toggleShortcut(accelerator: string, enabled: boolean): boolean {
  const config = registeredShortcuts.get(accelerator);
  
  if (enabled && config) {
    // Ya está registrado
    return true;
  }
  
  if (enabled) {
    // Buscar en defaults
    const defaultConfig = DEFAULT_SHORTCUTS.find(s => s.accelerator === accelerator);
    if (defaultConfig) {
      return registerShortcut({ ...defaultConfig, enabled: true });
    }
    return false;
  } else {
    // Deshabilitar
    unregisterShortcut(accelerator);
    return true;
  }
}

// Cleanup al cerrar la app
app.on('will-quit', () => {
  unregisterAllShortcuts();
});
