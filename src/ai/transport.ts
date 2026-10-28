import type { AiConfig } from './contracts.ts';
export class AiError extends Error {}
export interface Message { role: 'user' | 'assistant'; content: string }
export const DEFAULT_CONFIG: AiConfig = { provider:'demo',model:'',ollamaUrl:'http://127.0.0.1:11434',temperament:'dramatico' };
export function validateConfig(value: unknown): AiConfig {
  if (!value || typeof value !== 'object') throw new AiError('Configuração de IA inválida.');
  const c=value as Record<string,unknown>;
  if (!['demo','local','ollama','openai'].includes(String(c.provider)) || !['calmo','dramatico','impaciente'].includes(String(c.temperament))) throw new AiError('Escolha um provedor e um temperamento válidos.');
  if (typeof c.model!=='string' || c.model.length>160 || /[\x00-\x1f\x7f]/.test(c.model)) throw new AiError('Nome de modelo inválido.');
  let url: URL;
  try { url=new URL(String(c.ollamaUrl)); } catch { throw new AiError('Informe o endereço local do Ollama.'); }
  if (!['http:','https:'].includes(url.protocol) || !['localhost','127.0.0.1','[::1]'].includes(url.hostname) || url.username || url.password || url.search || url.hash || url.pathname!=='/') throw new AiError('Ollama deve usar localhost, 127.0.0.1 ou ::1, sem credenciais, caminho ou parâmetros.');
  return {provider:c.provider as AiConfig['provider'],model:c.model.trim(),ollamaUrl:url.origin,temperament:c.temperament as AiConfig['temperament']};
}
export function instructions(config: AiConfig): string {
  const tone={calmo:'Seja sereno e bem-humorado.',dramatico:'Use energia teatral, frases enfáticas e humor inteligente.',impaciente:'Seja impaciente de brincadeira e espirituoso, sem insultar ou humilhar.'}[config.temperament];
  return 'Você é Mini Enéas, uma caricatura fictícia e humorística inspirada em Enéas Carneiro, não a pessoa real. Converse em português brasileiro e ajude com clareza. '+tone+' Prefira respostas curtas e legíveis. Não apresente falas inventadas como citações históricas. Não alegue acesso ao computador, Telegram, arquivos ou ferramentas: nesta versão você conversa por texto e voz. Não finja ter executado ações. Admita incertezas.';
}
function httpError(status: number): AiError {
  return new AiError(status===401||status===403?'Acesso recusado. Confira a chave e as permissões.':status===404?'Modelo ou serviço não encontrado. Confira a configuração.':status===429?'O provedor limitou o acesso. Confira a cota e tente depois.':`O provedor não concluiu a solicitação (HTTP ${status}).`);
}
async function* records(response: Response, sse: boolean): AsyncGenerator<Record<string,unknown>> {
  if (!response.body) throw new AiError('O provedor não enviou uma resposta.');
  const reader=response.body.getReader(), decoder=new TextDecoder(); let buffer='',data:string[]=[],bytes=0;
  function parse(text:string): Record<string,unknown> {
    let value:unknown; try{value=JSON.parse(text);}catch{throw new AiError('O provedor enviou dados inválidos.');}
    if(!value||typeof value!=='object'||Array.isArray(value))throw new AiError('Formato de resposta inválido.');return value as Record<string,unknown>;
  }
  function line(line:string):Record<string,unknown>|undefined {
    if (!sse) return line.trim()?parse(line):undefined;
    if (!line) {const text=data.join('\n');data=[];return text&&text!=='[DONE]'?parse(text):undefined;}
    if(line.startsWith('data:')) data.push(line.slice(5).replace(/^ /,''));
    if(data.join('\n').length>65_536)throw new AiError('O provedor enviou um evento muito grande.');
  }
  try {
    while(true){
      const chunk=await reader.read();
      if(chunk.done){buffer+=decoder.decode();break;}
      bytes+=chunk.value.byteLength;if(bytes>1_048_576)throw new AiError('A resposta ultrapassou o limite desta conversa.');
      buffer+=decoder.decode(chunk.value,{stream:true});
      let end:number;
      while((end=buffer.indexOf('\n'))>=0){const text=buffer.slice(0,end).replace(/\r$/,'');buffer=buffer.slice(end+1);const event=line(text);if(event)yield event;}
      if(buffer.length>65_536)throw new AiError('O provedor enviou um evento muito grande.');
    }
    if(buffer){const event=line(buffer.replace(/\r$/,''));if(event)yield event;}
    if(sse&&data.length){const event=line('');if(event)yield event;}
  } finally {try{await reader.cancel();}catch{}reader.releaseLock();}
}
export class AiTransport {
  constructor(private request: typeof fetch = fetch) {}
  async models(config:AiConfig,key:string,signal:AbortSignal):Promise<string[]> {
    if(config.provider==='demo')return [];
    if(config.provider==='openai'&&!key)throw new AiError('Configure a chave da API primeiro.');
    const url=config.provider==='openai'?'https://api.openai.com/v1/models':config.ollamaUrl+'/api/tags';
    const response=await this.request(url,{signal,redirect:'error',headers:config.provider==='openai'?{Authorization:'Bearer '+key}:{}});
    if(!response.ok){await response.body?.cancel();throw httpError(response.status);}
    let bytes=0,text='';const reader=response.body?.getReader();if(!reader)throw new AiError('Lista de modelos indisponível.');
    const decoder=new TextDecoder();
    try{while(true){const chunk=await reader.read();if(chunk.done)break;bytes+=chunk.value.byteLength;if(bytes>512_000)throw new AiError('Lista de modelos muito grande.');text+=decoder.decode(chunk.value,{stream:true});}text+=decoder.decode();}finally{try{await reader.cancel();}catch{}reader.releaseLock();}
    let data:Record<string,unknown>;try{data=JSON.parse(text);}catch{throw new AiError('Lista de modelos inválida.');}
    const items=config.provider==='openai'?data?.data:data?.models;
    if(!Array.isArray(items))throw new AiError('Lista de modelos inválida.');
    return [...new Set(items.map(item=>config.provider==='openai'?item?.id:item?.name).filter((id):id is string=>typeof id==='string'&&id.length>0&&id.length<=160&&!/[\x00-\x1f\x7f]/.test(id)))].sort().slice(0,200);
  }
  async stream(config:AiConfig,key:string,messages:Message[],signal:AbortSignal,onDelta:(text:string)=>void):Promise<string> {
    if(!config.model)throw new AiError('Informe o nome do modelo em Opções → Conversa com IA.');
    if(config.provider==='openai'&&!key)throw new AiError('Configure a chave da API primeiro.');
    if(config.provider==='demo')throw new AiError('O modo demonstração não usa um provedor de IA.');
    const openai=config.provider==='openai';
    const body=openai?{model:config.model,instructions:instructions(config),input:messages,stream:true,store:false,max_output_tokens:1024}
      :{model:config.model,messages:[{role:'system',content:instructions(config)},...messages],stream:true,options:{num_predict:512,num_ctx:4096},keep_alive:'30s'};
    const response=await this.request(openai?'https://api.openai.com/v1/responses':config.ollamaUrl+'/api/chat',{
      method:'POST',signal,redirect:'error',headers:{'Content-Type':'application/json',...(openai?{Authorization:'Bearer '+key}:{})},body:JSON.stringify(body),
    });
    if(!response.ok){await response.body?.cancel();throw httpError(response.status);}
    let text='',complete=false;
    for await(const event of records(response,openai)){
      if(signal.aborted)throw new AiError('Solicitação interrompida.');
      if(event.error||['error','response.failed','response.incomplete'].includes(String(event.type)))throw new AiError('O provedor interrompeu a resposta. Tente uma pergunta mais curta ou confira o modelo.');
      const message=event.message as Record<string,unknown>|undefined;
      const delta=openai?(['response.output_text.delta','response.refusal.delta'].includes(String(event.type))?event.delta:undefined):message?.content;
      if(typeof delta==='string'&&delta){if(text.length+delta.length>12_000)throw new AiError('A resposta ultrapassou o limite de texto.');text+=delta;onDelta(text);}
      if(openai?event.type==='response.completed':event.done===true){complete=true;break;}
    }
    if(!complete)throw new AiError('A conexão terminou antes de concluir a resposta.');
    if(!text.trim())throw new AiError('O modelo não enviou texto. Confira se ele aceita conversa por texto.');
    return text;
  }
}
