import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import { AiService, type KeyProtection } from '../src/ai/service.ts';
import { AiTransport, AiError, DEFAULT_CONFIG, validateConfig, instructions } from '../src/ai/transport.ts';
import type { AiConfig, AiEvent, AiSave } from '../src/ai/contracts.ts';
const config:AiConfig={...DEFAULT_CONFIG,provider:'ollama',model:'modelo-ficticio'};
const saving=(extra:Partial<AiSave>={}):AiSave=>({...config,rememberKey:false,...extra});
const crypto:KeyProtection={available:()=>true,encrypt:text=>Buffer.from(text.split('').reverse().join('')),decrypt:bytes=>bytes.toString().split('').reverse().join('')};
const noCrypto:KeyProtection={available:()=>false,encrypt:()=>{throw new Error('Não deve cifrar');},decrypt:()=>{throw new Error('Não deve decifrar');}};
const encoder=new TextEncoder();
function response(text:string,bytewise=false){
  const bytes=encoder.encode(text);
  return new Response(new ReadableStream({start(controller){if(bytewise)for(const byte of bytes)controller.enqueue(Uint8Array.of(byte));else controller.enqueue(bytes);controller.close();}}));
}
function ollama(text='Olá!'){return response(JSON.stringify({message:{content:text},done:false})+'\n'+JSON.stringify({done:true})+'\n',true);}
async function temp(fn:(directory:string)=>Promise<void>){const dir=await mkdtemp(path.join(os.tmpdir(),'mini-eneas-ai-'));try{await fn(dir);}finally{await rm(dir,{recursive:true,force:true});}}
async function ask(service:AiService,id:string,text:string):Promise<AiEvent[]>{
  const events:AiEvent[]=[];let done!:()=>void;const complete=new Promise<void>(resolve=>{done=resolve;});
  await service.start(id,text,event=>{events.push(event);if(['done','error','cancelled'].includes(event.type))done();});await complete;return events;
}
test('validação restringe Ollama a loopback e mantém instruções sem alegar acesso à máquina',()=>{
  assert.equal(validateConfig(config).ollamaUrl,'http://127.0.0.1:11434');
  for(const url of ['http://empresa.test','file:///tmp/model','http://127.0.0.1:11434/api/chat','http://user:senha@localhost:11434','http://localhost:11434?token=segredo'])assert.throws(()=>validateConfig({...config,ollamaUrl:url}),AiError);
  assert.throws(()=>validateConfig({...config,provider:'outro'}),AiError);
  assert.match(instructions(config),/caricatura fictícia/);assert.match(instructions(config),/Não finja ter executado/);
});
test('Ollama decodifica UTF-8 fragmentado e não mostra o campo de raciocínio',async()=>{
  const updates:string[]=[];
  const transport=new AiTransport(async(url,options)=>{
    assert.equal(url,'http://127.0.0.1:11434/api/chat');const body=JSON.parse(options!.body as string);
    assert.equal(body.messages[0].role,'system');assert.equal(body.options.num_predict,512);assert.equal(body.stream,true);assert.equal(options?.redirect,'error');
    return response('{"message":{"thinking":"oculto","content":"Olá 🧠"},"done":false}\n{"message":{"content":"!"},"done":true}\n',true);
  });
  assert.equal(await transport.stream(config,'',[],new AbortController().signal,text=>updates.push(text)),'Olá 🧠!');assert.deepEqual(updates,['Olá 🧠','Olá 🧠!']);
});
test('Responses usa endpoint oficial, store false e SSE sem expor cabeçalhos ao consumidor',async()=>{
  const transport=new AiTransport(async(url,options)=>{
    assert.equal(url,'https://api.openai.com/v1/responses');assert.equal((options!.headers as Record<string,string>).Authorization,'Bearer chave-ficticia');
    const body=JSON.parse(options!.body as string);assert.equal(body.store,false);assert.equal(body.max_output_tokens,1024);assert.equal(body.tools,undefined);
    return response(': heartbeat\r\nevent: response.output_text.delta\r\ndata: {"type":"response.output_text.delta",\r\ndata: "delta":"Olá!"}\r\n\r\ndata: {"type":"response.completed"}\r\n\r\n',true);
  });
  assert.equal(await transport.stream({...config,provider:'openai'},'chave-ficticia',[],new AbortController().signal,()=>{}),'Olá!');
});
test('EOF prematuro, falha do provedor e resposta grande não são aceitos como sucesso',async()=>{
  const run=(body:string)=>new AiTransport(async()=>response(body)).stream(config,'',[],new AbortController().signal,()=>{});
  await assert.rejects(run('{"message":{"content":"parcial"}}\n'),/antes de concluir/);
  await assert.rejects(run('{"error":"chave secreta ou detalhe privado"}\n'),error=>error instanceof AiError&&!error.message.includes('secreta'));
  await assert.rejects(run(JSON.stringify({message:{content:'x'.repeat(12001)},done:true})+'\n'),/limite de texto/);
  const denied=new AiTransport(async()=>new Response('conteúdo privado de erro',{status:401}));
  await assert.rejects(denied.stream(config,'',[],new AbortController().signal,()=>{}),/Acesso recusado/);
});
test('lista modelos sem gerar resposta nem expor outros dados do provedor',async()=>{
  const transport=new AiTransport(async(url,options)=>{assert.match(String(url),/\/api\/tags$/);assert.equal(options?.method,undefined);return Response.json({models:[{name:'local-a',private:'não retornar'},{name:'local-a'},{name:'local-b'},{name:123}]});});
  assert.deepEqual(await transport.models(config,'',new AbortController().signal),['local-a','local-b']);
});
test('chave protegida persiste de forma privada, nunca retorna à interface e pode ser esquecida',async()=>temp(async dir=>{
  const service=new AiService(dir,crypto);const settings=await service.save(saving({provider:'openai',key:'chave-apenas-de-teste',rememberKey:true}));
  assert.equal(settings.hasKey,true);assert.equal(settings.rememberKey,true);assert.equal(JSON.stringify(settings).includes('chave-apenas'),false);
  const file=path.join(dir,'ai.json');assert.equal((await readFile(file,'utf8')).includes('chave-apenas'),false);assert.equal((await stat(file)).mode&0o777,0o600);
  const restored=new AiService(dir,crypto);assert.equal((await restored.settings()).hasKey,true);
  await restored.save(saving({forgetKey:true}));assert.equal((await new AiService(dir,crypto).settings()).hasKey,false);assert.equal(JSON.parse(await readFile(file,'utf8')).encryptedKey,undefined);
}));
test('sem chaveiro seguro, chave fica só na sessão; falha ao cifrar não altera configuração anterior',async()=>temp(async dir=>{
  const service=new AiService(dir,noCrypto);const settings=await service.save(saving({provider:'openai',key:'somente-sessao',rememberKey:true}));
  assert.equal(settings.hasKey,true);assert.equal(settings.rememberKey,false);assert.match(settings.storageNotice,/só nesta sessão/);
  assert.equal((await readFile(path.join(dir,'ai.json'),'utf8')).includes('somente-sessao'),false);
  assert.equal((await new AiService(dir,noCrypto).settings()).hasKey,false);
  const failing=new AiService(dir,{...crypto,encrypt:()=>{throw new Error('privado');}});
  await assert.rejects(failing.save(saving({provider:'openai',model:'troca',key:'fake',rememberKey:true})),/Não foi possível proteger/);
  assert.equal((await new AiService(dir,noCrypto).settings()).model,config.model);
}));
test('histórico guarda apenas turnos completos, é limitado e pode ser limpo',async()=>temp(async dir=>{
  const inputs:unknown[][]=[];
  const transport=new AiTransport(async(_url,options)=>{inputs.push(JSON.parse(options!.body as string).messages);return ollama();});
  const service=new AiService(dir,crypto,transport);await service.save(saving());
  for(let i=0;i<8;i++){const events=await ask(service,'message-'+i,'Olá '+i);assert.equal(events.at(-1)?.type,'done');}
  assert.equal(inputs[0].length,2);assert.ok(inputs[7].length<=14);
  service.clear();await ask(service,'after-clear','Sem contexto');assert.equal(inputs.at(-1)?.length,2);
  const stored=await readFile(path.join(dir,'ai.json'),'utf8');assert.equal(stored.includes('Sem contexto'),false);
}));
test('cancelamento interrompe rede e rejeita concorrência sem guardar turno parcial',async()=>temp(async dir=>{
  let calls=0,aborted=false;
  const transport=new AiTransport(async(_url,options)=>{
    if(calls++>0){assert.equal(JSON.parse(options!.body as string).messages.length,2);return ollama('Depois');}
    return new Promise<Response>((_resolve,reject)=>options!.signal!.addEventListener('abort',()=>{aborted=true;reject(new Error('motivo privado'));},{once:true}));
  });
  const service=new AiService(dir,crypto,transport);await service.save(saving());
  const events:AiEvent[]=[];let resolve!:()=>void;const finished=new Promise<void>(r=>{resolve=r;});
  await service.start('cancel-me','Primeira',event=>{events.push(event);if(event.type==='cancelled')resolve();});
  await assert.rejects(service.start('duplicate','Outra',()=>{}),/andamento/);await assert.rejects(service.save(saving()),/solicitação atual/);assert.throws(()=>service.clear(),/Interrompa/);
  service.cancel('cancel-me');await finished;assert.equal(aborted,true);assert.equal(events.at(-1)?.type,'cancelled');
  await ask(service,'second-turn','Segunda');
}));
test('timeout tem mensagem controlada e libera nova conversa',async()=>temp(async dir=>{
  const transport=new AiTransport(async(_url,options)=>new Promise<Response>((_resolve,reject)=>options!.signal!.addEventListener('abort',()=>reject(new Error('segredo')),{once:true})));
  const service=new AiService(dir,crypto,transport,10);await service.save(saving());
  const events=await ask(service,'timeout-case','Olá');assert.equal(events.at(-1)?.type,'error');assert.match(events.at(-1)?.message??'',/demorou/);assert.equal(JSON.stringify(events).includes('segredo'),false);
}));
test('transporte real contra servidor local fictício entrega texto antes do fim',async()=>{
  let completed=false;const server=createServer(async(req,res)=>{
    assert.equal(req.url,'/api/chat');for await(const _chunk of req){}res.writeHead(200,{'content-type':'application/x-ndjson'});
    res.write('{"message":{"content":"Antes"},"done":false}\n');
    setTimeout(()=>{completed=true;res.end('{"message":{"content":" do fim"},"done":true}\n');},30);
  });
  try{
    await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
    const address=server.address();if(!address||typeof address==='string')throw new Error('Porta indisponível');
    let streamedBeforeEnd=false;
    const text=await new AiTransport().stream({...config,ollamaUrl:'http://127.0.0.1:'+address.port},'',[],AbortSignal.timeout(5000),()=>{if(!completed)streamedBeforeEnd=true;});
    assert.equal(text,'Antes do fim');assert.equal(streamedBeforeEnd,true);
  }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
