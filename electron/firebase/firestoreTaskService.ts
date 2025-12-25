/**
 * Firestore Task Service
 * Operaciones CRUD directas con Firestore como fuente única de datos
 */

import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  Timestamp,
  serverTimestamp,
  DocumentData,
} from 'firebase/firestore';
import { getFirestoreDb, isFirebaseConfigured } from './config';
import { getCurrentUser } from './authService';
import { getDeviceId } from '../utils/deviceId';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

// ═══════════════════════════════════════════════════════════════════════════
// INTERFACES
// ═══════════════════════════════════════════════════════════════════════════

export interface Subtask {
  id: string;
  title: string;
  done: boolean;
}

export interface Task {
  id: string;
  title: string;
  notes: string | null;
  projectId: string | null;
  project?: Project | null;
  sortOrder: number;
  tags: string | null;
  priority: number;
  dueDate: Date | null;
  startDate: Date | null;
  isRecurring: boolean;
  recurrenceRule: string | null;
  recurrenceEnd: Date | null;
  subtasks: string | null;
  isWaitingFor: boolean;
  waitingForNote: string | null;
  followUpDate: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  deviceId: string;
  syncVersion: number;
  reminders: Reminder[];
}

export interface Project {
  id: string;
  name: string;
  color: string;
  icon: string | null;
  sortOrder: number;
  isArchived: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  deviceId: string;
  syncVersion: number;
}

export interface Reminder {
  id: string;
  taskId: string;
  fireAt: Date;
  type: string;
  snoozedUntil: Date | null;
  deletedAt: Date | null;
}

export interface Tag {
  id: string;
  name: string;
  color: string;
  createdAt: Date;
  deviceId: string;
}

export interface CreateTaskInput {
  title: string;
  notes?: string | null;
  projectId?: string | null;
  dueDate?: Date | string | null;
  priority?: number;
  tags?: string[] | null;
  isWaitingFor?: boolean;
  waitingForNote?: string | null;
  addReminder?: boolean;
  isRecurring?: boolean;
  recurrenceRule?: string | null;
  recurrenceEnd?: Date | string | null;
  subtasks?: Subtask[] | null;
}

export interface UpdateTaskInput {
  title?: string;
  notes?: string | null;
  projectId?: string | null;
  dueDate?: Date | string | null;
  priority?: number;
  tags?: string[] | null;
  isWaitingFor?: boolean;
  waitingForNote?: string | null;
  addReminder?: boolean;
  isRecurring?: boolean;
  recurrenceRule?: string | null;
  recurrenceEnd?: Date | string | null;
  subtasks?: Subtask[] | null;
  completedAt?: Date | null;
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function checkAuth() {
  if (!isFirebaseConfigured()) {
    throw new Error('Firebase no está configurado');
  }
  // Solo verificamos que tengamos un userId (de sesión real o almacenada)
  const user = getCurrentUser();
  if (!user || !user.uid) {
    throw new Error('Usuario no autenticado. Por favor inicia sesión.');
  }
}

function getUserId(): string {
  const user = getCurrentUser();
  if (!user || !user.uid) {
    throw new Error('Usuario no autenticado');
  }
  return user.uid;
}

function toDate(value: any): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (value instanceof Timestamp) return value.toDate();
  if (typeof value === 'string') return new Date(value);
  if (typeof value === 'number') return new Date(value);
  if (value.toDate) return value.toDate(); // Firestore Timestamp
  return null;
}

function toTimestamp(value: any): Timestamp | null {
  const date = toDate(value);
  return date ? Timestamp.fromDate(date) : null;
}

function docToTask(docData: DocumentData, docId: string, project?: Project | null): Task {
  return {
    id: docId,
    title: docData.title || '',
    notes: docData.notes || null,
    projectId: docData.projectId || null,
    project: project || null,
    sortOrder: docData.sortOrder || 0,
    tags: docData.tags || null,
    priority: docData.priority || 0,
    dueDate: toDate(docData.dueDate),
    startDate: toDate(docData.startDate),
    isRecurring: docData.isRecurring || false,
    recurrenceRule: docData.recurrenceRule || null,
    recurrenceEnd: toDate(docData.recurrenceEnd),
    subtasks: docData.subtasks || null,
    isWaitingFor: docData.isWaitingFor || false,
    waitingForNote: docData.waitingForNote || null,
    followUpDate: toDate(docData.followUpDate),
    completedAt: toDate(docData.completedAt),
    createdAt: toDate(docData.createdAt) || new Date(),
    updatedAt: toDate(docData.updatedAt) || new Date(),
    deletedAt: toDate(docData.deletedAt),
    deviceId: docData.deviceId || '',
    syncVersion: docData.syncVersion || 0,
    reminders: [], // Se cargan por separado si es necesario
  };
}

function docToProject(docData: DocumentData, docId: string): Project {
  return {
    id: docId,
    name: docData.name || '',
    color: docData.color || '#3B82F6',
    icon: docData.icon || null,
    sortOrder: docData.sortOrder || 0,
    isArchived: docData.isArchived || false,
    createdAt: toDate(docData.createdAt) || new Date(),
    updatedAt: toDate(docData.updatedAt) || new Date(),
    deletedAt: toDate(docData.deletedAt),
    deviceId: docData.deviceId || '',
    syncVersion: docData.syncVersion || 0,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// TASKS - CRUD
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Obtiene todas las tareas del usuario (no eliminadas)
 */
export async function getAllTasks(): Promise<Task[]> {
  logger.info('getAllTasks: iniciando...');
  checkAuth();
  const db = getFirestoreDb();
  const userId = getUserId();
  
  logger.info(`getAllTasks: userId=${userId}`);
  
  if (!db) throw new Error('Firestore no disponible');
  
  const tasksRef = collection(db, 'users', userId, 'tasks');
  logger.info(`getAllTasks: obteniendo docs de users/${userId}/tasks`);
  // Consulta simple sin índice compuesto - filtramos en memoria
  const snapshot = await getDocs(tasksRef);
  logger.info(`getAllTasks: snapshot tiene ${snapshot.size} documentos`);
  const tasks: Task[] = [];
  
  // Cargar proyectos para relacionar
  const projects = await getAllProjects();
  const projectMap = new Map(projects.map(p => [p.id, p]));
  
  snapshot.forEach(doc => {
    const data = doc.data();
    logger.debug(`Task doc ${doc.id}: deletedAt=${data.deletedAt}, completedAt=${data.completedAt}, title=${data.title}`);
    // Filtrar tareas eliminadas en memoria
    if (data.deletedAt !== null && data.deletedAt !== undefined) return;
    
    const project = data.projectId ? projectMap.get(data.projectId) : null;
    tasks.push(docToTask(data, doc.id, project));
  });
  
  // Ordenar: no completadas primero, luego por fecha
  tasks.sort((a, b) => {
    if (a.completedAt && !b.completedAt) return 1;
    if (!a.completedAt && b.completedAt) return -1;
    if (a.dueDate && b.dueDate) return a.dueDate.getTime() - b.dueDate.getTime();
    if (a.dueDate && !b.dueDate) return -1;
    if (!a.dueDate && b.dueDate) return 1;
    return b.createdAt.getTime() - a.createdAt.getTime();
  });
  
  logger.debug(`Fetched ${tasks.length} tasks from Firestore`);
  return tasks;
}

/**
 * Obtiene tareas para "Hoy"
 */
export async function getTodayTasks(): Promise<Task[]> {
  const allTasks = await getAllTasks();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  return allTasks.filter(t => 
    !t.completedAt && 
    t.dueDate && 
    t.dueDate >= today && 
    t.dueDate < tomorrow
  );
}

/**
 * Obtiene tareas vencidas
 */
export async function getOverdueTasks(): Promise<Task[]> {
  const allTasks = await getAllTasks();
  const now = new Date();
  
  return allTasks.filter(t => 
    !t.completedAt && 
    t.dueDate && 
    t.dueDate < now
  );
}

/**
 * Obtiene tareas de los próximos 7 días
 */
export async function getUpcomingTasks(): Promise<Task[]> {
  const allTasks = await getAllTasks();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const nextWeek = new Date(today);
  nextWeek.setDate(nextWeek.getDate() + 7);
  
  return allTasks.filter(t => 
    !t.completedAt && 
    t.dueDate && 
    t.dueDate >= today && 
    t.dueDate <= nextWeek
  );
}

/**
 * Obtiene tareas "Esperando respuesta"
 */
export async function getWaitingTasks(): Promise<Task[]> {
  const allTasks = await getAllTasks();
  return allTasks.filter(t => !t.completedAt && t.isWaitingFor);
}

/**
 * Obtiene una tarea por ID
 */
export async function getTaskById(id: string): Promise<Task | null> {
  checkAuth();
  const db = getFirestoreDb();
  const userId = getUserId();
  
  if (!db) throw new Error('Firestore no disponible');
  
  const taskRef = doc(db, 'users', userId, 'tasks', id);
  const taskSnap = await getDoc(taskRef);
  
  if (!taskSnap.exists()) return null;
  
  const data = taskSnap.data();
  let project: Project | null = null;
  
  if (data.projectId) {
    project = await getProjectById(data.projectId);
  }
  
  return docToTask(data, taskSnap.id, project);
}

/**
 * Crea una nueva tarea
 */
export async function createTask(input: CreateTaskInput): Promise<Task> {
  checkAuth();
  const db = getFirestoreDb();
  const userId = getUserId();
  const deviceId = getDeviceId();
  
  if (!db) throw new Error('Firestore no disponible');
  
  const taskId = uuidv4();
  const now = new Date();
  const dueDate = toDate(input.dueDate);
  
  const taskData = {
    title: input.title,
    notes: input.notes || null,
    projectId: input.projectId || null,
    sortOrder: 0,
    tags: input.tags ? JSON.stringify(input.tags) : null,
    priority: input.priority ?? 0,
    dueDate: dueDate ? Timestamp.fromDate(dueDate) : null,
    startDate: null,
    isRecurring: input.isRecurring ?? false,
    recurrenceRule: input.recurrenceRule || null,
    recurrenceEnd: toTimestamp(input.recurrenceEnd),
    subtasks: input.subtasks ? JSON.stringify(input.subtasks) : null,
    isWaitingFor: input.isWaitingFor ?? false,
    waitingForNote: input.waitingForNote || null,
    followUpDate: null,
    completedAt: null,
    createdAt: Timestamp.fromDate(now),
    updatedAt: serverTimestamp(),
    deletedAt: null,
    deviceId,
    syncVersion: 1,
  };
  
  const taskRef = doc(db, 'users', userId, 'tasks', taskId);
  await setDoc(taskRef, taskData);
  
  // Crear reminder si se solicitó
  if (dueDate && input.addReminder !== false) {
    await createReminder(userId, taskId, dueDate, input.recurrenceRule || undefined);
  }
  
  logger.info(`Task created in Firestore: ${taskId} - ${input.title}`);
  
  // Retornar la tarea creada
  let project: Project | null = null;
  if (input.projectId) {
    project = await getProjectById(input.projectId);
  }
  
  return {
    id: taskId,
    title: input.title,
    notes: input.notes || null,
    projectId: input.projectId || null,
    project,
    sortOrder: 0,
    tags: input.tags ? JSON.stringify(input.tags) : null,
    priority: input.priority ?? 0,
    dueDate,
    startDate: null,
    isRecurring: input.isRecurring ?? false,
    recurrenceRule: input.recurrenceRule || null,
    recurrenceEnd: toDate(input.recurrenceEnd),
    subtasks: input.subtasks ? JSON.stringify(input.subtasks) : null,
    isWaitingFor: input.isWaitingFor ?? false,
    waitingForNote: input.waitingForNote || null,
    followUpDate: null,
    completedAt: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    deviceId,
    syncVersion: 1,
    reminders: [],
  };
}

/**
 * Actualiza una tarea
 */
export async function updateTask(id: string, input: UpdateTaskInput): Promise<Task> {
  checkAuth();
  const db = getFirestoreDb();
  const userId = getUserId();
  
  if (!db) throw new Error('Firestore no disponible');
  
  const taskRef = doc(db, 'users', userId, 'tasks', id);
  const taskSnap = await getDoc(taskRef);
  
  if (!taskSnap.exists()) {
    throw new Error('Tarea no encontrada');
  }
  
  const updateData: any = {
    updatedAt: serverTimestamp(),
    syncVersion: (taskSnap.data().syncVersion || 0) + 1,
  };
  
  if (input.title !== undefined) updateData.title = input.title;
  if (input.notes !== undefined) updateData.notes = input.notes;
  if (input.projectId !== undefined) updateData.projectId = input.projectId;
  if (input.priority !== undefined) updateData.priority = input.priority;
  if (input.isWaitingFor !== undefined) updateData.isWaitingFor = input.isWaitingFor;
  if (input.waitingForNote !== undefined) updateData.waitingForNote = input.waitingForNote;
  if (input.isRecurring !== undefined) updateData.isRecurring = input.isRecurring;
  if (input.recurrenceRule !== undefined) updateData.recurrenceRule = input.recurrenceRule;
  if (input.completedAt !== undefined) {
    updateData.completedAt = input.completedAt ? Timestamp.fromDate(input.completedAt) : null;
  }
  
  if (input.dueDate !== undefined) {
    updateData.dueDate = toTimestamp(input.dueDate);
  }
  
  if (input.recurrenceEnd !== undefined) {
    updateData.recurrenceEnd = toTimestamp(input.recurrenceEnd);
  }
  
  if (input.tags !== undefined) {
    updateData.tags = input.tags ? JSON.stringify(input.tags) : null;
  }
  
  if (input.subtasks !== undefined) {
    updateData.subtasks = input.subtasks ? JSON.stringify(input.subtasks) : null;
  }
  
  await updateDoc(taskRef, updateData);
  
  logger.info(`Task updated in Firestore: ${id}`);
  
  // Retornar la tarea actualizada
  return (await getTaskById(id))!;
}

/**
 * Completa una tarea
 */
export async function completeTask(id: string): Promise<Task> {
  checkAuth();
  const db = getFirestoreDb();
  const userId = getUserId();
  
  if (!db) throw new Error('Firestore no disponible');
  
  // Verificar si es recurrente
  const task = await getTaskById(id);
  if (task?.isRecurring && task.recurrenceRule && task.dueDate) {
    return completeRecurringTask(id, task);
  }
  
  const taskRef = doc(db, 'users', userId, 'tasks', id);
  await updateDoc(taskRef, {
    completedAt: Timestamp.fromDate(new Date()),
    updatedAt: serverTimestamp(),
    syncVersion: (task?.syncVersion || 0) + 1,
  });
  
  logger.info(`Task completed in Firestore: ${id}`);
  return (await getTaskById(id))!;
}

/**
 * Completa una tarea recurrente (crea siguiente ocurrencia)
 */
async function completeRecurringTask(id: string, task: Task): Promise<Task> {
  const db = getFirestoreDb();
  const userId = getUserId();
  
  if (!db || !task.dueDate || !task.recurrenceRule) {
    return completeTask(id);
  }
  
  // Calcular próxima fecha
  const nextDueDate = getNextOccurrence(task.dueDate, task.recurrenceRule);
  
  // Verificar si llegamos al fin de la recurrencia
  if (task.recurrenceEnd && nextDueDate > task.recurrenceEnd) {
    // Completar definitivamente
    const taskRef = doc(db, 'users', userId, 'tasks', id);
    await updateDoc(taskRef, {
      completedAt: Timestamp.fromDate(new Date()),
      updatedAt: serverTimestamp(),
    });
    return (await getTaskById(id))!;
  }
  
  // Actualizar a la siguiente fecha (no marcar como completada)
  const taskRef = doc(db, 'users', userId, 'tasks', id);
  await updateDoc(taskRef, {
    dueDate: Timestamp.fromDate(nextDueDate),
    updatedAt: serverTimestamp(),
  });
  
  logger.info(`Recurring task moved to next occurrence: ${id} -> ${nextDueDate}`);
  return (await getTaskById(id))!;
}

/**
 * Calcula la próxima fecha según la regla de recurrencia
 */
function getNextOccurrence(currentDate: Date, recurrenceRule: string): Date {
  const nextDate = new Date(currentDate);
  
  const rule = recurrenceRule.toLowerCase();
  
  if (rule === 'daily' || rule.includes('freq=daily')) {
    nextDate.setDate(nextDate.getDate() + 1);
  } else if (rule === 'weekly' || rule.includes('freq=weekly')) {
    if (rule.includes('byday=')) {
      // Días específicos (weekdays)
      const daysMatch = rule.match(/byday=([a-z,]+)/i);
      if (daysMatch) {
        const days = daysMatch[1].toUpperCase().split(',');
        const dayMap: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
        const allowedDays = days.map(d => dayMap[d]).filter(d => d !== undefined);
        
        do {
          nextDate.setDate(nextDate.getDate() + 1);
        } while (!allowedDays.includes(nextDate.getDay()));
      }
    } else {
      nextDate.setDate(nextDate.getDate() + 7);
    }
  } else if (rule === 'monthly' || rule.includes('freq=monthly')) {
    nextDate.setMonth(nextDate.getMonth() + 1);
  } else if (rule === 'yearly' || rule.includes('freq=yearly')) {
    nextDate.setFullYear(nextDate.getFullYear() + 1);
  } else if (rule === 'weekdays') {
    do {
      nextDate.setDate(nextDate.getDate() + 1);
    } while (nextDate.getDay() === 0 || nextDate.getDay() === 6);
  }
  
  return nextDate;
}

/**
 * Reabre una tarea completada
 */
export async function reopenTask(id: string): Promise<Task> {
  checkAuth();
  const db = getFirestoreDb();
  const userId = getUserId();
  
  if (!db) throw new Error('Firestore no disponible');
  
  const taskRef = doc(db, 'users', userId, 'tasks', id);
  await updateDoc(taskRef, {
    completedAt: null,
    updatedAt: serverTimestamp(),
  });
  
  logger.info(`Task reopened in Firestore: ${id}`);
  return (await getTaskById(id))!;
}

/**
 * Elimina una tarea (soft delete)
 */
export async function deleteTask(id: string): Promise<Task> {
  checkAuth();
  const db = getFirestoreDb();
  const userId = getUserId();
  
  if (!db) throw new Error('Firestore no disponible');
  
  const taskRef = doc(db, 'users', userId, 'tasks', id);
  const task = await getTaskById(id);
  
  await updateDoc(taskRef, {
    deletedAt: Timestamp.fromDate(new Date()),
    updatedAt: serverTimestamp(),
  });
  
  logger.info(`Task deleted in Firestore: ${id}`);
  return task!;
}

/**
 * Busca tareas por texto
 */
export async function searchTasks(queryText: string): Promise<Task[]> {
  const allTasks = await getAllTasks();
  const lowerQuery = queryText.toLowerCase();
  
  return allTasks.filter(t => 
    t.title.toLowerCase().includes(lowerQuery) ||
    (t.notes && t.notes.toLowerCase().includes(lowerQuery))
  );
}

/**
 * Obtiene tareas por proyecto
 */
export async function getTasksByProject(projectId: string | null): Promise<Task[]> {
  const allTasks = await getAllTasks();
  return allTasks.filter(t => t.projectId === projectId);
}

/**
 * Obtiene tareas por etiqueta
 */
export async function getTasksByTag(tagName: string): Promise<Task[]> {
  const allTasks = await getAllTasks();
  const lowerTag = tagName.toLowerCase();
  
  return allTasks.filter(t => {
    if (!t.tags) return false;
    try {
      const tags = JSON.parse(t.tags);
      return tags.some((tag: string) => tag.toLowerCase() === lowerTag);
    } catch {
      return false;
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// PROJECTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Obtiene todos los proyectos
 */
export async function getAllProjects(): Promise<Project[]> {
  checkAuth();
  const db = getFirestoreDb();
  const userId = getUserId();
  
  if (!db) throw new Error('Firestore no disponible');
  
  const projectsRef = collection(db, 'users', userId, 'projects');
  // Consulta simple - filtrar en memoria
  const snapshot = await getDocs(projectsRef);
  const projects: Project[] = [];
  
  snapshot.forEach(doc => {
    const data = doc.data();
    // Filtrar proyectos eliminados
    if (data.deletedAt !== null && data.deletedAt !== undefined) return;
    projects.push(docToProject(data, doc.id));
  });
  
  projects.sort((a, b) => a.sortOrder - b.sortOrder);
  
  logger.debug(`Fetched ${projects.length} projects from Firestore`);
  return projects;
}

/**
 * Obtiene un proyecto por ID
 */
export async function getProjectById(id: string): Promise<Project | null> {
  checkAuth();
  const db = getFirestoreDb();
  const userId = getUserId();
  
  if (!db) throw new Error('Firestore no disponible');
  
  const projectRef = doc(db, 'users', userId, 'projects', id);
  const projectSnap = await getDoc(projectRef);
  
  if (!projectSnap.exists()) return null;
  
  return docToProject(projectSnap.data(), projectSnap.id);
}

/**
 * Crea un proyecto
 */
export async function createProject(input: { name: string; color?: string; icon?: string }): Promise<Project> {
  checkAuth();
  const db = getFirestoreDb();
  const userId = getUserId();
  const deviceId = getDeviceId();
  
  if (!db) throw new Error('Firestore no disponible');
  
  const projectId = uuidv4();
  const now = new Date();
  
  const projectData = {
    name: input.name,
    color: input.color || '#3B82F6',
    icon: input.icon || null,
    sortOrder: 0,
    isArchived: false,
    createdAt: Timestamp.fromDate(now),
    updatedAt: serverTimestamp(),
    deletedAt: null,
    deviceId,
    syncVersion: 1,
  };
  
  const projectRef = doc(db, 'users', userId, 'projects', projectId);
  await setDoc(projectRef, projectData);
  
  logger.info(`Project created in Firestore: ${projectId} - ${input.name}`);
  
  return {
    id: projectId,
    name: input.name,
    color: input.color || '#3B82F6',
    icon: input.icon || null,
    sortOrder: 0,
    isArchived: false,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    deviceId,
    syncVersion: 1,
  };
}

/**
 * Actualiza un proyecto
 */
export async function updateProject(id: string, input: { name?: string; color?: string; icon?: string }): Promise<Project> {
  checkAuth();
  const db = getFirestoreDb();
  const userId = getUserId();
  
  if (!db) throw new Error('Firestore no disponible');
  
  const projectRef = doc(db, 'users', userId, 'projects', id);
  const updateData: any = { updatedAt: serverTimestamp() };
  
  if (input.name !== undefined) updateData.name = input.name;
  if (input.color !== undefined) updateData.color = input.color;
  if (input.icon !== undefined) updateData.icon = input.icon;
  
  await updateDoc(projectRef, updateData);
  
  logger.info(`Project updated in Firestore: ${id}`);
  return (await getProjectById(id))!;
}

/**
 * Archiva un proyecto
 */
export async function archiveProject(id: string): Promise<Project> {
  checkAuth();
  const db = getFirestoreDb();
  const userId = getUserId();
  
  if (!db) throw new Error('Firestore no disponible');
  
  const projectRef = doc(db, 'users', userId, 'projects', id);
  await updateDoc(projectRef, {
    isArchived: true,
    updatedAt: serverTimestamp(),
  });
  
  logger.info(`Project archived in Firestore: ${id}`);
  return (await getProjectById(id))!;
}

/**
 * Elimina un proyecto
 */
export async function deleteProject(id: string): Promise<void> {
  checkAuth();
  const db = getFirestoreDb();
  const userId = getUserId();
  
  if (!db) throw new Error('Firestore no disponible');
  
  const projectRef = doc(db, 'users', userId, 'projects', id);
  await updateDoc(projectRef, {
    deletedAt: Timestamp.fromDate(new Date()),
    updatedAt: serverTimestamp(),
  });
  
  logger.info(`Project deleted in Firestore: ${id}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// TAGS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Obtiene todas las etiquetas
 */
export async function getAllTags(): Promise<Tag[]> {
  checkAuth();
  const db = getFirestoreDb();
  const userId = getUserId();
  
  if (!db) throw new Error('Firestore no disponible');
  
  const tagsRef = collection(db, 'users', userId, 'tags');
  const snapshot = await getDocs(tagsRef);
  
  const tags: Tag[] = [];
  snapshot.forEach(doc => {
    const data = doc.data();
    tags.push({
      id: doc.id,
      name: data.name,
      color: data.color || '#6B7280',
      createdAt: toDate(data.createdAt) || new Date(),
      deviceId: data.deviceId || '',
    });
  });
  
  logger.debug(`Fetched ${tags.length} tags from Firestore`);
  return tags;
}

/**
 * Crea una etiqueta
 */
export async function createTag(name: string, color?: string): Promise<Tag> {
  checkAuth();
  const db = getFirestoreDb();
  const userId = getUserId();
  const deviceId = getDeviceId();
  
  if (!db) throw new Error('Firestore no disponible');
  
  const tagId = uuidv4();
  const now = new Date();
  
  const tagData = {
    name: name.toLowerCase(),
    color: color || '#6B7280',
    createdAt: Timestamp.fromDate(now),
    deviceId,
  };
  
  const tagRef = doc(db, 'users', userId, 'tags', tagId);
  await setDoc(tagRef, tagData);
  
  logger.info(`Tag created in Firestore: ${tagId} - ${name}`);
  
  return {
    id: tagId,
    name: name.toLowerCase(),
    color: color || '#6B7280',
    createdAt: now,
    deviceId,
  };
}

/**
 * Elimina una etiqueta
 */
export async function deleteTag(id: string): Promise<void> {
  checkAuth();
  const db = getFirestoreDb();
  const userId = getUserId();
  
  if (!db) throw new Error('Firestore no disponible');
  
  const tagRef = doc(db, 'users', userId, 'tags', id);
  await deleteDoc(tagRef);
  
  logger.info(`Tag deleted from Firestore: ${id}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// REMINDERS (para notificaciones)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Crea un reminder para una tarea
 */
async function createReminder(userId: string, taskId: string, fireAt: Date, recurrenceRule?: string): Promise<void> {
  const db = getFirestoreDb();
  const deviceId = getDeviceId();
  
  if (!db) return;
  
  const reminderId = uuidv4();
  
  const reminderData = {
    taskId,
    fireAt: Timestamp.fromDate(fireAt),
    type: 'due',
    recurrenceRule: recurrenceRule || null,
    snoozedUntil: null,
    dismissed: false,
    firedAt: null,
    createdAt: Timestamp.fromDate(new Date()),
    deletedAt: null,
    deviceId,
  };
  
  const reminderRef = doc(db, 'users', userId, 'reminders', reminderId);
  await setDoc(reminderRef, reminderData);
  
  logger.debug(`Reminder created in Firestore for task ${taskId}`);
}

/**
 * Obtiene el próximo reminder a disparar
 */
export async function getNextReminder(): Promise<{ id: string; taskId: string; fireAt: Date; task: Task } | null> {
  checkAuth();
  const db = getFirestoreDb();
  const userId = getUserId();
  
  if (!db) return null;
  
  const remindersRef = collection(db, 'users', userId, 'reminders');
  const now = new Date();
  
  // Consulta simple - filtrar en memoria para evitar índices
  const snapshot = await getDocs(remindersRef);
  
  // Filtrar y ordenar en memoria
  const validReminders: { id: string; data: DocumentData; fireAt: Date }[] = [];
  snapshot.forEach(docSnap => {
    const data = docSnap.data();
    if (data.deletedAt !== null && data.deletedAt !== undefined) return;
    if (data.dismissed === true) return;
    if (data.firedAt !== null && data.firedAt !== undefined) return;
    const fireAt = toDate(data.fireAt);
    if (fireAt) {
      validReminders.push({ id: docSnap.id, data, fireAt });
    }
  });
  
  // Ordenar por fireAt
  validReminders.sort((a, b) => a.fireAt.getTime() - b.fireAt.getTime());
  
  // Procesar el primero válido
  for (const reminder of validReminders) {
    const task = await getTaskById(reminder.data.taskId);
    if (task && !task.completedAt && !task.deletedAt) {
      return {
        id: reminder.id,
        taskId: reminder.data.taskId,
        fireAt: reminder.fireAt,
        task,
      };
    }
  }
  
  return null;
}

/**
 * Marca un reminder como disparado
 */
export async function markReminderAsFired(reminderId: string): Promise<void> {
  checkAuth();
  const db = getFirestoreDb();
  const userId = getUserId();
  
  if (!db) return;
  
  const reminderRef = doc(db, 'users', userId, 'reminders', reminderId);
  await updateDoc(reminderRef, {
    firedAt: Timestamp.fromDate(new Date()),
  });
}

/**
 * Pospone un reminder
 */
export async function snoozeReminder(reminderId: string, minutes: number): Promise<void> {
  checkAuth();
  const db = getFirestoreDb();
  const userId = getUserId();
  
  if (!db) return;
  
  const snoozedUntil = new Date(Date.now() + minutes * 60 * 1000);
  
  const reminderRef = doc(db, 'users', userId, 'reminders', reminderId);
  await updateDoc(reminderRef, {
    snoozedUntil: Timestamp.fromDate(snoozedUntil),
    fireAt: Timestamp.fromDate(snoozedUntil),
    firedAt: null,
  });
  
  logger.info(`Reminder snoozed for ${minutes} minutes: ${reminderId}`);
}

/**
 * Descarta un reminder
 */
export async function dismissReminder(reminderId: string): Promise<void> {
  checkAuth();
  const db = getFirestoreDb();
  const userId = getUserId();
  
  if (!db) return;
  
  const reminderRef = doc(db, 'users', userId, 'reminders', reminderId);
  await updateDoc(reminderRef, {
    dismissed: true,
  });
  
  logger.info(`Reminder dismissed: ${reminderId}`);
}
