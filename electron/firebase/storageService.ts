/**
 * Firebase Storage Service
 * Servicio para subir/descargar archivos adjuntos en Firebase Storage
 */

import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject, getMetadata } from 'firebase/storage';
import { initializeApp, getApp } from 'firebase/app';
import { logger } from '../utils/logger';
import { isFirebaseConfigured } from './config';
import { getFirebaseAuth } from './config';
import * as fs from 'fs';
import * as path from 'path';
import { app as electronApp } from 'electron';

// Carpeta local para cache de adjuntos
const ATTACHMENTS_DIR = path.join(electronApp.getPath('userData'), 'attachments');

/**
 * Obtiene la instancia de Storage
 */
function getFirebaseStorage() {
  if (!isFirebaseConfigured()) {
    return null;
  }
  try {
    const app = getApp();
    return getStorage(app);
  } catch (error) {
    logger.error('Error getting Firebase Storage:', error);
    return null;
  }
}

/**
 * Sube un archivo a Firebase Storage
 */
export async function uploadAttachment(
  userId: string,
  attachmentId: string,
  localFilePath: string,
  mimeType: string
): Promise<string | null> {
  const storage = getFirebaseStorage();
  if (!storage) {
    logger.warn('Firebase Storage not available');
    return null;
  }

  try {
    // Leer archivo local
    const fileBuffer = await fs.promises.readFile(localFilePath);
    
    // Crear referencia en Storage: users/{userId}/attachments/{attachmentId}/{filename}
    const fileName = path.basename(localFilePath);
    const storageRef = ref(storage, `users/${userId}/attachments/${attachmentId}/${fileName}`);
    
    // Subir archivo
    logger.info(`Uploading attachment ${attachmentId} to Firebase Storage...`);
    const snapshot = await uploadBytes(storageRef, fileBuffer, {
      contentType: mimeType,
    });
    
    // Obtener URL de descarga
    const downloadUrl = await getDownloadURL(snapshot.ref);
    logger.info(`Attachment ${attachmentId} uploaded successfully`);
    
    return downloadUrl;
  } catch (error) {
    logger.error(`Error uploading attachment ${attachmentId}:`, error);
    return null;
  }
}

/**
 * Descarga un archivo de Firebase Storage
 */
export async function downloadAttachment(
  downloadUrl: string,
  localFilePath: string
): Promise<boolean> {
  try {
    logger.info(`Downloading attachment to ${localFilePath}...`);
    
    // Fetch del archivo
    const response = await fetch(downloadUrl);
    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`);
    }
    
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    // Asegurar que existe el directorio
    const dir = path.dirname(localFilePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    // Guardar archivo
    await fs.promises.writeFile(localFilePath, buffer);
    logger.info(`Attachment downloaded to ${localFilePath}`);
    
    return true;
  } catch (error) {
    logger.error('Error downloading attachment:', error);
    return false;
  }
}

/**
 * Elimina un archivo de Firebase Storage
 */
export async function deleteAttachmentFromStorage(
  userId: string,
  attachmentId: string,
  fileName: string
): Promise<boolean> {
  const storage = getFirebaseStorage();
  if (!storage) {
    return false;
  }

  try {
    const storageRef = ref(storage, `users/${userId}/attachments/${attachmentId}/${fileName}`);
    await deleteObject(storageRef);
    logger.info(`Attachment ${attachmentId} deleted from Storage`);
    return true;
  } catch (error: any) {
    // Si el archivo no existe, no es un error grave
    if (error.code === 'storage/object-not-found') {
      logger.warn(`Attachment ${attachmentId} not found in Storage`);
      return true;
    }
    logger.error(`Error deleting attachment ${attachmentId}:`, error);
    return false;
  }
}

/**
 * Verifica si un archivo existe en Storage
 */
export async function attachmentExistsInStorage(
  userId: string,
  attachmentId: string,
  fileName: string
): Promise<boolean> {
  const storage = getFirebaseStorage();
  if (!storage) {
    return false;
  }

  try {
    const storageRef = ref(storage, `users/${userId}/attachments/${attachmentId}/${fileName}`);
    await getMetadata(storageRef);
    return true;
  } catch (error: any) {
    if (error.code === 'storage/object-not-found') {
      return false;
    }
    logger.error('Error checking attachment existence:', error);
    return false;
  }
}

/**
 * Obtiene la ruta local de un adjunto (para cache)
 */
export function getLocalAttachmentPath(fileName: string): string {
  return path.join(ATTACHMENTS_DIR, fileName);
}

/**
 * Asegura que existe la carpeta de adjuntos
 */
export function ensureAttachmentsDir(): void {
  if (!fs.existsSync(ATTACHMENTS_DIR)) {
    fs.mkdirSync(ATTACHMENTS_DIR, { recursive: true });
  }
}
