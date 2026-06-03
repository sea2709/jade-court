/**
 * Long-lived Pikafish UCI subprocess with serialized commands.
 */
import { type ChildProcess, spawn } from 'node:child_process';
import readline from 'node:readline';

export class UciEngine {
  private proc: ChildProcess | null = null;
  private rl: readline.Interface | null = null;
  private chain: Promise<void> = Promise.resolve();

  async start(binaryPath: string): Promise<void> {
    if (this.proc) return;
    this.proc = spawn(binaryPath, [], { stdio: ['pipe', 'pipe', 'pipe'] });
    const stdout = this.proc.stdout;
    if (!stdout) throw new Error('engine_no_stdout');
    this.rl = readline.createInterface({ input: stdout });
    this.proc.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString().trim();
      if (text) console.warn('[pikafish]', text);
    });
    await this.sendAndWait('uci', (line) => line === 'uciok');
    await this.sendAndWait('isready', (line) => line === 'readyok');
  }

  async stop(): Promise<void> {
    if (!this.proc) return;
    try {
      this.proc.stdin?.write('quit\n');
    } catch {
      /* ignore */
    }
    this.proc.kill();
    this.proc = null;
    this.rl?.close();
    this.rl = null;
  }

  async bestMove(positionLine: string, goArgs: string, timeoutMs: number): Promise<string> {
    return this.enqueue(() => this.bestMoveInner(positionLine, goArgs, timeoutMs));
  }

  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.chain.then(fn);
    this.chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private write(line: string): void {
    if (!this.proc?.stdin) throw new Error('engine_not_running');
    this.proc.stdin.write(`${line}\n`);
  }

  private async sendAndWait(
    command: string,
    until: (line: string) => boolean,
    timeoutMs = 10_000,
  ): Promise<void> {
    this.write(command);
    await this.waitForLine(until, timeoutMs);
  }

  private async bestMoveInner(
    positionLine: string,
    goArgs: string,
    timeoutMs: number,
  ): Promise<string> {
    this.write(positionLine);
    this.write(`go ${goArgs}`);
    const line = await this.waitForLine(
      (l) => l.startsWith('bestmove '),
      timeoutMs,
    );
    const parts = line.split(/\s+/);
    const move = parts[1];
    if (!move || move === '(none)') throw new Error('engine_no_move');
    return move;
  }

  private waitForLine(
    match: (line: string) => boolean,
    timeoutMs: number,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!this.rl) {
        reject(new Error('engine_not_running'));
        return;
      }
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error('engine_timeout'));
      }, timeoutMs);

      const onLine = (line: string) => {
        const trimmed = line.trim();
        if (!trimmed) return;
        if (match(trimmed)) {
          cleanup();
          resolve(trimmed);
        }
      };

      const onExit = (code: number | null) => {
        cleanup();
        reject(new Error(`engine_exited:${code ?? 'unknown'}`));
      };

      const cleanup = () => {
        clearTimeout(timer);
        this.rl?.off('line', onLine);
        this.proc?.off('exit', onExit);
      };

      this.rl.on('line', onLine);
      this.proc?.on('exit', onExit);
    });
  }
}

let shared: UciEngine | null = null;

export async function getUciEngine(binaryPath: string): Promise<UciEngine> {
  if (!shared) {
    shared = new UciEngine();
    await shared.start(binaryPath);
  }
  return shared;
}

export async function shutdownUciEngine(): Promise<void> {
  if (shared) {
    await shared.stop();
    shared = null;
  }
}
