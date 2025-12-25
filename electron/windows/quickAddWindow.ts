/**
 * Quick Add Window
 * Ventana pequeña para añadir tareas rápidamente desde el tray
 * Fase 7
 */

import { BrowserWindow, screen, ipcMain } from 'electron';
import * as path from 'path';
import { logger } from '../utils/logger';

let quickAddWindow: BrowserWindow | null = null;

/**
 * Crea y muestra la ventana de Quick Add
 */
export function showQuickAddWindow(): void {
  // Si ya existe, enfocarla
  if (quickAddWindow && !quickAddWindow.isDestroyed()) {
    quickAddWindow.show();
    quickAddWindow.focus();
    return;
  }

  const { x, y } = getWindowPosition();

  quickAddWindow = new BrowserWindow({
    width: 400,
    height: 200,
    x,
    y,
    frame: false,
    resizable: false,
    movable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    backgroundColor: '#ffffff',
    webPreferences: {
      preload: path.join(__dirname, '../preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  });

  // Cargar contenido HTML inline
  quickAddWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(getQuickAddHTML())}`);

  quickAddWindow.once('ready-to-show', () => {
    quickAddWindow?.show();
    quickAddWindow?.focus();
  });

  // Cerrar cuando pierde el foco
  quickAddWindow.on('blur', () => {
    quickAddWindow?.hide();
  });

  quickAddWindow.on('closed', () => {
    quickAddWindow = null;
  });

  logger.debug('Quick Add window created');
}

/**
 * Oculta la ventana de Quick Add
 */
export function hideQuickAddWindow(): void {
  quickAddWindow?.hide();
}

/**
 * Calcula la posición de la ventana (cerca del tray)
 */
function getWindowPosition(): { x: number; y: number } {
  const display = screen.getPrimaryDisplay();
  const { width, height } = display.workAreaSize;
  
  // Posicionar en la esquina superior derecha, debajo de la barra de menú
  return {
    x: width - 420,
    y: 30,
  };
}

/**
 * HTML para la ventana de Quick Add
 */
function getQuickAddHTML(): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      padding: 16px;
      border-radius: 12px;
      height: 100vh;
      display: flex;
      flex-direction: column;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
    }
    .title {
      color: white;
      font-size: 14px;
      font-weight: 600;
    }
    .close-btn {
      background: rgba(255,255,255,0.2);
      border: none;
      color: white;
      width: 24px;
      height: 24px;
      border-radius: 50%;
      cursor: pointer;
      font-size: 12px;
    }
    .close-btn:hover {
      background: rgba(255,255,255,0.3);
    }
    .input-container {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    input[type="text"] {
      width: 100%;
      padding: 12px 16px;
      font-size: 16px;
      border: none;
      border-radius: 8px;
      outline: none;
      background: white;
    }
    input[type="text"]::placeholder {
      color: #999;
    }
    .options {
      display: flex;
      gap: 8px;
      align-items: center;
    }
    select {
      padding: 8px 12px;
      border: none;
      border-radius: 6px;
      background: rgba(255,255,255,0.9);
      font-size: 13px;
      outline: none;
      cursor: pointer;
    }
    input[type="date"], input[type="time"] {
      padding: 8px 12px;
      border: none;
      border-radius: 6px;
      background: rgba(255,255,255,0.9);
      font-size: 13px;
      outline: none;
    }
    .submit-btn {
      padding: 10px 20px;
      background: white;
      color: #667eea;
      border: none;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: transform 0.1s;
    }
    .submit-btn:hover {
      transform: scale(1.02);
    }
    .submit-btn:active {
      transform: scale(0.98);
    }
    .hint {
      color: rgba(255,255,255,0.7);
      font-size: 11px;
      text-align: center;
      margin-top: 8px;
    }
  </style>
</head>
<body>
  <div class="header">
    <span class="title">⚡ Añadir Tarea Rápida</span>
    <button class="close-btn" onclick="window.close()">✕</button>
  </div>
  
  <div class="input-container">
    <input 
      type="text" 
      id="taskTitle" 
      placeholder="¿Qué necesitas hacer?" 
      autofocus
      onkeypress="if(event.key==='Enter')submitTask()"
    />
    
    <div class="options">
      <select id="priority">
        <option value="0">Sin prioridad</option>
        <option value="1">🟢 Baja</option>
        <option value="2">🟡 Media</option>
        <option value="3">🔴 Alta</option>
      </select>
      
      <input type="date" id="dueDate" />
      <input type="time" id="dueTime" />
      
      <button class="submit-btn" onclick="submitTask()">Añadir</button>
    </div>
  </div>
  
  <div class="hint">Presiona Enter para añadir rápidamente</div>

  <script>
    // Establecer fecha por defecto (hoy)
    document.getElementById('dueDate').valueAsDate = new Date();
    
    async function submitTask() {
      const title = document.getElementById('taskTitle').value.trim();
      if (!title) return;
      
      const priority = parseInt(document.getElementById('priority').value);
      const dateVal = document.getElementById('dueDate').value;
      const timeVal = document.getElementById('dueTime').value;
      
      let dueDate = null;
      if (dateVal) {
        dueDate = new Date(dateVal);
        if (timeVal) {
          const [hours, minutes] = timeVal.split(':');
          dueDate.setHours(parseInt(hours), parseInt(minutes));
        } else {
          dueDate.setHours(12, 0); // Mediodía por defecto
        }
        dueDate = dueDate.toISOString();
      }
      
      try {
        await window.electronAPI.createTask({
          title,
          priority,
          dueDate,
          notes: null,
          projectId: null,
        });
        
        // Limpiar y cerrar
        document.getElementById('taskTitle').value = '';
        window.close();
      } catch (error) {
        console.error('Error creating task:', error);
        alert('Error al crear la tarea');
      }
    }
    
    // Cerrar con Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') window.close();
    });
  </script>
</body>
</html>
  `;
}

/**
 * Registra los handlers IPC para Quick Add
 */
export function setupQuickAddHandlers(): void {
  ipcMain.handle('quick-add:show', () => {
    showQuickAddWindow();
  });
  
  ipcMain.handle('quick-add:hide', () => {
    hideQuickAddWindow();
  });
}
