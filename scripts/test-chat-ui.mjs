// Interface headless + serviço real, usando somente um provedor HTTP fictício local.
import { chromium } from 'playwright-core';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const {AiService}=createRequire(import.meta.url)('../dist/ai.cjs');
const temporary=await mkdtemp(path.join(os.tmpdir(),'mini-eneas-chat-ui-'));
let browser,service,cancelled=false;const requests=[];
const server=createServer(async(req,res)=>{
  if(req.url==='/api/tags'){res.writeHead(200,{'content-type':'application/json'}).end(JSON.stringify({models:[{name:'modelo-ui-ficticio'}]}));return;}
  if(req.url==='/api/chat'){
    let body='';for await(const chunk of req)body+=chunk;const payload=JSON.parse(body);requests.push(payload);
    const text=payload.messages.at(-1).content;
    if(text==='falhar'){res.writeHead(500).end('DETALHE PRIVADO QUE NÃO DEVE IR PARA A TELA');return;}
    res.writeHead(200,{'content-type':'application/x-ndjson'});
    if(text==='cancelar'){res.write('{"message":{"content":"Trecho parcial"},"done":false}\n');res.on('close',()=>{cancelled=true;});return;}
    if(text==='html'){res.end(JSON.stringify({message:{content:'Texto <img src=x onerror=alert(1)> seguro'},done:true})+'\n');return;}
    res.write('{"message":{"content":"Primeiro "},"done":false}\n');
    setTimeout(()=>res.end('{"message":{"content":"a ideia, depois a execução."},"done":true}\n'),700);return;
  }
  try{
    const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname),assets=path.resolve('dist');
    const file=path.resolve(assets,'.'+(name==='/'?'/index.html':name));if(!file.startsWith(assets+path.sep)){res.writeHead(403).end();return;}
    const bytes=await readFile(file);res.writeHead(200,{'content-type':({'.html':'text/html','.js':'text/javascript','.css':'text/css'})[path.extname(file)]??'application/octet-stream'}).end(bytes);
  }catch{res.writeHead(404).end();}
});
try{
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const url=`http://127.0.0.1:${server.address().port}`;
  service=new AiService(temporary,{available:()=>false,encrypt:()=>{throw new Error('não usado');},decrypt:()=>{throw new Error('não usado');}});
  browser=await chromium.launch({executablePath:process.env.CHROME_PATH??'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader'],env:{...process.env,DISPLAY:'',WAYLAND_DISPLAY:''}});
  const page=await browser.newPage({viewport:{width:1180,height:1100}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.exposeFunction('__aiInvoke',async(method,...args)=>{
    if(method==='settings')return service.settings();if(method==='save')return service.save(args[0]);if(method==='models')return service.models();
    if(method==='start')return service.start(args[0],args[1],event=>{void page.evaluate(event=>window.__receiveAi?.(event),event).catch(()=>{});});
    if(method==='cancel')return service.cancel(args[0]);if(method==='clear')return service.clear();throw new Error('Método de teste inválido');
  });
  await page.addInitScript(()=>{
    const listeners=new Set();window.__receiveAi=event=>listeners.forEach(fn=>fn(event));
    window.eneasAi={settings:()=>window.__aiInvoke('settings'),save:value=>window.__aiInvoke('save',value),models:()=>window.__aiInvoke('models'),start:(id,text)=>window.__aiInvoke('start',id,text),cancel:id=>window.__aiInvoke('cancel',id),clear:()=>window.__aiInvoke('clear'),onEvent:fn=>{listeners.add(fn);return()=>listeners.delete(fn);}};
  });
  await page.goto(url+'/?studio=1');await page.waitForFunction(()=>window.prototype3d?.stats().frames>1);
  await page.locator('#ai-configuration summary').click();
  await page.locator('#ai-provider').selectOption('ollama');await page.locator('#ai-address').fill(url);
  await page.getByRole('button',{name:'✓ Aplicar configuração',exact:true}).click();
  await page.getByText('✓ Configuração aplicada. A conversa anterior foi limpa.',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Listar modelos',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('#ai-model-list').children.length===1);
  assert.equal(requests.length,0,'Listar modelos não pode gerar uma resposta');
  await page.locator('#ai-model').fill('modelo-ui-ficticio');await page.getByRole('button',{name:'✓ Aplicar configuração',exact:true}).click();
  await page.getByText('✓ Configuração aplicada. A conversa anterior foi limpa.',{exact:true}).waitFor();
  const send=async text=>{await page.locator('#message').fill(text);await page.getByRole('button',{name:'Enviar mensagem',exact:true}).click();};
  await send('Olá');await page.getByText('✍ Respondendo…',{exact:true}).waitFor();
  assert.equal(await page.locator('#chat-cancel').isVisible(),true);assert.equal(await page.locator('#chat-send').isDisabled(),true);
  assert.match(await page.locator('#chat-log').innerText(),/Primeiro/);
  await page.getByRole('button',{name:'👉 Cutucar',exact:true}).click({clickCount:3,delay:40});
  await page.getByText('Ora, tenha modos!',{exact:true}).waitFor();
  await page.getByText('✓ Resposta concluída.',{exact:true}).waitFor();assert.match(await page.locator('#chat-log').innerText(),/depois a execução/);
  assert.equal(await page.evaluate(()=>window.prototype3d.stats().state),'annoyed','A resposta não deve apagar uma reação em andamento');
  await send('html');await page.getByText('✓ Resposta concluída.',{exact:true}).waitFor();assert.equal(await page.locator('#chat-log img').count(),0);
  await send('cancelar');await page.getByText('✍ Respondendo…',{exact:true}).waitFor();await page.getByRole('button',{name:'■ Interromper',exact:true}).click();
  await page.getByText('Resposta interrompida. O trecho parcial não será usado no contexto.',{exact:true}).waitFor();assert.equal(cancelled,true);
  await send('falhar');await page.getByText('O provedor não concluiu a solicitação (HTTP 500).',{exact:true}).waitFor();assert.equal((await page.locator('body').innerText()).includes('DETALHE PRIVADO'),false);
  assert.equal(requests.at(-1).messages.some(m=>m.content==='cancelar'),false,'Turno cancelado não deve ser reenviado');
  await page.getByRole('button',{name:'Limpar conversa',exact:true}).click();assert.equal(await page.locator('#chat-log p').count(),0);
  await send('Olá de novo');await page.getByText('✓ Resposta concluída.',{exact:true}).waitFor();assert.equal(requests.at(-1).messages.length,2);
  await page.screenshot({path:'previews/conversa-ia-teste.png',fullPage:true});
  // Chave inteiramente fictícia; sem chamada à OpenAI ou acesso ao chaveiro real.
  await page.locator('#ai-provider').selectOption('openai');await page.locator('#ai-key').fill('chave-ficticia-de-interface');await page.locator('#ai-remember').check();
  await page.getByRole('button',{name:'✓ Aplicar configuração',exact:true}).click();
  await page.getByText('Sem chaveiro seguro disponível: a chave ficará só nesta sessão.',{exact:true}).waitFor();
  assert.equal(await page.locator('#ai-key').inputValue(),'');assert.equal((await service.settings()).hasKey,true);
  assert.equal((await readFile(path.join(temporary,'ai.json'),'utf8')).includes('chave-ficticia'),false);
  await page.getByRole('button',{name:'Esquecer chave',exact:true}).click();await page.getByText('✓ Chave removida da sessão e da configuração salva.',{exact:true}).waitFor();assert.equal((await service.settings()).hasKey,false);
  assert.deepEqual(errors,[]);console.log('PASSOU: interface + serviço real + servidor fictício local; streaming, cancelamento, erros, contexto, configuração e chave só na sessão. Nenhuma janela ou chamada paga.');
}finally{service?.dispose();await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(()=>resolve()));await rm(temporary,{recursive:true,force:true});}
