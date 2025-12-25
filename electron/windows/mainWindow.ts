/**
 * Main Window Manager
 * Gestiona la ventana principal de la aplicación
 */

import { BrowserWindow, shell, Menu, MenuItemConstructorOptions, app } from 'electron';
import * as path from 'path';
import { logger } from '../utils/logger';

let mainWindow: BrowserWindow | null = null;
let forceQuit = false; // Bandera para forzar cierre

/**
 * Establece si se debe forzar el cierre (llamado desde main.ts)
 */
export function setForceQuit(value: boolean): void {
  forceQuit = value;
  logger.debug(`Force quit set to: ${value}`);
}

// Configuración de ventana
const WINDOW_CONFIG = {
  width: 1200,
  height: 800,
  minWidth: 800,
  minHeight: 600,
  titleBarStyle: 'hiddenInset' as const, // macOS native look
  trafficLightPosition: { x: 16, y: 16 },
  backgroundColor: '#ffffff',
  show: false, // No mostrar hasta que esté lista
};

/**
 * Crea la ventana principal
 */
export async function createMainWindow(devServerUrl: string | null): Promise<BrowserWindow> {
  logger.debug('Creating main window...');
  
  const preloadPath = path.join(__dirname, '../preload.js');
  logger.debug(`Preload path: ${preloadPath}`);

  mainWindow = new BrowserWindow({
    ...WINDOW_CONFIG,
    webPreferences: {
      preload: preloadPath,
      // ⚠️ SEGURIDAD: Configuración estricta
      nodeIntegration: false,
      contextIsolation: true,
      // sandbox: false para permitir preload script
      sandbox: false,
      webSecurity: true,
    },
  });

  // Mostrar cuando esté lista (evita flash blanco)
  mainWindow.once('ready-to-show', () => {
    logger.debug('Main window ready to show');
    mainWindow?.show();
  });

  // IMPORTANTE: Cerrar ventana NO cierra la app
  // Solo la oculta para que siga funcionando en menubar/tray
  // EXCEPTO cuando el usuario usa ⌘Q o "Salir"
  mainWindow.on('close', (event) => {
    if (!forceQuit) {
      // Solo ocultar, no cerrar
      event.preventDefault();
      mainWindow?.hide();
      logger.debug('Main window hidden (not closed)');
    } else {
      // Permitir cierre real cuando la app está saliendo
      logger.debug('Main window closing (app quitting)');
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    logger.debug('Main window reference cleared');
  });

  // Abrir links externos en navegador por defecto
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Menú contextual (clic derecho) para copiar/pegar
  mainWindow.webContents.on('context-menu', (_event, params) => {
    const { isEditable, selectionText, editFlags } = params;
    
    const menuTemplate: MenuItemConstructorOptions[] = [];

    // Si hay texto seleccionado, mostrar opciones de copiar
    if (selectionText) {
      menuTemplate.push({
        label: 'Copiar',
        role: 'copy',
        enabled: editFlags.canCopy,
      });
    }

    // Si es un campo editable, mostrar opciones de edición
    if (isEditable) {
      menuTemplate.push(
        {
          label: 'Cortar',
          role: 'cut',
          enabled: editFlags.canCut,
        },
        {
          label: 'Pegar',
          role: 'paste',
          enabled: editFlags.canPaste,
        },
        { type: 'separator' },
        {
          label: 'Seleccionar Todo',
          role: 'selectAll',
          enabled: editFlags.canSelectAll,
        }
      );
    }

    // Solo mostrar menú si hay opciones
    if (menuTemplate.length > 0) {
      const contextMenu = Menu.buildFromTemplate(menuTemplate);
      contextMenu.popup();
    }
  });

  // Cargar contenido
  if (devServerUrl) {
    logger.debug(`Loading dev server: ${devServerUrl}`);
    await mainWindow.loadURL(devServerUrl);
  } else {
    // Producción: cargar archivos estáticos de Next.js export
    // app.getAppPath() retorna la ruta a la carpeta de la app
    const appPath = app.getAppPath();
    const indexPath = path.join(appPath, 'out', 'index.html');
    logger.info(`App path: ${appPath}`);
    logger.info(`Loading production build: ${indexPath}`);
    await mainWindow.loadFile(indexPath);
  }

  return mainWindow;
}

/**
 * Obtiene la ventana principal (puede ser null)
 */
export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

/**
 * Muestra la ventana principal (o la crea si no existe)
 */
export function showMainWindow(): void {
  if (mainWindow) {
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.show();
    mainWindow.focus();
    logger.debug('Main window shown and focused');
  }
}

/**
 * Oculta la ventana principal
 */
export function hideMainWindow(): void {
  mainWindow?.hide();
  logger.debug('Main window hidden');
}

/**
 * Verifica si la ventana está visible
 */
export function isMainWindowVisible(): boolean {
  return mainWindow?.isVisible() ?? false;
}
