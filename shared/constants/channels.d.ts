/**
 * IPC Channel Definitions
 * Canales de comunicación entre Main y Renderer
 */
export declare const IPC_CHANNELS: {
    readonly WINDOW_MINIMIZE: "window:minimize";
    readonly WINDOW_MAXIMIZE: "window:maximize";
    readonly WINDOW_CLOSE: "window:close";
    readonly WINDOW_SHOW: "window:show";
    readonly APP_QUIT: "app:quit";
    readonly APP_GET_VERSION: "app:get-version";
    readonly APP_GET_DEVICE_ID: "app:get-device-id";
    readonly TASK_CREATE: "task:create";
    readonly TASK_UPDATE: "task:update";
    readonly TASK_DELETE: "task:delete";
    readonly TASK_GET_ALL: "task:get-all";
    readonly TASK_COMPLETE: "task:complete";
    readonly REMINDER_CREATE: "reminder:create";
    readonly REMINDER_SNOOZE: "reminder:snooze";
    readonly REMINDER_DISMISS: "reminder:dismiss";
    readonly NOTIFICATION_CLICKED: "notification:clicked";
    readonly NOTIFICATION_ACTION: "notification:action";
    readonly SETTINGS_GET: "settings:get";
    readonly SETTINGS_UPDATE: "settings:update";
};
export type IpcChannel = typeof IPC_CHANNELS[keyof typeof IPC_CHANNELS];
//# sourceMappingURL=channels.d.ts.map