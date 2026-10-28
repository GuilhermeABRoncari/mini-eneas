const { app, BrowserWindow, Menu, Tray, nativeImage, screen, ipcMain, session, safeStorage } = require('electron');
const { AiService, AiError } = require('../dist/ai.cjs');
const fs = require('node:fs');
const {LocalTransport} = require('./local-ai.cjs');
const {AudioService} = require('./audio.cjs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
app.setName('Mini Enéas');
app.setPath('userData', process.env.MINI_ENEAS_DATA_DIR || path.join(app.getPath('appData'), 'mini-eneas'));
let window, tray, saveTimer, ai, audio, localTransport;
const studio = process.argv.includes('--studio');
const page = path.join(__dirname, '..', 'dist', 'index.html');
const settingsFile = () => path.join(app.getPath('userData'), 'window.json');
function readPosition() {
  try {
    const saved = JSON.parse(fs.readFileSync(settingsFile(), 'utf8'));
    if (!Number.isInteger(saved.x) || !Number.isInteger(saved.y)) return {};
    const area = screen.getDisplayMatching({ x:saved.x,y:saved.y,width:420,height:720 }).workArea;
    return { x:Math.max(area.x,Math.min(saved.x,area.x+Math.max(0,area.width-420))), y:Math.max(area.y,Math.min(saved.y,area.y+Math.max(0,area.height-720))) };
  } catch { return {}; }
}
function savePosition() {
  if (studio || !window || window.isDestroyed()) return;
  try {
    fs.mkdirSync(app.getPath('userData'), { recursive:true, mode:0o700 });
    const { x,y } = window.getBounds();
    const temporary = settingsFile()+'.tmp';
    fs.writeFileSync(temporary,JSON.stringify({ x,y }),{ mode:0o600 }); fs.renameSync(temporary,settingsFile());
  } catch { /* Falha de persistência não impede o uso. */ }
}
function trusted(event) { return window && event.sender === window.webContents && event.senderFrame === window.webContents.mainFrame; }
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance',()=>{ if (window) { window.show(); window.restore(); window.focus(); } });
  app.whenReady().then(async()=>{
    localTransport=new LocalTransport(path.join(__dirname,'..'));
    ai=new AiService(app.getPath('userData'),{
      // Electron 45: o backend síncrono é verificável; nunca aceitar basic_text.
      available:()=>safeStorage.isEncryptionAvailable() && (process.platform!=='linux'||['gnome_libsecret','kwallet','kwallet5','kwallet6'].includes(safeStorage.getSelectedStorageBackend())),
      encrypt:text=>safeStorage.encryptString(text),decrypt:bytes=>safeStorage.decryptString(bytes),
    },localTransport);
    if(!fs.existsSync(path.join(app.getPath('userData'),'ai.json'))&&fs.existsSync(path.join(__dirname,'../models/qwen3-1.7b-q4_k_m.gguf'))) {
      await ai.save({provider:'local',model:'Qwen3 1.7B local',ollamaUrl:'http://127.0.0.1:11434',temperament:'dramatico',rememberKey:false});
    }
    session.defaultSession.setPermissionRequestHandler((_contents,_permission,callback)=>callback(false));
    session.defaultSession.setPermissionCheckHandler(()=>false);
    const area = screen.getPrimaryDisplay().workArea;
    window = new BrowserWindow({ width:studio ? Math.min(1160,area.width) : 420,height:studio ? Math.min(960,area.height) : Math.min(720,area.height),
      ...(studio ? {} : readPosition()), frame:false,transparent:!studio,backgroundColor:studio?'#e8e9df':'#00000000',hasShadow:false,
      resizable:studio,alwaysOnTop:!studio,show:false,autoHideMenuBar:true,
      webPreferences:{ preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true,devTools:false },
    });
    window.webContents.setWindowOpenHandler(()=>({ action:'deny' }));
    window.webContents.on('will-navigate',event=>event.preventDefault());
    window.once('ready-to-show',()=>window.show());
    window.on('move',()=>{ clearTimeout(saveTimer); saveTimer=setTimeout(savePosition,300); });
    window.on('close',savePosition);
    window.on('closed',()=>{ window=null; app.quit(); });
    ipcMain.on('mini:minimize',event=>{ if (trusted(event)) window.minimize(); });
    ipcMain.on('mini:quit',event=>{ if (trusted(event)) app.quit(); });
    ipcMain.on('mini:panel',(event,open)=>{
      if (!trusted(event) || typeof open!=='boolean' || studio) return;
      const work=screen.getDisplayMatching(window.getBounds()).workArea;
      window.setSize(420,Math.min(open?940:720,work.height));
    });
    const handle=(channel,fn)=>ipcMain.handle(channel,async(event,...args)=>{
      if(!trusted(event))throw new Error('Origem não autorizada.');
      try{return await fn(...args);}catch(error){throw new Error(error instanceof AiError?error.message:'Não foi possível concluir. Confira as configurações e tente novamente.');}
    });
    audio=new AudioService(path.join(__dirname,'..'),value=>{if(window&&!window.isDestroyed())window.webContents.send('mini:audio-event',value);});
    handle('mini:audio-command',value=>audio.command(value));
    handle('mini:ai-settings',()=>ai.settings());
    handle('mini:ai-save',value=>ai.save(value));
    handle('mini:ai-models',()=>ai.models());
    handle('mini:ai-start',(id,text)=>ai.start(id,text,event=>{if(window&&!window.isDestroyed())window.webContents.send('mini:ai-event',event);}));
    handle('mini:ai-cancel',id=>{if(typeof id==='string')ai.cancel(id);});
    handle('mini:ai-clear',()=>ai.clear());
    window.webContents.on('render-process-gone',()=>{ai.dispose();audio?.dispose();localTransport?.dispose();});
    // Ícone original gerado em memória; sem arquivos ou serviços externos.
    try {
      const width=32, pixels=Buffer.alloc(width*width*4);
      for(let y=0;y<width;y++) for(let x=0;x<width;x++) {
        const i=(y*width+x)*4, face=(x-16)**2+(y-15)**2<140, eye=(y>=10&&y<=14&&((x>=8&&x<=12)||(x>=20&&x<=24)));
        pixels[i]=eye?28:face?223:41; pixels[i+1]=eye?40:face?179:74; pixels[i+2]=eye?36:face?133:61; pixels[i+3]=255;
      }
      tray=new Tray(nativeImage.createFromBitmap(pixels,{ width,height:width,scaleFactor:1 }));
      tray.setToolTip('Mini Enéas · protótipo local');
      tray.setContextMenu(Menu.buildFromTemplate([{ label:'Mostrar Mini Enéas',click:()=>{window?.show();window?.restore();} },{type:'separator'},{label:'Encerrar',click:()=>app.quit()}]));
      tray.on('click',()=>{window?.show();window?.restore();});
    } catch { /* Minimizar mantém o aplicativo acessível pela barra do sistema. */ }
    await window.loadURL(pathToFileURL(page).href+(studio?'?studio=1':''));
  });
  app.on('before-quit',()=>{clearTimeout(saveTimer);savePosition();ai?.dispose();audio?.dispose();localTransport?.dispose();tray?.destroy();});
  app.on('window-all-closed',()=>app.quit());
}
