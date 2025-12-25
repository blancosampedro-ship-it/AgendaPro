/**
 * Firebase Auth Service
 * Autenticación con correo electrónico/contraseña
 */

import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  User,
  sendPasswordResetEmail,
  updateProfile,
} from 'firebase/auth';
import { getFirebaseAuth, isFirebaseConfigured } from './config';
import { logger } from '../utils/logger';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { app } from 'electron';

// Clave para cifrar/descifrar (basada en el deviceId del sistema)
const ENCRYPTION_KEY = crypto.createHash('sha256')
  .update(app.getPath('userData'))
  .digest();
// Almacenamiento local de sesión
const SESSION_FILE = path.join(app.getPath('userData'), 'auth-session.json');

export interface AuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}

interface StoredSession {
  email: string;
  uid: string;
  displayName?: string;
  // Guardamos la contraseña cifrada para re-autenticar
  encryptedPassword?: string;
}

let currentUser: User | null = null;
let storedSessionUser: AuthUser | null = null; // Para restaurar sesión desde archivo

/**
 * Cifra una contraseña
 */
function encryptPassword(password: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(password, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

/**
 * Descifra una contraseña
 */
function decryptPassword(encryptedPassword: string): string | null {
  try {
    const [ivHex, encrypted] = encryptedPassword.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (error) {
    logger.error('Error al descifrar contraseña:', error);
    return null;
  }
}

/**
 * Convierte User de Firebase a AuthUser
 */
function toAuthUser(user: User): AuthUser {
  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    photoURL: user.photoURL,
  };
}

/**
 * Lee la sesión almacenada del archivo JSON
 */
function loadStoredSession(): StoredSession | null {
  try {
    if (fs.existsSync(SESSION_FILE)) {
      const data = fs.readFileSync(SESSION_FILE, 'utf8');
      return JSON.parse(data) as StoredSession;
    }
  } catch (error) {
    logger.error('Error al leer sesión almacenada:', error);
  }
  return null;
}

/**
 * Registrar nuevo usuario con email/contraseña
 */
export async function signUp(email: string, password: string, displayName?: string): Promise<AuthUser | null> {
  if (!isFirebaseConfigured()) {
    throw new Error('Firebase no está configurado');
  }

  const auth = getFirebaseAuth();
  if (!auth) {
    throw new Error('Firebase Auth no inicializado');
  }

  try {
    logger.info(`Creando nuevo usuario: ${email}`);
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    currentUser = userCredential.user;

    // Actualizar nombre de usuario si se proporciona
    if (displayName && currentUser) {
      await updateProfile(currentUser, { displayName });
    }

    // Guardar sesión localmente (con contraseña cifrada para re-auth)
    saveSession({
      email: currentUser.email || email,
      uid: currentUser.uid,
      displayName: displayName || currentUser.displayName || undefined,
      encryptedPassword: encryptPassword(password),
    });

    logger.info(`Usuario creado exitosamente: ${currentUser.uid}`);
    return toAuthUser(currentUser);
  } catch (error: any) {
    logger.error('Error al registrar:', error);
    throw translateFirebaseError(error);
  }
}

/**
 * Iniciar sesión con email/contraseña
 */
export async function signIn(email: string, password: string): Promise<AuthUser | null> {
  if (!isFirebaseConfigured()) {
    throw new Error('Firebase no está configurado');
  }

  const auth = getFirebaseAuth();
  if (!auth) {
    throw new Error('Firebase Auth no inicializado');
  }

  try {
    logger.info(`Iniciando sesión: ${email}`);
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    currentUser = userCredential.user;

    // Guardar sesión localmente (con contraseña cifrada para re-auth)
    saveSession({
      email: currentUser.email || email,
      uid: currentUser.uid,
      displayName: currentUser.displayName || undefined,
      encryptedPassword: encryptPassword(password),
    });

    logger.info(`Sesión iniciada: ${currentUser.uid}`);
    return toAuthUser(currentUser);
  } catch (error: any) {
    logger.error('Error al iniciar sesión:', error);
    throw translateFirebaseError(error);
  }
}

/**
 * Cerrar sesión
 */
export async function signOut(): Promise<void> {
  const auth = getFirebaseAuth();
  if (auth) {
    await firebaseSignOut(auth);
  }
  currentUser = null;
  clearSession();
  logger.info('Sesión cerrada');
}

/**
 * Enviar correo de recuperación de contraseña
 */
export async function resetPassword(email: string): Promise<void> {
  if (!isFirebaseConfigured()) {
    throw new Error('Firebase no está configurado');
  }

  const auth = getFirebaseAuth();
  if (!auth) {
    throw new Error('Firebase Auth no inicializado');
  }

  try {
    await sendPasswordResetEmail(auth, email);
    logger.info(`Correo de recuperación enviado a: ${email}`);
  } catch (error: any) {
    logger.error('Error al enviar correo de recuperación:', error);
    throw translateFirebaseError(error);
  }
}

/**
 * Obtiene el usuario actual
 */
export function getCurrentUser(): AuthUser | null {
  if (currentUser) {
    return toAuthUser(currentUser);
  }
  // Fallback a la sesión almacenada
  return storedSessionUser;
}

/**
 * Verifica si hay un usuario autenticado (Firebase o sesión almacenada)
 */
export function isAuthenticated(): boolean {
  // Considerar autenticado si tiene sesión real de Firebase O sesión almacenada
  return currentUser !== null || storedSessionUser !== null;
}

/**
 * Verifica si hay una sesión almacenada (puede que expire)
 */
export function hasStoredSession(): boolean {
  return storedSessionUser !== null;
}

/**
 * Obtiene el UID del usuario actual (para Firestore)
 */
export function getCurrentUserId(): string | null {
  if (currentUser) return currentUser.uid;
  if (storedSessionUser) return storedSessionUser.uid;
  return null;
}

/**
 * Restaura la sesión desde el almacenamiento local
 * Si hay credenciales guardadas, re-autentica con Firebase
 */
export async function restoreSession(): Promise<AuthUser | null> {
  // Primero intentar restaurar desde el archivo local
  const storedSession = loadStoredSession();
  
  if (!storedSession) {
    logger.info('No hay sesión almacenada');
    return null;
  }

  // Guardar info básica para mostrar en UI mientras re-autenticamos
  storedSessionUser = {
    uid: storedSession.uid,
    email: storedSession.email,
    displayName: storedSession.displayName || null,
    photoURL: null,
  };
  logger.info(`Sesión encontrada para: ${storedSession.email}`);

  if (!isFirebaseConfigured()) {
    logger.warn('Firebase no configurado, usando sesión almacenada (sin conexión a Firestore)');
    return storedSessionUser;
  }

  const auth = getFirebaseAuth();
  if (!auth) {
    logger.warn('Firebase Auth no disponible');
    return storedSessionUser;
  }

  // Primero verificar si Firebase ya tiene una sesión activa
  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      unsubscribe();
      
      if (user) {
        // Firebase ya tiene sesión activa
        currentUser = user;
        storedSessionUser = null;
        logger.info(`Sesión de Firebase activa: ${user.email}`);
        resolve(toAuthUser(user));
      } else if (storedSession.encryptedPassword) {
        // No hay sesión activa, intentar re-autenticar con credenciales guardadas
        logger.info('Re-autenticando con credenciales guardadas...');
        const password = decryptPassword(storedSession.encryptedPassword);
        
        if (password) {
          try {
            const userCredential = await signInWithEmailAndPassword(auth, storedSession.email, password);
            currentUser = userCredential.user;
            storedSessionUser = null;
            logger.info(`Re-autenticación exitosa: ${currentUser.email}`);
            resolve(toAuthUser(currentUser));
          } catch (error: any) {
            logger.error('Error en re-autenticación:', error.code || error.message);
            // Mantener la sesión almacenada para mostrar en UI pero sin acceso a Firestore
            resolve(storedSessionUser);
          }
        } else {
          logger.warn('No se pudo descifrar la contraseña');
          resolve(storedSessionUser);
        }
      } else {
        // No hay contraseña guardada (sesión antigua)
        logger.warn('Sesión sin credenciales guardadas, requiere re-login');
        resolve(storedSessionUser);
      }
    });
  });
}

/**
 * Listener para cambios de autenticación
 */
export function onAuthChange(callback: (user: AuthUser | null) => void): () => void {
  const auth = getFirebaseAuth();
  if (!auth) {
    return () => {};
  }

  return onAuthStateChanged(auth, (user) => {
    currentUser = user;
    callback(user ? toAuthUser(user) : null);
  });
}

/**
 * Guarda la sesión localmente
 */
function saveSession(session: StoredSession): void {
  try {
    fs.writeFileSync(SESSION_FILE, JSON.stringify(session), 'utf8');
  } catch (error) {
    logger.error('Error al guardar sesión:', error);
  }
}

/**
 * Elimina la sesión local
 */
function clearSession(): void {
  try {
    if (fs.existsSync(SESSION_FILE)) {
      fs.unlinkSync(SESSION_FILE);
    }
  } catch (error) {
    logger.error('Error al eliminar sesión:', error);
  }
}

/**
 * Traduce errores de Firebase a mensajes amigables en español
 */
function translateFirebaseError(error: any): Error {
  const code = error.code || '';
  const messages: Record<string, string> = {
    'auth/email-already-in-use': 'Este correo ya está registrado',
    'auth/invalid-email': 'Correo electrónico inválido',
    'auth/operation-not-allowed': 'Operación no permitida',
    'auth/weak-password': 'La contraseña debe tener al menos 6 caracteres',
    'auth/user-disabled': 'Esta cuenta ha sido deshabilitada',
    'auth/user-not-found': 'No existe una cuenta con este correo',
    'auth/wrong-password': 'Contraseña incorrecta',
    'auth/invalid-credential': 'Credenciales inválidas',
    'auth/too-many-requests': 'Demasiados intentos. Intenta más tarde',
    'auth/network-request-failed': 'Error de conexión. Verifica tu internet',
  };

  return new Error(messages[code] || error.message || 'Error de autenticación');
}
