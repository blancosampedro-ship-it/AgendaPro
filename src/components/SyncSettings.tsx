/**
 * SyncSettings - Componente de configuración de sincronización
 * Con autenticación por correo electrónico/contraseña
 */

'use client';

import { useState, useEffect } from 'react';

interface User {
  uid: string;
  email: string | null;
  displayName?: string | null;
  photoURL?: string | null;
}

interface ConnectionStatus {
  connected: boolean;
  lastChecked: Date | null;
}

interface BackupMetadata {
  id: string;
  timestamp: Date;
  deviceId: string;
  taskCount: number;
  projectCount: number;
  encrypted: boolean;
  location: 'local' | 'cloud';
}

export default function SyncSettings() {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({ connected: false, lastChecked: null });
  const [localBackups, setLocalBackups] = useState<BackupMetadata[]>([]);
  const [cloudBackups, setCloudBackups] = useState<BackupMetadata[]>([]);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [backupPassword, setBackupPassword] = useState('');
  const [showPasswordInput, setShowPasswordInput] = useState(false);
  const [firebaseConfigured, setFirebaseConfigured] = useState(false);
  
  // Auth form state
  const [authMode, setAuthMode] = useState<'login' | 'register' | 'reset'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');

  useEffect(() => {
    checkAuth();
    checkFirebaseConfig();
  }, []);

  const checkFirebaseConfig = async () => {
    try {
      const configured = await window.electronAPI.firebase.isConfigured();
      setFirebaseConfigured(configured);
    } catch (error) {
      console.error('Error checking Firebase config:', error);
    }
  };

  const checkAuth = async () => {
    try {
      const currentUser = await window.electronAPI.auth.getCurrentUser();
      setUser(currentUser as User | null);
      
      if (currentUser) {
        setConnectionStatus({ connected: true, lastChecked: new Date() });
        await loadBackups();
      } else {
        setConnectionStatus({ connected: false, lastChecked: new Date() });
      }
    } catch (error) {
      console.error('Error checking auth:', error);
      setConnectionStatus({ connected: false, lastChecked: new Date() });
    }
  };

  const loadBackups = async () => {
    try {
      const local = await window.electronAPI.backup.listLocal();
      setLocalBackups(local);
      
      if (user) {
        const cloud = await window.electronAPI.backup.listCloud();
        setCloudBackups(cloud);
      }
    } catch (error) {
      console.error('Error loading backups:', error);
    }
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setMessage({ type: 'error', text: 'Completa todos los campos' });
      return;
    }

    setLoading(true);
    setMessage(null);
    try {
      const result = await window.electronAPI.auth.signIn(email, password);
      if (result) {
        setUser(result);
        setMessage({ type: 'success', text: '¡Sesión iniciada!' });
        setEmail('');
        setPassword('');
        setConnectionStatus({ connected: true, lastChecked: new Date() });
        await loadBackups();
      }
    } catch (error: any) {
      console.error('Sign in error:', error);
      setMessage({ type: 'error', text: error.message || 'Error al iniciar sesión' });
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setMessage({ type: 'error', text: 'Completa todos los campos' });
      return;
    }

    setLoading(true);
    setMessage(null);
    try {
      const result = await window.electronAPI.auth.signUp(email, password, displayName || undefined);
      if (result) {
        setUser(result);
        setMessage({ type: 'success', text: '¡Cuenta creada exitosamente!' });
        setEmail('');
        setPassword('');
        setDisplayName('');
        setConnectionStatus({ connected: true, lastChecked: new Date() });
        await loadBackups();
      }
    } catch (error: any) {
      console.error('Sign up error:', error);
      setMessage({ type: 'error', text: error.message || 'Error al crear cuenta' });
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      setMessage({ type: 'error', text: 'Ingresa tu correo electrónico' });
      return;
    }

    setLoading(true);
    setMessage(null);
    try {
      await window.electronAPI.auth.resetPassword(email);
      setMessage({ type: 'success', text: 'Correo de recuperación enviado' });
      setAuthMode('login');
    } catch (error: any) {
      console.error('Reset password error:', error);
      setMessage({ type: 'error', text: error.message || 'Error al enviar correo' });
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    setLoading(true);
    try {
      await window.electronAPI.auth.signOut();
      setUser(null);
      setConnectionStatus({ connected: false, lastChecked: new Date() });
      setCloudBackups([]);
      setMessage({ type: 'success', text: 'Sesión cerrada' });
    } catch (error) {
      console.error('Sign out error:', error);
      setMessage({ type: 'error', text: 'Error al cerrar sesión' });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateLocalBackup = async () => {
    setLoading(true);
    try {
      const password = showPasswordInput ? backupPassword : undefined;
      await window.electronAPI.backup.createLocal(password);
      setMessage({ type: 'success', text: 'Backup local creado' });
      await loadBackups();
      setBackupPassword('');
      setShowPasswordInput(false);
    } catch (error: any) {
      console.error('Backup error:', error);
      setMessage({ type: 'error', text: error.message || 'Error al crear backup' });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCloudBackup = async () => {
    if (!user) {
      setMessage({ type: 'error', text: 'Inicia sesión para crear backups en la nube' });
      return;
    }
    setLoading(true);
    try {
      const password = showPasswordInput ? backupPassword : undefined;
      await window.electronAPI.backup.createCloud(password);
      setMessage({ type: 'success', text: 'Backup en la nube creado' });
      await loadBackups();
      setBackupPassword('');
      setShowPasswordInput(false);
    } catch (error: any) {
      console.error('Cloud backup error:', error);
      setMessage({ type: 'error', text: error.message || 'Error al crear backup' });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteBackup = async (backup: BackupMetadata) => {
    if (!confirm(`¿Eliminar backup del ${new Date(backup.timestamp).toLocaleString()}?`)) {
      return;
    }
    try {
      if (backup.location === 'local') {
        await window.electronAPI.backup.deleteLocal(backup.id);
      }
      setMessage({ type: 'success', text: 'Backup eliminado' });
      await loadBackups();
    } catch (error: any) {
      console.error('Delete backup error:', error);
      setMessage({ type: 'error', text: error.message || 'Error al eliminar backup' });
    }
  };

  const formatDate = (date: Date | string | null) => {
    if (!date) return 'Nunca';
    return new Date(date).toLocaleString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        title="Sincronización y backups"
      >
        <svg className="w-5 h-5 text-gray-600 dark:text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      </button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Sincronización y Backups
          </h2>
          <button
            onClick={() => setIsOpen(false)}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Message */}
          {message && (
            <div className={`p-3 rounded-lg text-sm ${
              message.type === 'success' 
                ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' 
                : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
            }`}>
              {message.text}
            </div>
          )}

          {/* Firebase Status */}
          {!firebaseConfigured && (
            <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
              <p className="text-sm text-yellow-800 dark:text-yellow-200">
                ⚠️ Firebase no está configurado. Crea un archivo <code className="bg-yellow-100 dark:bg-yellow-800 px-1 rounded">.env.local</code> con las credenciales de Firebase.
              </p>
            </div>
          )}

          {/* Auth Section */}
          <section>
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              Cuenta
            </h3>
            
            {user ? (
              <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white font-semibold">
                    {(user.displayName || user.email || '?')[0].toUpperCase()}
                  </div>
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">
                      {user.displayName || 'Usuario'}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {user.email}
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleSignOut}
                  disabled={loading}
                  className="px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                >
                  Cerrar sesión
                </button>
              </div>
            ) : firebaseConfigured ? (
              <div className="space-y-4">
                {/* Auth Mode Tabs */}
                <div className="flex gap-1 bg-gray-100 dark:bg-gray-700 p-1 rounded-lg">
                  <button
                    onClick={() => setAuthMode('login')}
                    className={`flex-1 py-1.5 text-sm rounded-md transition-colors ${
                      authMode === 'login' 
                        ? 'bg-white dark:bg-gray-600 shadow' 
                        : 'hover:bg-gray-200 dark:hover:bg-gray-600'
                    }`}
                  >
                    Iniciar sesión
                  </button>
                  <button
                    onClick={() => setAuthMode('register')}
                    className={`flex-1 py-1.5 text-sm rounded-md transition-colors ${
                      authMode === 'register' 
                        ? 'bg-white dark:bg-gray-600 shadow' 
                        : 'hover:bg-gray-200 dark:hover:bg-gray-600'
                    }`}
                  >
                    Crear cuenta
                  </button>
                </div>

                {/* Auth Form */}
                <form onSubmit={authMode === 'login' ? handleSignIn : authMode === 'register' ? handleSignUp : handleResetPassword}>
                  {authMode === 'register' && (
                    <input
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="Nombre (opcional)"
                      className="w-full mb-3 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                    />
                  )}
                  
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Correo electrónico"
                    required
                    className="w-full mb-3 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                  />
                  
                  {authMode !== 'reset' && (
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Contraseña"
                      required
                      minLength={6}
                      className="w-full mb-3 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                    />
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 text-sm font-medium"
                  >
                    {loading ? 'Procesando...' : 
                      authMode === 'login' ? 'Iniciar sesión' :
                      authMode === 'register' ? 'Crear cuenta' :
                      'Enviar correo de recuperación'}
                  </button>

                  {authMode === 'login' && (
                    <button
                      type="button"
                      onClick={() => setAuthMode('reset')}
                      className="w-full mt-2 text-sm text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      ¿Olvidaste tu contraseña?
                    </button>
                  )}

                  {authMode === 'reset' && (
                    <button
                      type="button"
                      onClick={() => setAuthMode('login')}
                      className="w-full mt-2 text-sm text-gray-600 dark:text-gray-400 hover:underline"
                    >
                      Volver a iniciar sesión
                    </button>
                  )}
                </form>
              </div>
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Configura Firebase para habilitar la sincronización.
              </p>
            )}
          </section>

          {/* Connection Status Section */}
          {user && (
            <section>
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                Estado de conexión
              </h3>
              
              <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                  <span className="text-sm text-green-700 dark:text-green-300">
                    Conectado a la nube
                  </span>
                </div>
                <p className="mt-1 text-xs text-green-600 dark:text-green-400">
                  Tus datos se guardan automáticamente en Firestore
                </p>
              </div>
            </section>
          )}

          {/* Backups Section */}
          <section>
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              Backups
            </h3>

            {/* Password toggle */}
            <div className="mb-3">
              <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showPasswordInput}
                  onChange={(e) => setShowPasswordInput(e.target.checked)}
                  className="rounded border-gray-300 dark:border-gray-600"
                />
                Cifrar backup con contraseña
              </label>
              
              {showPasswordInput && (
                <input
                  type="password"
                  value={backupPassword}
                  onChange={(e) => setBackupPassword(e.target.value)}
                  placeholder="Contraseña de cifrado"
                  className="mt-2 w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                />
              )}
            </div>

            <div className="flex gap-2 mb-4">
              <button
                onClick={handleCreateLocalBackup}
                disabled={loading}
                className="flex-1 px-3 py-2 text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors disabled:opacity-50"
              >
                💾 Backup local
              </button>
              <button
                onClick={handleCreateCloudBackup}
                disabled={loading || !user}
                className="flex-1 px-3 py-2 text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors disabled:opacity-50"
              >
                ☁️ Backup nube
              </button>
            </div>

            {/* Backup list */}
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {localBackups.length === 0 && cloudBackups.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
                  No hay backups disponibles
                </p>
              ) : (
                <>
                  {localBackups.map((backup) => (
                    <div
                      key={backup.id}
                      className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg text-sm"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span>💾</span>
                          <span className="text-gray-900 dark:text-white">
                            {formatDate(backup.timestamp)}
                          </span>
                          {backup.encrypted && (
                            <span className="text-xs text-amber-600">🔒</span>
                          )}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {backup.taskCount} tareas, {backup.projectCount} proyectos
                        </div>
                      </div>
                      <button
                        onClick={() => handleDeleteBackup(backup)}
                        className="p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  ))}
                  
                  {cloudBackups.map((backup) => (
                    <div
                      key={backup.id}
                      className="flex items-center justify-between p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-sm"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span>☁️</span>
                          <span className="text-gray-900 dark:text-white">
                            {formatDate(backup.timestamp)}
                          </span>
                          {backup.encrypted && (
                            <span className="text-xs text-amber-600">🔒</span>
                          )}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {backup.taskCount} tareas, {backup.projectCount} proyectos
                        </div>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
