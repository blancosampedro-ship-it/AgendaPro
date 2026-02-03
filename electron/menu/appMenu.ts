/**
 * App Menu - Menú nativo macOS
 * Incluye atajos: ⌘N (nueva tarea), ⌘K (command palette), ⌘, (ajustes)
 */

import { Menu, app, shell, BrowserWindow } from 'electron';
import { showMainWindow, getMainWindow } from '../windows/mainWindow';
import { logger } from '../utils/logger';

/**
 * Crea el menú de la aplicación
 */
export function createAppMenu(): void {
  const isMac = process.platform === 'darwin';

  const template: Electron.MenuItemConstructorOptions[] = [
    // ═══════════════════════════════════════════════════════════════════════
    // APP MENU (solo macOS)
    // ═══════════════════════════════════════════════════════════════════════
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: 'about' as const, label: 'Acerca de AgendaPro' },
        { type: 'separator' as const },
        {
          label: 'Ajustes...',
          accelerator: 'Cmd+,',
          click: () => {
            logger.debug('Menu: Settings clicked');
            showMainWindow();
            // TODO: Navegar a /settings
            const win = getMainWindow();
            win?.webContents.send('navigate', '/settings');
          },
        },
        { type: 'separator' as const },
        { role: 'services' as const },
        { type: 'separator' as const },
        { role: 'hide' as const, label: 'Ocultar AgendaPro' },
        { role: 'hideOthers' as const },
        { role: 'unhide' as const },
        { type: 'separator' as const },
        { role: 'quit' as const, label: 'Salir de AgendaPro' },
      ],
    }] : []),

    // ═══════════════════════════════════════════════════════════════════════
    // ARCHIVO
    // ═══════════════════════════════════════════════════════════════════════
    {
      label: 'Archivo',
      submenu: [
        {
          label: 'Nueva Tarea',
          accelerator: 'CmdOrCtrl+N',
          click: () => {
            logger.debug('Menu: New task clicked');
            showMainWindow();
            // TODO: Abrir modal de nueva tarea
            const win = getMainWindow();
            win?.webContents.send('new-task');
          },
        },
        {
          label: 'Nuevo Proyecto',
          accelerator: 'CmdOrCtrl+Shift+N',
          click: () => {
            logger.debug('Menu: New project clicked');
            showMainWindow();
            const win = getMainWindow();
            win?.webContents.send('new-project');
          },
        },
        { type: 'separator' },
        {
          label: 'Importar desde Recordatorios de Apple',
          accelerator: 'CmdOrCtrl+Shift+I',
          click: async () => {
            logger.info('Menu: Import from Apple Reminders');
            try {
              const { importAppleReminders } = await import('../services/appleRemindersService');
              const result = await importAppleReminders({ includeCompleted: false });
              
              // Mostrar resultado
              const { dialog } = await import('electron');
              dialog.showMessageBox({
                type: 'info',
                title: 'Importación completada',
                message: `Se importaron ${result.imported} tareas de Recordatorios de Apple.`,
                detail: result.skipped > 0 ? `${result.skipped} tareas completadas omitidas.` : undefined,
              });
              
              // Refrescar lista de tareas
              const win = getMainWindow();
              win?.webContents.send('tasks:refresh');
              
              // Actualizar scheduler
              const { reschedule } = await import('../scheduler/dueDateScheduler');
              reschedule();
            } catch (error: any) {
              logger.error('Error importing Apple Reminders:', error);
              const { dialog } = await import('electron');
              
              // Detectar error de permisos
              const errorMsg = error.message || error.toString();
              const isPermissionError = errorMsg.includes('-1743') || errorMsg.includes('not authorized');
              
              if (isPermissionError) {
                const result = await dialog.showMessageBox({
                  type: 'warning',
                  title: 'Permiso requerido',
                  message: 'AgendaPro necesita permiso para acceder a Recordatorios',
                  detail: 'Para importar tus recordatorios, debes permitir que AgendaPro controle la app Recordatorios.\n\n1. Abre Preferencias del Sistema\n2. Ve a Privacidad y Seguridad → Automatización\n3. Busca AgendaPro y activa "Recordatorios"',
                  buttons: ['Abrir Preferencias', 'Cancelar'],
                  defaultId: 0,
                });
                
                if (result.response === 0) {
                  // Abrir preferencias de Automatización
                  const { shell } = await import('electron');
                  shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Automation');
                }
              } else {
                dialog.showErrorBox(
                  'Error de importación',
                  `No se pudieron importar los recordatorios.\n\n${errorMsg}`
                );
              }
            }
          },
        },
        { type: 'separator' },
        isMac 
          ? { role: 'close' as const, label: 'Cerrar Ventana' }
          : { role: 'quit' as const, label: 'Salir' },
      ],
    },

    // ═══════════════════════════════════════════════════════════════════════
    // EDITAR
    // ═══════════════════════════════════════════════════════════════════════
    {
      label: 'Editar',
      submenu: [
        { role: 'undo' as const, label: 'Deshacer' },
        { role: 'redo' as const, label: 'Rehacer' },
        { type: 'separator' as const },
        { role: 'cut' as const, label: 'Cortar' },
        { role: 'copy' as const, label: 'Copiar' },
        { role: 'paste' as const, label: 'Pegar' },
        { role: 'pasteAndMatchStyle' as const, label: 'Pegar y Adaptar Estilo' },
        { role: 'delete' as const, label: 'Eliminar' },
        { role: 'selectAll' as const, label: 'Seleccionar Todo' },
        { type: 'separator' as const },
        // Speech submenu (macOS only)
        ...(process.platform === 'darwin' ? [
          {
            label: 'Habla',
            submenu: [
              { role: 'startSpeaking' as const, label: 'Empezar a Hablar' },
              { role: 'stopSpeaking' as const, label: 'Dejar de Hablar' },
            ],
          },
        ] : []),
      ],
    },

    // ═══════════════════════════════════════════════════════════════════════
    // IR A
    // ═══════════════════════════════════════════════════════════════════════
    {
      label: 'Ir',
      submenu: [
        {
          label: 'Command Palette',
          accelerator: 'CmdOrCtrl+K',
          click: () => {
            logger.debug('Menu: Command palette clicked');
            showMainWindow();
            const win = getMainWindow();
            win?.webContents.send('toggle-command-palette');
          },
        },
        { type: 'separator' },
        {
          label: 'Inbox',
          accelerator: 'CmdOrCtrl+1',
          click: () => {
            showMainWindow();
            const win = getMainWindow();
            win?.webContents.send('navigate', '/inbox');
          },
        },
        {
          label: 'Hoy',
          accelerator: 'CmdOrCtrl+2',
          click: () => {
            showMainWindow();
            const win = getMainWindow();
            win?.webContents.send('navigate', '/today');
          },
        },
        {
          label: 'Próximos 7 días',
          accelerator: 'CmdOrCtrl+3',
          click: () => {
            showMainWindow();
            const win = getMainWindow();
            win?.webContents.send('navigate', '/upcoming');
          },
        },
        {
          label: 'Vencidas',
          accelerator: 'CmdOrCtrl+4',
          click: () => {
            showMainWindow();
            const win = getMainWindow();
            win?.webContents.send('navigate', '/overdue');
          },
        },
        {
          label: 'Esperando',
          accelerator: 'CmdOrCtrl+5',
          click: () => {
            showMainWindow();
            const win = getMainWindow();
            win?.webContents.send('navigate', '/waiting');
          },
        },
        { type: 'separator' },
        {
          label: 'Recordatorios',
          click: () => {
            showMainWindow();
            const win = getMainWindow();
            win?.webContents.send('reminders:open');
          },
        },
        { type: 'separator' },
        {
          label: 'Proyectos',
          accelerator: 'CmdOrCtrl+P',
          click: () => {
            showMainWindow();
            const win = getMainWindow();
            win?.webContents.send('navigate', '/projects');
          },
        },
      ],
    },

    // ═══════════════════════════════════════════════════════════════════════
    // VISTA
    // ═══════════════════════════════════════════════════════════════════════
    {
      label: 'Vista',
      submenu: [
        { role: 'reload' as const, label: 'Recargar' },
        { role: 'forceReload' as const, label: 'Forzar Recarga' },
        { role: 'toggleDevTools' as const, label: 'Herramientas de Desarrollo' },
        { type: 'separator' as const },
        { role: 'resetZoom' as const, label: 'Tamaño Real' },
        { role: 'zoomIn' as const, label: 'Aumentar' },
        { role: 'zoomOut' as const, label: 'Reducir' },
        { type: 'separator' as const },
        { role: 'togglefullscreen' as const, label: 'Pantalla Completa' },
      ],
    },

    // ═══════════════════════════════════════════════════════════════════════
    // VENTANA
    // ═══════════════════════════════════════════════════════════════════════
    {
      label: 'Ventana',
      submenu: [
        { role: 'minimize' as const, label: 'Minimizar' },
        { role: 'zoom' as const },
        ...(isMac ? [
          { type: 'separator' as const },
          { role: 'front' as const, label: 'Traer Todo al Frente' },
        ] : [
          { role: 'close' as const },
        ]),
      ],
    },

    // ═══════════════════════════════════════════════════════════════════════
    // AYUDA
    // ═══════════════════════════════════════════════════════════════════════
    {
      label: 'Ayuda',
      submenu: [
        {
          label: 'Documentación',
          click: async () => {
            await shell.openExternal('https://agendapro.app/docs');
          },
        },
        {
          label: 'Reportar un Problema',
          click: async () => {
            await shell.openExternal('https://github.com/agendapro/app/issues');
          },
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
  
  logger.debug('App menu created');
}
