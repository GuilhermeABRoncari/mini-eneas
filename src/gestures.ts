export const FULL_TURN = Math.PI * 2;
export const MIN_SIZE = .65;
export const MAX_SIZE = 1.25;
export function normalizeAngle(angle: number): number {
  return Number.isFinite(angle) ? ((angle % FULL_TURN) + FULL_TURN) % FULL_TURN : 0;
}
export function wheelChange(angle: number, size: number, deltaY: number, deltaMode: number, ctrl: boolean, height: number) {
  // deltaMode: pixels, linhas ou páginas. Limita picos sem depender da frequência de eventos.
  const pixels = Number.isFinite(deltaY) ? Math.max(-120,Math.min(120,deltaY * (deltaMode === 1 ? 16 : deltaMode === 2 ? height : 1))) : 0;
  if (ctrl) {
    const next = Math.max(MIN_SIZE,Math.min(MAX_SIZE,size * Math.exp(-pixels * .0015)));
    return { angle: normalizeAngle(angle), size: next, rotation: 0, resizing: next - size };
  }
  return { angle: normalizeAngle(angle + pixels * .004), size, rotation: pixels * .004, resizing: 0 };
}
