import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wheelChange, normalizeAngle, FULL_TURN, MIN_SIZE, MAX_SIZE } from '../src/gestures.ts';
import { Behavior } from '../src/behavior.ts';
test('rodinha gira nos dois sentidos e atravessa voltas completas sem limitar a orientação',()=>{
  let angle=0;
  for(let i=0;i<40;i++) angle=wheelChange(angle,1,100,0,false,365).angle;
  assert.ok(Math.abs(angle-normalizeAngle(16))<1e-10);
  const backwards=wheelChange(0,1,-100,0,false,365);
  assert.ok(backwards.angle>Math.PI); assert.equal(backwards.size,1);
  assert.ok(Math.abs(normalizeAngle(-.1)-(FULL_TURN-.1))<1e-10);
});
test('Ctrl + rodinha aumenta/diminui sem girar, respeita limites e normaliza linhas/páginas',()=>{
  assert.ok(wheelChange(2,1,-100,0,true,365).size>1);
  assert.ok(wheelChange(2,1,100,0,true,365).size<1);
  assert.equal(wheelChange(2,1,100,0,true,365).angle,2);
  let size=1;
  for(let i=0;i<100;i++)size=wheelChange(0,size,-120,0,true,365).size;
  assert.equal(size,MAX_SIZE);
  for(let i=0;i<100;i++)size=wheelChange(0,size,120,0,true,365).size;
  assert.equal(size,MIN_SIZE);
  assert.equal(wheelChange(0,1,3,1,false,365).rotation,wheelChange(0,1,48,0,false,365).rotation);
  assert.equal(wheelChange(0,1,1,2,false,365).rotation,wheelChange(0,1,120,0,false,365).rotation);
  assert.equal(wheelChange(0,1,NaN,0,false,365).rotation,0);
});
test('dois giros rápidos provocam tontura que termina; passeio lento e pequenos giros não provocam',()=>{
  const b=new Behavior();
  assert.equal(b.spin(Math.PI*2,0),false); assert.equal(b.spin(Math.PI*2,100),true); assert.equal(b.state,'dizzy');
  assert.equal(b.spin(Math.PI*4,200),false); assert.equal(b.until,4100);
  b.tick(4100); assert.equal(b.state,'idle');
  const slow=new Behavior();slow.spin(Math.PI*2,0);assert.equal(slow.spin(Math.PI*2,5000),false);assert.equal(slow.state,'idle');
});
test('alternar tamanhos zanga, sem contar ruído, limites ou uma única mudança grande',()=>{
  const b=new Behavior();assert.equal(b.resizeBy(.4,0),false);assert.equal(b.resizeBy(0,10),false);
  assert.equal(b.resizeBy(-.2,100),false);assert.equal(b.resizeBy(.2,200),true);
  assert.equal(b.state,'annoyed'); assert.match(b.message,/sanfona/);
  assert.equal(b.resizeBy(-.3,300),false);assert.equal(b.until,4200);
  b.tick(4200); assert.equal(b.state,'idle');
  const slow=new Behavior();slow.resizeBy(.2,0);slow.resizeBy(-.2,5000);assert.equal(slow.resizeBy(.2,10000),false);
});
