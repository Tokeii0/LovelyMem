/**
 * 简单的事件发射器
 * 用于组件间通信
 */

export type EventMap = Record<string, unknown>;

export type EventCallback<T> = (data: T) => void;

export class EventEmitter<Events extends EventMap = EventMap> {
    private events: { [K in keyof Events]?: Array<EventCallback<Events[K]>> } = {};

    on<K extends keyof Events>(event: K, callback: EventCallback<Events[K]>): () => void {
        let handlers = this.events[event];
        if (!handlers) {
            handlers = [];
            this.events[event] = handlers;
        }
        handlers.push(callback);

        // 返回取消订阅函数
        return () => this.off(event, callback);
    }

    off<K extends keyof Events>(event: K, callback: EventCallback<Events[K]>): void {
        const handlers = this.events[event];
        if (!handlers) return;

        const index = handlers.indexOf(callback);
        if (index > -1) {
            handlers.splice(index, 1);
        }
    }

    emit<K extends keyof Events>(event: K, data?: Events[K]): void {
        const handlers = this.events[event];
        if (!handlers) return;

        handlers.slice().forEach(callback => {
            try {
                callback(data as Events[K]);
            } catch (error) {
                console.error(`事件处理器错误 [${String(event)}]:`, error);
            }
        });
    }

    once<K extends keyof Events>(event: K, callback: EventCallback<Events[K]>): void {
        const onceCallback: EventCallback<Events[K]> = (data) => {
            callback(data);
            this.off(event, onceCallback);
        };

        this.on(event, onceCallback);
    }

    removeAllListeners<K extends keyof Events>(event?: K): void {
        if (event) {
            delete this.events[event];
        } else {
            this.events = {};
        }
    }

    listenerCount<K extends keyof Events>(event: K): number {
        const handlers = this.events[event];
        return handlers ? handlers.length : 0;
    }

    eventNames(): Array<keyof Events> {
        return Object.keys(this.events) as Array<keyof Events>;
    }
}
