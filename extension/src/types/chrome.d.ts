// Minimal chrome namespace types to satisfy TS during local dev
// In browser, real types are present; this avoids type errors in editor.
// For full types, install @types/chrome if needed.
declare namespace chrome {
  namespace runtime {
    interface Port {
      name: string;
      postMessage(message: any): void;
      onMessage: { addListener(cb: (msg: any) => void): void };
      onDisconnect: { addListener(cb: () => void): void };
    }
    function connect(options: { name: string }): Port;
    const onConnect: { addListener(cb: (port: Port) => void): void };
  }
  namespace storage {
    namespace local {
      function get(keys: string[] | { [key: string]: any }): Promise<any>;
      function set(items: { [key: string]: any }): Promise<void>;
    }
  }
}

