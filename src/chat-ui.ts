import type { AiBridge, AiEvent, AiSettings, Provider, Temperament } from './ai/contracts.ts';
export interface ChatHooks { demo(text:string):string; phase(phase:'thinking'|'delta'|'done'|'error'|'cancelled',text:string):void }
export function initializeChat(bridge:AiBridge|undefined,hooks:ChatHooks) {
  const $=<E extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as E;
  const log=$('chat-log'),input=$<HTMLInputElement>('message'),form=$<HTMLFormElement>('ai-settings');
  const provider=$<HTMLSelectElement>('ai-provider'),model=$<HTMLInputElement>('ai-model'),address=$<HTMLInputElement>('ai-address'),key=$<HTMLInputElement>('ai-key'),remember=$<HTMLInputElement>('ai-remember');
  let settings:AiSettings={provider:'demo',model:'',ollamaUrl:'http://127.0.0.1:11434',temperament:'dramatico',hasKey:false,rememberKey:false,storageNotice:'Chaves ficam nesta sessão.'};
  let activeId:string|undefined,reply:HTMLParagraphElement|undefined,replyText:Text|undefined,configuring=false,ready=!bridge,dirty=false;
  const label=()=>settings.provider==='demo'?'Demonstração':settings.provider==='ollama'?'Ollama':'OpenAI';
  function controls(){
    const busy=!!activeId||configuring||!ready;
    for(const control of form.querySelectorAll<HTMLInputElement|HTMLButtonElement|HTMLSelectElement>('input,select,button'))control.disabled=busy||!bridge;
    $('ai-models-button').toggleAttribute('disabled',busy||!bridge||dirty||settings.provider==='demo');
    $('ai-forget').toggleAttribute('disabled',busy||!bridge||!settings.hasKey);
    $('chat-send').toggleAttribute('disabled',busy||!ready);$('chat-clear').toggleAttribute('disabled',busy);
    $('chat-cancel').hidden=!activeId;input.disabled=busy||!ready;
  }
  function status(text:string,error=false){$('chat-status').textContent=text;$('chat-status').classList.toggle('error',error);}
  function mode(){
    $('chat-mode').textContent=settings.provider==='demo'?'🧪 Demonstração local':`🧠 ${label()} · ${settings.model||'modelo não escolhido'}`;
    $('chat-description').textContent=settings.provider==='demo'?'Falas locais, sem IA conectada. Experimente “oi”, “pensar” ou “dormir”.':settings.provider==='openai'?'Mensagem e contexto recente serão enviados à OpenAI. O uso da API pode ter cobrança.':'Mensagem e contexto recente serão enviados ao servidor Ollama configurado neste computador.';
    $('connection-note').textContent=settings.provider==='demo'?'Demonstração sem IA. Telegram e DevStack ainda não conectados.':`Conversa por ${label()}. Sem voz, Telegram ou DevStack.`;
  }
  function visibility(){
    $('ai-local-fields').hidden=provider.value!=='ollama';$('ai-key-fields').hidden=provider.value!=='openai';$('ai-model-fields').hidden=provider.value==='demo';
  }
  function populate(){
    provider.value=settings.provider;model.value=settings.model;address.value=settings.ollamaUrl;
    $<HTMLSelectElement>('ai-temperament').value=settings.temperament;key.value='';key.placeholder=settings.hasKey?'Chave já configurada · deixe vazio para manter':'Cole sua chave da API';remember.checked=settings.rememberKey;
    $('ai-storage').textContent=settings.storageNotice;dirty=false;visibility();mode();controls();
  }
  function append(name:string,text:string):[HTMLParagraphElement,Text]{
    const p=document.createElement('p'),b=document.createElement('b'),body=document.createTextNode(text);b.textContent=name+': ';p.append(b,body);log.append(p);
    while(log.children.length>12)log.firstElementChild?.remove();log.scrollTop=log.scrollHeight;return [p,body];
  }
  function finish(){activeId=undefined;reply=undefined;replyText=undefined;controls();}
  function event(value:AiEvent){
    if(!value||value.id!==activeId)return;
    if(value.type==='thinking'){status('💭 Pensando…');hooks.phase('thinking','');return;}
    if(value.type==='delta'||value.type==='done'){
      const text=typeof value.text==='string'?value.text.slice(0,12000):'';
      if(replyText)replyText.data=text;log.scrollTop=log.scrollHeight;hooks.phase(value.type,text);
      if(value.type==='done'){status('✓ Resposta concluída.');finish();}else status('✍ Respondendo…');
    }else if(value.type==='error'||value.type==='cancelled'){
      const message=value.message||'Não foi possível concluir a resposta.';
      if(replyText&&!replyText.data)replyText.data=value.type==='cancelled'?'Resposta interrompida.':'Não houve resposta.';
      reply?.classList.add('partial');status(message,value.type==='error');hooks.phase(value.type,message);finish();
    }
  }
  bridge?.onEvent(event);
  provider.addEventListener('change',visibility);
  form.addEventListener('input',()=>{dirty=true;controls();});form.addEventListener('change',()=>{dirty=true;controls();});
  form.addEventListener('submit',async e=>{
    e.preventDefault();if(!bridge||activeId||configuring)return;
    configuring=true;controls();status('Aplicando configuração…');
    try{
      settings=await bridge.save({provider:provider.value as Provider,model:model.value,ollamaUrl:address.value,temperament:$<HTMLSelectElement>('ai-temperament').value as Temperament,key:key.value,rememberKey:remember.checked});
      log.replaceChildren();populate();status('✓ Configuração aplicada. A conversa anterior foi limpa.');
    }catch(error){status(error instanceof Error?error.message:'Não foi possível salvar.',true);}finally{configuring=false;controls();}
  });
  $('ai-models-button').addEventListener('click',async()=>{
    if(!bridge||activeId||configuring||dirty)return;configuring=true;controls();status('Consultando modelos disponíveis…');
    try{
      const models=await bridge.models();const list=$('ai-model-list');list.replaceChildren();
      for(const name of models){const option=document.createElement('option');option.value=name;list.append(option);}
      status(models.length?`✓ ${models.length} modelos listados. Escolha um e aplique; a geração será testada ao enviar.`:'Nenhum modelo encontrado. Configure um modelo no provedor primeiro.');
    }catch(error){status(error instanceof Error?error.message:'Não foi possível listar modelos.',true);}finally{configuring=false;controls();}
  });
  $('ai-forget').addEventListener('click',async()=>{
    if(!bridge||activeId||configuring)return;configuring=true;controls();
    try{settings=await bridge.save({...settings,key:'',rememberKey:false,forgetKey:true});log.replaceChildren();populate();status('✓ Chave removida da sessão e da configuração salva.');}
    catch(error){status(error instanceof Error?error.message:'Não foi possível remover a chave.',true);}finally{configuring=false;controls();}
  });
  $('chat').addEventListener('submit',async e=>{
    e.preventDefault();const text=input.value.trim();if(!text||activeId||configuring||!ready)return;
    if(settings.provider==='demo'){append('Você',text);append('Enéas · demonstração',hooks.demo(text));input.value='';return;}
    if(!bridge){status('Abra pelo aplicativo desktop para conectar uma IA.',true);return;}
    activeId=crypto.randomUUID();const id=activeId;append('Você',text);[reply,replyText]=append('Enéas · '+label(),'');input.value='';controls();status('Enviando…');
    try{await bridge.start(id,text);}catch(error){event({id,type:'error',message:error instanceof Error?error.message:'Não foi possível iniciar a conversa.'});}
  });
  $('chat-cancel').addEventListener('click',async()=>{
    if(!bridge||!activeId)return;status('Interrompendo…');
    try{await bridge.cancel(activeId);}catch{status('Não foi possível interromper. A solicitação tem limite de dois minutos.',true);}
  });
  $('chat-clear').addEventListener('click',async()=>{
    if(activeId||configuring)return;
    try{await bridge?.clear();log.replaceChildren();status('Conversa limpa.');}catch(error){status(error instanceof Error?error.message:'Não foi possível limpar.',true);}
  });
  populate();
  if(bridge)void bridge.settings().then(value=>{settings=value;ready=true;populate();}).catch(()=>{ready=true;status('Não foi possível carregar a IA. O modo demonstração continua disponível.',true);controls();});
  else status('Prévia do navegador: use o aplicativo desktop para configurar uma IA.');
}
