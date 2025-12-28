/**
 * AI Service
 * Comunicación con OpenAI API para asistencia inteligente
 */

import OpenAI from 'openai';
import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { logger } from '../utils/logger';

// Ruta para guardar configuración de IA
const getConfigPath = () => path.join(app.getPath('userData'), 'ai-config.json');

// Clave para encriptar la API key (derivada del deviceId)
const getEncryptionKey = () => {
  const machineId = require('os').hostname() + require('os').userInfo().username;
  return crypto.createHash('sha256').update(machineId).digest();
};

interface AIConfig {
  apiKey: string; // Encriptada
  model: string;
  enabled: boolean;
}

let openaiClient: OpenAI | null = null;
let currentConfig: AIConfig | null = null;

/**
 * Encripta un string
 */
function encrypt(text: string): string {
  const iv = crypto.randomBytes(16);
  const key = getEncryptionKey();
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

/**
 * Desencripta un string
 */
function decrypt(text: string): string {
  try {
    const [ivHex, encrypted] = text.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const key = getEncryptionKey();
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch {
    return '';
  }
}

/**
 * Carga la configuración de IA
 */
export function loadAIConfig(): AIConfig | null {
  try {
    const configPath = getConfigPath();
    if (fs.existsSync(configPath)) {
      const data = fs.readFileSync(configPath, 'utf8');
      currentConfig = JSON.parse(data);
      return currentConfig;
    }
  } catch (error) {
    logger.error('aiService', 'Error loading AI config', error);
  }
  return null;
}

/**
 * Guarda la configuración de IA
 */
export function saveAIConfig(config: Partial<AIConfig>): void {
  try {
    const configPath = getConfigPath();
    const existing = loadAIConfig() || { apiKey: '', model: 'gpt-4o-mini', enabled: false };
    
    // Encriptar API key si se proporciona
    if (config.apiKey) {
      existing.apiKey = encrypt(config.apiKey);
    }
    if (config.model !== undefined) existing.model = config.model;
    if (config.enabled !== undefined) existing.enabled = config.enabled;
    
    fs.writeFileSync(configPath, JSON.stringify(existing, null, 2));
    currentConfig = existing;
    
    // Reinicializar cliente si hay nueva API key
    if (config.apiKey) {
      initializeClient();
    }
    
    logger.info('aiService', 'AI config saved');
  } catch (error) {
    logger.error('aiService', 'Error saving AI config', error);
    throw error;
  }
}

/**
 * Obtiene la configuración actual (sin API key desencriptada)
 */
export function getAIConfig(): { model: string; enabled: boolean; hasApiKey: boolean } {
  const config = currentConfig || loadAIConfig();
  return {
    model: config?.model || 'gpt-4o-mini',
    enabled: config?.enabled || false,
    hasApiKey: !!config?.apiKey,
  };
}

/**
 * Inicializa el cliente de OpenAI
 */
function initializeClient(): boolean {
  try {
    const config = currentConfig || loadAIConfig();
    if (!config?.apiKey) {
      logger.warn('aiService', 'No API key configured');
      return false;
    }
    
    const apiKey = decrypt(config.apiKey);
    if (!apiKey) {
      logger.error('aiService', 'Failed to decrypt API key');
      return false;
    }
    
    openaiClient = new OpenAI({ apiKey });
    logger.info('aiService', 'OpenAI client initialized');
    return true;
  } catch (error) {
    logger.error('aiService', 'Error initializing OpenAI client', error);
    return false;
  }
}

/**
 * Verifica si la IA está disponible
 */
export function isAIAvailable(): boolean {
  const config = getAIConfig();
  return config.enabled && config.hasApiKey;
}

/**
 * Valida una API key haciendo una llamada de prueba
 */
export async function validateApiKey(apiKey: string): Promise<{ valid: boolean; error?: string }> {
  try {
    const testClient = new OpenAI({ apiKey });
    
    // Hacer una llamada mínima para validar
    await testClient.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'test' }],
      max_tokens: 1,
    });
    
    return { valid: true };
  } catch (error: any) {
    logger.error('aiService', 'API key validation failed', error);
    
    if (error.status === 401) {
      return { valid: false, error: 'API Key inválida' };
    }
    if (error.status === 429) {
      return { valid: false, error: 'Límite de uso excedido' };
    }
    if (error.status === 402) {
      return { valid: false, error: 'Sin créditos disponibles' };
    }
    
    return { valid: false, error: error.message || 'Error de conexión' };
  }
}

/**
 * Sistema de prompts para el asistente
 */
const SYSTEM_PROMPT = `Eres un asistente de productividad integrado en AgendaPro, una app de gestión de tareas y recordatorios.

Tu rol es ayudar al usuario a:
1. Organizar mejor su tiempo y tareas
2. Sugerir horarios óptimos para nuevas tareas
3. Detectar y resolver conflictos de agenda
4. Priorizar tareas según urgencia e importancia
5. Crear subtareas a partir de tareas complejas

Reglas:
- Sé conciso y directo
- Usa español
- Cuando sugieras fechas/horas, usa formato legible (ej: "mañana a las 10:00")
- Si necesitas más información, pregunta
- No inventes tareas que el usuario no mencionó`;

/**
 * Genera una respuesta del asistente
 */
export async function chat(
  userMessage: string,
  context?: {
    tasks?: Array<{ title: string; dueDate: string | null; priority: number }>;
    currentDate?: string;
  }
): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    if (!openaiClient && !initializeClient()) {
      return { success: false, error: 'IA no configurada. Ve a Ajustes para agregar tu API Key.' };
    }
    
    const config = getAIConfig();
    if (!config.enabled) {
      return { success: false, error: 'IA deshabilitada. Actívala en Ajustes.' };
    }
    
    // Construir contexto
    let contextMessage = '';
    if (context?.currentDate) {
      contextMessage += `Fecha actual: ${context.currentDate}\n`;
    }
    if (context?.tasks && context.tasks.length > 0) {
      contextMessage += `\nTareas del usuario (${context.tasks.length}):\n`;
      context.tasks.slice(0, 20).forEach((task, i) => {
        contextMessage += `${i + 1}. "${task.title}" - ${task.dueDate || 'Sin fecha'} - Prioridad: ${task.priority}\n`;
      });
    }
    
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: SYSTEM_PROMPT },
    ];
    
    if (contextMessage) {
      messages.push({ role: 'system', content: `Contexto:\n${contextMessage}` });
    }
    
    messages.push({ role: 'user', content: userMessage });
    
    const completion = await openaiClient!.chat.completions.create({
      model: config.model,
      messages,
      max_tokens: 500,
      temperature: 0.7,
    });
    
    const response = completion.choices[0]?.message?.content;
    
    if (!response) {
      return { success: false, error: 'Sin respuesta del modelo' };
    }
    
    return { success: true, message: response };
  } catch (error: any) {
    logger.error('aiService', 'Chat error', error);
    return { success: false, error: error.message || 'Error al comunicar con IA' };
  }
}

/**
 * Sugiere un mejor horario para una tarea
 */
export async function suggestBestTime(
  taskTitle: string,
  existingTasks: Array<{ title: string; dueDate: string | null; priority: number }>
): Promise<{ success: boolean; suggestion?: string; error?: string }> {
  const prompt = `El usuario quiere programar: "${taskTitle}"

Basándote en sus tareas existentes, sugiere el mejor momento para esta tarea.
Considera:
- Evitar conflictos con tareas existentes
- Días menos cargados
- Horas razonables (9:00-20:00)

Responde con UNA sugerencia concreta de fecha y hora, y una breve explicación del por qué.`;

  return chat(prompt, { 
    tasks: existingTasks,
    currentDate: new Date().toLocaleDateString('es-ES', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  });
}

/**
 * Genera subtareas para una tarea compleja
 */
export async function generateSubtasks(
  taskTitle: string,
  taskNotes?: string
): Promise<{ success: boolean; subtasks?: string[]; error?: string }> {
  const prompt = `Desglosa esta tarea en subtareas concretas y accionables:

Tarea: "${taskTitle}"
${taskNotes ? `Notas: ${taskNotes}` : ''}

Genera entre 3 y 7 subtareas. Responde SOLO con una lista JSON de strings, sin explicación adicional.
Ejemplo: ["Subtarea 1", "Subtarea 2", "Subtarea 3"]`;

  const result = await chat(prompt, {
    currentDate: new Date().toLocaleDateString('es-ES')
  });
  
  if (!result.success || !result.message) {
    return { success: false, error: result.error };
  }
  
  try {
    // Intentar parsear JSON de la respuesta
    const jsonMatch = result.message.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const subtasks = JSON.parse(jsonMatch[0]);
      if (Array.isArray(subtasks)) {
        return { success: true, subtasks };
      }
    }
    return { success: false, error: 'Formato de respuesta inválido' };
  } catch {
    return { success: false, error: 'Error al parsear subtareas' };
  }
}

/**
 * Analiza y prioriza tareas
 */
export async function prioritizeTasks(
  tasks: Array<{ id: string; title: string; dueDate: string | null; priority: number }>
): Promise<{ success: boolean; analysis?: string; error?: string }> {
  const prompt = `Analiza estas tareas y dame un resumen de priorización:

${tasks.map((t, i) => `${i + 1}. "${t.title}" - ${t.dueDate || 'Sin fecha'}`).join('\n')}

Indica:
1. Cuáles son más urgentes
2. Cuáles podrían posponerse
3. Si hay algún patrón o conflicto

Sé breve y directo.`;

  return chat(prompt, {
    currentDate: new Date().toLocaleDateString('es-ES', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric'
    })
  });
}

// Inicializar al cargar el módulo
loadAIConfig();

// ═══════════════════════════════════════════════════════════════════════════
// ASISTENTE DE CREACIÓN DE TAREAS (Hybrid: básico + IA)
// ═══════════════════════════════════════════════════════════════════════════

export interface ParsedTaskInput {
  type: 'task' | 'call' | 'email' | 'video' | 'meeting' | 'trip';
  title: string;
  cleanTitle?: string;
  dueDate?: string;      // ISO string
  dueTime?: string;      // HH:MM
  endDate?: string;      // ISO string  
  endTime?: string;      // HH:MM
  location?: string;
  participants?: string[];
  priority?: number;
  subtasks?: string[];
  typeData?: {
    platform?: string;
    meetingUrl?: string;
    contactName?: string;
    subject?: string;
    recipient?: string;
    destination?: string;
    transportMode?: string;
  };
  confidence: 'high' | 'medium' | 'low';
}

/**
 * Detección BÁSICA sin IA (instantánea, gratis)
 * Usa regex y palabras clave para detectar tipo, fecha, hora, ubicación
 */
export function parseTaskBasic(input: string): ParsedTaskInput {
  const text = input.toLowerCase().trim();
  const originalInput = input.trim();
  
  let type: ParsedTaskInput['type'] = 'task';
  let cleanTitle = originalInput;
  let dueDate: string | undefined;
  let dueTime: string | undefined;
  let location: string | undefined;
  let priority = 0;
  let platform: string | undefined;
  let contactName: string | undefined;
  let destination: string | undefined;
  
  // ═══════════════════════════════════════════════════════════════════════
  // DETECTAR TIPO DE COMPROMISO
  // ═══════════════════════════════════════════════════════════════════════
  
  // Llamada
  if (/\b(llamar|llamada|call|telefonear|telefono)\b/i.test(text)) {
    type = 'call';
    cleanTitle = cleanTitle.replace(/\b(llamar a|llamada con|call with|llamar)\b/gi, '').trim();
    // Extraer nombre después de "a" o "con"
    const contactMatch = text.match(/(?:llamar a|llamada con|call)\s+([a-záéíóúñ]+(?:\s+[a-záéíóúñ]+)?)/i);
    if (contactMatch) contactName = contactMatch[1];
  }
  // Email
  else if (/\b(email|correo|mail|enviar mail|escribir a)\b/i.test(text)) {
    type = 'email';
    cleanTitle = cleanTitle.replace(/\b(email a|correo a|enviar mail a|escribir a|email|correo|mail)\b/gi, '').trim();
  }
  // Videoconferencia
  else if (/\b(video|videollamada|zoom|teams|meet|webinar|videoconferencia)\b/i.test(text)) {
    type = 'video';
    if (/zoom/i.test(text)) platform = 'zoom';
    else if (/teams/i.test(text)) platform = 'teams';
    else if (/meet/i.test(text)) platform = 'meet';
    cleanTitle = cleanTitle.replace(/\b(videollamada con|video con|zoom con|teams con|meet con|videollamada|videoconferencia)\b/gi, '').trim();
  }
  // Reunión presencial
  else if (/\b(reunión|reunion|meeting|quedada|cita|visita)\b/i.test(text)) {
    type = 'meeting';
    cleanTitle = cleanTitle.replace(/\b(reunión con|reunion con|meeting with|meeting|reunión|reunion)\b/gi, '').trim();
  }
  // Viaje
  else if (/\b(viaje|vuelo|viajar|trip|volar|tren a|avión a|ir a)\b/i.test(text)) {
    type = 'trip';
    // Extraer destino
    const destMatch = text.match(/(?:viaje a|vuelo a|viajar a|ir a|tren a|avión a)\s+([a-záéíóúñ]+)/i);
    if (destMatch) destination = destMatch[1];
    cleanTitle = cleanTitle.replace(/\b(viaje a|vuelo a|viajar a|trip to)\b/gi, '').trim();
  }
  
  // ═══════════════════════════════════════════════════════════════════════
  // DETECTAR FECHA
  // ═══════════════════════════════════════════════════════════════════════
  const today = new Date();
  
  // Hoy
  if (/\b(hoy)\b/i.test(text)) {
    dueDate = today.toISOString().split('T')[0];
    cleanTitle = cleanTitle.replace(/\b(hoy)\b/gi, '').trim();
  }
  // Mañana
  else if (/\b(mañana)\b/i.test(text)) {
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    dueDate = tomorrow.toISOString().split('T')[0];
    cleanTitle = cleanTitle.replace(/\b(mañana)\b/gi, '').trim();
  }
  // Pasado mañana
  else if (/\b(pasado mañana)\b/i.test(text)) {
    const dayAfter = new Date(today);
    dayAfter.setDate(dayAfter.getDate() + 2);
    dueDate = dayAfter.toISOString().split('T')[0];
    cleanTitle = cleanTitle.replace(/\b(pasado mañana)\b/gi, '').trim();
  }
  // Día de la semana (el lunes, el viernes)
  else {
    const daysMap: Record<string, number> = {
      'domingo': 0, 'lunes': 1, 'martes': 2, 'miércoles': 3, 'miercoles': 3,
      'jueves': 4, 'viernes': 5, 'sábado': 6, 'sabado': 6
    };
    const dayMatch = text.match(/\b(?:el\s+)?(lunes|martes|miércoles|miercoles|jueves|viernes|sábado|sabado|domingo)\b/i);
    if (dayMatch) {
      const targetDay = daysMap[dayMatch[1].toLowerCase()];
      const currentDay = today.getDay();
      let daysToAdd = targetDay - currentDay;
      if (daysToAdd <= 0) daysToAdd += 7; // Próxima semana
      
      const targetDate = new Date(today);
      targetDate.setDate(targetDate.getDate() + daysToAdd);
      dueDate = targetDate.toISOString().split('T')[0];
      cleanTitle = cleanTitle.replace(new RegExp(`\\b(?:el\\s+)?${dayMatch[1]}\\b`, 'gi'), '').trim();
    }
  }
  
  // Fecha específica (15 enero, 15/01, 15-01-2025)
  const datePatterns = [
    // "15 enero", "15 de enero"
    /(\d{1,2})\s*(?:de\s+)?(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)/i,
    // "15/01/2025" o "15-01-2025"
    /(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?/
  ];
  
  const monthsMap: Record<string, number> = {
    'enero': 0, 'febrero': 1, 'marzo': 2, 'abril': 3, 'mayo': 4, 'junio': 5,
    'julio': 6, 'agosto': 7, 'septiembre': 8, 'octubre': 9, 'noviembre': 10, 'diciembre': 11
  };
  
  if (!dueDate) {
    const monthMatch = text.match(datePatterns[0]);
    if (monthMatch) {
      const day = parseInt(monthMatch[1]);
      const month = monthsMap[monthMatch[2].toLowerCase()];
      let year = today.getFullYear();
      // Si el mes ya pasó, asumir próximo año
      if (month < today.getMonth() || (month === today.getMonth() && day < today.getDate())) {
        year++;
      }
      dueDate = new Date(year, month, day).toISOString().split('T')[0];
      cleanTitle = cleanTitle.replace(datePatterns[0], '').trim();
    }
    
    const numericMatch = text.match(datePatterns[1]);
    if (numericMatch && !dueDate) {
      const day = parseInt(numericMatch[1]);
      const month = parseInt(numericMatch[2]) - 1;
      const year = numericMatch[3] ? (numericMatch[3].length === 2 ? 2000 + parseInt(numericMatch[3]) : parseInt(numericMatch[3])) : today.getFullYear();
      dueDate = new Date(year, month, day).toISOString().split('T')[0];
      cleanTitle = cleanTitle.replace(datePatterns[1], '').trim();
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════
  // DETECTAR HORA
  // ═══════════════════════════════════════════════════════════════════════
  // "a las 10", "10:30", "10am", "14h", "a las 9 de la mañana"
  const timePatterns = [
    /a\s+las?\s+(\d{1,2})(?::(\d{2}))?(?:\s*(am|pm|h))?/i,
    /(\d{1,2}):(\d{2})(?:\s*(am|pm))?/,
    /(\d{1,2})\s*(am|pm|h)/i,
  ];
  
  for (const pattern of timePatterns) {
    const match = text.match(pattern);
    if (match) {
      let hours = parseInt(match[1]);
      const minutes = match[2] ? parseInt(match[2]) : 0;
      const meridiem = match[3]?.toLowerCase();
      
      if (meridiem === 'pm' && hours < 12) hours += 12;
      if (meridiem === 'am' && hours === 12) hours = 0;
      
      dueTime = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
      cleanTitle = cleanTitle.replace(pattern, '').trim();
      break;
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════
  // DETECTAR UBICACIÓN
  // ═══════════════════════════════════════════════════════════════════════
  const locationMatch = text.match(/\b(?:en)\s+([A-Za-záéíóúñÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-Za-záéíóúñÁÉÍÓÚÑ][a-záéíóúñ]+)*)/i);
  if (locationMatch && !['las', 'el', 'la', 'los', 'un', 'una'].includes(locationMatch[1].toLowerCase())) {
    location = locationMatch[1];
    // Solo limpiar si no es parte del título principal
    if (type === 'meeting' || type === 'trip') {
      cleanTitle = cleanTitle.replace(/\ben\s+[A-Za-záéíóúñ]+(?:\s+[A-Za-záéíóúñ]+)*/i, '').trim();
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════
  // DETECTAR PRIORIDAD
  // ═══════════════════════════════════════════════════════════════════════
  if (/\b(urgente|importante|crítico|critico|asap|ya|ahora)\b/i.test(text)) {
    priority = 3;
    cleanTitle = cleanTitle.replace(/\b(urgente|importante|crítico|critico|asap)\b/gi, '').trim();
  }
  
  // Limpiar título
  cleanTitle = cleanTitle
    .replace(/\s+/g, ' ')
    .replace(/^[,\s]+|[,\s]+$/g, '')
    .trim();
  
  // Si quedó muy corto, usar el original
  if (cleanTitle.length < 3) {
    cleanTitle = originalInput;
  }
  
  // Capitalizar primera letra
  cleanTitle = cleanTitle.charAt(0).toUpperCase() + cleanTitle.slice(1);
  
  const result: ParsedTaskInput = {
    type,
    title: originalInput,
    cleanTitle,
    confidence: dueDate || location || type !== 'task' ? 'medium' : 'low',
  };
  
  if (dueDate) result.dueDate = dueDate;
  if (dueTime) result.dueTime = dueTime;
  if (location) result.location = location;
  if (priority) result.priority = priority;
  
  // Type-specific data
  if (type === 'video' && platform) {
    result.typeData = { platform };
  }
  if (type === 'call' && contactName) {
    result.typeData = { contactName };
  }
  if (type === 'trip' && destination) {
    result.typeData = { destination };
    if (!location) result.location = destination;
  }
  
  return result;
}

/**
 * Análisis PROFUNDO con IA (usa OpenAI)
 * Extrae tipo, título limpio, fecha, hora, ubicación, participantes, subtareas
 */
export async function parseTaskWithAI(
  input: string,
  options?: { generateSubtasks?: boolean }
): Promise<{ success: boolean; parsed?: ParsedTaskInput; error?: string }> {
  try {
    if (!openaiClient && !initializeClient()) {
      return { success: false, error: 'IA no configurada. Ve a Ajustes para agregar tu API Key.' };
    }
    
    const config = getAIConfig();
    if (!config.enabled) {
      return { success: false, error: 'IA deshabilitada. Actívala en Ajustes.' };
    }
    
    const today = new Date();
    const todayStr = today.toLocaleDateString('es-ES', { 
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' 
    });
    
    const prompt = `Analiza este texto y extrae información para crear una tarea/evento.

TEXTO: "${input}"
FECHA ACTUAL: ${todayStr}

Responde SOLO con un JSON válido (sin explicación) con estos campos:
{
  "type": "task" | "call" | "email" | "video" | "meeting" | "trip",
  "cleanTitle": "título limpio y claro",
  "dueDate": "YYYY-MM-DD" o null,
  "dueTime": "HH:MM" o null,
  "endDate": "YYYY-MM-DD" o null (solo para eventos largos),
  "endTime": "HH:MM" o null,
  "location": "ubicación" o null,
  "participants": ["nombre1", "nombre2"] o [],
  "priority": 0-3 (0=ninguna, 3=urgente),
  ${options?.generateSubtasks ? '"subtasks": ["subtarea1", "subtarea2", ...] (3-7 subtareas accionables),' : ''}
  "typeData": {
    "platform": "zoom/meet/teams" (solo video),
    "contactName": "nombre" (solo llamada),
    "subject": "asunto" (solo email),
    "destination": "destino" (solo viaje)
  } o null
}

Reglas:
- type "meeting" = reunión presencial, "video" = videollamada
- Si detectas "mañana", calcula la fecha
- Si no hay hora clara, deja null
- El cleanTitle debe ser descriptivo pero conciso
- priority 3 si dice urgente/importante/asap${options?.generateSubtasks ? '\n- Las subtareas deben ser acciones concretas' : ''}`;

    const completion = await openaiClient!.chat.completions.create({
      model: config.model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 600,
      temperature: 0.3,
    });
    
    const response = completion.choices[0]?.message?.content;
    if (!response) {
      return { success: false, error: 'Sin respuesta del modelo' };
    }
    
    // Extraer JSON de la respuesta
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { success: false, error: 'Formato de respuesta inválido' };
    }
    
    const parsed = JSON.parse(jsonMatch[0]);
    
    const result: ParsedTaskInput = {
      type: parsed.type || 'task',
      title: input,
      cleanTitle: parsed.cleanTitle || input,
      confidence: 'high',
    };
    
    if (parsed.dueDate) result.dueDate = parsed.dueDate;
    if (parsed.dueTime) result.dueTime = parsed.dueTime;
    if (parsed.endDate) result.endDate = parsed.endDate;
    if (parsed.endTime) result.endTime = parsed.endTime;
    if (parsed.location) result.location = parsed.location;
    if (parsed.participants?.length) result.participants = parsed.participants;
    if (parsed.priority) result.priority = parsed.priority;
    if (parsed.subtasks?.length) result.subtasks = parsed.subtasks;
    if (parsed.typeData) result.typeData = parsed.typeData;
    
    return { success: true, parsed: result };
  } catch (error: any) {
    logger.error('aiService', 'parseTaskWithAI error', error);
    return { success: false, error: error.message || 'Error al analizar con IA' };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// DETECCIÓN DE TAREAS SIMILARES/DUPLICADAS
// ═══════════════════════════════════════════════════════════════════════════

export interface SimilarTask {
  id: string;
  title: string;
  dueDate: string | null;
  projectName: string | null;
  similarity: number; // 0-100
}

// ═══════════════════════════════════════════════════════════════════════
// BÚSQUEDA LOCAL DE TAREAS SIMILARES (INSTANTÁNEA)
// ═══════════════════════════════════════════════════════════════════════

// Stopwords en español para ignorar
const STOPWORDS = new Set([
  'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas',
  'de', 'del', 'al', 'a', 'en', 'con', 'por', 'para', 'sin',
  'sobre', 'entre', 'hacia', 'desde', 'durante', 'mediante',
  'y', 'o', 'ni', 'que', 'como', 'pero', 'si', 'no',
  'mi', 'tu', 'su', 'mis', 'tus', 'sus', 'este', 'esta', 'esto',
  'ese', 'esa', 'eso', 'aquel', 'aquella', 'aquello',
  'ser', 'estar', 'hacer', 'tener', 'ir', 'ver',
  'muy', 'más', 'menos', 'ya', 'aún', 'todavía',
]);

/**
 * Normaliza texto para comparación
 */
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Quitar acentos
    .replace(/[^\w\s]/g, ' ') // Quitar puntuación
    .trim();
}

/**
 * Tokeniza texto en palabras significativas
 */
function tokenize(text: string): string[] {
  const normalized = normalizeText(text);
  return normalized
    .split(/\s+/)
    .filter(word => word.length > 2 && !STOPWORDS.has(word));
}

/**
 * Calcula distancia de Levenshtein entre dos strings
 */
function levenshteinDistance(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Verifica si dos palabras son similares (fuzzy match)
 */
function wordsAreSimilar(word1: string, word2: string, threshold = 0.75): boolean {
  if (word1 === word2) return true;
  if (Math.abs(word1.length - word2.length) > 3) return false;
  
  const maxLen = Math.max(word1.length, word2.length);
  const distance = levenshteinDistance(word1, word2);
  const similarity = 1 - (distance / maxLen);
  
  return similarity >= threshold;
}

/**
 * Calcula similitud entre dos conjuntos de tokens con fuzzy matching
 */
function calculateSimilarity(tokens1: string[], tokens2: string[]): number {
  if (tokens1.length === 0 || tokens2.length === 0) return 0;

  let matches = 0;
  const usedIndices = new Set<number>();

  for (const t1 of tokens1) {
    for (let i = 0; i < tokens2.length; i++) {
      if (usedIndices.has(i)) continue;
      if (wordsAreSimilar(t1, tokens2[i])) {
        matches++;
        usedIndices.add(i);
        break;
      }
    }
  }

  // Similitud Jaccard modificada
  const union = tokens1.length + tokens2.length - matches;
  const jaccard = union > 0 ? matches / union : 0;
  
  // Bonus si hay más matches absolutos
  const matchRatio = matches / Math.min(tokens1.length, tokens2.length);
  
  // Combinar métricas (ponderado)
  const score = (jaccard * 0.4 + matchRatio * 0.6) * 100;
  
  return Math.round(score);
}

/**
 * Busca tareas similares LOCALMENTE (instantáneo, sin IA)
 */
export function findSimilarTasksLocal(
  newTitle: string,
  pendingTasks: Array<{ id: string; title: string; dueDate: string | null; projectName: string | null }>
): { success: boolean; similar: SimilarTask[] } {
  try {
    if (!newTitle || newTitle.length < 3) {
      return { success: true, similar: [] };
    }

    if (!pendingTasks || pendingTasks.length === 0) {
      return { success: true, similar: [] };
    }

    const newTokens = tokenize(newTitle);
    
    if (newTokens.length === 0) {
      return { success: true, similar: [] };
    }

    const results: SimilarTask[] = [];

    for (const task of pendingTasks) {
      const taskTokens = tokenize(task.title);
      if (taskTokens.length === 0) continue;

      const similarity = calculateSimilarity(newTokens, taskTokens);

      // Solo incluir si similitud >= 40%
      if (similarity >= 40) {
        results.push({
          id: task.id,
          title: task.title,
          dueDate: task.dueDate,
          projectName: task.projectName,
          similarity
        });
      }
    }

    // Ordenar por similitud descendente y limitar a 3
    const sorted = results
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 3);

    return { success: true, similar: sorted };
  } catch (error) {
    logger.error('aiService', 'findSimilarTasksLocal error', error);
    return { success: true, similar: [] };
  }
}

/**
 * Busca tareas similares usando IA para comparación semántica (LENTO - usar solo si necesario)
 */
export async function findSimilarTasks(
  newTitle: string,
  pendingTasks: Array<{ id: string; title: string; dueDate: string | null; projectName: string | null }>
): Promise<{ success: boolean; similar?: SimilarTask[]; error?: string }> {
  try {
    // Validaciones
    if (!newTitle || newTitle.length < 3) {
      return { success: true, similar: [] };
    }
    
    if (!pendingTasks || pendingTasks.length === 0) {
      return { success: true, similar: [] };
    }

    if (!openaiClient && !initializeClient()) {
      return { success: false, error: 'IA no configurada' };
    }
    
    const config = getAIConfig();
    if (!config.enabled) {
      return { success: false, error: 'IA deshabilitada' };
    }

    // Limitar a 50 tareas para no sobrecargar el prompt
    const tasksToCompare = pendingTasks.slice(0, 50);
    
    const prompt = `Analiza si el título de una nueva tarea es similar o duplicado de alguna tarea existente.

NUEVA TAREA: "${newTitle}"

TAREAS EXISTENTES:
${tasksToCompare.map((t, i) => `${i + 1}. [ID:${t.id}] "${t.title}"`).join('\n')}

Busca tareas que:
- Sean semánticamente similares (mismo concepto aunque con palabras diferentes)
- Puedan ser duplicados o variantes de la misma tarea
- Traten sobre el mismo tema/persona/proyecto

NO incluyas tareas que solo comparten una palabra común genérica (como "llamar", "hacer", "revisar").

Responde SOLO con un JSON array. Cada elemento debe tener:
- "id": el ID de la tarea similar
- "similarity": porcentaje de similitud (50-100, solo incluye si es >= 50)

Si no hay similares, responde: []

Ejemplo de respuesta: [{"id":"abc123","similarity":85},{"id":"def456","similarity":62}]`;

    const completion = await openaiClient!.chat.completions.create({
      model: config.model,
      messages: [
        { role: 'system', content: 'Eres un asistente que detecta tareas duplicadas. Responde SOLO con JSON válido, sin explicación.' },
        { role: 'user', content: prompt }
      ],
      max_tokens: 200,
      temperature: 0.3,
    });

    const response = completion.choices[0]?.message?.content?.trim();
    
    if (!response) {
      return { success: true, similar: [] };
    }

    // Parsear JSON
    try {
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        return { success: true, similar: [] };
      }
      
      const parsed = JSON.parse(jsonMatch[0]) as Array<{ id: string; similarity: number }>;
      
      if (!Array.isArray(parsed)) {
        return { success: true, similar: [] };
      }

      // Mapear con datos completos de las tareas
      const similar: SimilarTask[] = parsed
        .filter(p => p.id && p.similarity >= 50)
        .map(p => {
          const task = tasksToCompare.find(t => t.id === p.id);
          if (!task) return null;
          return {
            id: task.id,
            title: task.title,
            dueDate: task.dueDate,
            projectName: task.projectName,
            similarity: p.similarity
          };
        })
        .filter((t): t is SimilarTask => t !== null)
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, 3); // Máximo 3 resultados

      return { success: true, similar };
    } catch (parseError) {
      logger.warn('aiService', 'Failed to parse similar tasks response', response);
      return { success: true, similar: [] };
    }
  } catch (error: any) {
    logger.error('aiService', 'findSimilarTasks error', error);
    return { success: false, error: error.message || 'Error al buscar similares' };
  }
}
