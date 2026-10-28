import { mkdir, lstat, readFile, open, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { AiConfig, AiEvent, AiSave, AiSettings } from './contracts.ts';
import { AiError, AiTransport, DEFAULT_CONFIG, validateConfig, type Message } from './transport.ts';
export { AiError, AiTransport } from './transport.ts';
export interface KeyProtection { available(): boolean; encrypt(text:string):Buffer; decrypt(bytes:Buffer):string }
const ID=/^[a-zA-Z0-9-]{8,80}$/;
function safeMessage(error:unknown):string {return error instanceof AiError?error.message:'Não foi possível conectar ao provedor. Confira se ele está disponível e tente novamente.';}
function validateKey(value:unknown):string {if(typeof value!=='string'||value.length>4096||/[^\x21-\x7e]/.test(value))throw new AiError('Chave inválida. Cole apenas o token, sem espaços.');return value;}
export class AiService {
  private config:AiConfig={...DEFAULT_CONFIG};
  private key=''; private remembered=false; private notice=''; private loaded?:Promise<void>;
  private history:Message[]=[];
  private active?:{id:string;controller:AbortController;timeout:boolean};
  private configuring=false;
  constructor(private directory:string,private crypto:KeyProtection,private transport=new AiTransport(),private timeoutMs=120_000){}
  private file(name:string){return path.join(this.directory,name);}
  private async read(name:string,max:number):Promise<Buffer>{const p=this.file(name),s=await lstat(p);if(!s.isFile()||s.size>max)throw new AiError('Arquivo de configuração inválido.');return readFile(p);}
  private async write(name:string,data:Buffer|string){
    await mkdir(this.directory,{recursive:true,mode:0o700});
    const temporary=this.file('.'+name+'.'+randomUUID()+'.tmp');
    try{const handle=await open(temporary,'wx',0o600);try{await handle.writeFile(data);await handle.sync();}finally{await handle.close();}await rename(temporary,this.file(name));}
    finally{await unlink(temporary).catch(()=>{});}
  }
  private async load(){
    try{
      const stored=JSON.parse((await this.read('ai.json',32_000)).toString());this.config=validateConfig(stored);
      if(stored.encryptedKey){
        try{
          if(typeof stored.encryptedKey!=='string'||stored.encryptedKey.length>22_000||!this.crypto.available())throw new Error('Keyring indisponível');
          this.key=validateKey(this.crypto.decrypt(Buffer.from(stored.encryptedKey,'base64')));this.remembered=true;
        }catch{this.notice='A chave salva não pôde ser recuperada. Informe-a novamente; nenhuma chave será exibida.';}
      }
    }catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')this.notice='As preferências de IA não puderam ser lidas. Revise e salve novamente.';}
  }
  private ready(){return this.loaded??=this.load();}
  private view():AiSettings {return {...this.config,hasKey:!!this.key,rememberKey:this.remembered,storageNotice:this.notice||(this.remembered?'Chave protegida pelo chaveiro do sistema.':'Chaves não salvas ficam apenas nesta sessão.')};}
  async settings():Promise<AiSettings>{await this.ready();return this.view();}
  async save(value:AiSave):Promise<AiSettings>{
    await this.ready();if(this.active||this.configuring)throw new AiError('Aguarde ou interrompa a solicitação atual antes de configurar.');
    const config=validateConfig(value);
    if(typeof value.rememberKey!=='boolean'||(value.forgetKey!==undefined&&typeof value.forgetKey!=='boolean'))throw new AiError('Configuração de chave inválida.');
    let key=value.forgetKey?'':this.key;
    if(value.key!==undefined&&value.key!=='')key=validateKey(value.key);
    if(value.forgetKey&&value.key)throw new AiError('Escolha remover ou substituir a chave.');
    this.configuring=true;
    try{
      let remembered=false,notice='',encryptedKey:string|undefined;
      if(key&&value.rememberKey){
        if(this.crypto.available()){
          try{encryptedKey=this.crypto.encrypt(key).toString('base64');remembered=true;}catch{throw new AiError('Não foi possível proteger a chave. Desmarque “Lembrar chave” para usar só nesta sessão.');}
        }else notice='Sem chaveiro seguro disponível: a chave ficará só nesta sessão.';
      }
      if(config.provider==='local'&&!config.model)config.model='Qwen3 1.7B local';
      await this.write('ai.json',JSON.stringify({...config,encryptedKey},null,2)+'\n');
      this.config=config;this.key=key;this.remembered=remembered;this.notice=notice;this.history=[];
      return this.view();
    }finally{this.configuring=false;}
  }
  async models():Promise<string[]>{
    await this.ready();if(this.active||this.configuring)throw new AiError('Aguarde a solicitação atual.');
    this.configuring=true;
    try{return await this.transport.models({...this.config},this.key,AbortSignal.timeout(10_000));}
    catch(error){throw new AiError(safeMessage(error));}finally{this.configuring=false;}
  }
  async start(id:string,input:string,emit:(event:AiEvent)=>void):Promise<void>{
    await this.ready();
    if(typeof id!=='string'||!ID.test(id)||typeof input!=='string'||!input.trim()||input.length>2000)throw new AiError('Envie uma mensagem com até 2.000 caracteres.');
    if(this.active||this.configuring)throw new AiError('Já existe uma solicitação em andamento.');
    if(this.config.provider==='demo')throw new AiError('Selecione um provedor de IA primeiro.');
    if(!this.config.model)throw new AiError('Informe o modelo em Conversa com IA.');
    if(this.config.provider==='openai'&&!this.key)throw new AiError('Informe a chave da API em Conversa com IA.');
    const active={id,controller:new AbortController(),timeout:false};this.active=active;
    const config={...this.config},key=this.key,history=[...this.history,{role:'user' as const,content:input.trim()}];
    void this.run(active,config,key,history,emit);
  }
  private async run(active:NonNullable<AiService['active']>,config:AiConfig,key:string,messages:Message[],emit:(event:AiEvent)=>void){
    let pending:string|undefined,flushTimer:ReturnType<typeof setTimeout>|undefined;
    const send=(event:Omit<AiEvent,'id'>)=>{try{emit({id:active.id,...event});}catch{active.controller.abort();}};
    const flush=()=>{clearTimeout(flushTimer);flushTimer=undefined;if(pending!==undefined){send({type:'delta',text:pending});pending=undefined;}};
    const timeout=setTimeout(()=>{active.timeout=true;active.controller.abort();},this.timeoutMs);
    send({type:'thinking'});
    try{
      const text=await this.transport.stream(config,key,messages,active.controller.signal,value=>{pending=value;if(!flushTimer)flushTimer=setTimeout(flush,50);});
      if(active.controller.signal.aborted)throw new AiError('Solicitação interrompida.');
      flush();this.history=[...messages,{role:'assistant' as const,content:text}].slice(-12);
      while(this.history.reduce((sum,m)=>sum+m.content.length,0)>24_000&&this.history.length>2)this.history.splice(0,2);
      send({type:'done',text});
    }catch(error){
      flush();
      if(active.controller.signal.aborted&&!active.timeout)send({type:'cancelled',message:'Resposta interrompida. O trecho parcial não será usado no contexto.'});
      else send({type:'error',message:active.timeout?'O provedor demorou mais de dois minutos. Tente novamente ou escolha outro modelo.':safeMessage(error)});
    }finally{clearTimeout(timeout);clearTimeout(flushTimer);active.controller.abort();if(this.active===active)this.active=undefined;}
  }
  cancel(id:string){if(this.active?.id===id)this.active.controller.abort();}
  clear(){if(this.active)throw new AiError('Interrompa a resposta antes de limpar a conversa.');this.history=[];}
  dispose(){this.active?.controller.abort();this.history=[];this.key='';}
}
