import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import {spawn} from 'node:child_process';
const project=path.resolve(import.meta.dirname,'..');
async function freePort(){return new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});}
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const basePayload={
  device_id:'smart-kitchen-001', temperature_c:29.2,humidity_pct:61,
  mq2_adc:null,mq2_status:'OFFLINE',gas_threshold_adc:4000,
  system_status:'TEST NORMAL',mode:'SIMULASI',servo_target_deg:10,
  led_red_on:false,led_green_on:true,buzzer_on:false,alarm_active:false
};
test('dashboard dan API dapat menerima, menyimpan, membaca serta menganalisis data',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'smartkitchen-test-'));
  const port=await freePort();const url=`http://127.0.0.1:${port}`;
  const env={...process.env,PORT:String(port),DEMO_LOCAL:'1',DATABASE_URL:'',LOCAL_DATA_FILE:path.join(dir,'data.json'),DEVICE_API_KEY:'test-device-key-123',DASHBOARD_USER:'admin-demo',DASHBOARD_PASSWORD:'test-password-123',TELEGRAM_BOT_TOKEN:'',TELEGRAM_CHAT_ID:''};
  const proc=spawn(process.execPath,['server.js'],{cwd:project,env,stdio:['ignore','pipe','pipe']});
  let log='';proc.stdout.on('data',c=>log+=c);proc.stderr.on('data',c=>log+=c);
  try{
    let healthy=false;
    for(let i=0;i<60;i++){try{const r=await fetch(url+'/health');if(r.ok){healthy=true;break;}}catch{} await pause(100);}
    assert.ok(healthy,'Server gagal start: '+log);
    const basic='Basic '+Buffer.from('admin-demo:test-password-123').toString('base64');
    const headers={Authorization:basic};
    let r=await fetch(url+'/');assert.equal(r.status,401);
    r=await fetch(url+'/',{headers});assert.equal(r.status,200);assert.match(await r.text(),/Smart Kitchen Safety/);
    r=await fetch(url+'/api/latest',{headers});assert.equal((await r.json()).data,null);
    const post=async(data,key=env.DEVICE_API_KEY)=>fetch(url+'/api/v1/telemetry',{method:'POST',headers:{'Content-Type':'application/json','X-Device-Key':key},body:JSON.stringify(data)});
    r=await post({...basePayload,sample_id:'sample_0001'},'wrong-key');assert.equal(r.status,401);
    r=await post({...basePayload,sample_id:'sample_0001',mq2_adc:4095});assert.equal(r.status,422);
    r=await post({...basePayload,sample_id:'sample_0001'});assert.equal(r.status,201);assert.equal((await r.json()).events,1);
    r=await post({...basePayload,sample_id:'sample_0001'});assert.equal(r.status,200);assert.equal((await r.json()).duplicate,true);
    r=await post({...basePayload,sample_id:'sample_0002',system_status:'TEST GAS',servo_target_deg:90,led_red_on:true,led_green_on:false,buzzer_on:true,alarm_active:true});assert.equal(r.status,201);assert.equal((await r.json()).events,2);
    r=await fetch(url+'/api/summary',{headers});let data=(await r.json()).data;
    assert.equal(data.sample_count,2);assert.equal(data.simulation_sample_count,2);assert.equal(data.real_sample_count,0);assert.equal(data.simulation_alarm_events,1);assert.equal(data.actuator_events,1);
    r=await fetch(url+'/api/events',{headers});data=(await r.json()).data;assert.equal(data.length,3);
    r=await fetch(url+'/api/latest',{headers});data=(await r.json()).data;assert.equal(data.system_status,'TEST GAS');
    r=await fetch(url+'/app.js',{headers});assert.equal(r.status,200);assert.match(await r.text(),/DATA SIMULASI/);
  }finally{
    proc.kill('SIGTERM');await pause(150);await fs.rm(dir,{recursive:true,force:true});
  }
});
