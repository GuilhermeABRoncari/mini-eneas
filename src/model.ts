import * as T from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

/** Modelo original procedural. Articulação por objetos; não é um rig humanoide. */
export function createAvatar({ exportMaterials = false } = {}) {
  const root = new T.Group(); root.name = 'MiniEneas';
  const material = (color: string, roughness: number) => exportMaterials
    ? new T.MeshStandardMaterial({ color, roughness })
    : new T.MeshLambertMaterial({ color });
  const materials = {
    skin: material('#dca77f', .83),
    suit: material('#243a3d', .9),
    lapel: material('#344b4d', .88),
    white: material('#f4ead6', .8),
    tie: material('#ac4934', .7),
    beard: material('#343b3a', .97),
    hair: material('#565c55', .96),
    black: material('#151d1f', .56),
    eye: material('#111b1c', .27),
  };
  type MaterialName = keyof typeof materials;
  let meshCount = 0;
  function mesh(parent: T.Object3D, geometry: T.BufferGeometry, material: MaterialName, pos: [number, number, number], scale: [number, number, number] = [1, 1, 1]) {
    const object = new T.Mesh(geometry, materials[material]); object.position.set(...pos); object.scale.set(...scale);
    object.name = 'Part' + ++meshCount; parent.add(object); return object;
  }
  const sphere = new T.SphereGeometry(1, 16, 12);
  const ball = (parent: T.Object3D, material: MaterialName, pos: [number, number, number], scale: [number, number, number]) => mesh(parent, sphere, material, pos, scale);
  const box = (parent: T.Object3D, material: MaterialName, pos: [number, number, number], size: [number, number, number], radius = .06, segments = 1) => mesh(parent, new RoundedBoxGeometry(...size, segments, radius), material, pos);
  const body = new T.Group(); body.name = 'Body'; root.add(body);
  for (const sign of [-1, 1]) {
    box(body, 'suit', [sign * .19, .39, 0], [.27, .48, .3]);
    box(body, 'black', [sign * .19, .14, .08], [.32, .21, .47]);
  }
  box(body, 'suit', [0, .94, 0], [.77, .81, .43], .12, 2);
  box(body, 'white', [0, 1.12, .228], [.31, .46, .027], .01);
  const tie = box(body, 'tie', [0, 1.075, .252], [.095, .3, .032], .015); tie.rotation.z = -.035;
  for (const sign of [-1, 1]) {
    const lapel = box(body, 'lapel', [sign * .2, 1.13, .23], [.16, .4, .035], .02); lapel.rotation.z = sign * -.36;
    ball(body, 'black', [sign * .1, .82, .234], [.025, .025, .012]);
  }
  ball(body, 'skin', [0, 1.38, 0], [.17, .2, .17]);
  const arms: T.Group[] = [];
  for (const sign of [-1, 1]) {
    const arm = new T.Group(); arm.name = sign < 0 ? 'LeftArm' : 'RightArm'; arm.position.set(sign * .43, 1.25, 0); body.add(arm); arms.push(arm);
    box(arm, 'suit', [sign * .035, -.25, 0], [.25, .57, .29], .09);
    box(arm, 'white', [sign * .035, -.51, .01], [.21, .07, .25], .02);
    ball(arm, 'skin', [sign * .035, -.61, .035], [.135, .15, .14]);
    ball(arm, 'skin', [sign * -.065, -.56, .12], [.055, .08, .06]);
  }
  const head = new T.Group(); head.name = 'Head'; head.position.set(0, 1.94, .025); body.add(head);
  box(head, 'skin', [0, .12, 0], [1.43, 1.24, 1.03], .3, 3);
  for (const sign of [-1, 1]) {
    ball(head, 'skin', [sign * .74, .05, .015], [.12, .19, .14]);
    ball(head, 'tie', [sign * .79, .05, .075], [.028, .085, .035]);
    // Têmporas discretas deixam o topo calvo visível.
    ball(head, 'hair', [sign * .665, -.03, -.09], [.09, .34, .32]);
  }
  // Barba volumosa, com volumes arredondados em vez de textura externa.
  ball(head, 'beard', [0, -.35, .34], [.62, .4, .36]);
  for (let i = 0; i < 9; i++) {
    const x = (i - 4) * .13;
    ball(head, i % 3 === 0 ? 'hair' : 'beard', [x, -.37 - .17 * (1 - Math.abs(x) / .65), .49 - .13 * Math.abs(x)], [.115, .17, .15]);
  }
  const mouth = ball(head, 'black', [0, -.28, .705], [.105, .024, .018]); mouth.name = 'Mouth';
  for (const sign of [-1, 1]) {
    const moustache = ball(head, 'beard', [sign * .115, -.18, .665], [.19, .075, .09]); moustache.rotation.z = sign * -.2;
  }
  ball(head, 'skin', [0, -.045, .6], [.125, .16, .145]);
  const eyes: T.Mesh[] = []; const brows: T.Group[] = [];
  function rim(cx: number) {
    const points: T.Vector3[] = [];
    const w = .255, h = .205, r = .085;
    for (const [x, y, start] of [[w-r, h-r, 0], [-w+r, h-r, Math.PI/2], [-w+r, -h+r, Math.PI], [w-r, -h+r, Math.PI*1.5]]) {
      for (let i = 0; i <= 7; i++) { const a = start + i / 7 * Math.PI / 2; points.push(new T.Vector3(cx + x + Math.cos(a)*r, .13+y+Math.sin(a)*r, .57)); }
    }
    mesh(head, new T.TubeGeometry(new T.CatmullRomCurve3(points, true), 40, .031, 6, true), 'black', [0,0,0]);
  }
  for (const sign of [-1, 1]) {
    rim(sign * .325);
    const eye = ball(head, 'eye', [sign * .325, .11, .535], [.082, .103, .035]); eyes.push(eye);
    ball(eye, 'white', [-.28, .32, .85], [.18, .14, .23]);
    const brow = new T.Group(); brow.position.set(sign * .325, .405, .49); head.add(brow); brows.push(brow);
    const browMesh = box(brow, 'beard', [0, 0, 0], [.32, .065, .06], .025); browMesh.rotation.z = sign * .07;
    box(head, 'black', [sign * .61, .17, .3], [.045, .06, .46], .02);
  }
  box(head, 'black', [0, .15, .59], [.14, .05, .045], .02);
  // Une só peças rígidas do mesmo material e da mesma articulação.
  // Olhos, boca, sobrancelhas e pivôs continuam independentes.
  const before = new Set<T.BufferGeometry>();
  root.traverse(object => { if (object instanceof T.Mesh) before.add(object.geometry); });
  const dynamic = new Set<T.Object3D>([mouth, ...eyes]);
  for (const parent of [body, head, ...arms]) {
    const buckets = new Map<T.Material, T.Mesh[]>();
    for (const object of parent.children) {
      if (!(object instanceof T.Mesh) || dynamic.has(object) || object.children.length || Array.isArray(object.material)) continue;
      const items = buckets.get(object.material) ?? []; items.push(object); buckets.set(object.material,items);
    }
    for (const [mat, objects] of buckets) {
      if (objects.length < 2) continue;
      const parts = objects.map(object => {
        object.updateMatrix(); const source = object.geometry;
        const part = source.index ? source.toNonIndexed() : source.clone();
        part.applyMatrix4(object.matrix); return part;
      });
      const geometry = mergeGeometries(parts);
      parts.forEach(part => part.dispose());
      if (!geometry) throw new Error('Não foi possível agrupar as peças do modelo.');
      // Reindexa após a união para não manter três cópias de cada vértice.
      const indexed = mergeVertices(geometry); geometry.dispose();
      const combined = new T.Mesh(indexed,mat); combined.name = parent.name + '_Batch_' + mat.uuid;
      objects.forEach(object => parent.remove(object)); parent.add(combined);
    }
  }
  const used = new Set<T.BufferGeometry>();
  root.traverse(object => { if (object instanceof T.Mesh) used.add(object.geometry); });
  before.forEach(geometry => { if (!used.has(geometry)) geometry.dispose(); });
  return { root, body, head, arms, eyes, brows, mouth, materials };
}
export type Avatar = ReturnType<typeof createAvatar>;

function rotationTrack(name: string, times: number[], poses: [number, number, number][]) {
  const values = poses.flatMap(p => new T.Quaternion().setFromEuler(new T.Euler(...p)).toArray());
  return new T.QuaternionKeyframeTrack(name + '.quaternion', times, values);
}
export function createClips() {
  const neutral: [number,number,number] = [0,0,0];
  return [
    new T.AnimationClip('Acenar', 2.4, [rotationTrack('RightArm', [0,.4,.8,1.2,1.6,2,2.4], [neutral,[0,0,2.4],[0,.25,2.05],[0,-.25,2.5],[0,.25,2.05],[0,0,2.4],neutral])]),
    new T.AnimationClip('Pensar', 3.2, [rotationTrack('Head', [0,.8,2.4,3.2], [neutral,[.03,-.18,.12],[.03,-.18,.12],neutral]), rotationTrack('LeftArm', [0,.8,2.4,3.2], [neutral,[-1,0,-.6],[-1,0,-.6],neutral])]),
    new T.AnimationClip('Reclamar', 4, [rotationTrack('Head', [0,.5,1,1.5,2,3.3,4], [neutral,[0,-.16,-.04],[0,.16,-.04],[0,-.16,-.04],[0,.16,-.04],[0,0,-.08],neutral]),rotationTrack('RightArm',[0,.5,3.3,4],[neutral,[-.45,0,1.05],[-.45,0,1.05],neutral]),rotationTrack('LeftArm',[0,.5,3.3,4],[neutral,[-.45,0,-1.05],[-.45,0,-1.05],neutral])]),
    new T.AnimationClip('Dormir', 4, [rotationTrack('Head', [0,1,3,4], [[.2,0,.1],[.26,0,.13],[.2,0,.1],[.2,0,.1]])]),
    new T.AnimationClip('Falar', 3.2, [rotationTrack('RightArm',[0,.6,1.2,1.8,2.5,3.2],[neutral,[-.7,0,.7],[-.4,.2,.45],[-.8,0,.8],[-.5,0,.5],neutral])]),
  ];
}
