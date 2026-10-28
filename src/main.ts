import * as T from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { createAvatar, createClips } from './model.ts';
import { Behavior, labels, states, type State } from './behavior.ts';
import { RenderLoop, frameInterval } from './render-loop.ts';
import { normalizeAngle, wheelChange, MIN_SIZE, MAX_SIZE } from './gestures.ts';
import { initializeChat } from './chat-ui.ts';
import type { AiBridge } from './ai/contracts.ts';

declare global { interface Window {
  desktop?: { hide(): void; quit(): void; panel(open: boolean): void };
  eneasAi?: AiBridge;
  prototype3d?: { sample(state: State, time?: number): void; resume(): void; stats(): object; exportModel(): Promise<number[]> };
} }
const $ = <E extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as E;
const studio = new URLSearchParams(location.search).has('studio');
document.body.classList.toggle('studio', studio);
const viewport = $('viewport');
const behavior = new Behavior();
const avatar = createAvatar();
const clips = createClips();
const scene = new T.Scene(); scene.add(avatar.root);
const camera = new T.PerspectiveCamera(30, 1, .1, 50); camera.position.set(2.4, 2.5, 6); camera.lookAt(0, 1.38, 0);
const ambient = new T.HemisphereLight('#fff5df', '#8b9c91', 2.7); scene.add(ambient);
const key = new T.DirectionalLight('#fff1da', 4.2); key.position.set(-3, 5, 6); scene.add(key);
const rim = new T.DirectionalLight('#c5e9dc', 2.4); rim.position.set(4, 3, -3); scene.add(rim);
const floor = new T.Mesh(new T.CircleGeometry(.95, 64), new T.MeshBasicMaterial({ color: '#455f50', transparent: true, opacity: .1, depthWrite: false }));
floor.rotation.x = -Math.PI / 2; floor.position.y = .025; floor.scale.y = .65; scene.add(floor);
const mixer = new T.AnimationMixer(avatar.root);
const clipFor: Partial<Record<State,string>> = { wave: 'Acenar', think: 'Pensar', annoyed: 'Reclamar', sleep: 'Dormir', speak: 'Falar' };
let action: T.AnimationAction | undefined, renderer: T.WebGLRenderer | undefined, frozen = false;
let previousState: State | undefined, frame = 0, angle = 0, size = 1, quiet = false;
let elapsed = 0;
let chatPhase:'thinking'|'delta'|undefined,chatExcerpt='';
const look = new T.Vector2(); const raycaster = new T.Raycaster();
try {
  renderer = new T.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1)); renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  viewport.append(renderer.domElement);
  renderer.domElement.addEventListener('webglcontextlost', event => { event.preventDefault(); $('render-error').hidden = false; $('render-error').textContent = 'A renderização foi interrompida. Reabra o protótipo para recuperar o personagem.'; });
} catch {
  $('render-error').hidden = false; $('render-error').textContent = 'Não foi possível iniciar o 3D. Este protótipo precisa de WebGL disponível no sistema.';
}
function resize() {
  const w = viewport.clientWidth, h = viewport.clientHeight;
  renderer?.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix();
  renderLoop.wake();
}

function renderStatus() {
  $('status').textContent = labels[behavior.state]; $('speech').textContent = behavior.message;
  document.body.classList.toggle('sleeping', behavior.state === 'sleep');
  document.body.classList.toggle('dizzy', behavior.state === 'dizzy');
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-action]')) button.setAttribute('aria-pressed', String(button.dataset.action === behavior.state));
}
function transition(state: State) {
  action?.stop(); avatar.head.rotation.set(0,0,0); avatar.arms.forEach(arm => arm.rotation.set(0,0,0));
  avatar.body.rotation.z = 0;
  const clip = clips.find(c => c.name === clipFor[state]);
  action = clip ? mixer.clipAction(clip) : undefined;
  if (action) { action.reset().setLoop(state === 'sleep' ? T.LoopRepeat : T.LoopOnce, state === 'sleep' ? Infinity : 1); action.clampWhenFinished = true; action.play(); }
  previousState = state;
}
function act(state: State) { behavior.act(state, performance.now()); previousState = undefined; renderStatus(); renderLoop.wake(); }
function poke() { behavior.poke(performance.now()); previousState = undefined; renderStatus(); renderLoop.wake(); }
function paint(time: number, dt: number) {
  if (previousState !== behavior.state) transition(behavior.state);
  mixer.update(dt);
  avatar.root.rotation.y = angle;
  avatar.root.scale.setScalar(size);
  avatar.root.position.y = (1-size) * 1.38;
  floor.position.y = .025 + avatar.root.position.y; floor.scale.set(size,size * .65,1);
  avatar.body.position.y = Math.sin(time * (behavior.state === 'sleep' ? 1.5 : 2)) * .012;
  if (behavior.state === 'idle') { avatar.head.rotation.y = look.x * .13; avatar.head.rotation.x = -look.y * .08; }
  if (behavior.state === 'dizzy') {
    avatar.head.rotation.set(Math.sin(time*4)*.1,Math.sin(time*3)*.18,Math.sin(time*5)*.16);
    avatar.body.rotation.z = Math.sin(time*3)*.055;
  }
  const blink = behavior.state === 'sleep' ? .08 : behavior.state === 'dizzy' ? .5 + Math.sin(time*6)*.25 : Math.sin(time * 1.3) > .992 ? .1 : 1;
  avatar.eyes.forEach(eye => { eye.scale.y = .103 * blink; });
  avatar.brows.forEach((brow, i) => { brow.rotation.z = behavior.state === 'annoyed' ? (i === 0 ? -.25 : .25) : 0; });
  avatar.mouth.scale.y = .024 * (behavior.state === 'speak' ? 1 + Math.abs(Math.sin(time*12))*2 : 1);
  renderer?.render(scene,camera); frame++;
}
const renderLoop = new RenderLoop({
  now: () => performance.now(), timer: (fn, delay) => window.setTimeout(fn,delay), clearTimer: id => clearTimeout(id),
  frame: fn => requestAnimationFrame(fn), cancelFrame: id => cancelAnimationFrame(id),
}, () => frameInterval(behavior.state), (now, dt) => {
  elapsed += dt;
  if (behavior.tick(now)) {
    if(chatPhase){behavior.act(chatPhase==='thinking'?'think':'speak',now);behavior.until=Infinity;if(chatExcerpt)behavior.message=chatExcerpt;}
    renderStatus();
  }
  paint(elapsed, dt);
});
document.addEventListener('visibilitychange', () => { if (document.hidden) renderLoop.pause(); else if (!frozen) renderLoop.resume(); });
new ResizeObserver(resize).observe(viewport); resize();
if (!document.hidden) renderLoop.resume();
viewport.addEventListener('pointermove', event => {
  const bounds = viewport.getBoundingClientRect(); look.set((event.clientX-bounds.left)/bounds.width*2-1,-((event.clientY-bounds.top)/bounds.height)*2+1);
  if (behavior.state === 'idle') renderLoop.wake();
});
viewport.addEventListener('pointerleave', () => { look.set(0,0); renderLoop.wake(); });
viewport.addEventListener('click', event => {
  const r = viewport.getBoundingClientRect();
  raycaster.setFromCamera(new T.Vector2((event.clientX-r.left)/r.width*2-1,-(event.clientY-r.top)/r.height*2+1),camera);
  if (raycaster.intersectObject(avatar.root,true).length) poke();
});
viewport.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); poke(); } });
viewport.addEventListener('wheel',event => {
  event.preventDefault();
  const next = wheelChange(angle,size,event.deltaY,event.deltaMode,event.ctrlKey,viewport.clientHeight);
  angle = next.angle; size = next.size;
  const now = performance.now();
  if (event.ctrlKey ? behavior.resizeBy(next.resizing,now) : behavior.spin(next.rotation,now)) { previousState = undefined; renderStatus(); }
  syncPreferences(); schedulePreferences(); renderLoop.wake();
}, { passive: false });
$('poke').addEventListener('click', poke);
for (const button of document.querySelectorAll<HTMLButtonElement>('[data-action]')) button.addEventListener('click', () => { const state = button.dataset.action as State; if (states.includes(state)) act(state); });

function savePreferences() { try { localStorage.setItem('mini-eneas-preferences-v1', JSON.stringify({ angle, size, quiet })); } catch { /* O protótipo continua utilizável sem persistência. */ } }
let preferencesTimer: number | undefined;
function schedulePreferences() { clearTimeout(preferencesTimer); preferencesTimer = window.setTimeout(savePreferences,150); }
window.addEventListener('pagehide', () => { clearTimeout(preferencesTimer); savePreferences(); });
try {
  const prefs = JSON.parse(localStorage.getItem('mini-eneas-preferences-v1') ?? '{}');
  if (Number.isFinite(prefs.angle)) angle = normalizeAngle(prefs.angle);
  if (Number.isFinite(prefs.size)) size = T.MathUtils.clamp(prefs.size,MIN_SIZE,MAX_SIZE);
  quiet = prefs.quiet === true;
} catch { /* Preferências inválidas não impedem a inicialização. */ }
function syncPreferences() {
  $('angle-value').textContent = Math.round(angle*180/Math.PI) + '°'; ($('angle') as HTMLInputElement).value = String(Math.round(angle*180/Math.PI));
  $('size-value').textContent = Math.round(size*100) + '%'; ($('size') as HTMLInputElement).value = String(Math.round(size*100));
  ($('quiet') as HTMLInputElement).checked = quiet; document.body.classList.toggle('quiet',quiet);
}
$('angle').addEventListener('input', event => { angle = normalizeAngle(Number((event.target as HTMLInputElement).value)*Math.PI/180); syncPreferences(); savePreferences(); renderLoop.wake(); });
$('size').addEventListener('input', event => { size = Number((event.target as HTMLInputElement).value)/100; syncPreferences(); savePreferences(); renderLoop.wake(); });
$('quiet').addEventListener('change', event => { quiet = (event.target as HTMLInputElement).checked; if (quiet) act('sleep'); else act('idle'); syncPreferences(); savePreferences(); });
syncPreferences(); if (quiet) behavior.act('sleep',performance.now()); renderStatus();
const inspector = $('inspector'); inspector.hidden = !studio;
$('panel-toggle').addEventListener('click', () => { inspector.hidden = !inspector.hidden; $('panel-toggle').setAttribute('aria-expanded',String(!inspector.hidden)); window.desktop?.panel(!inspector.hidden); });
$('hide').addEventListener('click', () => { if (window.desktop) window.desktop.hide(); else $('speech').textContent = 'Esconder está disponível ao abrir pelo aplicativo desktop.'; });
$('close').addEventListener('click', () => { if (window.desktop) window.desktop.quit(); else $('speech').textContent = 'Esta é uma prévia. Feche a aba para encerrar.'; });
initializeChat(window.eneasAi,{
  demo(text){behavior.reply(text,performance.now());previousState=undefined;renderStatus();renderLoop.wake();return behavior.message;},
  phase(phase,text){
    const excerpt=text.length>240?text.slice(0,237)+'…':text;
    if(phase==='thinking'){chatPhase='thinking';chatExcerpt='';act('think');behavior.until=Infinity;}
    else if(phase==='delta'){
      const first=chatPhase!=='delta';chatPhase='delta';chatExcerpt=excerpt;
      if(first&&!['dizzy','annoyed'].includes(behavior.state)){act('speak');behavior.until=Infinity;}
      if(behavior.state==='speak'){behavior.message=excerpt;renderStatus();}
    }else{
      chatPhase=undefined;chatExcerpt='';
      if(!['dizzy','annoyed'].includes(behavior.state)){act(phase==='done'?'speak':'idle');if(phase==='done'){behavior.message=excerpt;renderStatus();}}
    }
    renderLoop.wake();
  },
});
async function exportModel(): Promise<number[]> {
  // Exporta pose neutra isolada da animação que está sendo exibida.
  const model = createAvatar({ exportMaterials: true }); const exporter = new GLTFExporter();
  try { const buffer = await exporter.parseAsync(model.root,{ binary:true, animations:createClips() }); return Array.from(new Uint8Array(buffer as ArrayBuffer)); }
  finally { const geometries = new Set<T.BufferGeometry>(); model.root.traverse(o => { if (o instanceof T.Mesh) geometries.add(o.geometry); }); geometries.forEach(g => g.dispose()); Object.values(model.materials).forEach(m => m.dispose()); }
}
$('export').addEventListener('click', async () => {
  const button = $('export') as HTMLButtonElement; button.disabled = true;
  try { const data = await exportModel(); const url = URL.createObjectURL(new Blob([new Uint8Array(data)],{type:'model/gltf-binary'})); const link = document.createElement('a'); link.href=url; link.download='mini-eneas-prototipo.glb'; link.click(); setTimeout(()=>URL.revokeObjectURL(url),1000); button.textContent='✓ Modelo exportado'; }
  catch { button.textContent='Falha ao exportar. Tente novamente.'; } finally { button.disabled=false; }
});
// Inspeção da prévia em testes headless; nenhuma API nativa ou credencial exposta.
window.prototype3d = {
  sample(state,time=1) { frozen=true; renderLoop.pause(); behavior.act(state,performance.now()); transition(state); paint(time,time); renderStatus(); },
  resume() { frozen=false; if (!document.hidden) renderLoop.resume(); },
  stats() { return { renderer: !!renderer, frames: frame, state: behavior.state, angle, size, triangles: renderer?.info.render.triangles, calls: renderer?.info.render.calls, pixelRatio: renderer?.getPixelRatio(), targetFps: 1000/frameInterval(behavior.state), clips:clips.map(c=>c.name) }; },
  exportModel,
};
