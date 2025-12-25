/**
 * Firebase Configuration
 * Configuración de Firebase para AgendaPro
 */

import { initializeApp, FirebaseApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';
import { logger } from '../utils/logger';
import * as path from 'path';
import * as fs from 'fs';
import { app as electronApp } from 'electron';

// Cargar variables de entorno desde .env.local
function loadEnvFile(): Record<string, string> {
  const envVars: Record<string, string> = {};
  
  // Buscar .env.local en el directorio del proyecto
  const possiblePaths = [
    path.join(process.cwd(), '.env.local'),
    path.join(process.cwd(), '.env'),
    path.join(__dirname, '../../.env.local'),
    path.join(__dirname, '../../.env'),
    path.join(__dirname, '../../../.env.local'),
    path.join(__dirname, '../../../.env'),
  ];
  
  // En app empaquetada, buscar también en Resources
  if (electronApp.isPackaged) {
    const resourcesPath = process.resourcesPath;
    possiblePaths.unshift(
      path.join(resourcesPath, '.env.local'),
      path.join(resourcesPath, '.env'),
      path.join(resourcesPath, 'app', '.env.local'),
      path.join(resourcesPath, 'app', '.env')
    );
  }
  
  for (const envPath of possiblePaths) {
    if (fs.existsSync(envPath)) {
      logger.info(`Loading env from: ${envPath}`);
      const content = fs.readFileSync(envPath, 'utf8');
      const lines = content.split('\n');
      
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const [key, ...valueParts] = trimmed.split('=');
          if (key && valueParts.length > 0) {
            envVars[key.trim()] = valueParts.join('=').trim();
          }
        }
      }
      logger.info(`Loaded ${Object.keys(envVars).length} env vars`);
      break;
    }
  }
  
  if (Object.keys(envVars).length === 0) {
    logger.warn('No .env file found. Firebase sync will be disabled.');
  }
  
  return envVars;
}

// Cargar variables al inicio
const envVars = loadEnvFile();

// Configuración de Firebase
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY || envVars.FIREBASE_API_KEY || '',
  authDomain: process.env.FIREBASE_AUTH_DOMAIN || envVars.FIREBASE_AUTH_DOMAIN || '',
  projectId: process.env.FIREBASE_PROJECT_ID || envVars.FIREBASE_PROJECT_ID || '',
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET || envVars.FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || envVars.FIREBASE_MESSAGING_SENDER_ID || '',
  appId: process.env.FIREBASE_APP_ID || envVars.FIREBASE_APP_ID || '',
};

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;

/**
 * Verifica si Firebase está configurado
 */
export function isFirebaseConfigured(): boolean {
  const configured = !!(
    firebaseConfig.apiKey &&
    firebaseConfig.authDomain &&
    firebaseConfig.projectId
  );
  logger.debug(`Firebase configured: ${configured}, apiKey: ${firebaseConfig.apiKey ? 'set' : 'missing'}`);
  return configured;
}

/**
 * Inicializa Firebase
 */
export function initializeFirebase(): boolean {
  if (!isFirebaseConfigured()) {
    logger.warn('Firebase not configured - sync disabled');
    return false;
  }

  try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    
    logger.info('Firebase initialized successfully');
    return true;
  } catch (error) {
    logger.error('Firebase initialization failed:', error);
    return false;
  }
}

/**
 * Obtiene la instancia de Auth
 * Inicializa Firebase si no está inicializado
 */
export function getFirebaseAuth(): Auth | null {
  if (!auth && isFirebaseConfigured()) {
    initializeFirebase();
  }
  return auth;
}

/**
 * Obtiene la instancia de Firestore
 * Inicializa Firebase si no está inicializado
 */
export function getFirestoreDb(): Firestore | null {
  if (!db && isFirebaseConfigured()) {
    initializeFirebase();
  }
  return db;
}

/**
 * Obtiene la configuración actual (sin claves sensibles)
 */
export function getFirebaseStatus(): {
  configured: boolean;
  projectId: string | null;
} {
  return {
    configured: isFirebaseConfigured(),
    projectId: firebaseConfig.projectId || null,
  };
}
