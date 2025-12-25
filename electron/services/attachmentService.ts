/**
 * Attachment Service
 * Gestión de archivos, URLs y emails adjuntos a tareas
 * Con sincronización a Firebase Storage
 */

import { app, shell } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { getDatabase } from '../database/connection';
import { getDeviceId } from '../utils/deviceId';
import { logger } from '../utils/logger';
import { uploadAttachment, downloadAttachment, deleteAttachmentFromStorage } from '../firebase/storageService';
import { getCurrentUser } from '../firebase/authService';

// Carpeta de adjuntos
const ATTACHMENTS_DIR = path.join(app.getPath('userData'), 'attachments');

// Límite de tamaño: 10MB
const MAX_FILE_SIZE = 10 * 1024 * 1024;

// Tipos MIME permitidos
const ALLOWED_MIME_TYPES = [
  // Documentos
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
  // Imágenes
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  // Emails
  'message/rfc822', // .eml files
];

/**
 * Asegura que existe la carpeta de adjuntos
 */
function ensureAttachmentsDir(): void {
  if (!fs.existsSync(ATTACHMENTS_DIR)) {
    fs.mkdirSync(ATTACHMENTS_DIR, { recursive: true });
    logger.info(`Created attachments directory: ${ATTACHMENTS_DIR}`);
  }
}

/**
 * Obtiene el tipo MIME basado en la extensión
 */
function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes: Record<string, string> = {
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.ppt': 'application/vnd.ms-powerpoint',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.txt': 'text/plain',
    '.csv': 'text/csv',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.eml': 'message/rfc822',
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

/**
 * Obtiene el icono según el tipo de archivo
 */
export function getFileIcon(mimeType: string): string {
  if (mimeType.startsWith('image/')) return '🖼️';
  if (mimeType === 'application/pdf') return '📕';
  if (mimeType.includes('word')) return '📘';
  if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return '📗';
  if (mimeType.includes('powerpoint') || mimeType.includes('presentation')) return '📙';
  if (mimeType.startsWith('text/')) return '📄';
  if (mimeType === 'message/rfc822') return '📧';
  return '📎';
}

// ═══════════════════════════════════════════════════════════════════════════
// ARCHIVOS
// ═══════════════════════════════════════════════════════════════════════════

export interface AddFileInput {
  taskId: string;
  filePath: string;
  name?: string;
}

/**
 * Añade un archivo adjunto a una tarea
 * Guarda localmente primero, luego sube a Firebase Storage en background
 */
export async function addFileAttachment(input: AddFileInput) {
  const db = getDatabase();
  const deviceId = getDeviceId();
  ensureAttachmentsDir();

  logger.info(`Adding file attachment: ${input.filePath} for task ${input.taskId}`);

  // Verificar que el archivo existe
  if (!input.filePath || !fs.existsSync(input.filePath)) {
    logger.error(`File not found: ${input.filePath}`);
    throw new Error('El archivo no existe o la ruta no es válida');
  }

  // Verificar tamaño
  const stats = fs.statSync(input.filePath);
  logger.info(`File size: ${stats.size} bytes`);
  
  if (stats.size > MAX_FILE_SIZE) {
    throw new Error(`El archivo excede el límite de ${MAX_FILE_SIZE / 1024 / 1024}MB`);
  }

  // Obtener tipo MIME
  const mimeType = getMimeType(input.filePath);
  
  // Generar nombre único para el archivo
  const ext = path.extname(input.filePath);
  const baseName = input.name || path.basename(input.filePath, ext);
  const uniqueName = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}${ext}`;
  const destPath = path.join(ATTACHMENTS_DIR, uniqueName);

  // Copiar archivo localmente (rápido)
  await fs.promises.copyFile(input.filePath, destPath);
  logger.info(`File copied to: ${destPath}`);

  // Guardar en DB (sin URL de nube aún)
  const attachment = await db.attachment.create({
    data: {
      taskId: input.taskId,
      type: 'file',
      name: baseName,
      filePath: uniqueName,
      mimeType,
      size: stats.size,
      deviceId,
      url: null, // Se actualizará cuando suba a la nube
    },
  });

  logger.info(`File attachment created: ${attachment.id} for task ${input.taskId}`);

  // Subir a Firebase Storage en background (no bloquea)
  uploadToCloudBackground(attachment.id, destPath, mimeType);

  return attachment;
}

/**
 * Sube un archivo a Firebase Storage en background
 */
async function uploadToCloudBackground(attachmentId: string, localPath: string, mimeType: string) {
  try {
    const user = getCurrentUser();
    if (!user) {
      logger.debug('No user logged in, skipping cloud upload');
      return;
    }

    const downloadUrl = await uploadAttachment(user.uid, attachmentId, localPath, mimeType);
    
    if (downloadUrl) {
      // Actualizar la DB con la URL de descarga
      const db = getDatabase();
      await db.attachment.update({
        where: { id: attachmentId },
        data: { url: downloadUrl },
      });
      logger.info(`Attachment ${attachmentId} synced to cloud`);
    }
  } catch (error) {
    logger.error(`Background upload failed for ${attachmentId}:`, error);
    // No falla - el archivo sigue disponible localmente
  }
}

/**
 * Lee el contenido de un archivo para preview (base64)
 * Si no está local pero tiene URL de nube, lo descarga
 */
export async function getFileContent(attachmentId: string): Promise<{ data: string; mimeType: string } | null> {
  const db = getDatabase();
  
  const attachment = await db.attachment.findUnique({
    where: { id: attachmentId },
  });

  if (!attachment || attachment.type !== 'file' || !attachment.filePath) {
    return null;
  }

  const fullPath = path.join(ATTACHMENTS_DIR, attachment.filePath);
  
  // Si no existe localmente pero tiene URL de nube, descargarlo
  if (!fs.existsSync(fullPath)) {
    if (attachment.url) {
      logger.info(`Downloading attachment ${attachmentId} from cloud...`);
      const downloaded = await downloadAttachment(attachment.url, fullPath);
      if (!downloaded) {
        logger.warn(`Failed to download attachment ${attachmentId}`);
        return null;
      }
    } else {
      logger.warn(`Attachment file not found and no cloud URL: ${fullPath}`);
      return null;
    }
  }

  const data = fs.readFileSync(fullPath);
  return {
    data: data.toString('base64'),
    mimeType: attachment.mimeType || 'application/octet-stream',
  };
}

/**
 * Abre un archivo con la aplicación por defecto
 * Si no está local pero tiene URL de nube, lo descarga primero
 */
export async function openFile(attachmentId: string): Promise<boolean> {
  const db = getDatabase();
  
  const attachment = await db.attachment.findUnique({
    where: { id: attachmentId },
  });

  if (!attachment || attachment.type !== 'file' || !attachment.filePath) {
    return false;
  }

  const fullPath = path.join(ATTACHMENTS_DIR, attachment.filePath);
  
  // Si no existe localmente pero tiene URL de nube, descargarlo
  if (!fs.existsSync(fullPath)) {
    if (attachment.url) {
      logger.info(`Downloading attachment ${attachmentId} from cloud before opening...`);
      const downloaded = await downloadAttachment(attachment.url, fullPath);
      if (!downloaded) {
        logger.warn(`Failed to download attachment ${attachmentId}`);
        return false;
      }
    } else {
      logger.warn(`Attachment file not found and no cloud URL: ${fullPath}`);
      return false;
    }
  }

  await shell.openPath(fullPath);
  return true;
}

// ═══════════════════════════════════════════════════════════════════════════
// URLs
// ═══════════════════════════════════════════════════════════════════════════

export interface AddUrlInput {
  taskId: string;
  url: string;
  name?: string;
}

/**
 * Añade un enlace URL a una tarea
 */
export async function addUrlAttachment(input: AddUrlInput) {
  const db = getDatabase();
  const deviceId = getDeviceId();

  // Validar URL
  try {
    new URL(input.url);
  } catch {
    throw new Error('URL inválida');
  }

  const attachment = await db.attachment.create({
    data: {
      taskId: input.taskId,
      type: 'url',
      name: input.name || new URL(input.url).hostname,
      url: input.url,
      deviceId,
    },
  });

  logger.info(`URL attachment created: ${attachment.id} for task ${input.taskId}`);
  return attachment;
}

/**
 * Abre una URL en el navegador por defecto
 */
export async function openUrl(attachmentId: string): Promise<boolean> {
  const db = getDatabase();
  
  const attachment = await db.attachment.findUnique({
    where: { id: attachmentId },
  });

  if (!attachment || !attachment.url) {
    return false;
  }

  await shell.openExternal(attachment.url);
  return true;
}

// ═══════════════════════════════════════════════════════════════════════════
// EMAILS
// ═══════════════════════════════════════════════════════════════════════════

export interface AddEmailInput {
  taskId: string;
  url: string; // message:// o outlook://
  name?: string;
  metadata?: {
    from?: string;
    subject?: string;
    date?: string;
  };
}

/**
 * Extrae metadatos de un archivo .eml
 */
function parseEmlFile(filePath: string): { subject?: string; from?: string; date?: string } {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split(/\r?\n/);
    const metadata: { subject?: string; from?: string; date?: string } = {};
    
    for (const line of lines) {
      if (line.startsWith('Subject:')) {
        metadata.subject = line.substring(8).trim();
      } else if (line.startsWith('From:')) {
        metadata.from = line.substring(5).trim();
      } else if (line.startsWith('Date:')) {
        metadata.date = line.substring(5).trim();
      }
      // Parar después de los headers (línea vacía)
      if (line === '' && (metadata.subject || metadata.from)) {
        break;
      }
    }
    
    return metadata;
  } catch {
    return {};
  }
}

export interface AddEmlFileInput {
  taskId: string;
  filePath: string;
  name?: string;
}

/**
 * Añade un archivo .eml (email de Outlook) como adjunto
 */
export async function addEmlAttachment(input: AddEmlFileInput) {
  const db = getDatabase();
  const deviceId = getDeviceId();
  ensureAttachmentsDir();

  logger.info(`Adding .eml attachment: ${input.filePath} for task ${input.taskId}`);

  // Verificar que el archivo existe
  if (!input.filePath || !fs.existsSync(input.filePath)) {
    throw new Error('El archivo .eml no existe');
  }

  // Extraer metadatos del email
  const metadata = parseEmlFile(input.filePath);
  
  // Copiar archivo localmente
  const stats = fs.statSync(input.filePath);
  const uniqueName = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}.eml`;
  const destPath = path.join(ATTACHMENTS_DIR, uniqueName);
  await fs.promises.copyFile(input.filePath, destPath);

  const attachment = await db.attachment.create({
    data: {
      taskId: input.taskId,
      type: 'email',
      name: input.name || metadata.subject || 'Email de Outlook',
      filePath: uniqueName,
      mimeType: 'message/rfc822',
      size: stats.size,
      metadata: JSON.stringify(metadata),
      deviceId,
    },
  });

  logger.info(`EML attachment created: ${attachment.id} for task ${input.taskId}`);
  
  // Subir a la nube en background
  uploadToCloudBackground(attachment.id, destPath, 'message/rfc822');
  
  return attachment;
}

/**
 * Añade un enlace a email a una tarea
 */
export async function addEmailAttachment(input: AddEmailInput) {
  const db = getDatabase();
  const deviceId = getDeviceId();

  // Validar que sea un enlace de email
  if (!input.url.startsWith('message://') && !input.url.startsWith('outlook://')) {
    throw new Error('Enlace de email inválido. Debe ser message:// o outlook://');
  }

  const attachment = await db.attachment.create({
    data: {
      taskId: input.taskId,
      type: 'email',
      name: input.name || input.metadata?.subject || 'Email',
      url: input.url,
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
      deviceId,
    },
  });

  logger.info(`Email attachment created: ${attachment.id} for task ${input.taskId}`);
  return attachment;
}

/**
 * Abre un email en la aplicación correspondiente
 */
export async function openEmail(attachmentId: string): Promise<boolean> {
  const db = getDatabase();
  
  const attachment = await db.attachment.findUnique({
    where: { id: attachmentId },
  });

  if (!attachment || attachment.type !== 'email') {
    return false;
  }

  // Si tiene URL (message:// o outlook://), abrirla
  if (attachment.url) {
    await shell.openExternal(attachment.url);
    return true;
  }
  
  // Si es un archivo .eml, abrirlo con la app predeterminada
  if (attachment.filePath) {
    const fullPath = path.join(ATTACHMENTS_DIR, attachment.filePath);
    if (fs.existsSync(fullPath)) {
      await shell.openPath(fullPath);
      return true;
    }
  }

  return false;
}

// ═══════════════════════════════════════════════════════════════════════════
// GESTIÓN GENERAL
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Obtiene todos los adjuntos de una tarea
 */
export async function getTaskAttachments(taskId: string) {
  const db = getDatabase();
  
  return db.attachment.findMany({
    where: { taskId },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Elimina un adjunto (local y de la nube)
 */
export async function deleteAttachment(attachmentId: string) {
  const db = getDatabase();
  
  const attachment = await db.attachment.findUnique({
    where: { id: attachmentId },
  });

  if (!attachment) {
    throw new Error('Adjunto no encontrado');
  }

  // Si es archivo, eliminar del disco local
  if (attachment.type === 'file' && attachment.filePath) {
    const fullPath = path.join(ATTACHMENTS_DIR, attachment.filePath);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
      logger.info(`Deleted local file: ${fullPath}`);
    }
    
    // También eliminar de Firebase Storage en background
    const user = getCurrentUser();
    if (user && attachment.url) {
      deleteAttachmentFromStorage(user.uid, attachmentId, attachment.filePath)
        .catch(err => logger.warn('Failed to delete from cloud:', err));
    }
  }

  // Eliminar de DB
  await db.attachment.delete({
    where: { id: attachmentId },
  });

  logger.info(`Attachment deleted: ${attachmentId}`);
  return { success: true };
}

/**
 * Abre cualquier tipo de adjunto
 */
export async function openAttachment(attachmentId: string): Promise<boolean> {
  const db = getDatabase();
  
  const attachment = await db.attachment.findUnique({
    where: { id: attachmentId },
  });

  if (!attachment) {
    return false;
  }

  switch (attachment.type) {
    case 'file':
      return openFile(attachmentId);
    case 'url':
      return openUrl(attachmentId);
    case 'email':
      return openEmail(attachmentId);
    default:
      return false;
  }
}

/**
 * Obtiene la ruta completa de un archivo adjunto
 */
export function getAttachmentPath(fileName: string): string {
  return path.join(ATTACHMENTS_DIR, fileName);
}

/**
 * Formatea el tamaño en bytes a formato legible
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
