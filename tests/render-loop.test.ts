import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RenderLoop, frameInterval, type FrameHost } from '../src/render-loop.ts';
function fakeHost() {
  let now=0, next=0;
  const timers=new Map<number,{fn:()=>void,delay:number}>(), frames=new Map<number,(t:number)=>void>();
  const host:FrameHost={now:()=>now,timer:(fn,delay)=>{timers.set(++next,{fn,delay});return next;},clearTimer:id=>{timers.delete(id);},frame:fn=>{frames.set(++next,fn);return next;},cancelFrame:id=>{frames.delete(id);}};
  return {host,timers,frames,setTime:(t:number)=>{now=t;},frame:(t:number)=>{now=t;const entries=[...frames];frames.clear();entries.forEach(([,fn])=>fn(t));},timer:()=>{const entries=[...timers];timers.clear();entries.forEach(([,job])=>job.fn());}};
}
test('repouso e sono agendam menos trabalho; ação ganha o próximo frame sem esperar timer',()=>{
  const clock=fakeHost(), painted:number[]=[];
  const loop=new RenderLoop(clock.host,()=>frameInterval('sleep'),(t)=>painted.push(t));
  loop.resume(); clock.frame(16); assert.equal(painted.length,1); assert.equal(clock.frames.size,0);
  assert.ok([...clock.timers.values()][0].delay>200);
  loop.wake(); assert.equal(clock.timers.size,0); assert.equal(clock.frames.size,1);
  clock.frame(32); assert.deepEqual(painted,[16,32]);
  assert.ok(frameInterval('sleep')>frameInterval('idle')); assert.ok(frameInterval('idle')>frameInterval('wave'));
});
test('pausa remove timers/frames e volta sem avançar pelo tempo em segundo plano',()=>{
  const clock=fakeHost(), deltas:number[]=[];
  const loop=new RenderLoop(clock.host,()=>30,(_t,dt)=>deltas.push(dt));
  loop.resume(); clock.frame(16); loop.pause();
  assert.equal(clock.frames.size+clock.timers.size,0); loop.wake(); assert.equal(clock.frames.size,0);
  clock.setTime(10000); loop.resume(); clock.frame(10016); assert.deepEqual(deltas,[.016,.016]);
  loop.pause(); assert.equal(clock.frames.size+clock.timers.size,0);
});
test('um frame lento avança a animação no tempo real e não acumula agendamentos',()=>{
  const clock=fakeHost(), deltas:number[]=[];
  const loop=new RenderLoop(clock.host,()=>33,(_t,dt)=>deltas.push(dt));
  loop.resume(); loop.wake(); loop.wake(); assert.equal(clock.frames.size,1);
  clock.frame(250); assert.equal(deltas[0],.25);
  clock.timer(); clock.frame(500); assert.equal(deltas[1],.25); assert.equal(clock.timers.size,1);
});
test('timer antecipado não ultrapassa a taxa de quadros configurada',()=>{
  const clock=fakeHost(), painted:number[]=[];
  const loop=new RenderLoop(clock.host,()=>250,t=>painted.push(t));
  loop.resume(); clock.frame(16); clock.setTime(250); clock.timer(); clock.frame(250);
  assert.deepEqual(painted,[16]); assert.equal(clock.frames.size,1);
  clock.frame(266); assert.deepEqual(painted,[16,266]);
});
