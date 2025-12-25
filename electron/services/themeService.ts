/**
 * ThemeService - Gestión de temas de la aplicación
 * Fase 6: Temas claro/oscuro/sistema con persistencia
 */

import { nativeTheme, BrowserWindow } from 'electron';
import { getDatabase } from '../database/connection';
import { logger } from '../utils/logger';
import { getDeviceId } from '../utils/deviceId';

export type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeConfig {
  mode: ThemeMode;
  accentColor?: string;
}

let currentTheme: ThemeMode = 'system';
let mainWindow: BrowserWindow | null = null;

/**
 * Inicializar servicio de temas
 */
export async function initThemeService(window: BrowserWindow): Promise<void> {
  mainWindow = window;
  
  // Cargar tema guardado
  const savedTheme = await loadSavedTheme();
  currentTheme = savedTheme;
  
  // Aplicar tema inicial
  applyTheme(savedTheme);
  
  // Escuchar cambios del sistema
  nativeTheme.on('updated', () => {
    if (currentTheme === 'system') {
      notifyRendererThemeChange();
    }
  });
  
  logger.info(`Tema inicializado: ${savedTheme}`);
}

/**
 * Cargar tema guardado de la base de datos
 */
async function loadSavedTheme(): Promise<ThemeMode> {
  try {
    const db = getDatabase();
    const settings = await db.settings.findUnique({
      where: { id: 'main' },
    });
    
    if (settings?.theme) {
      const value = settings.theme as ThemeMode;
      if (['light', 'dark', 'system'].includes(value)) {
        return value;
      }
    }
  } catch (error) {
    logger.warn('No se pudo cargar tema guardado, usando system');
  }
  
  return 'system';
}

/**
 * Guardar tema en la base de datos
 */
async function saveTheme(mode: ThemeMode): Promise<void> {
  try {
    const db = getDatabase();
    await db.settings.upsert({
      where: { id: 'main' },
      update: { theme: mode },
      create: { 
        id: 'main',
        theme: mode,
        deviceId: getDeviceId(),
      },
    });
  } catch (error) {
    logger.error('Error guardando tema:', error);
  }
}

/**
 * Aplicar un tema
 */
export function applyTheme(mode: ThemeMode): void {
  currentTheme = mode;
  
  // Configurar nativeTheme de Electron
  switch (mode) {
    case 'light':
      nativeTheme.themeSource = 'light';
      break;
    case 'dark':
      nativeTheme.themeSource = 'dark';
      break;
    case 'system':
    default:
      nativeTheme.themeSource = 'system';
      break;
  }
  
  // Notificar al renderer
  notifyRendererThemeChange();
}

/**
 * Cambiar tema y persistir
 */
export async function setTheme(mode: ThemeMode): Promise<void> {
  applyTheme(mode);
  await saveTheme(mode);
  logger.info(`Tema cambiado a: ${mode}`);
}

/**
 * Obtener tema actual
 */
export function getCurrentTheme(): ThemeMode {
  return currentTheme;
}

/**
 * Obtener si el tema actual es oscuro (considerando 'system')
 */
export function isDarkMode(): boolean {
  if (currentTheme === 'system') {
    return nativeTheme.shouldUseDarkColors;
  }
  return currentTheme === 'dark';
}

/**
 * Obtener información completa del tema
 */
export function getThemeInfo(): {
  mode: ThemeMode;
  isDark: boolean;
  systemPrefersDark: boolean;
} {
  return {
    mode: currentTheme,
    isDark: isDarkMode(),
    systemPrefersDark: nativeTheme.shouldUseDarkColors,
  };
}

/**
 * Notificar al renderer sobre cambio de tema
 */
function notifyRendererThemeChange(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('theme:changed', getThemeInfo());
  }
}

/**
 * Ciclar entre temas (light -> dark -> system -> light)
 */
export async function cycleTheme(): Promise<ThemeMode> {
  const cycle: ThemeMode[] = ['light', 'dark', 'system'];
  const currentIndex = cycle.indexOf(currentTheme);
  const nextIndex = (currentIndex + 1) % cycle.length;
  const nextTheme = cycle[nextIndex];
  
  await setTheme(nextTheme);
  return nextTheme;
}
