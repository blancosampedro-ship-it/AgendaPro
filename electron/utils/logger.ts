/**
 * Logger utility
 * Logging centralizado para debug y producción
 * En producción: solo errores y warnings para mejor rendimiento
 */

import { app } from 'electron';

// Usar app.isPackaged es más confiable que NODE_ENV
const isDev = !app.isPackaged;

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

function formatMessage(level: LogLevel, ...args: unknown[]): string {
  // Formato más simple en producción
  if (!isDev) {
    return `[${level.toUpperCase()}] ${args.map(arg => 
      typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
    ).join(' ')}`;
  }
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
  return `${prefix} ${args.map(arg => 
    typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
  ).join(' ')}`;
}

export const logger = {
  info: (...args: unknown[]) => {
    // En producción, solo mostrar info importantes (no todos)
    if (isDev) {
      console.log(formatMessage('info', ...args));
    }
  },

  warn: (...args: unknown[]) => {
    console.warn(formatMessage('warn', ...args));
  },

  error: (...args: unknown[]) => {
    console.error(formatMessage('error', ...args));
  },

  debug: (...args: unknown[]) => {
    if (isDev) {
      console.log(formatMessage('debug', ...args));
    }
  },
  
  // Log que siempre se muestra (para métricas importantes)
  always: (...args: unknown[]) => {
    console.log(formatMessage('info', ...args));
  },
};
