const {spawn}=require('node:child_process');
const {createInterface}=require('node:readline');
const fs=require('node:fs');
const path=require('node:path');
const {AiTransport,AiError}=require('../dist/ai.cjs');
class LocalTransport extends AiTransport {
  constructor(root){super();this.root=root;this.child=null;this.pending=null;}
  async models(config,key,signal){return config.provider==='local'?['Qwen3 1.7B local']:super.models(config,key,signal);}
  async stream(config,key,messages,signal,onDelta){
    if(config.provider!=='local')return super.stream(config,key,messages,signal,onDelta);
    if(signal.aborted)throw new AiError('Resposta interrompida.');
    if(!this.child){
      fs.mkdirSync(path.join(this.root,'data'),{recursive:true});
      const log=fs.openSync(path.join(this.root,'data/desktop-brain.log'),'a',0o600);
      const child=spawn('/usr/bin/python',[path.join(this.root,'desktop/brain_bridge.py')],{cwd:this.root,detached:true,stdio:['pipe','pipe',log]});fs.closeSync(log);this.child=child;
      child.stdin.on('error',()=>{});
      child.on('error',()=>this.pending?.reject(new AiError('Não foi possível iniciar a IA local.')));
      child.on('exit',()=>{if(this.child===child){this.child=null;this.pending?.reject(new AiError('A IA local parou. Confira os modelos instalados.'));}});
      createInterface({input:child.stdout}).on('line',line=>{try{const value=JSON.parse(line);if(typeof value.text==='string')this.pending?.resolve(value.text);}catch{}});
    }
    let abort;
    try{
      const result=await new Promise((resolve,reject)=>{
        this.pending={resolve,reject};abort=()=>{reject(new AiError('Resposta interrompida.'));this.dispose();};signal.addEventListener('abort',abort,{once:true});
        this.child.stdin.write(JSON.stringify({messages})+'\n');
      });onDelta(result);return result;
    }finally{signal.removeEventListener('abort',abort);this.pending=null;}
  }
  dispose(){const child=this.child;this.child=null;if(child){try{process.kill(-child.pid,'SIGTERM');}catch{}}}
}
module.exports={LocalTransport};
