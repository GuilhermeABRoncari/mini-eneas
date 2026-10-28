import type { State } from './behavior.ts';
export function frameInterval(state: State): number {
  return state === 'sleep' ? 250 : state === 'idle' ? 1000 / 12 : 1000 / 30;
}
export interface FrameHost {
  now(): number;
  timer(fn: () => void, delay: number): number;
  clearTimer(id: number): void;
  frame(fn: (time: number) => void): number;
  cancelFrame(id: number): void;
}
/** Só agenda um frame quando ele é necessário; não desperta a 60 Hz em repouso. */
export class RenderLoop {
  private timerId?: number;
  private frameId?: number;
  private paused = true;
  private previous = 0;
  constructor(private host: FrameHost, private interval: () => number, private paint: (time: number, dt: number) => void) {}
  private cancel() {
    if (this.timerId !== undefined) this.host.clearTimer(this.timerId);
    if (this.frameId !== undefined) this.host.cancelFrame(this.frameId);
    this.timerId = this.frameId = undefined;
  }
  pause() { this.paused = true; this.cancel(); }
  resume() {
    if (!this.paused) return;
    this.paused = false; this.previous = this.host.now(); this.wake();
  }
  wake() {
    if (this.paused) return;
    this.cancel();
    this.queueFrame(this.host.now());
  }
  private queueFrame(due: number) {
    this.frameId = this.host.frame(() => {
      this.frameId = undefined;
      if (this.paused) return;
      const time = this.host.now();
      // O timestamp do rAF pode anteceder a execução real, especialmente sob carga.
      // Respeita o prazo também quando um timer dispara antes do próximo vblank.
      if (time + .5 < due) { this.queueFrame(due); return; }
      const dt = Math.max(0, (time - this.previous) / 1000); this.previous = time;
      // Não corta o tempo de animação: sob carga, clipes continuam no tempo real.
      this.paint(time, dt);
      if (this.paused) return;
      const target = time + this.interval();
      this.timerId = this.host.timer(() => { this.timerId = undefined; this.queueFrame(target); }, Math.max(0, target - this.host.now() - 8));
    });
  }
}
