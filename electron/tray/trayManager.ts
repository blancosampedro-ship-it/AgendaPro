/**
 * Tray Manager - Menubar icon
 * Mantiene la app viva en el menubar cuando se cierra la ventana
 */

import { Tray, Menu, nativeImage, app } from 'electron';
import * as path from 'path';
import { showMainWindow } from '../windows/mainWindow';
import { showQuickAddWindow } from '../windows/quickAddWindow';
import { logger } from '../utils/logger';

let tray: Tray | null = null;

/**
 * Crea un icono de tray programáticamente (16x16)
 * Icono: Cuadrado de color sólido
 */
function createTrayIcon(hasAlert: boolean = false): Electron.NativeImage {
  // Crear un canvas virtual con los datos del icono
  // 16x16 píxeles, RGBA (4 bytes por pixel)
  const size = 16;
  const channels = 4; // RGBA
  const buffer = Buffer.alloc(size * size * channels);
  
  // Color: Azul (#3B82F6) o Naranja (#F97316) para alerta
  const r = hasAlert ? 249 : 59;
  const g = hasAlert ? 115 : 130;
  const b = hasAlert ? 22 : 246;
  const a = 255;
  
  // Llenar el buffer con el color
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Crear un cuadrado redondeado (dejar esquinas transparentes)
      const isCorner = (
        (x < 2 && y < 2) || (x >= 14 && y < 2) ||
        (x < 2 && y >= 14) || (x >= 14 && y >= 14)
      );
      
      const idx = (y * size + x) * channels;
      if (isCorner) {
        // Esquinas transparentes
        buffer[idx] = 0;
        buffer[idx + 1] = 0;
        buffer[idx + 2] = 0;
        buffer[idx + 3] = 0;
      } else {
        buffer[idx] = r;
        buffer[idx + 1] = g;
        buffer[idx + 2] = b;
        buffer[idx + 3] = a;
      }
    }
  }
  
  const icon = nativeImage.createFromBuffer(buffer, {
    width: size,
    height: size,
  });
  
  return icon;
}

/**
 * Crea el icono en el tray/menubar
 */
export function createTray(): Tray {
  logger.debug('Creating tray...');

  // Crear icono programáticamente
  const icon = createTrayIcon(false);

  tray = new Tray(icon);
  tray.setToolTip('AgendaPro - Tu secretaria virtual');

  // Crear menú contextual
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Abrir AgendaPro',
      click: () => {
        logger.debug('Tray: Open clicked');
        showMainWindow();
      },
    },
    { type: 'separator' },
    {
      label: '⚡ Quick Add',
      accelerator: 'CmdOrCtrl+Shift+N',
      click: () => {
        logger.debug('Tray: Quick Add clicked');
        showQuickAddWindow();
      },
    },
    {
      label: 'Nueva Tarea',
      accelerator: 'CmdOrCtrl+N',
      click: () => {
        logger.debug('Tray: New task clicked');
        showMainWindow();
        // TODO: Enviar evento para abrir modal de nueva tarea
      },
    },
    { type: 'separator' },
    {
      label: 'Salir',
      click: () => {
        logger.info('Tray: Quit clicked');
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);

  // Click en el icono abre la app (macOS behavior)
  tray.on('click', () => {
    logger.debug('Tray icon clicked');
    showMainWindow();
  });

  // Double click también abre
  tray.on('double-click', () => {
    showMainWindow();
  });

  logger.debug('Tray created successfully');
  return tray;
}

/**
 * Actualiza el icono del tray (para mostrar badge de notificaciones)
 */
export function updateTrayIcon(hasAlert: boolean): void {
  if (!tray) return;

  try {
    const icon = createTrayIcon(hasAlert);
    tray.setImage(icon);
    logger.debug(`Tray icon updated: hasAlert=${hasAlert}`);
  } catch (error) {
    logger.error('Failed to update tray icon:', error);
  }
}

/**
 * Actualiza el tooltip del tray
 */
export function setTrayTooltip(text: string): void {
  tray?.setToolTip(text);
}

/**
 * Destruye el tray icon
 */
export function destroyTray(): void {
  if (tray) {
    tray.destroy();
    tray = null;
    logger.debug('Tray destroyed');
  }
}

/**
 * Obtiene la instancia del tray
 */
export function getTray(): Tray | null {
  return tray;
}
