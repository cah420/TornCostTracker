// Simple event bus
const listeners = new Map();

export const Events = {
    on(event, callback) {
        if (!listeners.has(event)) listeners.set(event, []);
        listeners.get(event).push(callback);
    },

    off(event, callback) {
        if (!listeners.has(event)) return;
        listeners.set(
            event,
            listeners.get(event).filter(cb => cb !== callback)
        );
    },

    emit(event, payload = {}) {
        (listeners.get(event) || []).forEach(cb => cb(payload));
    }
};
