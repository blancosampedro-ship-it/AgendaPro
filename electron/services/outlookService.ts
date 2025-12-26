/**
 * Outlook Service
 * Captura emails seleccionados desde Microsoft Outlook via AppleScript
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { logger } from '../utils/logger';

const execAsync = promisify(exec);

export interface OutlookEmail {
  id: string;
  subject: string;
  sender: string;
  senderName: string;
  recipients: string[];
  recipientNames: string[];
  dateSent: string;
  dateReceived: string;
  isFromMe: boolean;  // true = enviado, false = recibido
  messageId: string;
  folder: string;
}

export interface CaptureResult {
  success: boolean;
  email?: OutlookEmail;
  error?: string;
}

/**
 * AppleScript para capturar el email seleccionado en Outlook
 */
const CAPTURE_EMAIL_SCRIPT = `
tell application "Microsoft Outlook"
    try
        set selectedMessages to selected objects
        if (count of selectedMessages) = 0 then
            return "ERROR:NO_SELECTION"
        end if
        
        set theMessage to item 1 of selectedMessages
        
        -- Obtener propiedades básicas
        set theId to id of theMessage
        set theSubject to subject of theMessage
        
        -- Fecha de envío y recepción
        set theDateSent to time sent of theMessage
        set theDateReceived to time received of theMessage
        
        -- Remitente
        set theSender to sender of theMessage
        set senderEmail to ""
        set senderName to ""
        try
            set senderEmail to address of theSender
            set senderName to name of theSender
        end try
        
        -- Destinatarios
        set recipientEmails to ""
        set recipientNames to ""
        try
            set toRecipients to to recipients of theMessage
            repeat with r in toRecipients
                set recipientEmails to recipientEmails & (email address of r) & "|"
                try
                    set recipientNames to recipientNames & (name of r) & "|"
                on error
                    set recipientNames to recipientNames & (email address of r) & "|"
                end try
            end repeat
        end try
        
        -- Carpeta actual
        set theFolder to ""
        try
            set theFolder to name of folder of theMessage
        end try
        
        -- Obtener mis cuentas para determinar si es enviado o recibido
        set myAccounts to ""
        try
            set allAccounts to every exchange account
            repeat with acc in allAccounts
                set myAccounts to myAccounts & (email address of acc) & "|"
            end repeat
        end try
        try
            set popAccounts to every pop account
            repeat with acc in popAccounts
                set myAccounts to myAccounts & (email address of acc) & "|"
            end repeat
        end try
        try
            set imapAccounts to every imap account
            repeat with acc in imapAccounts
                set myAccounts to myAccounts & (email address of acc) & "|"
            end repeat
        end try
        
        -- Construir resultado como JSON-like string (evitamos caracteres problemáticos)
        set resultStr to "ID:" & theId & ";;;"
        set resultStr to resultStr & "SUBJECT:" & theSubject & ";;;"
        set resultStr to resultStr & "SENDER:" & senderEmail & ";;;"
        set resultStr to resultStr & "SENDER_NAME:" & senderName & ";;;"
        set resultStr to resultStr & "RECIPIENTS:" & recipientEmails & ";;;"
        set resultStr to resultStr & "RECIPIENT_NAMES:" & recipientNames & ";;;"
        set resultStr to resultStr & "DATE_SENT:" & (theDateSent as string) & ";;;"
        set resultStr to resultStr & "DATE_RECEIVED:" & (theDateReceived as string) & ";;;"
        set resultStr to resultStr & "FOLDER:" & theFolder & ";;;"
        set resultStr to resultStr & "MY_ACCOUNTS:" & myAccounts
        
        return resultStr
        
    on error errMsg
        return "ERROR:" & errMsg
    end try
end tell
`;

/**
 * Parsea el resultado del AppleScript
 */
function parseAppleScriptResult(output: string): OutlookEmail | null {
  if (output.startsWith('ERROR:')) {
    return null;
  }
  
  const parts = output.split(';;;');
  const data: Record<string, string> = {};
  
  for (const part of parts) {
    const colonIndex = part.indexOf(':');
    if (colonIndex > 0) {
      const key = part.substring(0, colonIndex);
      const value = part.substring(colonIndex + 1);
      data[key] = value.trim();
    }
  }
  
  // Parsear arrays
  const recipients = (data['RECIPIENTS'] || '').split('|').filter(Boolean);
  const recipientNames = (data['RECIPIENT_NAMES'] || '').split('|').filter(Boolean);
  const myAccounts = (data['MY_ACCOUNTS'] || '').split('|').filter(Boolean).map(e => e.toLowerCase());
  
  // Determinar si es email enviado o recibido
  const senderEmail = data['SENDER'] || '';
  const isFromMe = myAccounts.some(acc => senderEmail.toLowerCase().includes(acc));
  
  return {
    id: data['ID'] || '',
    subject: data['SUBJECT'] || '(Sin asunto)',
    sender: senderEmail,
    senderName: data['SENDER_NAME'] || senderEmail,
    recipients,
    recipientNames,
    dateSent: data['DATE_SENT'] || '',
    dateReceived: data['DATE_RECEIVED'] || '',
    isFromMe,
    messageId: data['ID'] || '',
    folder: data['FOLDER'] || '',
  };
}

/**
 * Captura el email actualmente seleccionado en Outlook
 */
export async function captureSelectedEmail(): Promise<CaptureResult> {
  try {
    logger.info('Capturing selected email from Outlook...');
    
    // Ejecutar AppleScript
    const { stdout, stderr } = await execAsync(`osascript -e '${CAPTURE_EMAIL_SCRIPT.replace(/'/g, "'\"'\"'")}'`);
    
    if (stderr) {
      logger.warn('AppleScript stderr:', stderr);
    }
    
    const result = stdout.trim();
    
    // Verificar errores
    if (result.startsWith('ERROR:NO_SELECTION')) {
      return {
        success: false,
        error: 'No hay ningún email seleccionado en Outlook. Selecciona un email e inténtalo de nuevo.',
      };
    }
    
    if (result.startsWith('ERROR:')) {
      const errorMsg = result.substring(6);
      logger.error('AppleScript error:', errorMsg);
      return {
        success: false,
        error: `Error al acceder a Outlook: ${errorMsg}`,
      };
    }
    
    // Parsear resultado
    const email = parseAppleScriptResult(result);
    
    if (!email) {
      return {
        success: false,
        error: 'No se pudo obtener la información del email.',
      };
    }
    
    logger.info(`Captured email: ${email.subject} (${email.isFromMe ? 'sent' : 'received'})`);
    
    return {
      success: true,
      email,
    };
    
  } catch (error: any) {
    logger.error('Error capturing email from Outlook:', error);
    
    // Detectar errores comunes
    if (error.message?.includes('not allowed to send keystrokes') || 
        error.message?.includes('not allowed assistive access')) {
      return {
        success: false,
        error: 'AgendaPro necesita permisos para controlar Outlook. Ve a Preferencias del Sistema → Privacidad y Seguridad → Automatización y activa Outlook para AgendaPro.',
      };
    }
    
    if (error.message?.includes('Application isn\'t running')) {
      return {
        success: false,
        error: 'Microsoft Outlook no está abierto. Ábrelo y selecciona un email.',
      };
    }
    
    return {
      success: false,
      error: error.message || 'Error desconocido al capturar email.',
    };
  }
}

/**
 * Verifica si Outlook está disponible
 */
export async function isOutlookAvailable(): Promise<boolean> {
  try {
    const checkScript = `
      tell application "System Events"
        return (name of processes) contains "Microsoft Outlook"
      end tell
    `;
    const { stdout } = await execAsync(`osascript -e '${checkScript}'`);
    return stdout.trim() === 'true';
  } catch {
    return false;
  }
}

/**
 * Genera URL para abrir el email en Outlook
 * Usamos subject, sender y date como identificadores permanentes
 * ya que el message id de Outlook es volátil (cambia al reiniciar)
 */
export function getOutlookUrl(email: OutlookEmail): string {
  // Codificamos los parámetros de búsqueda permanentes
  const params = new URLSearchParams();
  params.set('subject', email.subject);
  params.set('sender', email.sender);
  params.set('date', email.dateSent);
  return `outlook://search?${params.toString()}`;
}
