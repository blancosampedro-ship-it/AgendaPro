/**
 * TaskModal Component
 * Modal para crear/editar tareas y compromisos de agenda
 */

'use client';

import { useState, useEffect } from 'react';
import { ConflictModal } from './ConflictModal';
import type { 
  CommitmentType, 
  CommitmentConfig, 
  CallData, 
  EmailData,
  VideoData,
  MeetingData,
  TripData,
  Location
} from '../types/electron.d';

// Configuración de tipos de compromiso (sincronizada con commitmentService)
const COMMITMENT_CONFIG: Record<CommitmentType, CommitmentConfig> = {
  task: {
    label: 'Tarea',
    icon: '📋',
    color: 'blue',
    hasEndDate: false,
    hasLocation: false,
    defaultDuration: 30,
    statuses: ['pending', 'in_progress', 'done'],
  },
  call: {
    label: 'Llamada',
    icon: '📞',
    color: 'green',
    hasEndDate: false,
    hasLocation: false,
    defaultDuration: 15,
    statuses: ['pending', 'in_progress', 'done'],
  },
  email: {
    label: 'Email',
    icon: '📧',
    color: 'purple',
    hasEndDate: false,
    hasLocation: false,
    defaultDuration: 10,
    statuses: ['pending', 'sent', 'waiting', 'done'],
  },
  video: {
    label: 'Videoconferencia',
    icon: '📹',
    color: 'indigo',
    hasEndDate: true,
    hasLocation: false,
    defaultDuration: 60,
    statuses: ['pending', 'in_progress', 'done'],
  },
  meeting: {
    label: 'Reunión presencial',
    icon: '🤝',
    color: 'orange',
    hasEndDate: true,
    hasLocation: true,
    defaultDuration: 60,
    statuses: ['pending', 'in_progress', 'done'],
  },
  trip: {
    label: 'Viaje de trabajo',
    icon: '✈️',
    color: 'red',
    hasEndDate: true,
    hasLocation: true,
    defaultDuration: 480, // 8 horas por defecto
    statuses: ['pending', 'in_progress', 'done'],
  },
};

interface ScheduleAnalysis {
  conflicts: {
    hasConflicts: boolean;
    conflicts: Array<{ id: string; title: string; dueDate: string; priority: number }>;
  };
  dayLoad: {
    date: string;
    taskCount: number;
    level: 'light' | 'moderate' | 'heavy';
    tasks: Array<{ id: string; title: string; dueDate: string; priority: number }>;
  };
  suggestions: Array<{ date: string; reason: string; dayLoad: 'light' | 'moderate' | 'heavy' }>;
  warning: string | null;
}

interface Subtask {
  id: string;
  title: string;
  done: boolean;
}

interface Task {
  id: string;
  title: string;
  notes: string | null;
  dueDate: string | null;
  completedAt: string | null;
  priority: number;
  isWaitingFor: boolean;
  waitingForNote: string | null;
  projectId: string | null;
  project: { id: string; name: string; color: string } | null;
  assignedToId: string | null;
  assignedTo: { id: string; name: string; email: string | null; color: string } | null;
  tags: string | null;
  isRecurring: boolean;
  recurrenceRule: string | null;
  subtasks: string | null;
  reminders: Array<{
    id: string;
    fireAt: string;
    snoozedUntil: string | null;
  }>;
  // Campos de Commitment (Fase 7)
  type?: CommitmentType;
  status?: string;
  typeData?: string | null;
  endDate?: string | null;
}

interface Project {
  id: string;
  name: string;
  color: string;
  icon: string | null;
  _count: { tasks: number };
}

interface Tag {
  id: string;
  name: string;
  color: string;
}

interface Contact {
  id: string;
  name: string;
  email: string | null;
  color: string;
}

interface Attachment {
  id: string;
  taskId: string;
  type: 'file' | 'url' | 'email';
  name: string;
  filePath?: string | null;
  mimeType?: string | null;
  size?: number | null;
  url?: string | null;
  metadata?: string | null;
  createdAt: string;
}

interface TaskModalProps {
  task: Task | null;
  projects: Project[];
  defaultProjectId?: string | null;
  onClose: () => void;
  onSave: () => void;
}

export function TaskModal({ task, projects, defaultProjectId, onClose, onSave }: TaskModalProps) {
  // Inicializar fecha y hora con valores actuales
  const getInitialDate = () => {
    if (task?.dueDate) {
      return new Date(task.dueDate).toISOString().split('T')[0];
    }
    return new Date().toISOString().split('T')[0];
  };
  
  const getInitialTime = () => {
    if (task?.dueDate) {
      return new Date(task.dueDate).toTimeString().slice(0, 5);
    }
    return new Date().toTimeString().slice(0, 5);
  };

  const [title, setTitle] = useState(task?.title || '');
  const [notes, setNotes] = useState(task?.notes || '');
  const [dueDate, setDueDate] = useState(getInitialDate);
  const [dueTime, setDueTime] = useState(getInitialTime);
  const [priority, setPriority] = useState(task?.priority || 0);
  const [projectId, setProjectId] = useState<string | null>(task?.projectId || defaultProjectId || null);
  const [isWaitingFor, setIsWaitingFor] = useState(task?.isWaitingFor || false);
  
  // ═══════════════════════════════════════════════════════════════════════
  // COMMITMENT TYPE STATE (Fase 7)
  // ═══════════════════════════════════════════════════════════════════════
  const [commitmentType, setCommitmentType] = useState<CommitmentType>(() => {
    return (task?.type as CommitmentType) || 'task';
  });
  const [commitmentStatus, setCommitmentStatus] = useState<string>(() => {
    return task?.status || 'pending';
  });
  
  // Call-specific data
  const [callData, setCallData] = useState<CallData>(() => {
    if (task?.typeData && task?.type === 'call') {
      try {
        return JSON.parse(task.typeData);
      } catch { return {}; }
    }
    return {};
  });
  
  // Email-specific data  
  const [emailData, setEmailData] = useState<EmailData>(() => {
    if (task?.typeData && task?.type === 'email') {
      try {
        return JSON.parse(task.typeData);
      } catch { return {}; }
    }
    return {};
  });
  
  // Video-specific data
  const [videoData, setVideoData] = useState<VideoData>(() => {
    if (task?.typeData && task?.type === 'video') {
      try {
        return JSON.parse(task.typeData);
      } catch { return {}; }
    }
    return {};
  });
  
  // Meeting-specific data
  const [meetingData, setMeetingData] = useState<MeetingData>(() => {
    if (task?.typeData && task?.type === 'meeting') {
      try {
        return JSON.parse(task.typeData);
      } catch { return {}; }
    }
    return {};
  });
  
  // Trip-specific data
  const [tripData, setTripData] = useState<TripData>(() => {
    if (task?.typeData && task?.type === 'trip') {
      try {
        return JSON.parse(task.typeData);
      } catch { return {}; }
    }
    return {};
  });
  
  // End date for events with duration (video, meeting, trip)
  const [endDate, setEndDate] = useState<string>(() => {
    if (task?.endDate) {
      return new Date(task.endDate).toISOString().split('T')[0];
    }
    return '';
  });
  const [endTime, setEndTime] = useState<string>(() => {
    if (task?.endDate) {
      return new Date(task.endDate).toTimeString().slice(0, 5);
    }
    return '';
  });
  
  // Locations
  const [locations, setLocations] = useState<Location[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);
  const [showNewLocation, setShowNewLocation] = useState(false);
  const [newLocationName, setNewLocationName] = useState('');
  const [newLocationAddress, setNewLocationAddress] = useState('');
  const [newLocationCity, setNewLocationCity] = useState('');
  
  // Sub-eventos para viajes
  const [subEvents, setSubEvents] = useState<Task[]>([]);
  const [showAddSubEvent, setShowAddSubEvent] = useState(false);
  const [newSubEventTitle, setNewSubEventTitle] = useState('');
  const [newSubEventType, setNewSubEventType] = useState<CommitmentType>('meeting');
  const [newSubEventDate, setNewSubEventDate] = useState('');
  const [newSubEventTime, setNewSubEventTime] = useState('09:00');
  // ═══════════════════════════════════════════════════════════════════════
  const [waitingForNote, setWaitingForNote] = useState(task?.waitingForNote || '');
  const [addReminder, setAddReminder] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // ═══════════════════════════════════════════════════════════════════════
  // RECORDATORIOS MÚLTIPLES (con antelación)
  // ═══════════════════════════════════════════════════════════════════════
  interface ReminderWithAdvance {
    advanceMinutes: number;
    advanceLabel: string;
  }
  const [selectedReminders, setSelectedReminders] = useState<ReminderWithAdvance[]>([]);
  const [reminderOptions, setReminderOptions] = useState<ReminderWithAdvance[]>([]);
  const [showReminderPicker, setShowReminderPicker] = useState(false);
  const [remindersLoaded, setRemindersLoaded] = useState(false);
  
  // Schedule analyzer state
  const [scheduleAnalysis, setScheduleAnalysis] = useState<ScheduleAnalysis | null>(null);
  const [showConflictModal, setShowConflictModal] = useState(false);
  const [pendingTaskData, setPendingTaskData] = useState<any>(null);
  
  // Fase 4: Recurrencia
  const [isRecurring, setIsRecurring] = useState(task?.isRecurring || false);
  const [recurrenceRule, setRecurrenceRule] = useState(task?.recurrenceRule || 'daily');
  
  // Fase 4: Subtareas
  const [subtasks, setSubtasks] = useState<Subtask[]>(() => {
    if (task?.subtasks) {
      try {
        return JSON.parse(task.subtasks);
      } catch {
        return [];
      }
    }
    return [];
  });
  const [newSubtask, setNewSubtask] = useState('');
  const [generatingSubtasks, setGeneratingSubtasks] = useState(false);
  const [aiAvailable, setAIAvailable] = useState(false);
  
  // Asignación a contacto
  const [assignedToId, setAssignedToId] = useState<string | null>(task?.assignedToId || null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  
  // ═══════════════════════════════════════════════════════════════════════
  // ASISTENTE IA para crear tareas
  // ═══════════════════════════════════════════════════════════════════════
  const [aiParsing, setAIParsing] = useState(false);
  const [aiSuggestion, setAISuggestion] = useState<{
    type?: CommitmentType;
    cleanTitle?: string;
    dueDate?: string;
    dueTime?: string;
    location?: string;
    priority?: number;
    subtasks?: string[];
    confidence?: 'high' | 'medium' | 'low';
  } | null>(null);
  const [showAISuggestion, setShowAISuggestion] = useState(false);
  
  // Adjuntos
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [newUrlName, setNewUrlName] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [showEmailInput, setShowEmailInput] = useState(false);
  const [newEmailUrl, setNewEmailUrl] = useState('');
  const [newEmailSubject, setNewEmailSubject] = useState('');
  const [previewAttachment, setPreviewAttachment] = useState<{ data: string; mimeType: string } | null>(null);
  const [previewName, setPreviewName] = useState('');
  const [uploadingFile, setUploadingFile] = useState(false);
  // Archivos pendientes para tareas nuevas (antes de guardar)
  const [pendingFiles, setPendingFiles] = useState<{ filePath: string; name: string; isEml?: boolean }[]>([]);
  const [pendingUrls, setPendingUrls] = useState<{ url: string; name?: string }[]>([]);
  const [pendingEmails, setPendingEmails] = useState<{ url: string; name?: string; metadata?: any }[]>([]);
  // Outlook emails pendientes
  const [pendingOutlookEmails, setPendingOutlookEmails] = useState<{
    id: string;
    subject: string;
    contact: string;
    contactName: string;
    isFromMe: boolean;
    dateSent: string;
    sender: string; // email del remitente para búsqueda permanente
  }[]>([]);
  const [capturingOutlook, setCapturingOutlook] = useState(false);
  
  // Fase 4: Etiquetas
  const [tags, setTags] = useState<string[]>(() => {
    if (task?.tags) {
      try {
        return JSON.parse(task.tags);
      } catch {
        return [];
      }
    }
    return [];
  });
  const [tagInput, setTagInput] = useState('');
  const [availableTags, setAvailableTags] = useState<Tag[]>([]);

  useEffect(() => {
    // Cargar etiquetas disponibles y contactos
    const loadData = async () => {
      try {
        const api = (window as any).electronAPI;
        if (api?.getAllTags) {
          const fetchedTags = await api.getAllTags();
          setAvailableTags(fetchedTags);
        }
        // Cargar contactos
        if (api?.contacts?.getAll) {
          const fetchedContacts = await api.contacts.getAll();
          setContacts(fetchedContacts);
        }
        // Cargar ubicaciones (para reuniones y viajes)
        if (api?.locations?.getAll) {
          const fetchedLocations = await api.locations.getAll();
          setLocations(fetchedLocations);
        }
        // Cargar adjuntos si es edición
        if (task?.id && api?.attachments?.getAll) {
          const fetchedAttachments = await api.attachments.getAll(task.id);
          setAttachments(fetchedAttachments);
        }
        // Cargar sub-eventos si es un viaje existente
        if (task?.id && task?.type === 'trip' && api?.commitment?.getTripSubEvents) {
          const fetchedSubEvents = await api.commitment.getTripSubEvents(task.id);
          setSubEvents(fetchedSubEvents || []);
        }
        // Verificar si IA está disponible
        if (api?.ai?.isAvailable) {
          const available = await api.ai.isAvailable();
          setAIAvailable(available);
        }
        // Cargar opciones de recordatorios
        if (api?.reminders?.getOptions) {
          const options = await api.reminders.getOptions();
          setReminderOptions(options);
        }
      } catch (error) {
        console.error('Error loading data:', error);
      }
    };
    loadData();
  }, [task?.id, task?.type]);

  // Cargar recordatorios existentes o establecer valores por defecto
  useEffect(() => {
    const loadReminders = async () => {
      if (remindersLoaded) return;
      
      const api = (window as any).electronAPI;
      if (!api?.reminders) return;
      
      try {
        // Si es edición, cargar los recordatorios existentes
        if (task?.id) {
          const existingReminders = await api.reminders.getForTask(task.id);
          if (existingReminders && existingReminders.length > 0) {
            setSelectedReminders(existingReminders.map((r: any) => ({
              advanceMinutes: r.advanceMinutes,
              advanceLabel: r.advanceLabel,
            })));
          }
        } 
        // Si es nueva tarea, cargar valores por defecto según el tipo
        else if (commitmentType && addReminder) {
          const defaults = await api.reminders.getDefaults(commitmentType);
          if (defaults && defaults.length > 0) {
            setSelectedReminders(defaults);
          }
        }
        setRemindersLoaded(true);
      } catch (error) {
        console.error('Error loading reminders:', error);
      }
    };
    
    loadReminders();
  }, [task?.id, commitmentType, remindersLoaded, addReminder]);

  // Actualizar recordatorios por defecto cuando cambia el tipo de compromiso (solo para nuevas tareas)
  useEffect(() => {
    const updateDefaultReminders = async () => {
      if (task?.id) return; // Solo para nuevas tareas
      if (!addReminder) {
        setSelectedReminders([]);
        return;
      }
      
      const api = (window as any).electronAPI;
      if (!api?.reminders?.getDefaults) return;
      
      try {
        const defaults = await api.reminders.getDefaults(commitmentType);
        if (defaults && defaults.length > 0) {
          setSelectedReminders(defaults);
        }
      } catch (error) {
        console.error('Error loading default reminders:', error);
      }
    };
    
    updateDefaultReminders();
  }, [commitmentType, task?.id, addReminder]);

  // ═══════════════════════════════════════════════════════════════════════
  // FUNCIONES DE ADJUNTOS
  // ═══════════════════════════════════════════════════════════════════════
  
  const loadAttachments = async () => {
    if (!task?.id) return;
    setUploadingFile(true);
    try {
      const api = (window as any).electronAPI;
      const fetched = await api.attachments.getAll(task.id);
      setAttachments(fetched || []);
    } catch (error) {
      console.error('Error loading attachments:', error);
      setAttachments([]);
    } finally {
      setUploadingFile(false);
    }
  };

  const handleFileDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingFile(false);
    
    const files = e.dataTransfer.files;
    if (files.length === 0) return;
    
    // Comprobar si es un enlace de email (drag desde Mail)
    const text = e.dataTransfer.getData('text/plain');
    if (text && (text.startsWith('message://') || text.startsWith('outlook://'))) {
      await handleAddEmail(text);
      return;
    }
    
    const api = (window as any).electronAPI;
    
    // Si es tarea existente, guardar directamente
    if (task?.id) {
      setUploadingFile(true);
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const filePath = (file as any).path;
        const fileName = file.name;
        
        try {
          // Si es un archivo .eml (email de Outlook), usar addEml
          if (fileName.toLowerCase().endsWith('.eml')) {
            await api.attachments.addEml({
              taskId: task.id,
              filePath: filePath,
              name: fileName.replace(/\.eml$/i, ''),
            });
          } else {
            await api.attachments.addFile({
              taskId: task.id,
              filePath: filePath,
              name: fileName.replace(/\.[^/.]+$/, ''),
            });
          }
        } catch (error: any) {
          alert(error.message || 'Error al añadir archivo');
        }
      }
      await loadAttachments();
    } else {
      // Tarea nueva: guardar en pendientes
      const newPending = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const fileName = file.name;
        const isEml = fileName.toLowerCase().endsWith('.eml');
        newPending.push({
          filePath: (file as any).path,
          name: fileName.replace(/\.[^/.]+$/, ''),
          isEml: isEml,
        });
      }
      setPendingFiles([...pendingFiles, ...newPending]);
    }
  };

  const handleSelectFile = async () => {
    const api = (window as any).electronAPI;
    const filePath = await api.attachments.selectFile();
    if (!filePath) return;
    
    // Si es tarea existente, guardar directamente
    if (task?.id) {
      setUploadingFile(true);
      try {
        await api.attachments.addFile({
          taskId: task.id,
          filePath,
        });
        await loadAttachments();
      } catch (error: any) {
        setUploadingFile(false);
        alert(error.message || 'Error al añadir archivo');
      }
    } else {
      // Tarea nueva: guardar en pendientes
      const fileName = filePath.split('/').pop()?.replace(/\.[^/.]+$/, '') || 'archivo';
      setPendingFiles([...pendingFiles, { filePath, name: fileName }]);
    }
  };

  const handleAddUrl = async () => {
    if (!newUrl.trim()) return;
    
    const api = (window as any).electronAPI;
    
    if (task?.id) {
      try {
        await api.attachments.addUrl({
          taskId: task.id,
          url: newUrl.trim(),
          name: newUrlName.trim() || undefined,
        });
        setNewUrl('');
        setNewUrlName('');
        setShowUrlInput(false);
        await loadAttachments();
      } catch (error: any) {
        alert(error.message || 'Error al añadir enlace');
      }
    } else {
      // Tarea nueva: guardar en pendientes
      setPendingUrls([...pendingUrls, { url: newUrl.trim(), name: newUrlName.trim() || undefined }]);
      setNewUrl('');
      setNewUrlName('');
      setShowUrlInput(false);
    }
  };

  const handleAddEmail = async (emailUrl?: string) => {
    const url = emailUrl || newEmailUrl.trim();
    if (!url) return;
    
    const api = (window as any).electronAPI;
    
    if (task?.id) {
      try {
        await api.attachments.addEmail({
          taskId: task.id,
          url,
          name: newEmailSubject.trim() || undefined,
          metadata: newEmailSubject ? { subject: newEmailSubject.trim() } : undefined,
        });
        setNewEmailUrl('');
        setNewEmailSubject('');
        setShowEmailInput(false);
        await loadAttachments();
      } catch (error: any) {
        alert(error.message || 'Error al añadir email');
      }
    } else {
      // Tarea nueva: guardar en pendientes
      setPendingEmails([...pendingEmails, { 
        url, 
        name: newEmailSubject.trim() || undefined,
        metadata: newEmailSubject ? { subject: newEmailSubject.trim() } : undefined 
      }]);
      setNewEmailUrl('');
      setNewEmailSubject('');
      setShowEmailInput(false);
    }
  };

  // Eliminar adjunto pendiente (tarea nueva)
  const removePendingFile = (index: number) => {
    setPendingFiles(pendingFiles.filter((_, i) => i !== index));
  };

  const removePendingUrl = (index: number) => {
    setPendingUrls(pendingUrls.filter((_, i) => i !== index));
  };

  const removePendingEmail = (index: number) => {
    setPendingEmails(pendingEmails.filter((_, i) => i !== index));
  };

  const removePendingOutlookEmail = (index: number) => {
    setPendingOutlookEmails(pendingOutlookEmails.filter((_, i) => i !== index));
  };

  // Capturar email desde Outlook
  const handleCaptureFromOutlook = async () => {
    const api = (window as any).electronAPI;
    if (!api?.outlook?.captureEmail) {
      alert('La integración con Outlook no está disponible');
      return;
    }

    setCapturingOutlook(true);
    try {
      const result = await api.outlook.captureEmail();
      
      if (!result.success) {
        alert(result.error || 'Error al capturar email de Outlook');
        return;
      }

      const email = result.email;
      // URL con identificadores permanentes (subject, sender, date) en lugar del ID volátil
      const params = new URLSearchParams();
      params.set('subject', email.subject);
      params.set('sender', email.sender);
      params.set('date', email.dateSent);
      const outlookUrl = `outlook://search?${params.toString()}`;
      
      // Si es tarea existente, guardar directamente
      if (task?.id) {
        try {
          await api.attachments.addEmail({
            taskId: task.id,
            url: outlookUrl,
            name: email.subject,
            metadata: {
              from: email.isFromMe ? undefined : email.sender,
              to: email.isFromMe ? email.recipients.join(', ') : undefined,
              subject: email.subject,
              date: email.dateSent,
              isFromMe: email.isFromMe,
              outlookId: email.id,
            },
          });
          await loadAttachments();
        } catch (error: any) {
          alert(error.message || 'Error al guardar email');
        }
      } else {
        // Tarea nueva: guardar en pendientes
        setPendingOutlookEmails([...pendingOutlookEmails, {
          id: email.id,
          subject: email.subject,
          contact: email.isFromMe ? (email.recipients[0] || '') : email.sender,
          contactName: email.isFromMe ? (email.recipientNames[0] || email.recipients[0] || '') : (email.senderName || email.sender),
          isFromMe: email.isFromMe,
          dateSent: email.dateSent,
          sender: email.sender, // guardamos el sender para búsqueda permanente
        }]);
      }
    } catch (error: any) {
      console.error('Error capturing from Outlook:', error);
      alert(error.message || 'Error al capturar email de Outlook');
    } finally {
      setCapturingOutlook(false);
    }
  };

  const handleDeleteAttachment = async (id: string) => {
    if (!confirm('¿Eliminar este adjunto?')) return;
    
    const api = (window as any).electronAPI;
    try {
      await api.attachments.delete(id);
      loadAttachments();
    } catch (error) {
      alert('Error al eliminar adjunto');
    }
  };

  const handleOpenAttachment = async (id: string) => {
    const api = (window as any).electronAPI;
    await api.attachments.open(id);
  };

  const handlePreviewAttachment = async (attachment: Attachment) => {
    if (attachment.type !== 'file') {
      handleOpenAttachment(attachment.id);
      return;
    }
    
    // Solo preview para imágenes y PDFs
    if (!attachment.mimeType?.startsWith('image/') && attachment.mimeType !== 'application/pdf') {
      handleOpenAttachment(attachment.id);
      return;
    }
    
    const api = (window as any).electronAPI;
    const content = await api.attachments.getContent(attachment.id);
    if (content) {
      setPreviewAttachment(content);
      setPreviewName(attachment.name);
    }
  };

  const formatFileSize = (bytes: number | null | undefined): string => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getAttachmentIcon = (attachment: Attachment): string => {
    if (attachment.type === 'url') return '🔗';
    if (attachment.type === 'email') {
      // Detectar si es email de Outlook con metadata
      const metadata = attachment.metadata as any;
      if (metadata?.outlookId) {
        return metadata?.isFromMe ? '📤' : '📥';
      }
      return '✉️';
    }
    if (attachment.mimeType?.startsWith('image/')) return '🖼️';
    if (attachment.mimeType === 'application/pdf') return '📕';
    if (attachment.mimeType?.includes('word')) return '📘';
    if (attachment.mimeType?.includes('excel') || attachment.mimeType?.includes('spreadsheet')) return '📗';
    if (attachment.mimeType?.includes('powerpoint') || attachment.mimeType?.includes('presentation')) return '📙';
    return '📄';
  };

  const getAttachmentSubtitle = (attachment: Attachment): string | null => {
    if (attachment.type === 'email') {
      const metadata = attachment.metadata as any;
      if (metadata?.outlookId) {
        if (metadata.isFromMe && metadata.to) {
          return `Enviado a: ${metadata.to}`;
        } else if (metadata.from) {
          return `De: ${metadata.from}`;
        }
      }
    }
    return null;
  };

  // Funciones para subtareas
  const addSubtask = () => {
    if (!newSubtask.trim()) return;
    setSubtasks([...subtasks, { id: Date.now().toString(), title: newSubtask.trim(), done: false }]);
    setNewSubtask('');
  };

  const removeSubtask = (id: string) => {
    setSubtasks(subtasks.filter(s => s.id !== id));
  };

  const toggleSubtaskDone = (id: string) => {
    setSubtasks(subtasks.map(s => s.id === id ? { ...s, done: !s.done } : s));
  };

  // Generar subtareas con IA
  const generateSubtasksWithAI = async () => {
    if (!title.trim()) return;
    
    setGeneratingSubtasks(true);
    try {
      const api = (window as any).electronAPI;
      const result = await api.ai.generateSubtasks(title.trim(), notes.trim() || undefined);
      
      if (result.success && result.subtasks) {
        const newSubtasks = result.subtasks.map((st: string) => ({
          id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
          title: st,
          done: false,
        }));
        setSubtasks([...subtasks, ...newSubtasks]);
      } else {
        console.error('Error generating subtasks:', result.error);
        alert(result.error || 'Error al generar subtareas');
      }
    } catch (error) {
      console.error('Error:', error);
      alert('Error al comunicar con IA');
    } finally {
      setGeneratingSubtasks(false);
    }
  };

  // Funciones para etiquetas
  const addTag = (tagName: string) => {
    const normalizedTag = tagName.toLowerCase().trim();
    if (normalizedTag && !tags.includes(normalizedTag)) {
      setTags([...tags, normalizedTag]);
    }
    setTagInput('');
  };

  const removeTag = (tagName: string) => {
    setTags(tags.filter(t => t !== tagName));
  };

  // Guarda la tarea (llamado después de verificar conflictos o si el usuario decide mantener)
  const saveTask = async (taskData: any) => {
    try {
      const api = (window as any).electronAPI;
      
      let savedTaskId: string | null = task?.id ?? null;
      
      if (task) {
        await api.updateTask(task.id, taskData);
      } else {
        // Crear tarea y obtener el ID
        const created = await api.createTask(taskData);
        savedTaskId = created?.id;
      }

      // Gestionar recordatorios múltiples
      if (savedTaskId && taskData.dueDate && api?.reminders?.updateForTask) {
        const advanceMinutesList = selectedReminders.map(r => r.advanceMinutes);
        await api.reminders.updateForTask(savedTaskId, taskData.dueDate, advanceMinutesList);
      }

      // Si hay adjuntos pendientes y es tarea nueva, guardarlos
      if (savedTaskId && !task && (pendingFiles.length > 0 || pendingUrls.length > 0 || pendingEmails.length > 0 || pendingOutlookEmails.length > 0)) {
        try {
          // Archivos (incluyendo .eml de Outlook)
          for (const pf of pendingFiles) {
            if ((pf as any).isEml) {
              await api.attachments.addEml({ taskId: savedTaskId, filePath: pf.filePath, name: pf.name });
            } else {
              await api.attachments.addFile({ taskId: savedTaskId, filePath: pf.filePath, name: pf.name });
            }
          }
          // URLs
          for (const pu of pendingUrls) {
            await api.attachments.addUrl({ taskId: savedTaskId, url: pu.url, name: pu.name });
          }
          // Emails (Mail)
          for (const pe of pendingEmails) {
            await api.attachments.addEmail({ taskId: savedTaskId, url: pe.url, name: pe.name, metadata: pe.metadata });
          }
          // Emails de Outlook
          for (const pe of pendingOutlookEmails) {
            // URL con identificadores permanentes (subject, sender, date)
            const params = new URLSearchParams();
            params.set('subject', pe.subject);
            params.set('sender', pe.sender);
            params.set('date', pe.dateSent);
            const outlookUrl = `outlook://search?${params.toString()}`;
            await api.attachments.addEmail({
              taskId: savedTaskId,
              url: outlookUrl,
              name: pe.subject,
              metadata: {
                from: pe.isFromMe ? undefined : pe.contact,
                to: pe.isFromMe ? pe.contact : undefined,
                subject: pe.subject,
                date: pe.dateSent,
                isFromMe: pe.isFromMe,
                outlookId: pe.id,
              },
            });
          }
        } catch (attachError) {
          console.error('Error saving attachments:', attachError);
          // No falla la tarea, solo muestra advertencia
        }
      }

      onSave();
    } catch (error) {
      console.error('Error saving task:', error);
      alert('Error al guardar la tarea');
    } finally {
      setSaving(false);
      setShowConflictModal(false);
      setPendingTaskData(null);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════
  // ASISTENTE IA - Funciones de detección y análisis
  // ═══════════════════════════════════════════════════════════════════════
  
  // Detección básica al escribir (sin IA, instantánea)
  const handleTitleChange = async (newTitle: string) => {
    setTitle(newTitle);
    
    // Detección básica disponible en creación y edición
    if (newTitle.length < 6) {
      setShowAISuggestion(false);
      return;
    }
    
    const api = (window as any).electronAPI;
    if (!api?.ai?.parseTaskBasic) return;
    
    try {
      const result = await api.ai.parseTaskBasic(newTitle);
      if (result.success && result.parsed) {
        const p = result.parsed;
        // Solo mostrar sugerencia si detectó algo útil
        if (p.type !== 'task' || p.dueDate || p.location || p.priority) {
          setAISuggestion({
            type: p.type,
            cleanTitle: p.cleanTitle,
            dueDate: p.dueDate,
            dueTime: p.dueTime,
            location: p.location,
            priority: p.priority,
            confidence: p.confidence,
          });
          setShowAISuggestion(true);
        } else {
          setShowAISuggestion(false);
        }
      }
    } catch (error) {
      console.error('Error in basic parse:', error);
    }
  };
  
  // Aplicar sugerencia básica
  const applyBasicSuggestion = () => {
    if (!aiSuggestion) return;
    
    if (aiSuggestion.type) setCommitmentType(aiSuggestion.type);
    if (aiSuggestion.cleanTitle) setTitle(aiSuggestion.cleanTitle);
    if (aiSuggestion.dueDate) setDueDate(aiSuggestion.dueDate);
    if (aiSuggestion.dueTime) setDueTime(aiSuggestion.dueTime);
    if (aiSuggestion.priority) setPriority(aiSuggestion.priority);
    
    setShowAISuggestion(false);
    setAISuggestion(null);
  };
  
  // Análisis profundo con IA (botón ✨)
  const handleAIDeepParse = async () => {
    if (!title.trim() || aiParsing) return;
    
    const api = (window as any).electronAPI;
    if (!api?.ai?.parseTaskDeep) {
      alert('IA no disponible. Configura tu API Key en Ajustes.');
      return;
    }
    
    setAIParsing(true);
    try {
      const result = await api.ai.parseTaskDeep(title, { generateSubtasks: true });
      
      if (result.success && result.parsed) {
        const p = result.parsed;
        
        // Aplicar todos los campos detectados
        if (p.type) setCommitmentType(p.type);
        if (p.cleanTitle) setTitle(p.cleanTitle);
        if (p.dueDate) setDueDate(p.dueDate);
        if (p.dueTime) setDueTime(p.dueTime);
        if (p.endDate) setEndDate(p.endDate);
        if (p.endTime) setEndTime(p.endTime);
        if (p.priority !== undefined) setPriority(p.priority);
        
        // Si detectó subtareas, añadirlas
        if (p.subtasks && p.subtasks.length > 0) {
          const newSubtasks = p.subtasks.map((title: string, i: number) => ({
            id: `ai-${Date.now()}-${i}`,
            title,
            done: false,
          }));
          setSubtasks(prev => [...prev, ...newSubtasks]);
        }
        
        // Si detectó ubicación y es tipo meeting/trip, buscar o crear ubicación
        if (p.location && (p.type === 'meeting' || p.type === 'trip')) {
          // Buscar ubicación existente o mostrar para crear
          const existingLoc = locations.find(l => 
            l.name.toLowerCase().includes(p.location!.toLowerCase()) ||
            l.city?.toLowerCase().includes(p.location!.toLowerCase())
          );
          if (existingLoc) {
            setSelectedLocationId(existingLoc.id);
          } else {
            setNewLocationName(p.location);
            setShowNewLocation(true);
          }
        }
        
        // Guardar typeData si aplica
        if (p.typeData) {
          if (p.type === 'video' && p.typeData.platform) {
            setVideoData(prev => ({ ...prev, platform: p.typeData!.platform as any }));
          }
          if (p.type === 'call' && p.typeData.contactName) {
            setCallData(prev => ({ ...prev, contactName: p.typeData!.contactName }));
          }
          if (p.type === 'trip' && p.typeData.destination) {
            setTripData(prev => ({ ...prev, destination: p.typeData!.destination }));
          }
        }
        
        setShowAISuggestion(false);
      } else {
        alert(result.error || 'No se pudo analizar el texto');
      }
    } catch (error: any) {
      console.error('Error in AI deep parse:', error);
      alert('Error al analizar con IA: ' + (error.message || 'Error desconocido'));
    } finally {
      setAIParsing(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setSaving(true);

    try {
      const api = (window as any).electronAPI;
      if (!api) {
        console.error('electronAPI not available');
        return;
      }

      const dueDateFull = dueDate 
        ? new Date(`${dueDate}T${dueTime}:00`).toISOString()
        : null;

      // Preparar typeData según el tipo de compromiso
      let typeData: any = null;
      if (commitmentType === 'call') {
        typeData = callData;
      } else if (commitmentType === 'email') {
        typeData = emailData;
      } else if (commitmentType === 'video') {
        typeData = videoData;
      } else if (commitmentType === 'meeting') {
        typeData = { ...meetingData, locationId: selectedLocationId };
      } else if (commitmentType === 'trip') {
        typeData = tripData;
      }

      // Preparar fecha de fin para tipos con duración
      let endDateFull: string | null = null;
      if (COMMITMENT_CONFIG[commitmentType].hasEndDate && endDate) {
        endDateFull = new Date(`${endDate}T${endTime || '23:59'}:00`).toISOString();
      }

      const taskData = {
        title: title.trim(),
        notes: commitmentType === 'email' ? (emailData.body || notes.trim() || null) : (notes.trim() || null),
        dueDate: dueDateFull,
        endDate: endDateFull,
        priority,
        projectId,
        isWaitingFor: commitmentType === 'email' && emailData.responseExpected ? true : isWaitingFor,
        waitingForNote: commitmentType === 'email' && emailData.responseExpected 
          ? 'Esperando respuesta de email' 
          : (isWaitingFor ? waitingForNote.trim() || null : null),
        addReminder: addReminder && !!dueDateFull,
        // Fase 4
        isRecurring: isRecurring && !!dueDateFull,
        recurrenceRule: isRecurring && dueDateFull ? recurrenceRule : null,
        tags: tags.length > 0 ? tags : null,
        subtasks: subtasks.length > 0 ? subtasks : null,
        // Asignación
        assignedToId: assignedToId || null,
        // Fase 7: Commitment types
        type: commitmentType,
        status: commitmentStatus,
        typeData: typeData ? JSON.stringify(typeData) : null,
        locationId: commitmentType === 'meeting' ? selectedLocationId : null,
      };

      // Si tiene fecha, verificar conflictos (pero no bloquear si falla)
      if (dueDateFull && api.schedule?.analyze) {
        try {
          const analysis = await api.schedule.analyze(dueDateFull, task?.id);
          
          // Si hay conflictos o día muy cargado, mostrar modal
          if (analysis && analysis.conflicts?.hasConflicts || analysis?.dayLoad?.level === 'heavy') {
            setScheduleAnalysis(analysis);
            setPendingTaskData(taskData);
            setShowConflictModal(true);
            setSaving(false);
            return;
          }
        } catch (scheduleError) {
          // Si falla el análisis, continuar guardando sin bloquear
          console.warn('Schedule analysis failed, saving anyway:', scheduleError);
        }
      }

      // Sin conflictos, guardar directamente
      await saveTask(taskData);
    } catch (error) {
      console.error('Error saving task:', error);
      alert('Error al guardar la tarea');
    } finally {
      setSaving(false);
    }
  };

  // Handlers para el modal de conflictos
  const handleConflictSelectDate = async (newDate: string) => {
    if (pendingTaskData) {
      setSaving(true);
      const updatedTaskData = { ...pendingTaskData, dueDate: newDate };
      // Actualizar el estado de fecha/hora para que se refleje
      const newDateObj = new Date(newDate);
      setDueDate(newDateObj.toISOString().split('T')[0]);
      setDueTime(newDateObj.toTimeString().slice(0, 5));
      await saveTask(updatedTaskData);
    }
  };

  const handleConflictKeepOriginal = async () => {
    if (pendingTaskData) {
      setSaving(true);
      await saveTask(pendingTaskData);
    }
  };

  const handleConflictCancel = () => {
    setShowConflictModal(false);
    setPendingTaskData(null);
    setScheduleAnalysis(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <>
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100]"
      onMouseDown={(e) => {
        // Solo cerrar si el click fue directamente en el overlay, no al soltar después de arrastrar
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      onKeyDown={handleKeyDown}
    >
      <div
        className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <span>{COMMITMENT_CONFIG[commitmentType].icon}</span>
            {task 
              ? `Editar ${COMMITMENT_CONFIG[commitmentType].label}` 
              : `Nuev${commitmentType === 'call' || commitmentType === 'task' ? 'a' : 'o'} ${COMMITMENT_CONFIG[commitmentType].label}`
            }
          </h2>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form - Scrollable */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Commitment Type Selector - Mostrar siempre para crear y editar */}
          <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Tipo de compromiso
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(['task', 'call', 'email'] as CommitmentType[]).map((type) => {
                  const config = COMMITMENT_CONFIG[type];
                  const isSelected = commitmentType === type;
                  const colorClasses: Record<string, string> = {
                    blue: isSelected 
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 ring-2 ring-blue-500' 
                      : 'border-gray-200 dark:border-gray-600 hover:border-blue-300 hover:bg-blue-50/50',
                    green: isSelected 
                      ? 'border-green-500 bg-green-50 dark:bg-green-900/30 ring-2 ring-green-500' 
                      : 'border-gray-200 dark:border-gray-600 hover:border-green-300 hover:bg-green-50/50',
                    purple: isSelected 
                      ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/30 ring-2 ring-purple-500' 
                      : 'border-gray-200 dark:border-gray-600 hover:border-purple-300 hover:bg-purple-50/50',
                  };
                  
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => {
                        setCommitmentType(type);
                        setCommitmentStatus('pending');
                      }}
                      className={`flex flex-col items-center p-3 rounded-lg border-2 transition-all ${colorClasses[config.color]}`}
                    >
                      <span className="text-2xl mb-1">{config.icon}</span>
                      <span className={`text-sm font-medium ${isSelected ? 'text-gray-900 dark:text-white' : 'text-gray-600 dark:text-gray-400'}`}>
                        {config.label}
                      </span>
                    </button>
                  );
                })}
              </div>
              {/* Tipos avanzados - con duración y ubicación */}
              <div className="mt-2 grid grid-cols-3 gap-2">
                {(['video', 'meeting', 'trip'] as CommitmentType[]).map((type) => {
                  const config = COMMITMENT_CONFIG[type];
                  const isSelected = commitmentType === type;
                  const colorClasses: Record<string, string> = {
                    indigo: isSelected 
                      ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 ring-2 ring-indigo-500' 
                      : 'border-gray-200 dark:border-gray-600 hover:border-indigo-300 hover:bg-indigo-50/50',
                    orange: isSelected 
                      ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/30 ring-2 ring-orange-500' 
                      : 'border-gray-200 dark:border-gray-600 hover:border-orange-300 hover:bg-orange-50/50',
                    red: isSelected 
                      ? 'border-red-500 bg-red-50 dark:bg-red-900/30 ring-2 ring-red-500' 
                      : 'border-gray-200 dark:border-gray-600 hover:border-red-300 hover:bg-red-50/50',
                  };
                  
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => {
                        setCommitmentType(type);
                        setCommitmentStatus('pending');
                        // Auto-establecer hora de fin por defecto
                        if (config.hasEndDate && !endDate) {
                          const start = new Date(`${dueDate}T${dueTime}:00`);
                          start.setMinutes(start.getMinutes() + config.defaultDuration);
                          setEndDate(start.toISOString().split('T')[0]);
                          setEndTime(start.toTimeString().slice(0, 5));
                        }
                      }}
                      className={`flex flex-col items-center p-2 rounded-lg border-2 transition-all ${colorClasses[config.color]}`}
                    >
                      <span className="text-xl mb-0.5">{config.icon}</span>
                      <span className={`text-xs font-medium ${isSelected ? 'text-gray-900 dark:text-white' : 'text-gray-600 dark:text-gray-400'}`}>
                        {config.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

          {/* Title with AI Assistant */}
          <div className="relative">
            <div className="flex gap-2">
              <input
                type="text"
                value={title}
                onChange={e => handleTitleChange(e.target.value)}
                placeholder={
                  !task 
                    ? 'Ej: "reunión en Barcelona mañana" o "hacer pagos de nóminas"' 
                    : commitmentType === 'call' ? '¿A quién vas a llamar?' :
                      commitmentType === 'email' ? 'Asunto del email...' :
                      commitmentType === 'video' ? 'Título de la videoconferencia...' :
                      commitmentType === 'meeting' ? 'Título de la reunión...' :
                      commitmentType === 'trip' ? 'Destino del viaje...' :
                      '¿Qué necesitas hacer?'
                }
                className="flex-1 px-4 py-3 text-lg border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                autoFocus
              />
              {/* Botón IA - Disponible en creación y edición */}
              {title.length > 3 && (
                <button
                  type="button"
                  onClick={handleAIDeepParse}
                  disabled={aiParsing}
                  className={`px-4 py-2 rounded-lg font-medium transition-all flex items-center gap-2 ${
                    aiParsing 
                      ? 'bg-gray-300 dark:bg-gray-600 cursor-wait' 
                      : 'bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 text-white shadow-lg hover:shadow-xl'
                  }`}
                  title="Analizar con IA para completar automáticamente los campos"
                >
                  {aiParsing ? (
                    <span className="animate-spin">⏳</span>
                  ) : (
                    <>✨<span className="hidden sm:inline">IA</span></>
                  )}
                </button>
              )}
            </div>
            
            {/* Sugerencia de detección básica (sin IA) */}
            {showAISuggestion && aiSuggestion && (
              <div className="absolute top-full left-0 right-0 mt-1 p-3 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/30 dark:to-purple-900/30 border border-blue-200 dark:border-blue-700 rounded-lg shadow-lg z-10">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-blue-500">💡</span>
                    <span className="text-gray-700 dark:text-gray-300">
                      Detectado: 
                      {aiSuggestion.type && aiSuggestion.type !== 'task' && (
                        <span className="ml-1 font-medium">{COMMITMENT_CONFIG[aiSuggestion.type].icon} {COMMITMENT_CONFIG[aiSuggestion.type].label}</span>
                      )}
                      {aiSuggestion.dueDate && (
                        <span className="ml-2 text-gray-500">📅 {new Date(aiSuggestion.dueDate).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                      )}
                      {aiSuggestion.dueTime && (
                        <span className="ml-1 text-gray-500">🕐 {aiSuggestion.dueTime}</span>
                      )}
                      {aiSuggestion.location && (
                        <span className="ml-2 text-gray-500">📍 {aiSuggestion.location}</span>
                      )}
                      {aiSuggestion.priority === 3 && (
                        <span className="ml-2 text-red-500">🔴 Urgente</span>
                      )}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={applyBasicSuggestion}
                      className="px-3 py-1 text-xs bg-blue-500 text-white rounded-full hover:bg-blue-600"
                    >
                      Aplicar
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowAISuggestion(false)}
                      className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ═══════════════════════════════════════════════════════════════════════ */}
          {/* CALL-SPECIFIC FIELDS */}
          {/* ═══════════════════════════════════════════════════════════════════════ */}
          {commitmentType === 'call' && (
            <div className="border border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-900/10 rounded-lg p-3 space-y-3">
              <div className="flex items-center gap-2 text-green-700 dark:text-green-400 text-sm font-medium">
                <span>📞</span>
                <span>Detalles de la llamada</span>
              </div>
              
              {/* Teléfono */}
              <div>
                <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                  Teléfono
                </label>
                <input
                  type="tel"
                  value={callData.phoneNumber || ''}
                  onChange={e => setCallData({ ...callData, phoneNumber: e.target.value })}
                  placeholder="+34 612 345 678"
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
              
              {/* Motivo */}
              <div>
                <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                  Motivo de la llamada
                </label>
                <input
                  type="text"
                  value={callData.reason || ''}
                  onChange={e => setCallData({ ...callData, reason: e.target.value })}
                  placeholder="Seguimiento propuesta, consulta técnica..."
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>

              {/* Seleccionar contacto existente */}
              {contacts.length > 0 && (
                <div>
                  <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                    O seleccionar contacto
                  </label>
                  <select
                    value={callData.contactName || ''}
                    onChange={e => {
                      const contact = contacts.find(c => c.name === e.target.value);
                      setCallData({ 
                        ...callData, 
                        contactName: contact?.name || '',
                      });
                      if (contact && !assignedToId) {
                        setAssignedToId(contact.id);
                      }
                    }}
                    className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  >
                    <option value="">Seleccionar...</option>
                    {contacts.map(c => (
                      <option key={c.id} value={c.name}>{c.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════════════════ */}
          {/* EMAIL-SPECIFIC FIELDS */}
          {/* ═══════════════════════════════════════════════════════════════════════ */}
          {commitmentType === 'email' && (
            <div className="border border-purple-200 dark:border-purple-800 bg-purple-50/50 dark:bg-purple-900/10 rounded-lg p-3 space-y-3">
              <div className="flex items-center gap-2 text-purple-700 dark:text-purple-400 text-sm font-medium">
                <span>📧</span>
                <span>Detalles del email</span>
              </div>
              
              {/* Destinatarios */}
              <div>
                <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                  Para (destinatarios)
                </label>
                <input
                  type="text"
                  value={emailData.recipients?.join(', ') || ''}
                  onChange={e => setEmailData({ 
                    ...emailData, 
                    recipients: e.target.value.split(',').map(s => s.trim()).filter(Boolean)
                  })}
                  placeholder="email@ejemplo.com, otro@ejemplo.com"
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>

              {/* Cuerpo del mensaje (opcional) */}
              <div>
                <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                  Borrador del mensaje (opcional)
                </label>
                <textarea
                  value={emailData.body || ''}
                  onChange={e => setEmailData({ ...emailData, body: e.target.value })}
                  placeholder="Puntos clave a mencionar..."
                  rows={2}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-none"
                />
              </div>

              {/* Esperar respuesta */}
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={emailData.responseExpected || false}
                    onChange={e => setEmailData({ ...emailData, responseExpected: e.target.checked })}
                    className="w-4 h-4 text-purple-500 rounded border-gray-300 focus:ring-purple-500"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">
                    Esperar respuesta
                  </span>
                </label>
                
                {emailData.responseExpected && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">Límite:</span>
                    <input
                      type="date"
                      value={emailData.responseDeadline?.split('T')[0] || ''}
                      onChange={e => setEmailData({ 
                        ...emailData, 
                        responseDeadline: e.target.value ? new Date(e.target.value).toISOString() : undefined 
                      })}
                      className="px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════════════════ */}
          {/* VIDEO-SPECIFIC FIELDS */}
          {/* ═══════════════════════════════════════════════════════════════════════ */}
          {commitmentType === 'video' && (
            <div className="border border-indigo-200 dark:border-indigo-800 bg-indigo-50/50 dark:bg-indigo-900/10 rounded-lg p-3 space-y-3">
              <div className="flex items-center gap-2 text-indigo-700 dark:text-indigo-400 text-sm font-medium">
                <span>📹</span>
                <span>Detalles de la videoconferencia</span>
              </div>
              
              {/* URL de la reunión */}
              <div>
                <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                  Enlace de la reunión
                </label>
                <input
                  type="url"
                  value={videoData.meetingUrl || ''}
                  onChange={e => {
                    const url = e.target.value;
                    let platform: 'zoom' | 'meet' | 'teams' | 'other' = 'other';
                    if (url.includes('zoom.us')) platform = 'zoom';
                    else if (url.includes('meet.google')) platform = 'meet';
                    else if (url.includes('teams.microsoft')) platform = 'teams';
                    setVideoData({ ...videoData, meetingUrl: url, platform });
                  }}
                  placeholder="https://zoom.us/j/... o https://meet.google.com/..."
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
                {videoData.platform && videoData.platform !== 'other' && (
                  <p className="mt-1 text-xs text-indigo-600 dark:text-indigo-400">
                    {videoData.platform === 'zoom' && '🟦 Zoom detectado'}
                    {videoData.platform === 'meet' && '🟩 Google Meet detectado'}
                    {videoData.platform === 'teams' && '🟪 Microsoft Teams detectado'}
                  </p>
                )}
              </div>

              {/* ID y Contraseña (para Zoom) */}
              {videoData.platform === 'zoom' && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                      ID de reunión
                    </label>
                    <input
                      type="text"
                      value={videoData.meetingId || ''}
                      onChange={e => setVideoData({ ...videoData, meetingId: e.target.value })}
                      placeholder="123 456 7890"
                      className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                      Contraseña
                    </label>
                    <input
                      type="text"
                      value={videoData.password || ''}
                      onChange={e => setVideoData({ ...videoData, password: e.target.value })}
                      placeholder="abc123"
                      className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>
                </div>
              )}

              {/* Participantes */}
              <div>
                <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                  Participantes (separados por coma)
                </label>
                <input
                  type="text"
                  value={videoData.participants?.join(', ') || ''}
                  onChange={e => setVideoData({ 
                    ...videoData, 
                    participants: e.target.value.split(',').map(s => s.trim()).filter(Boolean)
                  })}
                  placeholder="Juan, María, Carlos..."
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>

              {/* Agenda */}
              <div>
                <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                  Agenda de la reunión
                </label>
                <textarea
                  value={videoData.agenda || ''}
                  onChange={e => setVideoData({ ...videoData, agenda: e.target.value })}
                  placeholder="1. Revisión de avances&#10;2. Próximos pasos&#10;3. Preguntas"
                  rows={2}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-none"
                />
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════════════════ */}
          {/* MEETING-SPECIFIC FIELDS */}
          {/* ═══════════════════════════════════════════════════════════════════════ */}
          {commitmentType === 'meeting' && (
            <div className="border border-orange-200 dark:border-orange-800 bg-orange-50/50 dark:bg-orange-900/10 rounded-lg p-3 space-y-3">
              <div className="flex items-center gap-2 text-orange-700 dark:text-orange-400 text-sm font-medium">
                <span>🤝</span>
                <span>Detalles de la reunión presencial</span>
              </div>
              
              {/* Tipo de reunión */}
              <div>
                <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                  Tipo de reunión
                </label>
                <select
                  value={meetingData.meetingType || ''}
                  onChange={e => setMeetingData({ ...meetingData, meetingType: e.target.value as MeetingData['meetingType'] })}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="">Seleccionar...</option>
                  <option value="one_on_one">👥 One-on-one</option>
                  <option value="team">👨‍👩‍👧‍👦 Equipo</option>
                  <option value="client">🤝 Con cliente</option>
                  <option value="external">🏢 Externa</option>
                </select>
              </div>

              {/* Ubicación */}
              <div>
                <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                  Ubicación
                </label>
                {!showNewLocation ? (
                  <div className="flex gap-2">
                    <select
                      value={selectedLocationId || ''}
                      onChange={e => setSelectedLocationId(e.target.value || null)}
                      className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    >
                      <option value="">Seleccionar ubicación...</option>
                      {locations.map(loc => (
                        <option key={loc.id} value={loc.id}>
                          {loc.name} {loc.city ? `(${loc.city})` : ''}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => setShowNewLocation(true)}
                      className="px-3 py-2 text-sm bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 rounded-lg hover:bg-orange-200 dark:hover:bg-orange-800/40"
                    >
                      + Nueva
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2 p-2 bg-orange-100/50 dark:bg-orange-900/20 rounded-lg">
                    <input
                      type="text"
                      value={newLocationName}
                      onChange={e => setNewLocationName(e.target.value)}
                      placeholder="Nombre (ej: Oficina cliente X)"
                      className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                    <input
                      type="text"
                      value={newLocationAddress}
                      onChange={e => setNewLocationAddress(e.target.value)}
                      placeholder="Dirección"
                      className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                    <input
                      type="text"
                      value={newLocationCity}
                      onChange={e => setNewLocationCity(e.target.value)}
                      placeholder="Ciudad"
                      className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={async () => {
                          if (!newLocationName.trim()) return;
                          try {
                            const api = (window as any).electronAPI;
                            const newLoc = await api.locations.create({
                              name: newLocationName.trim(),
                              address: newLocationAddress.trim() || undefined,
                              city: newLocationCity.trim() || undefined,
                            });
                            setLocations([...locations, newLoc]);
                            setSelectedLocationId(newLoc.id);
                            setShowNewLocation(false);
                            setNewLocationName('');
                            setNewLocationAddress('');
                            setNewLocationCity('');
                          } catch (error) {
                            console.error('Error creating location:', error);
                          }
                        }}
                        disabled={!newLocationName.trim()}
                        className="flex-1 px-3 py-2 text-sm bg-orange-500 text-white rounded hover:bg-orange-600 disabled:opacity-50"
                      >
                        Guardar ubicación
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowNewLocation(false);
                          setNewLocationName('');
                          setNewLocationAddress('');
                          setNewLocationCity('');
                        }}
                        className="px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Tiempo de viaje */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                    🚗 Tiempo de ida (min)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={meetingData.travelTimeMinutes || ''}
                    onChange={e => setMeetingData({ ...meetingData, travelTimeMinutes: parseInt(e.target.value) || undefined })}
                    placeholder="30"
                    className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                    🏠 Tiempo de vuelta (min)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={meetingData.returnTimeMinutes || ''}
                    onChange={e => setMeetingData({ ...meetingData, returnTimeMinutes: parseInt(e.target.value) || undefined })}
                    placeholder="30"
                    className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>
              </div>

              {/* Participantes */}
              <div>
                <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                  Participantes
                </label>
                <input
                  type="text"
                  value={meetingData.participants?.join(', ') || ''}
                  onChange={e => setMeetingData({ 
                    ...meetingData, 
                    participants: e.target.value.split(',').map(s => s.trim()).filter(Boolean)
                  })}
                  placeholder="Juan, María, Carlos..."
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>

              {/* Agenda */}
              <div>
                <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                  Agenda
                </label>
                <textarea
                  value={meetingData.agenda || ''}
                  onChange={e => setMeetingData({ ...meetingData, agenda: e.target.value })}
                  placeholder="Puntos a tratar..."
                  rows={2}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-none"
                />
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════════════════ */}
          {/* TRIP-SPECIFIC FIELDS */}
          {/* ═══════════════════════════════════════════════════════════════════════ */}
          {commitmentType === 'trip' && (
            <div className="border border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-900/10 rounded-lg p-3 space-y-3">
              <div className="flex items-center gap-2 text-red-700 dark:text-red-400 text-sm font-medium">
                <span>✈️</span>
                <span>Detalles del viaje de trabajo</span>
              </div>
              
              {/* Destino */}
              <div>
                <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                  Destino
                </label>
                <input
                  type="text"
                  value={tripData.destination || ''}
                  onChange={e => setTripData({ ...tripData, destination: e.target.value })}
                  placeholder="Madrid, Barcelona, Londres..."
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>

              {/* Propósito */}
              <div>
                <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                  Propósito del viaje
                </label>
                <input
                  type="text"
                  value={tripData.purpose || ''}
                  onChange={e => setTripData({ ...tripData, purpose: e.target.value })}
                  placeholder="Reunión con cliente, conferencia, formación..."
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>

              {/* Transporte */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                    Transporte
                  </label>
                  <select
                    value={tripData.transportType || ''}
                    onChange={e => setTripData({ ...tripData, transportType: e.target.value as TripData['transportType'] })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  >
                    <option value="">Seleccionar...</option>
                    <option value="flight">✈️ Avión</option>
                    <option value="train">🚄 Tren</option>
                    <option value="car">🚗 Coche</option>
                    <option value="other">🚌 Otro</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                    Detalles transporte
                  </label>
                  <input
                    type="text"
                    value={tripData.transportDetails || ''}
                    onChange={e => setTripData({ ...tripData, transportDetails: e.target.value })}
                    placeholder="Vuelo IB1234, AVE 08:30..."
                    className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>
              </div>

              {/* Alojamiento */}
              <div>
                <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                  Alojamiento
                </label>
                <input
                  type="text"
                  value={tripData.accommodation || ''}
                  onChange={e => setTripData({ ...tripData, accommodation: e.target.value })}
                  placeholder="Hotel NH Collection, Reserva #12345"
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>

              {/* Sub-eventos del viaje - Solo mostrar si es un viaje existente */}
              {task?.id && task?.type === 'trip' ? (
                <div className="border-t border-red-200 dark:border-red-800 pt-3 mt-2">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-red-700 dark:text-red-400">
                      📅 Eventos del viaje ({subEvents.length})
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowAddSubEvent(!showAddSubEvent)}
                      className="px-2 py-1 text-xs bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded hover:bg-red-200 dark:hover:bg-red-800/50"
                    >
                      {showAddSubEvent ? 'Cancelar' : '+ Añadir evento'}
                    </button>
                  </div>
                  
                  {/* Formulario para añadir sub-evento */}
                  {showAddSubEvent && (
                    <div className="p-2 bg-red-50/50 dark:bg-red-900/10 rounded-lg mb-2 space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <select
                            value={newSubEventType}
                            onChange={e => setNewSubEventType(e.target.value as CommitmentType)}
                            className="w-full px-2 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                          >
                            <option value="meeting">🤝 Reunión</option>
                            <option value="video">📹 Videoconf.</option>
                            <option value="call">📞 Llamada</option>
                            <option value="task">📋 Tarea</option>
                          </select>
                        </div>
                        <div className="flex gap-1">
                          <input
                            type="date"
                            value={newSubEventDate}
                            onChange={e => setNewSubEventDate(e.target.value)}
                            min={dueDate}
                            max={endDate || undefined}
                            className="flex-1 px-2 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                          />
                          <input
                            type="time"
                            value={newSubEventTime}
                            onChange={e => setNewSubEventTime(e.target.value)}
                            className="w-20 px-2 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                          />
                        </div>
                      </div>
                      <input
                        type="text"
                        value={newSubEventTitle}
                        onChange={e => setNewSubEventTitle(e.target.value)}
                        placeholder="Título del evento..."
                        className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      />
                      <button
                        type="button"
                        onClick={async () => {
                          if (!newSubEventTitle.trim() || !newSubEventDate) return;
                          try {
                            const api = (window as any).electronAPI;
                            const subEventDate = new Date(`${newSubEventDate}T${newSubEventTime}:00`).toISOString();
                            const newEvent = await api.createTask({
                              title: newSubEventTitle.trim(),
                              type: newSubEventType,
                              status: 'pending',
                              dueDate: subEventDate,
                              parentEventId: task.id,
                              projectId: projectId,
                            });
                            setSubEvents([...subEvents, newEvent]);
                            setNewSubEventTitle('');
                            setNewSubEventDate('');
                            setShowAddSubEvent(false);
                          } catch (error) {
                            console.error('Error creating sub-event:', error);
                          }
                        }}
                        disabled={!newSubEventTitle.trim() || !newSubEventDate}
                        className="w-full px-3 py-1.5 text-xs bg-red-500 text-white rounded hover:bg-red-600 disabled:opacity-50"
                      >
                        Añadir al viaje
                      </button>
                    </div>
                  )}
                  
                  {/* Lista de sub-eventos */}
                  {subEvents.length > 0 ? (
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {subEvents
                        .sort((a, b) => new Date(a.dueDate || 0).getTime() - new Date(b.dueDate || 0).getTime())
                        .map(subEvent => (
                        <div
                          key={subEvent.id}
                          className={`flex items-center gap-2 p-2 rounded text-xs ${
                            subEvent.completedAt 
                              ? 'bg-gray-100 dark:bg-gray-700/50 text-gray-500' 
                              : 'bg-white dark:bg-gray-700'
                          }`}
                        >
                          <span>
                            {subEvent.type === 'meeting' ? '🤝' :
                             subEvent.type === 'video' ? '📹' :
                             subEvent.type === 'call' ? '📞' : '📋'}
                          </span>
                          <span className={subEvent.completedAt ? 'line-through' : ''}>
                            {subEvent.title}
                          </span>
                          {subEvent.dueDate && (
                            <span className="text-gray-400 ml-auto">
                              {new Date(subEvent.dueDate).toLocaleDateString('es-ES', { 
                                day: 'numeric', 
                                month: 'short',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400 text-center py-2">
                      No hay eventos programados en este viaje
                    </p>
                  )}
                </div>
              ) : (
                /* Info para viajes nuevos */
                <div className="flex items-center gap-2 p-2 bg-red-100/50 dark:bg-red-900/20 rounded text-xs text-red-700 dark:text-red-300">
                  <span>💡</span>
                  <span>Después de crear el viaje, podrás añadir reuniones y eventos dentro de él.</span>
                </div>
              )}
            </div>
          )}

          {/* Notes - Solo mostrar si NO es email (el email tiene su propio campo de body) */}
          {commitmentType !== 'email' && (
            <div>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Notas adicionales..."
                rows={2}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              />
            </div>
          )}

          {/* Due Date & Time */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                📅 {COMMITMENT_CONFIG[commitmentType].hasEndDate ? 'Fecha inicio' : 'Fecha'}
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div className="w-28">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                🕐 {COMMITMENT_CONFIG[commitmentType].hasEndDate ? 'Hora inicio' : 'Hora'}
              </label>
              <input
                type="time"
                value={dueTime}
                onChange={e => setDueTime(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* End Date & Time - Solo para tipos con duración */}
          {COMMITMENT_CONFIG[commitmentType].hasEndDate && (
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  📅 Fecha fin
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                  min={dueDate}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div className="w-28">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  🕐 Hora fin
                </label>
                <input
                  type="time"
                  value={endTime}
                  onChange={e => setEndTime(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════════════════
              RECORDATORIOS MÚLTIPLES
              ═══════════════════════════════════════════════════════════════════════ */}
          {dueDate && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={addReminder}
                    onChange={e => {
                      setAddReminder(e.target.checked);
                      if (!e.target.checked) {
                        setSelectedReminders([]);
                      }
                    }}
                    className="w-4 h-4 text-blue-500 rounded border-gray-300 focus:ring-blue-500"
                  />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    🔔 Recordatorios
                  </span>
                </label>
                {addReminder && (
                  <button
                    type="button"
                    onClick={() => setShowReminderPicker(!showReminderPicker)}
                    className="text-sm text-blue-500 hover:text-blue-600 font-medium"
                  >
                    {showReminderPicker ? '✕ Cerrar' : '+ Añadir'}
                  </button>
                )}
              </div>
              
              {/* Lista de recordatorios seleccionados */}
              {addReminder && selectedReminders.length > 0 && (
                <div className="flex flex-wrap gap-2 pl-6">
                  {selectedReminders
                    .sort((a, b) => b.advanceMinutes - a.advanceMinutes)
                    .map(reminder => (
                    <span
                      key={reminder.advanceMinutes}
                      className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full text-xs"
                    >
                      🔔 {reminder.advanceLabel}
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedReminders(prev => 
                            prev.filter(r => r.advanceMinutes !== reminder.advanceMinutes)
                          );
                        }}
                        className="ml-1 text-blue-500 hover:text-red-500"
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                </div>
              )}
              
              {/* Selector de opciones de recordatorio */}
              {addReminder && showReminderPicker && (
                <div className="ml-6 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600">
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                    Selecciona cuándo quieres que te avise:
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {reminderOptions.map(option => {
                      const isSelected = selectedReminders.some(r => r.advanceMinutes === option.advanceMinutes);
                      return (
                        <button
                          key={option.advanceMinutes}
                          type="button"
                          onClick={() => {
                            if (isSelected) {
                              setSelectedReminders(prev => 
                                prev.filter(r => r.advanceMinutes !== option.advanceMinutes)
                              );
                            } else {
                              setSelectedReminders(prev => [...prev, option]);
                            }
                          }}
                          className={`px-3 py-2 text-xs rounded-lg border transition-colors ${
                            isSelected
                              ? 'bg-blue-500 text-white border-blue-500'
                              : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-blue-400'
                          }`}
                        >
                          {option.advanceLabel}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              
              {/* Mensaje informativo para tipos específicos */}
              {addReminder && selectedReminders.length === 0 && !showReminderPicker && (
                <p className="text-xs text-gray-500 dark:text-gray-400 pl-6">
                  {commitmentType === 'trip' && 'Recomendado: 1 semana, 1 día y 2 horas antes para preparar el viaje'}
                  {commitmentType === 'meeting' && 'Recomendado: 1 día, 2 horas y 15 min antes para prepararte y desplazarte'}
                  {commitmentType === 'video' && 'Recomendado: 15 min y 5 min antes para conectarte a tiempo'}
                  {commitmentType === 'call' && 'Recomendado: 10 min antes'}
                  {(commitmentType === 'task' || commitmentType === 'email') && 'Pulsa "Añadir" para configurar recordatorios'}
                </p>
              )}
            </div>
          )}

          {/* Project selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              📁 Proyecto
            </label>
            <select
              value={projectId || ''}
              onChange={e => setProjectId(e.target.value || null)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">📥 Sin proyecto (Inbox)</option>
              {projects.map(project => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </div>

          {/* Assigned to selector */}
          {contacts.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                👤 Asignado a
              </label>
              <select
                value={assignedToId || ''}
                onChange={e => setAssignedToId(e.target.value || null)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">Sin asignar</option>
                {contacts.map(contact => (
                  <option key={contact.id} value={contact.id}>
                    {contact.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Priority */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Prioridad
            </label>
            <div className="flex gap-2">
              {[
                { value: 0, label: 'Ninguna', color: 'bg-gray-200 dark:bg-gray-600' },
                { value: 1, label: '🟢 Baja', color: 'bg-green-100 text-green-700 border-green-300' },
                { value: 2, label: '🟡 Media', color: 'bg-yellow-100 text-yellow-700 border-yellow-300' },
                { value: 3, label: '🔴 Alta', color: 'bg-red-100 text-red-700 border-red-300' },
              ].map(p => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setPriority(p.value)}
                  className={`px-3 py-1.5 rounded-lg text-sm border transition-all ${
                    priority === p.value
                      ? `${p.color} border-2`
                      : 'bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:bg-gray-100'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Recurrence (Fase 4) */}
          {dueDate && (
            <div className="border border-gray-200 dark:border-gray-600 rounded-lg p-3">
              <label className="flex items-center gap-2 mb-2">
                <input
                  type="checkbox"
                  checked={isRecurring}
                  onChange={e => setIsRecurring(e.target.checked)}
                  className="w-4 h-4 text-purple-500 rounded border-gray-300 focus:ring-purple-500"
                />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  🔄 Repetir tarea
                </span>
              </label>
              {isRecurring && (
                <select
                  value={recurrenceRule}
                  onChange={e => setRecurrenceRule(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                >
                  <option value="daily">📅 Cada día</option>
                  <option value="weekdays">💼 Días laborables (L-V)</option>
                  <option value="weekly">📆 Cada semana</option>
                  <option value="monthly">🗓️ Cada mes</option>
                  <option value="yearly">🎂 Cada año</option>
                </select>
              )}
            </div>
          )}

          {/* Subtasks (Fase 4) */}
          <div className="border border-gray-200 dark:border-gray-600 rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                ☑️ Subtareas
              </label>
              {aiAvailable && title.trim() && (
                <button
                  type="button"
                  onClick={generateSubtasksWithAI}
                  disabled={generatingSubtasks}
                  className="px-2 py-1 text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-lg hover:bg-purple-200 dark:hover:bg-purple-800/50 disabled:opacity-50 flex items-center gap-1"
                  title="Generar subtareas con IA"
                >
                  {generatingSubtasks ? (
                    <>
                      <div className="w-3 h-3 border-2 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
                      <span>Generando...</span>
                    </>
                  ) : (
                    <>
                      <span>🤖</span>
                      <span>Generar con IA</span>
                    </>
                  )}
                </button>
              )}
            </div>
            
            {/* Lista de subtareas */}
            {subtasks.length > 0 && (
              <div className="space-y-1 mb-2">
                {subtasks.map(subtask => (
                  <div key={subtask.id} className="flex items-center gap-2 group">
                    <input
                      type="checkbox"
                      checked={subtask.done}
                      onChange={() => toggleSubtaskDone(subtask.id)}
                      className="w-4 h-4 text-blue-500 rounded border-gray-300"
                    />
                    <span className={`flex-1 text-sm ${subtask.done ? 'line-through text-gray-400' : 'text-gray-700 dark:text-gray-300'}`}>
                      {subtask.title}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeSubtask(subtask.id)}
                      className="p-1 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
            
            {/* Añadir subtarea */}
            <div className="flex gap-2">
              <input
                type="text"
                value={newSubtask}
                onChange={e => setNewSubtask(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addSubtask())}
                placeholder="Nueva subtarea..."
                className="flex-1 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400"
              />
              <button
                type="button"
                onClick={addSubtask}
                disabled={!newSubtask.trim()}
                className="px-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-600 hover:bg-gray-200 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-300 rounded-lg disabled:opacity-50"
              >
                +
              </button>
            </div>
          </div>

          {/* Tags (Fase 4) */}
          <div className="border border-gray-200 dark:border-gray-600 rounded-lg p-3">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              🏷️ Etiquetas
            </label>
            
            {/* Tags actuales */}
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-2">
                {tags.map(tag => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full"
                  >
                    #{tag}
                    <button
                      type="button"
                      onClick={() => removeTag(tag)}
                      className="hover:text-red-500"
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            )}
            
            {/* Input de etiqueta */}
            <div className="flex gap-2">
              <input
                type="text"
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addTag(tagInput))}
                placeholder="trabajo, personal, urgente..."
                className="flex-1 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400"
              />
              <button
                type="button"
                onClick={() => addTag(tagInput)}
                disabled={!tagInput.trim()}
                className="px-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-600 hover:bg-gray-200 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-300 rounded-lg disabled:opacity-50"
              >
                +
              </button>
            </div>
            
            {/* Sugerencias de etiquetas existentes */}
            {availableTags.length > 0 && tagInput && (
              <div className="mt-2 flex flex-wrap gap-1">
                {availableTags
                  .filter(t => t.name.includes(tagInput.toLowerCase()) && !tags.includes(t.name))
                  .slice(0, 5)
                  .map(tag => (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() => addTag(tag.name)}
                      className="px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-full hover:bg-gray-200"
                    >
                      #{tag.name}
                    </button>
                  ))}
              </div>
            )}
          </div>

          {/* Adjuntos - Disponible siempre */}
          <div 
            className={`border-2 border-dashed rounded-lg p-3 transition-colors ${
              isDraggingFile 
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' 
                : 'border-gray-200 dark:border-gray-600'
            }`}
            onDragOver={(e) => { e.preventDefault(); setIsDraggingFile(true); }}
            onDragLeave={() => setIsDraggingFile(false)}
            onDrop={handleFileDrop}
          >
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                📎 Adjuntos {(attachments.length + pendingFiles.length + pendingUrls.length + pendingEmails.length + pendingOutlookEmails.length) > 0 && 
                  `(${attachments.length + pendingFiles.length + pendingUrls.length + pendingEmails.length + pendingOutlookEmails.length})`}
                {(uploadingFile || capturingOutlook) && <span className="ml-2 text-xs text-blue-500">⏳</span>}
              </label>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={handleSelectFile}
                  disabled={uploadingFile}
                  className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-600 hover:bg-gray-200 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-300 rounded disabled:opacity-50"
                  title="Añadir archivo"
                >
                  📄
                </button>
                <button
                  type="button"
                  onClick={() => setShowUrlInput(!showUrlInput)}
                  className={`px-2 py-1 text-xs rounded ${showUrlInput ? 'bg-blue-500 text-white' : 'bg-gray-100 dark:bg-gray-600 hover:bg-gray-200 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-300'}`}
                  title="Añadir enlace"
                >
                  🔗
                </button>
                <button
                  type="button"
                  onClick={() => setShowEmailInput(!showEmailInput)}
                  className={`px-2 py-1 text-xs rounded ${showEmailInput ? 'bg-blue-500 text-white' : 'bg-gray-100 dark:bg-gray-600 hover:bg-gray-200 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-300'}`}
                  title="Añadir email (Mail)"
                >
                  ✉️
                </button>
                <button
                  type="button"
                  onClick={handleCaptureFromOutlook}
                  disabled={capturingOutlook}
                  className={`px-2 py-1 text-xs rounded bg-blue-100 dark:bg-blue-900 hover:bg-blue-200 dark:hover:bg-blue-800 text-blue-700 dark:text-blue-300 disabled:opacity-50`}
                  title="Capturar email de Outlook (selecciona un email en Outlook)"
                >
                  <span className="font-semibold">O</span>
                </button>
              </div>
            </div>
            
            {/* Input URL */}
            {showUrlInput && (
              <div className="mb-2 p-2 bg-gray-50 dark:bg-gray-700/50 rounded space-y-2">
                <input
                  type="text"
                  value={newUrlName}
                  onChange={(e) => setNewUrlName(e.target.value)}
                  placeholder="Nombre (opcional)"
                  className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700"
                />
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={newUrl}
                    onChange={(e) => setNewUrl(e.target.value)}
                    placeholder="https://..."
                    className="flex-1 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700"
                  />
                  <button
                    type="button"
                    onClick={handleAddUrl}
                    disabled={!newUrl.trim()}
                    className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
                  >
                    Añadir
                  </button>
                </div>
              </div>
            )}
            
            {/* Input Email */}
            {showEmailInput && (
              <div className="mb-2 p-2 bg-gray-50 dark:bg-gray-700/50 rounded space-y-2">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Arrastra un email desde Mail o pega el enlace message://
                </p>
                <input
                  type="text"
                  value={newEmailSubject}
                  onChange={(e) => setNewEmailSubject(e.target.value)}
                  placeholder="Asunto (opcional)"
                  className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700"
                />
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newEmailUrl}
                    onChange={(e) => setNewEmailUrl(e.target.value)}
                    placeholder="message://..."
                    className="flex-1 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700"
                  />
                  <button
                    type="button"
                    onClick={() => handleAddEmail()}
                    disabled={!newEmailUrl.trim()}
                    className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
                  >
                    Añadir
                  </button>
                </div>
              </div>
            )}
            
            {/* Lista de adjuntos */}
            {attachments.length === 0 && pendingFiles.length === 0 && pendingUrls.length === 0 && pendingEmails.length === 0 && pendingOutlookEmails.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-2">
                {isDraggingFile ? 'Suelta aquí...' : 'Arrastra archivos o emails aquí'}
              </p>
            ) : (
              <div className="space-y-1">
                {/* Adjuntos guardados (tarea existente) */}
                {attachments.map(attachment => {
                  const subtitle = getAttachmentSubtitle(attachment);
                  return (
                  <div 
                    key={attachment.id}
                    className="flex items-center gap-2 p-2 bg-gray-50 dark:bg-gray-700/50 rounded hover:bg-gray-100 dark:hover:bg-gray-600/50 group"
                  >
                    <span className="text-lg">{getAttachmentIcon(attachment)}</span>
                    <div className="flex-1 min-w-0">
                      {subtitle && (
                        <p className="text-xs text-blue-600 dark:text-blue-400">
                          {subtitle}
                        </p>
                      )}
                      <p className="text-sm text-gray-900 dark:text-white truncate">
                        {attachment.name}
                      </p>
                      {attachment.size && (
                        <p className="text-xs text-gray-400">
                          {formatFileSize(attachment.size)}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={() => handlePreviewAttachment(attachment)}
                        className="p-1 text-gray-400 hover:text-blue-500"
                        title="Abrir"
                      >
                        👁️
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteAttachment(attachment.id)}
                        className="p-1 text-gray-400 hover:text-red-500"
                        title="Eliminar"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                  );
                })}
                
                {/* Archivos pendientes (tarea nueva) */}
                {pendingFiles.map((pf, index) => (
                  <div 
                    key={`pending-file-${index}`}
                    className="flex items-center gap-2 p-2 bg-yellow-50 dark:bg-yellow-900/20 rounded group"
                  >
                    <span className="text-lg">📄</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-900 dark:text-white truncate">
                        {pf.name}
                      </p>
                      <p className="text-xs text-yellow-600 dark:text-yellow-400">
                        Se guardará al crear la tarea
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removePendingFile(index)}
                      className="p-1 text-gray-400 hover:text-red-500"
                      title="Quitar"
                    >
                      ✕
                    </button>
                  </div>
                ))}
                
                {/* URLs pendientes */}
                {pendingUrls.map((pu, index) => (
                  <div 
                    key={`pending-url-${index}`}
                    className="flex items-center gap-2 p-2 bg-yellow-50 dark:bg-yellow-900/20 rounded group"
                  >
                    <span className="text-lg">🔗</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-900 dark:text-white truncate">
                        {pu.name || pu.url}
                      </p>
                      <p className="text-xs text-yellow-600 dark:text-yellow-400">
                        Se guardará al crear la tarea
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removePendingUrl(index)}
                      className="p-1 text-gray-400 hover:text-red-500"
                      title="Quitar"
                    >
                      ✕
                    </button>
                  </div>
                ))}
                
                {/* Emails pendientes */}
                {pendingEmails.map((pe, index) => (
                  <div 
                    key={`pending-email-${index}`}
                    className="flex items-center gap-2 p-2 bg-yellow-50 dark:bg-yellow-900/20 rounded group"
                  >
                    <span className="text-lg">✉️</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-900 dark:text-white truncate">
                        {pe.name || 'Email'}
                      </p>
                      <p className="text-xs text-yellow-600 dark:text-yellow-400">
                        Se guardará al crear la tarea
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removePendingEmail(index)}
                      className="p-1 text-gray-400 hover:text-red-500"
                      title="Quitar"
                    >
                      ✕
                    </button>
                  </div>
                ))}

                {/* Emails de Outlook pendientes */}
                {pendingOutlookEmails.map((pe, index) => (
                  <div 
                    key={`pending-outlook-${index}`}
                    className="flex items-center gap-2 p-2 bg-blue-50 dark:bg-blue-900/20 rounded group"
                  >
                    <span className="text-lg">{pe.isFromMe ? '📤' : '📥'}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-blue-600 dark:text-blue-400">
                        {pe.isFromMe ? 'Enviado a:' : 'De:'} {pe.contactName}
                      </p>
                      <p className="text-sm text-gray-900 dark:text-white truncate">
                        {pe.subject}
                      </p>
                      <p className="text-xs text-yellow-600 dark:text-yellow-400">
                        Se guardará al crear la tarea
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removePendingOutlookEmail(index)}
                      className="p-1 text-gray-400 hover:text-red-500"
                      title="Quitar"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Waiting For */}
          <div>
            <label className="flex items-center gap-2 mb-2">
              <input
                type="checkbox"
                checked={isWaitingFor}
                onChange={e => setIsWaitingFor(e.target.checked)}
                className="w-4 h-4 text-orange-500 rounded border-gray-300 focus:ring-orange-500"
              />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                ⏳ Esperando respuesta
              </span>
            </label>
            {isWaitingFor && (
              <input
                type="text"
                value={waitingForNote}
                onChange={e => setWaitingForNote(e.target.value)}
                placeholder="¿De quién? (ej: Juan, soporte técnico...)"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              />
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!title.trim() || saving}
              className="flex-1 px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 text-white rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              {saving ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Guardando...</span>
                </>
              ) : (
                <span>{task ? 'Guardar' : 'Crear Tarea'}</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>

    {/* Modal de conflictos */}
    {showConflictModal && scheduleAnalysis && pendingTaskData?.dueDate && (
      <ConflictModal
        analysis={scheduleAnalysis}
        originalDate={pendingTaskData.dueDate}
        onSelectDate={handleConflictSelectDate}
        onKeepOriginal={handleConflictKeepOriginal}
        onCancel={handleConflictCancel}
      />
    )}

    {/* Modal de preview de archivos */}
    {previewAttachment && (
      <div 
        className="fixed inset-0 bg-black/80 flex items-center justify-center z-[60]"
        onClick={() => setPreviewAttachment(null)}
      >
        <div 
          className="relative max-w-4xl max-h-[90vh] m-4"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header con título y botón cerrar */}
          <div className="flex items-center justify-between mb-2 px-1">
            <p className="text-white text-sm truncate max-w-[300px]">{previewName}</p>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setPreviewAttachment(null);
              }}
              className="text-white hover:text-red-400 text-3xl font-bold px-3 py-1 bg-gray-800/50 rounded-lg hover:bg-gray-700/80 transition-colors"
            >
              ✕
            </button>
          </div>
          {previewAttachment.mimeType.startsWith('image/') ? (
            <img
              src={`data:${previewAttachment.mimeType};base64,${previewAttachment.data}`}
              alt={previewName}
              className="max-h-[80vh] object-contain rounded-lg"
            />
          ) : previewAttachment.mimeType === 'application/pdf' ? (
            <iframe
              src={`data:application/pdf;base64,${previewAttachment.data}`}
              className="w-[800px] h-[80vh] rounded-lg bg-white"
            />
          ) : null}
        </div>
      </div>
    )}
    </>
  );
}
