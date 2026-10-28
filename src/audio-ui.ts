export type AudioEvent = {event:string;state?:string;text?:string;message?:string;level?:number};
export interface AudioBridge {command(value:Record<string,unknown>):Promise<void>;onEvent(fn:(event:AudioEvent)=>void):()=>void}
declare global {interface Window {eneasAudio?:AudioBridge}}
export function initializeAudio(submit:(text:string)=>boolean, animate:(speaking:boolean)=>void) {
  const bridge=window.eneasAudio;
  const button=document.getElementById('microphone-toggle') as HTMLButtonElement;
  const mute=document.getElementById('voice-toggle') as HTMLButtonElement;
  const status=document.getElementById('microphone-status')!;
  const meter=document.getElementById('microphone-level') as HTMLMeterElement;
  let enabled=true,muted=false;
  try {enabled=localStorage.getItem('eneas-listening')!=='false';muted=localStorage.getItem('eneas-muted')==='true';}catch{}
  const persist=()=>{try{localStorage.setItem('eneas-listening',String(enabled));localStorage.setItem('eneas-muted',String(muted));}catch{}};
  function controls(){button.textContent=enabled?'● Pausar microfone':'○ Ativar microfone';button.setAttribute('aria-pressed',String(enabled));mute.textContent=muted?'Voz desligada':'Voz ligada';mute.setAttribute('aria-pressed',String(!muted));}
  async function command(value:Record<string,unknown>){try{await bridge?.command(value);}catch(error){status.textContent=error instanceof Error?error.message:'Falha no áudio local.';}}
  button.disabled=mute.disabled=!bridge;
  button.addEventListener('click',()=>{enabled=!enabled;persist();controls();void command({command:'listen',enabled});});
  mute.addEventListener('click',()=>{muted=!muted;persist();controls();void command({command:'mute',muted});});
  const labels:Record<string,string>={listening:'Ouvindo · fale normalmente',paused:'Microfone pausado',busy:'Aguardando resposta…',transcribing:'Entendendo sua fala…',synthesizing:'Preparando a voz…',speaking:'Falando…'};
  bridge?.onEvent(value=>{
    if(value.event==='level'){meter.value=value.level??0;return;}
    if(value.event==='error'){status.textContent=value.message??'Falha no áudio.';return;}
    if(value.event==='status'){status.textContent=labels[value.state??'']??'';animate(value.state==='speaking');if(value.state!=='listening')meter.value=0;}
    if(value.event==='transcript'&&value.text){if(!submit(value.text))void command({command:'busy',busy:false});}
  });
  controls();
  if(bridge){void command({command:'mute',muted}).then(()=>command({command:'listen',enabled}));}
  else status.textContent='Microfone disponível no aplicativo desktop.';
  return {
    busy(value:boolean){void command({command:'busy',busy:value});},
    speak(text:string){void command({command:'speak',text});},
  };
}
