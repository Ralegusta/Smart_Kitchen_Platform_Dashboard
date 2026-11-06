'use strict';
const http=require('node:http');
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const {createStore}=require('./lib/storage');
const {validateTelemetry}=require('./lib/logic');
const {notifyTelegram}=require('./lib/telegram');
const PORT=Number(process.env.PORT||3000);
const DEVICE_ID=process.env.DEVICE_ID||'smart-kitchen-001';
const webRoot=path.join(__dirname,'public');
function safeEqual(a,b){
  const aBuf=Buffer.from(String(a||'')); const bBuf=Buffer.from(String(b||''));
  return aBuf.length===bBuf.length && crypto.timingSafeEqual(aBuf,bBuf);
}
function send(res,status,payload,contentType='application/json; charset=utf-8'){
  const body= typeof payload==='string'?payload:JSON.stringify(payload);
  res.writeHead(status,{'Content-Type':contentType,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY',
    'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"});
  res.end(body);
}
function unauth(res) { res.setHeader('WWW-Authenticate','Basic realm="Smart Kitchen Dashboard", charset="UTF-8"');send(res,401,{error:'Masuk dengan akun dashboard terlebih dahulu'}); }
function authDashboard(req){
  const authorization=req.headers.authorization||'';
  if(!authorization.startsWith('Basic '))return false;
  let creds;
  try {creds=Buffer.from(authorization.slice(6),'base64').toString('utf8');}catch{return false;}
  const separator=creds.indexOf(':');if(separator<0)return false;
  return safeEqual(creds.slice(0,separator),process.env.DASHBOARD_USER)&&safeEqual(creds.slice(separator+1),process.env.DASHBOARD_PASSWORD);
}
function readJson(req) {
  return new Promise((resolve,reject)=>{
    const chunks=[];let length=0;
    req.on('data',chunk=>{length+=chunk.length;if(length>16384){reject(Object.assign(Error('Payload terlalu besar'),{status:413}));req.destroy();return;}chunks.push(chunk);});
    req.on('end',()=>{try{resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));}catch{reject(Object.assign(Error('JSON tidak valid'),{status:400}));}});
    req.on('error',reject);
  });
}
async function main() {
  for(const name of ['DEVICE_API_KEY','DASHBOARD_USER','DASHBOARD_PASSWORD']) {
    if(!process.env[name]||process.env[name].length<8)throw Error(`Environment ${name} harus diisi (minimum 8 karakter)`);
  }
  const store=await createStore();
  const server=http.createServer(async(req,res)=>{
    const url=new URL(req.url||'/',`http://${req.headers.host||'localhost'}`);
    try {
      if(url.pathname==='/health'&&req.method==='GET') {await store.check();return send(res,200,{ok:true,storage:store.mode});}
      if(url.pathname==='/api/v1/telemetry'&&req.method==='POST'){
        if(!safeEqual(req.headers['x-device-key'],process.env.DEVICE_API_KEY))return send(res,401,{error:'Device key salah'});
        const result=validateTelemetry(await readJson(req));
        if(result.errors)return send(res,422,{error:'Data tidak valid',details:result.errors});
        const saved=await store.insert(result.value);
        if(!saved.duplicate)void notifyTelegram(saved.record,saved.events);
        return send(res,saved.duplicate?200:201,{ok:true,duplicate:saved.duplicate,sample_id:saved.record.sample_id,recorded_at:saved.record.recorded_at,events:saved.events.length});
      }
      if(!authDashboard(req))return unauth(res);
      if(req.method!=='GET')return send(res,405,{error:'Metode tidak diperbolehkan'});
      const id=url.searchParams.get('device_id')||DEVICE_ID;
      if(!/^[a-zA-Z0-9_-]{3,64}$/.test(id))return send(res,400,{error:'device_id tidak valid'});
      const span=url.searchParams.get('span')||'24h';
      if(!['1h','24h','7d'].includes(span))return send(res,400,{error:'span tidak valid'});
      if(url.pathname==='/api/meta')return send(res,200,{storage:store.mode,device_id:DEVICE_ID,span_options:['1h','24h','7d'],refresh_seconds:5});
      if(url.pathname==='/api/latest')return send(res,200,{data:await store.latest(id)});
      if(url.pathname==='/api/telemetry')return send(res,200,{data:await store.list(id,span)});
      if(url.pathname==='/api/events')return send(res,200,{data:await store.events(id,span)});
      if(url.pathname==='/api/summary')return send(res,200,{data:await store.stats(id,span)});
      const files={'/':'index.html','/index.html':'index.html','/style.css':'style.css','/app.js':'app.js'};
      const file=files[url.pathname];
      if(file){
        const type=file.endsWith('.css')?'text/css; charset=utf-8':file.endsWith('.js')?'text/javascript; charset=utf-8':'text/html; charset=utf-8';
        return send(res,200,await fs.readFile(path.join(webRoot,file),'utf8'),type);
      }
      send(res,404,{error:'Halaman tidak ditemukan'});
    } catch(e){
      console.error('Kesalahan API:',e.message);
      if(!res.headersSent)send(res,e.status||500,{error:e.status?e.message:'Terjadi kesalahan server'});
    }
  });
  server.listen(PORT,'0.0.0.0',()=>console.log(`Smart Kitchen (${store.mode}) di http://localhost:${PORT}`));
  process.on('SIGTERM',async()=>{server.close();await store.close();process.exit(0);});
  process.on('SIGINT',async()=>{server.close();await store.close();process.exit(0);});
}
main().catch(e=>{console.error('Gagal menjalankan aplikasi:',e.message);process.exit(1);});
