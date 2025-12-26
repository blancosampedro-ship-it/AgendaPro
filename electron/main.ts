/**
 * AgendaPro - Electron Main Process
 * Entry point principal de la aplicación
 * 
 * Responsabilidades:
 * - Inicializar app y single instance
 * - Crear ventana principal
 * - Configurar tray/menubar
 * - Configurar menú macOS
 * - Manejar lifecycle de la app
 */

import { app, BrowserWindow } from 'electron';
import * as path from 'path';
import { createMainWindow, getMainWindow, showMainWindow, setForceQuit } from './windows/mainWindow';
import { createSplashWindow, closeSplashWindow, updateSplashStatus } from './windows/splashWindow';
import { createTray, destroyTray } from './tray/trayManager';
import { createAppMenu } from './menu/appMenu';
import { setupIpcHandlers } from './ipc/handlers';
import { initDatabase } from './database/connection';
import { getDeviceId } from './utils/deviceId';
import { logger } from './utils/logger';
import { startScheduler, stopScheduler } from './scheduler/dueDateScheduler';
import { setupReminderPopupHandlers } from './windows/reminderPopup';
import { setupOverduePopupHandlers, showOverduePopup } from './windows/overduePopup';

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURACIÓN
// ═══════════════════════════════════════════════════════════════════════════

// Solo usar app.isPackaged para determinar si es desarrollo o producción
const isDev = !app.isPackaged;
const DEV_SERVER_URL = 'http://localhost:3456';

// ═══════════════════════════════════════════════════════════════════════════
// SINGLE INSTANCE LOCK
// ═══════════════════════════════════════════════════════════════════════════

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  logger.info('Another instance is running. Quitting...');
  app.quit();
} else {
  app.on('second-instance', () => {
    // Alguien intentó abrir otra instancia, mostrar nuestra ventana
    logger.info('Second instance detected, focusing main window');
    showMainWindow();
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// APP LIFECYCLE
// ═══════════════════════════════════════════════════════════════════════════

app.whenReady().then(async () => {
  const startTime = Date.now();
  logger.info('AgendaPro starting...');
  if (isDev) {
    logger.info(`Mode: DEVELOPMENT | Platform: ${process.platform}`);
  }

  try {
    // ═══════════════════════════════════════════════════════════════════════
    // FASE 0: Splash screen INMEDIATO (aparece en ~100ms)
    // ═══════════════════════════════════════════════════════════════════════
    createSplashWindow();
    
    // ═══════════════════════════════════════════════════════════════════════
    // FASE 1: Inicialización mínima en PARALELO
    // ═══════════════════════════════════════════════════════════════════════
    updateSplashStatus('Preparando...');
    
    // Configurar IPC y handlers ANTES de la base de datos (no dependen de ella)
    setupIpcHandlers();
    setupReminderPopupHandlers();
    setupOverduePopupHandlers();
    
    // Crear menú y tray en paralelo con la BD
    createAppMenu();
    createTray();
    
    // Inicializar BD
    updateSplashStatus('Conectando base de datos...');
    await initDatabase();
    logger.debug('✓ Core initialized');

    // ═══════════════════════════════════════════════════════════════════════
    // FASE 2: Crear ventana principal
    // ═══════════════════════════════════════════════════════════════════════
    updateSplashStatus('Cargando interfaz...');
    const mainWindow = await createMainWindow(isDev ? DEV_SERVER_URL : null);
    
    // Cerrar splash después de un tiempo razonable
    setTimeout(() => {
      closeSplashWindow();
      mainWindow.show();
      
      // Mostrar popup de vencidas después de que mainWindow se muestre
      setTimeout(() => {
        showOverduePopup();
      }, 500);
    }, 2000); // 2 segundos máximo para el splash
    
    // ═══════════════════════════════════════════════════════════════════════
    // FASE 3: Servicios secundarios en BACKGROUND (no bloquean UI)
    // ═══════════════════════════════════════════════════════════════════════
    
    // Iniciar scheduler inmediatamente
    startScheduler();
    
    // Servicios que pueden inicializarse en background
    if (mainWindow) {
      // Ejecutar en paralelo sin esperar
      Promise.all([
        import('./services/themeService').then(({ initThemeService }) => initThemeService(mainWindow)),
        import('./services/offlineService').then(({ initOfflineService }) => initOfflineService(mainWindow)),
        import('./shortcuts/globalShortcuts').then(({ registerGlobalShortcuts }) => registerGlobalShortcuts()),
      ]).then(() => {
        logger.debug('✓ Background services ready');
      }).catch(err => logger.warn('Background service error:', err));
    }

    // Firebase en background completo (NO bloquea inicio)
    setImmediate(async () => {
      try {
        const { isFirebaseConfigured, initializeFirebase } = await import('./firebase/config');
        if (isFirebaseConfigured()) {
          initializeFirebase();
          const { restoreSession } = await import('./firebase/authService');
          const user = await restoreSession();
          if (user) logger.debug(`Firebase session: ${user.email}`);
        }
      } catch (error) {
        logger.warn('Firebase init error:', error);
      }
    });

    const elapsed = Date.now() - startTime;
    logger.always(`AgendaPro ready! (${elapsed}ms)`);

  } catch (error) {
    logger.error('Failed to initialize app:', error);
    app.quit();
  }
});

// macOS: Re-crear ventana si se clickea el dock icon
app.on('activate', () => {
  logger.info('App activated (dock click)');
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow(isDev ? DEV_SERVER_URL : null);
  } else {
    showMainWindow();
  }
});

// IMPORTANTE: En macOS, cerrar ventana NO cierra la app
// La app sigue viva en el menubar
app.on('window-all-closed', () => {
  // En macOS, no hacer nada - la app sigue en menubar
  if (process.platform !== 'darwin') {
    // En Windows/Linux, cerrar también (por ahora)
    // TODO: Evaluar si queremos menubar en Windows
    app.quit();
  }
  logger.info('All windows closed, app still running in menubar');
});

app.on('before-quit', async () => {
  logger.info('App is quitting...');
  setForceQuit(true); // Permitir que la ventana se cierre
  stopScheduler();
  
  // Detener servicio offline
  try {
    const { stopOfflineService } = await import('./services/offlineService');
    stopOfflineService();
  } catch {}
  
  // Los atajos globales se limpian automáticamente en will-quit
  
  destroyTray();
});

// ═══════════════════════════════════════════════════════════════════════════
// ERROR HANDLING
// ═══════════════════════════════════════════════════════════════════════════

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection at:', promise, 'reason:', reason);
});
