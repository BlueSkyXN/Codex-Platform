import { EventEmitter } from 'node:events';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import readline from 'node:readline';

export type JsonRpcMessage = {
  id?: string | number;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: unknown;
};

type Pending = {
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
  method: string;
  startedAt: number;
  timer: NodeJS.Timeout;
};

export class JsonRpcLineClient extends EventEmitter {
  private child?: ChildProcessWithoutNullStreams;
  private nextId = 1;
  private readonly pending = new Map<string | number, Pending>();

  constructor(private readonly bin: string, private readonly args: string[], private readonly cwd?: string, private readonly defaultTimeoutMs = 120_000) {
    super();
  }

  get running(): boolean {
    return Boolean(this.child && !this.child.killed);
  }

  start(): void {
    if (this.child) return;
    this.child = spawn(this.bin, this.args, {
      cwd: this.cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: process.env
    });

    const rl = readline.createInterface({ input: this.child.stdout });
    rl.on('line', (line) => this.handleLine(line));

    this.child.stderr.on('data', (chunk: Buffer) => {
      this.emit('stderr', chunk.toString('utf8'));
    });

    this.child.stdin.on('error', (error) => {
      this.emit('error', error);
      this.rejectAll(error);
    });

    this.child.on('error', (error) => {
      this.emit('error', error);
      this.rejectAll(error);
    });

    this.child.on('exit', (code, signal) => {
      const error = new Error(`codex app-server exited: code=${code ?? 'null'} signal=${signal ?? 'null'}`);
      this.emit('exit', { code, signal });
      this.rejectAll(error);
      this.child = undefined;
    });
  }

  stop(): void {
    const child = this.child;
    if (!child) return;
    child.kill('SIGTERM');
    setTimeout(() => {
      if (!child.killed) child.kill('SIGKILL');
    }, 2500).unref();
    this.child = undefined;
  }

  async request<T = unknown>(method: string, params?: unknown, timeoutMs = this.defaultTimeoutMs): Promise<T> {
    const id = this.nextId++;
    const message: JsonRpcMessage = params === undefined ? { id, method } : { id, method, params };
    return await new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`JSON-RPC request timed out after ${timeoutMs}ms: ${method}`));
      }, timeoutMs);
      this.pending.set(id, {
        method,
        startedAt: Date.now(),
        timer,
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value as T);
        },
        reject: (reason) => {
          clearTimeout(timer);
          reject(reason);
        }
      });
      try {
        this.write(message);
      } catch (error) {
        this.pending.delete(id);
        clearTimeout(timer);
        reject(error);
      }
    });
  }

  notify(method: string, params?: unknown): void {
    const message: JsonRpcMessage = params === undefined ? { method } : { method, params };
    this.write(message);
  }

  respond(id: string | number, result: unknown): void {
    this.write({ id, result });
  }

  rejectRequest(id: string | number, error: unknown): void {
    this.write({ id, error });
  }

  private write(message: JsonRpcMessage): void {
    if (!this.child) this.start();
    if (!this.child?.stdin.writable) throw new Error('codex app-server stdin is not writable');
    this.child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  private handleLine(line: string): void {
    const trimmed = line.trim();
    if (!trimmed) return;
    let message: JsonRpcMessage;
    try {
      message = JSON.parse(trimmed) as JsonRpcMessage;
    } catch (error) {
      this.emit('protocolError', { error, line: trimmed.slice(0, 2000) });
      return;
    }

    if (message.id !== undefined && message.method === undefined) {
      const pending = this.pending.get(message.id);
      if (!pending) {
        this.emit('orphanResponse', message);
        return;
      }
      this.pending.delete(message.id);
      if (message.error !== undefined) pending.reject(normalizeRpcError(message.error, pending.method));
      else pending.resolve(message.result);
      return;
    }

    if (message.method && message.id !== undefined) {
      this.emit('serverRequest', message);
      return;
    }

    if (message.method) {
      this.emit('notification', message);
      return;
    }

    this.emit('unknownMessage', message);
  }

  private rejectAll(error: unknown): void {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(error);
      this.pending.delete(id);
    }
  }
}

function normalizeRpcError(error: unknown, method: string): Error {
  if (error instanceof Error) return error;
  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>;
    const message = typeof record.message === 'string' ? record.message : JSON.stringify(error);
    return new Error(`JSON-RPC error from ${method}: ${message}`);
  }
  return new Error(`JSON-RPC error from ${method}: ${String(error)}`);
}
