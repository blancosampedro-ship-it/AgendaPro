/**
 * Device ID Generator
 * Genera y persiste un ID único para este dispositivo
 * Usado para anti-duplicados en sincronización
 */

import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

let cachedDeviceId: string | null = null;

/**
 * Obtiene el ID único del dispositivo
 * Si no existe, lo genera y lo persiste
 */
export function getDeviceId(): string {
  if (cachedDeviceId) {
    return cachedDeviceId;
  }

  const userDataPath = app.getPath('userData');
  const deviceIdPath = path.join(userDataPath, 'device-id');

  try {
    // Intentar leer ID existente
    if (fs.existsSync(deviceIdPath)) {
      cachedDeviceId = fs.readFileSync(deviceIdPath, 'utf-8').trim();
      return cachedDeviceId;
    }
  } catch (error) {
    // Si hay error leyendo, generar nuevo
  }

  // Generar nuevo ID
  cachedDeviceId = uuidv4();
  
  try {
    // Asegurar que el directorio existe
    if (!fs.existsSync(userDataPath)) {
      fs.mkdirSync(userDataPath, { recursive: true });
    }
    fs.writeFileSync(deviceIdPath, cachedDeviceId, 'utf-8');
  } catch (error) {
    // Si no podemos persistir, al menos tenemos el ID en memoria
    console.error('Failed to persist device ID:', error);
  }

  return cachedDeviceId;
}

/**
 * Obtiene información del dispositivo
 */
export function getDeviceInfo() {
  return {
    id: getDeviceId(),
    platform: process.platform,
    arch: process.arch,
    hostname: require('os').hostname(),
  };
}
