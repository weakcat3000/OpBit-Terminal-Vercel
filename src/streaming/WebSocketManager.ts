import { nextBackoffMs } from "./throttle";

interface WebSocketManagerOptions {
    url: string;
    venue: string;
    heartbeatMs?: number;
    onOpen?: () => void;
    onClose?: (event: CloseEvent) => void;
    onError?: (event: Event) => void;
    onMessage: (event: MessageEvent<string>) => void;
}

export class WebSocketManager {
    private socket: WebSocket | null = null;
    private readonly options: WebSocketManagerOptions;
    private reconnectAttempt = 0;
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    private explicitClose = false;
    private pendingSubscribe = new Set<string>();

    constructor(options: WebSocketManagerOptions) {
        this.options = options;
    }

    connect(): void {
        if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
            return;
        }

        this.explicitClose = false;
        const ws = new WebSocket(this.options.url);
        this.socket = ws;

        ws.onopen = () => {
            this.reconnectAttempt = 0;
            this.options.onOpen?.();
            this.flushPendingSubscriptions();
            this.startHeartbeat();
        };

        ws.onmessage = (event) => this.options.onMessage(event as MessageEvent<string>);
        ws.onerror = (event) => this.options.onError?.(event);

        ws.onclose = (event) => {
            this.stopHeartbeat();
            this.options.onClose?.(event);
            if (this.explicitClose) return;
            this.scheduleReconnect();
        };
    }

    disconnect(): void {
        this.explicitClose = true;
        this.stopHeartbeat();
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        if (this.socket) {
            this.socket.close();
            this.socket = null;
        }
    }

    send(payload: unknown): void {
        const serialized = JSON.stringify(payload);
        if (this.socket?.readyState === WebSocket.OPEN) {
            this.socket.send(serialized);
        }
    }

    subscribe(channels: string[]): void {
        for (const channel of channels) {
            this.pendingSubscribe.add(channel);
        }
        this.flushPendingSubscriptions();
    }

    unsubscribe(channels: string[]): void {
        if (channels.length === 0) return;
        for (const channel of channels) {
            this.pendingSubscribe.delete(channel);
        }
    }

    isConnected(): boolean {
        return this.socket?.readyState === WebSocket.OPEN;
    }

    private flushPendingSubscriptions(): void {
        if (!this.isConnected()) return;
        if (this.pendingSubscribe.size === 0) return;

        const channels = Array.from(this.pendingSubscribe);
        this.send({
            jsonrpc: "2.0",
            id: Date.now(),
            method: "public/subscribe",
            params: { channels },
        });
    }

    private scheduleReconnect(): void {
        if (this.reconnectTimer) return;
        const waitMs = nextBackoffMs(this.reconnectAttempt);
        this.reconnectAttempt += 1;
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.connect();
        }, waitMs);
    }

    private startHeartbeat(): void {
        this.stopHeartbeat();
        const intervalMs = this.options.heartbeatMs ?? 15000;
        this.heartbeatTimer = setInterval(() => {
            if (!this.isConnected()) return;
            this.send({
                jsonrpc: "2.0",
                id: Date.now(),
                method: "public/test",
                params: {},
            });
        }, intervalMs);
    }

    private stopHeartbeat(): void {
        if (!this.heartbeatTimer) return;
        clearInterval(this.heartbeatTimer);
        this.heartbeatTimer = null;
    }
}

