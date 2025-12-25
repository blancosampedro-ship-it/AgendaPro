# AgendaPro

Tu secretaria virtual para macOS - Gestión de tareas con notificaciones fiables.

## 🚀 Quick Start

```bash
# Instalar dependencias
npm install

# Generar cliente Prisma
npx prisma generate

# Crear base de datos
npx prisma migrate dev

# Iniciar en desarrollo
npm run dev

# O iniciar por separado:
npm run dev:next    # Inicia Next.js en puerto 3456
npm run start       # Inicia Electron (requiere Next.js corriendo)
```

## 📋 Scripts Disponibles

| Script | Descripción |
|--------|-------------|
| `npm run dev` | Inicia Next.js + Electron concurrentemente |
| `npm run dev:next` | Solo Next.js (puerto 3456) |
| `npm run start` | Solo Electron (requiere Next.js) |
| `npm run build` | Build de producción (Next + Electron) |
| `npm run build:next` | Solo build Next.js |
| `npm run build:electron` | Solo compilar TypeScript de Electron |
| `npm run dist:mac` | Empaquetar para macOS |
| `npm run prisma:studio` | Abrir Prisma Studio (ver DB) |

## 🏗️ Estructura del Proyecto

```
AgendaPro/
├── electron/          # Main Process (Electron)
│   ├── main.ts        # Entry point
│   ├── preload.ts     # Bridge seguro IPC
│   ├── windows/       # Gestión de ventanas
│   ├── tray/          # Menubar/tray icon
│   ├── menu/          # Menú nativo macOS
│   ├── database/      # Conexión SQLite
│   ├── ipc/           # Handlers IPC
│   └── utils/         # Utilidades
│
├── src/               # Renderer (Next.js)
│   ├── app/           # App Router
│   ├── components/    # Componentes React
│   └── styles/        # CSS global
│
├── shared/            # Código compartido Main/Renderer
│   ├── constants/     # IPC channels
│   └── types/         # TypeScript types
│
├── prisma/            # Base de datos
│   └── schema.prisma  # Modelo de datos
│
└── resources/         # Assets nativos (iconos)
```

## ✅ Fase 1 - Checklist de Verificación

### Setup Básico
- [x] `npm install` completa sin errores
- [x] `npx prisma generate` genera el cliente
- [x] `npx prisma migrate dev` crea la DB
- [x] `npm run build:electron` compila sin errores
- [x] `npm run build:next` exporta estáticamente

### Electron + Next.js
- [ ] `npm run dev` abre la ventana con Next.js
- [ ] La UI muestra "Fase 1 - Setup Completo"
- [ ] Electron está "Conectado" (via IPC)
- [ ] Device ID se muestra correctamente

### Menubar / Tray
- [ ] Aparece icono en el system tray
- [ ] Click en tray abre la ventana
- [ ] Menú contextual: "Abrir AgendaPro", "Nueva Tarea", "Salir"

### Cerrar ≠ Salir
- [ ] Cerrar ventana (⌘W o X) la oculta
- [ ] La app sigue viva en el tray
- [ ] Click en tray la vuelve a mostrar
- [ ] "Salir" del menú tray cierra la app completamente

### Menú macOS
- [ ] Menú "AgendaPro" con Ajustes (⌘,)
- [ ] Menú "Archivo" con Nueva Tarea (⌘N)
- [ ] Menú "Ir" con Command Palette (⌘K)
- [ ] Menú "Vista" con DevTools

### Seguridad
- [ ] `contextIsolation: true` (verificar en preload)
- [ ] `nodeIntegration: false`
- [ ] Solo APIs específicas expuestas en `window.electronAPI`

### Logs
- [ ] Logs claros en consola al iniciar
- [ ] Se muestra Device ID
- [ ] Se muestra ruta de la DB

## 🔒 Arquitectura de Seguridad

```
┌─────────────────────┐     IPC (canales específicos)     ┌─────────────────────┐
│    Main Process     │◄──────────────────────────────────►│  Renderer (Next.js) │
│  (Node.js completo) │     preload.ts como bridge        │  (sandbox, aislado) │
└─────────────────────┘                                    └─────────────────────┘
         │
         ▼
    ┌─────────┐
    │ SQLite  │
    │ (local) │
    └─────────┘
```

## 📊 Modelo de Datos (Fase 1)

El schema incluye:
- **Project**: Contenedor de tareas
- **Task**: Unidad de trabajo
- **Reminder**: Fuente del scheduler (separado de Task)
- **NextNotification**: Cola explícita del motor de vencimientos
- **TaskEvent**: Historial/audit log
- **Settings**: Configuración de la app
- **Device**: Registro de dispositivos (anti-duplicados)

Ver [prisma/schema.prisma](prisma/schema.prisma) para detalles.

## 🛣️ Roadmap

### Fase 1 ✅
- Setup Electron + Next.js
- Menubar persistente
- Menú macOS con atajos
- Base de datos SQLite
- Preload seguro

### Fase 2 ✅
- CRUD de tareas completo
- Motor de vencimientos (scheduler)
- Notificaciones con acciones
- Snooze desde notificación

### Fase 3 ✅
- Búsqueda de tareas
- Gestión de proyectos (crear, editar, eliminar)
- Filtro por proyecto (sidebar)
- Selector de proyecto en tareas
- UI mejorada con sidebar lateral

### Fase 4 ✅
- Tareas recurrentes (diaria, semanal, mensual, días laborables)
- Subtareas con checklist y progreso
- Sistema de etiquetas (tags)
- Modal mejorado con scroll

### Fase 5 ✅
- **Firebase Auth**: Inicio de sesión con Google OAuth
- **Sincronización Firestore**: Push/pull bidireccional con resolución de conflictos
- **Backups cifrados**: AES-256 con PBKDF2, locales y en la nube
- **Anti-duplicados**: syncVersion por entidad, lock por dispositivo
- UI de sincronización con indicadores de estado

## 🔥 Configuración de Firebase (Fase 5)

Para habilitar la sincronización en la nube:

1. Crea un proyecto en [Firebase Console](https://console.firebase.google.com)
2. Habilita **Authentication** con proveedor Google
3. Crea una base de datos **Firestore**
4. Obtén la configuración del proyecto (⚙️ → Project settings → Your apps)
5. Crea un archivo `.env.local` en la raíz:

```env
FIREBASE_API_KEY=tu_api_key
FIREBASE_AUTH_DOMAIN=tu_proyecto.firebaseapp.com
FIREBASE_PROJECT_ID=tu_proyecto
FIREBASE_STORAGE_BUCKET=tu_proyecto.appspot.com
FIREBASE_MESSAGING_SENDER_ID=123456789
FIREBASE_APP_ID=1:123456789:web:abc123
```

### Reglas de Firestore

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

### Estructura de datos en Firestore

```
users/
  {userId}/
    tasks/
      {taskId}/
        title, notes, dueDate, syncVersion, deviceId...
    projects/
      {projectId}/
        name, color, syncVersion, deviceId...
    tags/
      {tagId}/
        name, color, deviceId...
    backups/
      {backupId}/
        timestamp, deviceId, data (JSON/encrypted)...
```

### Fase 6 (Próxima)
- Widgets para macOS
- Atajos de teclado globales
- Modo offline mejorado
- Exportar/importar JSON
- Themes personalizables

---

**AgendaPro** - Tu secretaria virtual 📋

