/**
 * Splash Window Manager
 * Muestra una ventana de carga mientras se inicializa la app
 */

import { BrowserWindow, app } from 'electron';
import * as path from 'path';
import { logger } from '../utils/logger';

let splashWindow: BrowserWindow | null = null;

/**
 * Crea y muestra la ventana de splash
 */
export function createSplashWindow(): BrowserWindow {
  logger.debug('Creating splash window...');
  
  splashWindow = new BrowserWindow({
    width: 400,
    height: 500,
    frame: false,
    transparent: true,
    resizable: false,
    center: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // Cargar el HTML del splash
  // En desarrollo: electron/splash.html
  // En producción: dentro del app bundle
  let splashPath: string;
  if (app.isPackaged) {
    splashPath = path.join(process.resourcesPath, 'app', 'electron', 'splash.html');
  } else {
    splashPath = path.join(__dirname, '../../electron/splash.html');
  }
  
  logger.debug(`Splash path: ${splashPath}`);
  splashWindow.loadFile(splashPath);
  
  // Mostrar inmediatamente
  splashWindow.once('ready-to-show', () => {
    splashWindow?.show();
  });

  splashWindow.on('closed', () => {
    splashWindow = null;
  });

  return splashWindow;
}

/**
 * Actualiza el estado en el splash
 */
export function updateSplashStatus(status: string): void {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.webContents.executeJavaScript(
      `document.getElementById('status').textContent = '${status}';`
    ).catch(() => {});
  }
}

/**
 * Cierra la ventana de splash
 */
export function closeSplashWindow(): void {
  if (splashWindow && !splashWindow.isDestroyed()) {
    logger.debug('Closing splash window');
    splashWindow.close();
    splashWindow = null;
  }
}

/**
 * Obtiene la ventana de splash
 */
export function getSplashWindow(): BrowserWindow | null {
  return splashWindow;
}
