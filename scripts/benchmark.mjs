// Comparação controlada em software; não representa FPS no desktop/GPU real.
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const assets=path.resolve(process.argv[2]??'dist');
const output=process.argv[3]??'previews/performance-after.json';
const server=createServer(async(req,res)=>{
  try {
    const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    const file=path.resolve(assets,'.'+(name==='/'?'/index.html':name));
    if(!file.startsWith(assets+path.sep)){res.writeHead(403).end();return;}
    const bytes=await readFile(file);
    res.writeHead(200,{'content-type':({'.html':'text/html','.js':'text/javascript','.css':'text/css'})[path.extname(file)]??'application/octet-stream'}).end(bytes);
  }catch{res.writeHead(404).end();}
});
let browser;
try {
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  browser=await chromium.launch({executablePath:process.env.CHROME_PATH??'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader'],env:{...process.env,DISPLAY:'',WAYLAND_DISPLAY:''}});
  const results=[];
  for(const dpr of [1,2]) {
    const page=await browser.newPage({viewport:{width:420,height:650},deviceScaleFactor:dpr});
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.waitForFunction(()=>window.prototype3d?.stats().frames>2);
    const result=await page.evaluate(()=>{
      const api=window.prototype3d, canvas=document.querySelector('canvas'), gl=canvas.getContext('webgl2');
      if(!gl) throw new Error('WebGL ausente');
      const samples={}, pixel=new Uint8Array(4);
      const finish=()=>{gl.readPixels(canvas.width>>1,canvas.height>>1,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);};
      for(const state of ['idle','wave','annoyed']) {
        for(let i=0;i<10;i++){api.sample(state,.3+i*.02);finish();}
        const values=[];
        for(let i=0;i<40;i++){const start=performance.now();api.sample(state,.6+i*.02);finish();values.push(performance.now()-start);}
        values.sort((a,b)=>a-b);samples[state]={medianMs:values[20],p95Ms:values[38]};
      }
      return {...api.stats(),buffer:[canvas.width,canvas.height],context:gl.getContextAttributes(),samples};
    });
    assert.equal(result.renderer,true);results.push({dpr,...result});await page.close();
  }
  const report={method:'Chromium headless + SwiftShader; 10 aquecimentos e 40 amostras por estado; readPixels síncrono de 1 pixel central; mesma janela 420x650',browser:browser.version(),results};
  await writeFile(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
} finally {await browser?.close();await new Promise(resolve=>server.close(resolve));}
