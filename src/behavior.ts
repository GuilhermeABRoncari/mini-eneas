export const states = ['idle', 'wave', 'think', 'annoyed', 'speak', 'sleep', 'dizzy'] as const;
export type State = typeof states[number];
export const labels: Record<State, string> = { idle: 'De olho no movimento', wave: 'Muito bem!', think: 'Um momento de reflexão', annoyed: 'Ora, tenha modos!', speak: 'Tenho algo a dizer', sleep: 'Recarregando a paciência', dizzy: 'Tonto de tanto girar!' };
export class Behavior {
  state: State = 'idle';
  message = 'Meu nome é Enéas! Pode me cutucar. Com moderação.';
  until = Infinity;
  private pokes: number[] = [];
  private spins: { time: number; amount: number }[] = [];
  private resizes: { time: number; amount: number }[] = [];
  private lastSpinReaction = -Infinity;
  private lastResizeReaction = -Infinity;
  act(state: State, now: number): void {
    this.state = state;
    this.until = state === 'idle' || state === 'sleep' ? Infinity : now + (state === 'annoyed' || state === 'dizzy' ? 4_000 : 3_200);
    this.message = {
      idle: 'Estou por aqui. Pensando em coisas grandiosas.',
      wave: 'Muito bem! Agora, mãos à obra.',
      think: 'É preciso analisar isso com o devido rigor.',
      annoyed: 'Três cutucadas? Minha paciência não é um recurso renovável!',
      speak: 'Meu nome é Enéas! E eu tenho considerações.',
      sleep: 'Vou descansar. Até a indignação precisa de uma pausa.',
      dizzy: 'Pare esse carrossel! Estou vendo dois Brasis… e nenhum deles está parado!',
    }[state];
  }
  spin(amount: number, now: number): boolean {
    if (!Number.isFinite(amount) || !amount) return false;
    this.spins = this.spins.filter(entry => now - entry.time < 4_000);
    this.spins.push({ time: now, amount: Math.abs(amount) });
    if (this.spins.reduce((sum,entry) => sum + entry.amount,0) < Math.PI * 4 || now - this.lastSpinReaction < 4_500) return false;
    this.spins = []; this.lastSpinReaction = now; this.act('dizzy',now); return true;
  }
  resizeBy(amount: number, now: number): boolean {
    // Conta mudança efetiva; insistir no limite não equivale a encolher/crescer.
    if (!Number.isFinite(amount) || Math.abs(amount) < .00001) return false;
    this.resizes = this.resizes.filter(entry => now - entry.time < 4_000);
    this.resizes.push({ time: now, amount });
    let reversals = 0;
    for (let i=1;i<this.resizes.length;i++) if (Math.sign(this.resizes[i].amount) !== Math.sign(this.resizes[i-1].amount)) reversals++;
    const travel = this.resizes.reduce((sum,entry) => sum + Math.abs(entry.amount),0);
    if (reversals < 2 || travel < .35 || now - this.lastResizeReaction < 4_500) return false;
    this.resizes = []; this.lastResizeReaction = now; this.act('annoyed',now);
    this.message = 'Grande, pequeno, grande… Decida-se! Eu sou um homem de convicções, não uma sanfona!'; return true;
  }
  poke(now: number): void {
    if (this.state === 'sleep') { this.pokes = []; this.act('wave', now); this.message = 'Já acordei! Qual é a urgência nacional?'; return; }
    this.pokes = this.pokes.filter(time => now - time < 2_500);
    this.pokes.push(now);
    this.act(this.pokes.length >= 3 ? 'annoyed' : 'wave', now);
    if (this.pokes.length >= 3) this.pokes = [];
  }
  tick(now: number): boolean {
    if (now < this.until) return false;
    this.act('idle', now); return true;
  }
  reply(text: string, now: number): void {
    const normalized = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (/dorm|descans|silencio/.test(normalized)) this.act('sleep', now);
    else if (/pens|analise/.test(normalized)) this.act('think', now);
    else if (/oi|ola|bom dia/.test(normalized)) this.act('wave', now);
    else { this.act('speak', now); this.message = 'Por enquanto sou um protótipo com falas locais. A conexão com uma IA vem depois. Mas a presença de espírito já está pronta!'; }
  }
}
