/**
 * Commitment Service
 * Lógica específica para tipos de compromiso: call, email, video, meeting, trip
 */

import { getDatabase } from '../database/connection';
import { getDeviceId } from '../utils/deviceId';
import { logger } from '../utils/logger';

// ═══════════════════════════════════════════════════════════════════════════
// TIPOS
// ═══════════════════════════════════════════════════════════════════════════

export type CommitmentType = 'task' | 'call' | 'email' | 'video' | 'meeting' | 'trip';
export type CommitmentStatus = 'pending' | 'in_progress' | 'done' | 'waiting' | 'sent';

// Datos específicos por tipo
export interface CallData {
  contactName?: string;
  company?: string;
  reason?: string;
  estimatedDuration?: number; // minutos, default 15
  phoneNumber?: string;
}

export interface EmailData {
  subject?: string;
  recipient?: string;
  recipientEmail?: string;
}

export interface VideoData {
  platform?: 'zoom' | 'meet' | 'teams' | 'other';
  meetingUrl?: string;
  participants?: string[]; // nombres
  agenda?: string[]; // bullets de agenda
}

export interface MeetingData {
  participants?: string[];
  agenda?: string[];
  transportMode?: 'car' | 'public' | 'walking';
  travelTimeMinutes?: number; // tiempo de ida
  returnTravelTimeMinutes?: number; // tiempo de vuelta (opcional)
  bufferMinutes?: number; // margen extra (default 10)
}

export interface TripData {
  destination?: string;
  hotel?: string;
  objective?: string;
  transportMode?: 'car' | 'plane' | 'train' | 'bus';
  outboundTravelMinutes?: number;
  returnTravelMinutes?: number;
}

export type TypeData = CallData | EmailData | VideoData | MeetingData | TripData;

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURACIÓN POR TIPO
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// OPCIONES DE RECORDATORIO CON ANTELACIÓN
// ═══════════════════════════════════════════════════════════════════════════

export interface ReminderOption {
  advanceMinutes: number;
  label: string;
}

export const REMINDER_OPTIONS: ReminderOption[] = [
  { advanceMinutes: 0, label: 'A la hora del evento' },
  { advanceMinutes: 5, label: '5 minutos antes' },
  { advanceMinutes: 10, label: '10 minutos antes' },
  { advanceMinutes: 15, label: '15 minutos antes' },
  { advanceMinutes: 30, label: '30 minutos antes' },
  { advanceMinutes: 60, label: '1 hora antes' },
  { advanceMinutes: 120, label: '2 horas antes' },
  { advanceMinutes: 180, label: '3 horas antes' },
  { advanceMinutes: 1440, label: '1 día antes' },
  { advanceMinutes: 2880, label: '2 días antes' },
  { advanceMinutes: 4320, label: '3 días antes' },
  { advanceMinutes: 10080, label: '1 semana antes' },
  { advanceMinutes: 20160, label: '2 semanas antes' },
];

// Recordatorios por defecto según tipo de compromiso
export const DEFAULT_REMINDERS: Record<CommitmentType, number[]> = {
  task: [0],                           // A la hora
  call: [10],                          // 10 min antes
  email: [0],                          // A la hora
  video: [15, 5],                      // 15 min y 5 min antes
  meeting: [1440, 120, 15],            // 1 día, 2 horas, 15 min antes
  trip: [10080, 1440, 120],            // 1 semana, 1 día, 2 horas antes
};

export const COMMITMENT_CONFIG = {
  task: {
    label: 'Tarea',
    icon: '✓',
    color: '#6B7280',
    hasEndDate: false,
    hasLocation: false,
    defaultDuration: 0,
    statuses: ['pending', 'in_progress', 'done', 'waiting'],
  },
  call: {
    label: 'Llamada',
    icon: '📞',
    color: '#10B981',
    hasEndDate: false,
    hasLocation: false,
    defaultDuration: 15,
    statuses: ['pending', 'in_progress', 'done', 'waiting'],
  },
  email: {
    label: 'Email',
    icon: '✉️',
    color: '#3B82F6',
    hasEndDate: false,
    hasLocation: false,
    defaultDuration: 0,
    statuses: ['pending', 'sent', 'waiting', 'done'],
  },
  video: {
    label: 'Videoconferencia',
    icon: '🎥',
    color: '#8B5CF6',
    hasEndDate: true,
    hasLocation: false,
    defaultDuration: 60,
    statuses: ['pending', 'in_progress', 'done'],
  },
  meeting: {
    label: 'Reunión presencial',
    icon: '🤝',
    color: '#F59E0B',
    hasEndDate: true,
    hasLocation: true,
    defaultDuration: 60,
    statuses: ['pending', 'in_progress', 'done'],
  },
  trip: {
    label: 'Viaje de trabajo',
    icon: '✈️',
    color: '#EF4444',
    hasEndDate: true,
    hasLocation: true,
    defaultDuration: 480, // 8 horas
    statuses: ['pending', 'in_progress', 'done'],
  },
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Parsea typeData de string JSON a objeto
 */
export function parseTypeData<T extends TypeData>(typeDataStr: string | null): T | null {
  if (!typeDataStr) return null;
  try {
    return JSON.parse(typeDataStr) as T;
  } catch {
    return null;
  }
}

/**
 * Serializa typeData a string JSON
 */
export function serializeTypeData(data: TypeData | null): string | null {
  if (!data) return null;
  return JSON.stringify(data);
}

/**
 * Extrae URL de un texto (para meetingUrl)
 */
export function extractUrl(text: string): string | null {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const matches = text.match(urlRegex);
  return matches ? matches[0] : null;
}

/**
 * Detecta plataforma de videoconferencia por URL
 */
export function detectPlatform(url: string): VideoData['platform'] {
  if (url.includes('zoom.us')) return 'zoom';
  if (url.includes('meet.google.com')) return 'meet';
  if (url.includes('teams.microsoft.com')) return 'teams';
  return 'other';
}

/**
 * Calcula hora de salida para llegar a tiempo a una reunión
 */
export function calculateDepartureTime(
  meetingStart: Date,
  travelTimeMinutes: number,
  bufferMinutes: number = 10
): Date {
  const departure = new Date(meetingStart);
  departure.setMinutes(departure.getMinutes() - travelTimeMinutes - bufferMinutes);
  return departure;
}

/**
 * Calcula hora de llegada después de una reunión
 */
export function calculateReturnTime(
  meetingEnd: Date,
  returnTravelMinutes: number
): Date {
  const returnTime = new Date(meetingEnd);
  returnTime.setMinutes(returnTime.getMinutes() + returnTravelMinutes);
  return returnTime;
}

// ═══════════════════════════════════════════════════════════════════════════
// OPERACIONES DE UBICACIÓN
// ═══════════════════════════════════════════════════════════════════════════

export interface CreateLocationInput {
  name: string;
  address?: string;
  city?: string;
  province?: string;
  country?: string;
  postalCode?: string;
  latitude?: number;
  longitude?: number;
}

/**
 * Crea una nueva ubicación
 */
export async function createLocation(input: CreateLocationInput) {
  const db = getDatabase();
  const deviceId = getDeviceId();

  const location = await db.location.create({
    data: {
      name: input.name,
      address: input.address,
      city: input.city,
      province: input.province,
      country: input.country,
      postalCode: input.postalCode,
      latitude: input.latitude,
      longitude: input.longitude,
      deviceId,
    },
  });

  logger.info(`Location created: ${location.id} - ${location.name}`);
  return location;
}

/**
 * Obtiene todas las ubicaciones
 */
export async function getAllLocations() {
  const db = getDatabase();
  return db.location.findMany({
    orderBy: { name: 'asc' },
  });
}

/**
 * Busca ubicaciones por nombre
 */
export async function searchLocations(query: string) {
  const db = getDatabase();
  return db.location.findMany({
    where: {
      OR: [
        { name: { contains: query } },
        { address: { contains: query } },
        { city: { contains: query } },
        { province: { contains: query } },
      ],
    },
    orderBy: { name: 'asc' },
    take: 10,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// ACCIONES RÁPIDAS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Acción: Llamar ahora (marca como en progreso)
 */
export async function startCall(taskId: string) {
  const db = getDatabase();
  
  const task = await db.task.update({
    where: { id: taskId },
    data: {
      status: 'in_progress',
      updatedAt: new Date(),
    },
  });

  logger.info(`Call started: ${taskId}`);
  return task;
}

/**
 * Acción: Completar llamada
 */
export async function completeCall(taskId: string, notes?: string) {
  const db = getDatabase();
  
  const task = await db.task.update({
    where: { id: taskId },
    data: {
      status: 'done',
      completedAt: new Date(),
      notes: notes ? notes : undefined,
      updatedAt: new Date(),
    },
  });

  logger.info(`Call completed: ${taskId}`);
  return task;
}

/**
 * Acción: Reintentar llamada (crear seguimiento)
 */
export async function retryCall(taskId: string, retryInDays: number) {
  const db = getDatabase();
  const deviceId = getDeviceId();
  
  const originalTask = await db.task.findUnique({ where: { id: taskId } });
  if (!originalTask) throw new Error('Task not found');

  const retryDate = new Date();
  retryDate.setDate(retryDate.getDate() + retryInDays);
  retryDate.setHours(9, 0, 0, 0); // Default 9:00 AM

  // Marcar original como esperando
  await db.task.update({
    where: { id: taskId },
    data: {
      status: 'waiting',
      waitingForNote: `Reintentar en ${retryInDays} día(s)`,
      followUpDate: retryDate,
      updatedAt: new Date(),
    },
  });

  logger.info(`Call retry scheduled: ${taskId} in ${retryInDays} days`);
  return { retryDate };
}

/**
 * Acción: Marcar email como enviado
 */
export async function markEmailSent(taskId: string) {
  const db = getDatabase();
  
  const task = await db.task.update({
    where: { id: taskId },
    data: {
      status: 'sent',
      updatedAt: new Date(),
    },
  });

  logger.info(`Email marked as sent: ${taskId}`);
  return task;
}

/**
 * Acción: Esperar respuesta de email
 */
export async function waitForEmailResponse(taskId: string, reminderInDays: number) {
  const db = getDatabase();
  
  const followUpDate = new Date();
  followUpDate.setDate(followUpDate.getDate() + reminderInDays);
  followUpDate.setHours(9, 0, 0, 0);

  const task = await db.task.update({
    where: { id: taskId },
    data: {
      status: 'waiting',
      isWaitingFor: true,
      waitingForNote: `Esperando respuesta`,
      followUpDate,
      updatedAt: new Date(),
    },
  });

  logger.info(`Email waiting for response: ${taskId}, follow up in ${reminderInDays} days`);
  return task;
}

/**
 * Acción: Abrir enlace de videoconferencia
 */
export async function getMeetingUrl(taskId: string): Promise<string | null> {
  const db = getDatabase();
  
  const task = await db.task.findUnique({ where: { id: taskId } });
  if (!task || !task.typeData) return null;

  const data = parseTypeData<VideoData>(task.typeData);
  return data?.meetingUrl || null;
}

// ═══════════════════════════════════════════════════════════════════════════
// VIAJES Y SUB-EVENTOS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Obtiene los sub-eventos de un viaje
 */
export async function getTripSubEvents(tripId: string) {
  const db = getDatabase();
  
  return db.task.findMany({
    where: {
      parentEventId: tripId,
      deletedAt: null,
    },
    include: {
      location: true,
      assignedTo: true,
    },
    orderBy: { dueDate: 'asc' },
  });
}

/**
 * Verifica si una fecha está dentro del rango de un viaje
 */
export async function isDateWithinTrip(tripId: string, date: Date): Promise<boolean> {
  const db = getDatabase();
  
  const trip = await db.task.findUnique({ where: { id: tripId } });
  if (!trip || trip.type !== 'trip' || !trip.dueDate || !trip.endDate) {
    return false;
  }

  return date >= trip.dueDate && date <= trip.endDate;
}

// ═══════════════════════════════════════════════════════════════════════════
// ANÁLISIS DE TIEMPO DE DESPLAZAMIENTO
// ═══════════════════════════════════════════════════════════════════════════

export interface TravelBlock {
  type: 'outbound' | 'return';
  start: Date;
  end: Date;
  description: string;
}

/**
 * Calcula los bloques de tiempo de desplazamiento para una reunión
 */
export function calculateTravelBlocks(
  meetingStart: Date,
  meetingEnd: Date,
  travelTimeMinutes: number,
  returnTravelMinutes?: number,
  bufferMinutes: number = 10
): TravelBlock[] {
  const blocks: TravelBlock[] = [];

  // Bloque de ida
  const departureTime = calculateDepartureTime(meetingStart, travelTimeMinutes, bufferMinutes);
  blocks.push({
    type: 'outbound',
    start: departureTime,
    end: meetingStart,
    description: `Desplazamiento ida (${travelTimeMinutes + bufferMinutes} min)`,
  });

  // Bloque de vuelta (si se especifica)
  if (returnTravelMinutes) {
    const returnEnd = calculateReturnTime(meetingEnd, returnTravelMinutes);
    blocks.push({
      type: 'return',
      start: meetingEnd,
      end: returnEnd,
      description: `Desplazamiento vuelta (${returnTravelMinutes} min)`,
    });
  }

  return blocks;
}

/**
 * Verifica conflictos de tiempo incluyendo desplazamientos
 */
export async function checkTravelConflicts(
  meetingStart: Date,
  meetingEnd: Date,
  travelTimeMinutes: number,
  returnTravelMinutes?: number,
  excludeTaskId?: string
) {
  const db = getDatabase();
  const bufferMinutes = 10;

  // Calcular rango total (incluyendo desplazamientos)
  const totalStart = calculateDepartureTime(meetingStart, travelTimeMinutes, bufferMinutes);
  const totalEnd = returnTravelMinutes 
    ? calculateReturnTime(meetingEnd, returnTravelMinutes)
    : meetingEnd;

  // Buscar tareas que se solapen con este rango
  const conflictingTasks = await db.task.findMany({
    where: {
      deletedAt: null,
      completedAt: null,
      dueDate: {
        gte: new Date(totalStart.getTime() - 30 * 60 * 1000), // 30 min antes
        lte: new Date(totalEnd.getTime() + 30 * 60 * 1000),   // 30 min después
      },
      ...(excludeTaskId ? { NOT: { id: excludeTaskId } } : {}),
    },
    select: {
      id: true,
      title: true,
      type: true,
      dueDate: true,
      endDate: true,
    },
  });

  return {
    hasConflicts: conflictingTasks.length > 0,
    conflicts: conflictingTasks,
    travelBlocks: calculateTravelBlocks(meetingStart, meetingEnd, travelTimeMinutes, returnTravelMinutes, bufferMinutes),
  };
}

export default {
  // Config
  COMMITMENT_CONFIG,
  
  // Helpers
  parseTypeData,
  serializeTypeData,
  extractUrl,
  detectPlatform,
  calculateDepartureTime,
  calculateReturnTime,
  
  // Locations
  createLocation,
  getAllLocations,
  searchLocations,
  
  // Quick actions
  startCall,
  completeCall,
  retryCall,
  markEmailSent,
  waitForEmailResponse,
  getMeetingUrl,
  
  // Trips
  getTripSubEvents,
  isDateWithinTrip,
  
  // Travel
  calculateTravelBlocks,
  checkTravelConflicts,
};
