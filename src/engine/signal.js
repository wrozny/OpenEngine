/** Synchronous, disconnectable events. A snapshot makes mutation during dispatch safe. */
export class Signal {
  constructor(
    onError = (error) => {
      throw error;
    },
  ) {
    this.listeners = new Map();
    this.onError = onError;
  }
  Connect(callback) {
    if (typeof callback !== 'function') throw new TypeError('Connect expects a function');
    const connection = {
      Connected: true,
      Disconnect: () => {
        if (!connection.Connected) return;
        connection.Connected = false;
        this.listeners.delete(connection);
        connection._onDisconnect?.();
      },
    };
    this.listeners.set(connection, callback);
    return connection;
  }
  Fire(...args) {
    for (const [connection, listener] of [...this.listeners]) {
      if (!this.listeners.has(connection)) continue;
      try {
        listener(...args);
      } catch (error) {
        this.onError(error);
      }
    }
  }
  Clear() {
    for (const connection of this.listeners.keys()) connection.Disconnect();
  }
}
