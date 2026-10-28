// Chromium é iniciado exclusivamente em modo headless, com displays vazios.
import { chromium } from 'playwright-core';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';
import path from 'node:path';
const root=process.cwd(), assets=path.join(root,'dist'), output=path.join(root,'previews');
await mkdir(output,{recursive:true});
const server=createServer(async(req,res)=>{
  try {
    const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    const base=name.startsWith('/previews/')?root:assets;
    const file=path.resolve(base,'.'+(name==='/'?'/index.html':name));
    if(!file.startsWith(base+path.sep)){res.writeHead(403).end();return;}
    const bytes=await readFile(file);
    res.writeHead(200,{'content-type':({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png'})[path.extname(file)]??'application/octet-stream'}).end(bytes);
  } catch {res.writeHead(404).end();}
});
let browser;
try {
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const base=`http://127.0.0.1:${server.address().port}`;
  browser=await chromium.launch({executablePath:process.env.CHROME_PATH??'/usr/bin/google-chrome',headless:true,
    args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader'],env:{...process.env,DISPLAY:'',WAYLAND_DISPLAY:''}});
  const page=await browser.newPage({viewport:{width:1180,height:1030},deviceScaleFactor:1});
  const errors=[]; page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base+'/?studio=1');
  await page.waitForFunction(()=>window.prototype3d?.stats().frames>2);
  assert.equal(await page.locator('#render-error').isVisible(),false);
  const stats=await page.evaluate(()=>window.prototype3d.stats());
  assert.ok(stats.triangles>1000&&stats.triangles<16000); assert.ok(stats.calls<=25); assert.equal(stats.clips.length,5);
  assert.ok(stats.pixelRatio<=1);
  assert.equal(await page.evaluate(()=>document.querySelector('canvas').getContext('webgl2').getContextAttributes().preserveDrawingBuffer),false);
  await page.getByRole('button',{name:'👉 Cutucar',exact:true}).click({clickCount:3,delay:70});
  await page.getByText('Ora, tenha modos!',{exact:true}).waitFor();
  await page.getByRole('button',{name:'💤 Dormir',exact:true}).click();
  assert.equal(await page.locator('body').evaluate(el=>el.classList.contains('sleeping')),true);
  await page.locator('#viewport').press('Enter');
  await page.getByText('Já acordei! Qual é a urgência nacional?',{exact:true}).waitFor();
  // Interação no próprio modelo por raycast, além dos botões acessíveis.
  await page.locator('#viewport').click({position:{x:245,y:160}});
  await page.getByRole('button',{name:'💭 Pensar',exact:true}).click();
  await page.getByText('Um momento de reflexão',{exact:true}).waitFor();
  await page.locator('#message').fill('<img src=x onerror=alert(1)>');
  await page.getByRole('button',{name:'Enviar mensagem',exact:true}).click();
  assert.match(await page.locator('#chat-log').innerText(),/protótipo com falas locais/);
  assert.equal(await page.locator('#chat-log img').count(),0);
  await page.locator('#angle').fill('25'); await page.locator('#size').fill('105');
  await page.reload(); await page.waitForFunction(()=>window.prototype3d?.stats().frames>1);
  assert.equal(await page.locator('#angle').inputValue(),'25'); assert.equal(await page.locator('#size').inputValue(),'105');
  await page.locator('#quiet').check(); await page.reload();
  await page.waitForFunction(()=>window.prototype3d?.stats().frames>1);
  assert.equal(await page.locator('#quiet').isChecked(),true);
  assert.equal(await page.evaluate(()=>window.prototype3d.stats().state),'sleep');
  await page.locator('#quiet').uncheck(); await page.locator('#angle').fill('0'); await page.locator('#size').fill('100');
  const bounds=await page.locator('#viewport').boundingBox();
  await page.mouse.move(bounds.x+bounds.width/2,bounds.y+bounds.height/2);
  await page.mouse.wheel(0,100);
  await page.waitForFunction(()=>window.prototype3d.stats().angle>.1);
  assert.equal(await page.locator('#size').inputValue(),'100');
  const beforeZoom=await page.evaluate(()=>({angle:window.prototype3d.stats().angle,dpr:devicePixelRatio,scale:visualViewport.scale}));
  await page.keyboard.down('Control');
  try {await page.mouse.wheel(0,-100);await page.waitForFunction(()=>window.prototype3d.stats().size>1);} finally {await page.keyboard.up('Control');}
  const afterZoom=await page.evaluate(()=>({angle:window.prototype3d.stats().angle,dpr:devicePixelRatio,scale:visualViewport.scale}));
  assert.deepEqual(afterZoom,beforeZoom,'Ctrl+wheel deve ampliar só o personagem');
  const handled=await page.locator('#viewport').evaluate(el=>{
    let prevented=true;
    for(let i=0;i<40;i++) prevented= !el.dispatchEvent(new WheelEvent('wheel',{deltaY:100,bubbles:true,cancelable:true}))&&prevented;
    return prevented;
  });
  assert.equal(handled,true);
  await page.getByText('Tonto de tanto girar!',{exact:true}).waitFor();
  assert.equal(await page.locator('.dizzy-mark').isVisible(),true);
  await page.locator('#viewport').evaluate(el=>{
    for(let i=0;i<8;i++)el.dispatchEvent(new WheelEvent('wheel',{deltaY:i%2?100:-100,ctrlKey:true,bubbles:true,cancelable:true}));
  });
  assert.match(await page.locator('#speech').innerText(),/sanfona/);
  await page.waitForFunction(()=>window.prototype3d.stats().state==='idle',null,{timeout:6500});
  const savedAngle=await page.evaluate(()=>window.prototype3d.stats().angle);
  assert.equal(await page.locator('#chat-log').evaluate(el=>el.dispatchEvent(new WheelEvent('wheel',{deltaY:100,bubbles:true,cancelable:true}))),true);
  assert.equal(await page.evaluate(()=>window.prototype3d.stats().angle),savedAngle);
  await page.waitForTimeout(200); await page.reload();await page.waitForFunction(()=>window.prototype3d?.stats().frames>1);
  assert.ok(Math.abs(await page.evaluate(()=>window.prototype3d.stats().angle)-savedAngle)<1e-10,'Orientação completa deve persistir');
  await page.locator('#angle').fill('0');await page.locator('#size').fill('100');
  await page.getByRole('button',{name:'◎ Observar',exact:true}).click();
  const idleStart=await page.evaluate(()=>window.prototype3d.stats().frames);
  await page.waitForTimeout(1200);
  const idleFrames=await page.evaluate(start=>window.prototype3d.stats().frames-start,idleStart);
  assert.ok(idleFrames>=2&&idleFrames<=20,`Frames em repouso: ${idleFrames}`);
  await page.getByRole('button',{name:'💤 Dormir',exact:true}).click();
  const sleepStart=await page.evaluate(()=>window.prototype3d.stats().frames);
  await page.waitForTimeout(1200);
  const sleepFrames=await page.evaluate(start=>window.prototype3d.stats().frames-start,sleepStart);
  assert.ok(sleepFrames>=1&&sleepFrames<=8,`Frames dormindo: ${sleepFrames}`);
  const variants=[['idle','Observando'],['wave','Acenando'],['think','Pensando'],['annoyed','Reclamando'],['speak','Falando'],['sleep','Dormindo'],['dizzy','Tonto de tanto girar']];
  for(const [state] of variants){
    await page.evaluate(state=>window.prototype3d.sample(state,1),state);
    await page.locator('#viewport').screenshot({path:path.join(output,state+'.png'),omitBackground:true});
  }
  await page.evaluate(()=>window.prototype3d.sample('idle',1));
  await page.mouse.move(0,0);
  await page.screenshot({path:path.join(output,'mini-eneas-estudio.png'),fullPage:true});
  const bytes=await page.evaluate(()=>window.prototype3d.exportModel());
  const model=Buffer.from(bytes); assert.equal(model.toString('ascii',0,4),'glTF');
  assert.equal(model.readUInt32LE(4),2); assert.equal(model.readUInt32LE(8),model.length);
  const parsed=await new GLTFLoader().parseAsync(model.buffer.slice(model.byteOffset,model.byteOffset+model.byteLength),'');
  assert.equal(parsed.animations.length,5); assert.ok(parsed.scene.getObjectByName('Head'));
  await writeFile(path.join(output,'mini-eneas-prototipo.glb'),model);
  // Prévia compacta corresponde ao layout desktop, sem iniciar Electron.
  await page.setViewportSize({width:420,height:650}); await page.goto(base);
  await page.waitForFunction(()=>window.prototype3d?.stats().frames>1);
  assert.equal(await page.locator('#inspector').isVisible(),false);
  await page.locator('#panel-toggle').click(); assert.equal(await page.locator('#inspector').isVisible(),true);
  await page.locator('#panel-toggle').click(); await page.evaluate(()=>window.prototype3d.sample('wave',.8));
  await page.screenshot({path:path.join(output,'mini-eneas-desktop.png'),omitBackground:true});
  assert.deepEqual(errors,[]);
  const sheet=await browser.newPage({viewport:{width:1200,height:1050}});
  await sheet.setContent(`<html lang="pt-BR"><meta charset="utf-8"><style>body{margin:0;background:#eeeee3;color:#29443e;font-family:system-ui;padding:35px}small{letter-spacing:3px;color:#718471}h1{font:45px Georgia;margin:12px 0}p{color:#718471;margin-bottom:26px}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}.card{background:#faf7ed;border:1px solid #d9dfcf;border-radius:22px;text-align:center;overflow:hidden}.card img{width:100%;height:310px;object-fit:contain}.card b{display:block;padding:0 0 20px;font-size:14px}</style><small>MINI ENÉAS · ESTUDO DE MOVIMENTO</small><h1>Sete estados. Uma personalidade.</h1><p>Caricatura 3D original · modelo articulado por objetos · protótipo 0.2.0</p><div class="grid">${variants.map(([state,label])=>`<div class="card"><img src="${base}/previews/${state}.png"><b>${label}</b></div>`).join('')}</div></html>`);
  await sheet.waitForFunction(()=>[...document.images].every(image=>image.complete&&image.naturalWidth>0));
  await sheet.screenshot({path:path.join(output,'reacoes.png'),fullPage:true});
  console.log(JSON.stringify({result:'PASSOU — somente headless, nenhuma janela',...stats,idleFramesIn1200ms:idleFrames,sleepFramesIn1200ms:sleepFrames,glbBytes:model.length,animations:parsed.animations.map(a=>a.name)},null,2));
} finally {await browser?.close();await new Promise(resolve=>server.close(resolve));}
