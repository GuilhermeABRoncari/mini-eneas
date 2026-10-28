// Real native capture, fixture transcription, local AI and voice playback.
import {_electron as electron} from 'playwright-core';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
const run=promisify(execFile),root=process.cwd();
const temporary=await mkdtemp(path.join(os.tmpdir(),'eneas-audio-test-'));
let app;
try {
  const fixture=path.join(root,'data/verified-question-fixture.wav');
  const {stdout}=await run('/usr/bin/python',['-c','from core import transcribe_audio; import sys; print(transcribe_audio(sys.argv[1]))',fixture],{cwd:root,timeout:120000});
  const text=stdout.trim();assert.match(text,/capital do Brasil/i);console.log('Transcrição real:',text);
  app=await electron.launch({args:['.','--studio','--no-sandbox'],env:{...process.env,MINI_ENEAS_DATA_DIR:temporary},timeout:60000});
  const page=await app.firstWindow();
  await page.waitForFunction(()=>window.eneasAudio&&document.querySelector('#chat-mode')?.textContent.includes('IA local'));
  await page.evaluate(()=>{window.__audioEvents=[];window.eneasAudio.onEvent(e=>window.__audioEvents.push(e));});
  await page.waitForFunction(()=>window.__audioEvents.some(e=>e.event==='level'),{},{timeout:45000});
  console.log('Microfone real: nível recebido.');
  await page.locator('#microphone-toggle').click();
  await page.waitForFunction(()=>document.querySelector('#microphone-status').textContent==='Microfone pausado');
  await page.locator('#microphone-toggle').click();
  // Deliver the actual Whisper transcription through the same IPC event as capture.
  await app.evaluate(({BrowserWindow},text)=>BrowserWindow.getAllWindows()[0].webContents.send('mini:audio-event',{event:'transcript',text}),text);
  await page.waitForFunction(()=>document.querySelector('#chat-status').textContent==='✓ Resposta concluída.',{},{timeout:120000});
  assert.match(await page.locator('#chat-log').innerText(),/Brasília/i);
  console.log('Resposta real da IA:',await page.locator('#chat-log').innerText());
  await page.waitForFunction(()=>window.__audioEvents.some(e=>e.state==='speaking'),{},{timeout:240000});
  await page.waitForFunction(()=>{const events=window.__audioEvents;const i=events.findLastIndex(e=>e.state==='speaking');return i>=0&&events.slice(i+1).some(e=>e.state==='listening');},{},{timeout:120000});
  const errors=await page.evaluate(()=>window.__audioEvents.filter(e=>e.event==='error'));assert.deepEqual(errors,[]);
  await page.screenshot({path:'previews/microfone-integrado.png'});
  console.log('PASSOU: captura real, pausa/retomada, Whisper, chat/IA local, síntese, reprodução completa e retomada da escuta.');
}finally{await app?.close();await rm(temporary,{recursive:true,force:true});}
