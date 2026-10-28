import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Behavior } from '../src/behavior.ts';
import { createAvatar, createClips } from '../src/model.ts';
import * as T from 'three';

test('três cutucadas próximas irritam; cutucadas antigas expiram',()=>{
  const b=new Behavior(); b.poke(0); assert.equal(b.state,'wave'); b.poke(300); b.poke(800); assert.equal(b.state,'annoyed');
  b.tick(4801); assert.equal(b.state,'idle'); b.poke(6000); b.poke(9000); b.poke(12000); assert.equal(b.state,'wave');
});
test('sono persiste, acorda com uma cutucada e não acumula cutucadas antigas',()=>{
  const b=new Behavior(); b.poke(0); b.poke(1); b.act('sleep',10); assert.equal(b.tick(1e9),false);
  b.poke(20); assert.equal(b.state,'wave'); assert.match(b.message,/acordei/); b.poke(30); assert.equal(b.state,'wave');
});
test('reação termina no prazo e o modo demonstração não afirma ter IA',()=>{
  const b=new Behavior(); b.act('think',100); assert.equal(b.tick(3299),false); assert.equal(b.tick(3300),true);
  b.reply('Quem descobriu o Brasil?',4000); assert.equal(b.state,'speak'); assert.match(b.message,/sem IA|conexão com uma IA/);
  b.reply('dormir',5000); assert.equal(b.state,'sleep'); b.reply('Olá',6000); assert.equal(b.state,'wave');
});
test('modelo e clipes possuem alvos válidos, limites finitos e movimentos reais',()=>{
  const avatar=createAvatar(), clips=createClips(), mixer=new T.AnimationMixer(avatar.root);
  assert.equal(clips.length,5); assert.equal(new Set(clips.map(c=>c.name)).size,5);
  for (const clip of clips) {
    assert.equal(clip.validate(),true);
    for(const track of clip.tracks) assert.ok(avatar.root.getObjectByName(track.name.split('.')[0]));
  }
  const box=new T.Box3().setFromObject(avatar.root), size=box.getSize(new T.Vector3());
  assert.ok(size.y>2.5&&size.y<3.5); assert.ok(size.x>1.3&&size.x<2);
  const action=mixer.clipAction(clips[0]).play(); mixer.update(.6);
  assert.ok(Math.abs(avatar.arms[1].rotation.z)>1); action.stop();
  avatar.root.traverse(object=>assert.ok(object.matrixWorld.elements.every(Number.isFinite)));
});

test('agrupamento mantém olhos, boca e sobrancelhas independentes e respeita orçamento de geometria',()=>{
  const avatar=createAvatar(); let draws=0,triangles=0;
  avatar.root.traverse(object=>{if(object instanceof T.Mesh){draws++;triangles+=(object.geometry.index?.count??object.geometry.attributes.position.count)/3;}});
  assert.ok(draws<=25,`Peças: ${draws}`); assert.ok(triangles<16000,`Triângulos: ${triangles}`);
  for(const object of [avatar.mouth,...avatar.eyes,...avatar.brows]) assert.ok(avatar.root.getObjectById(object.id));
  const previous=new T.Box3().setFromObject(avatar.root);
  avatar.head.rotation.y=.4; const current=new T.Box3().setFromObject(avatar.root);
  assert.equal(previous.equals(current),false);
  const exported=createAvatar({exportMaterials:true});
  exported.root.traverse(object=>{if(object instanceof T.Mesh)assert.ok(object.material instanceof T.MeshStandardMaterial);});
});
