const {spawn} = require('node:child_process');
const {createInterface} = require('node:readline');
const fs = require('node:fs');
const path = require('node:path');
class AudioService {
  constructor(root, emit) { this.root=root; this.emit=emit; this.process=null; }
  start() {
    if(this.process)return;
    const python=path.join(this.root,'.voice/bin/python');
    if(!fs.existsSync(python))throw new Error('Ambiente de voz ausente. Consulte a seção Microfone no README.');
    fs.mkdirSync(path.join(this.root,'data'),{recursive:true});
    const log=fs.openSync(path.join(this.root,'data/desktop-audio.log'),'a',0o600);
    const child=spawn(python,[path.join(this.root,'desktop/audio_bridge.py')],{cwd:this.root,detached:true,stdio:['pipe','pipe',log]});
    fs.closeSync(log);this.process=child;
    child.stdin.on('error',()=>{});
    child.on('error',()=>this.emit({event:'error',message:'Não foi possível iniciar o áudio local.'}));
    child.on('exit',()=>{if(this.process===child){this.process=null;this.emit({event:'error',message:'O áudio local parou. Reabra o aplicativo.'});}});
    createInterface({input:child.stdout}).on('line',line=>{try{this.emit(JSON.parse(line));}catch{}});
  }
  command(value) {
    if(!value||typeof value!=='object')throw new Error('Comando de áudio inválido.');
    const c=value.command;
    if(!['listen','mute','busy','speak'].includes(c))throw new Error('Comando de áudio inválido.');
    if(c==='speak'&&(typeof value.text!=='string'||value.text.length>12000))throw new Error('Texto de voz inválido.');
    if(c!=='speak'&&typeof value[c==='listen'?'enabled':c==='mute'?'muted':'busy']!=='boolean')throw new Error('Estado de áudio inválido.');
    this.start();this.process.stdin.write(JSON.stringify(value)+'\n');
  }
  dispose() {
    const child=this.process;this.process=null;if(!child)return;
    // The dedicated process group includes capture, synthesis and playback.
    try{process.kill(-child.pid,'SIGTERM');}catch{}
    const timer=setTimeout(()=>{try{process.kill(-child.pid,'SIGKILL');}catch{}},2500);timer.unref();
  }
}
module.exports={AudioService};
