'use strict';
const $=id=>document.getElementById(id);
const WIB=new Intl.DateTimeFormat('id-ID',{timeZone:'Asia/Jakarta',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',second:'2-digit'});
const when=t=>t?WIB.format(new Date(t)):'—';
const show=(x,d=1)=>typeof x==='number'&&Number.isFinite(x)?x.toFixed(d):'—';
const safe=s=>String(s??'—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const b=x=>x?'ON':'OFF';
const isDanger=s=>['BAHAYA GAS','SUHU TINGGI','GAS + SUHU'].includes(s);
const first=(arr)=>arr&&arr.length?arr[0]:null;
async function get(path){const response=await fetch(path,{cache:'no-store'});if(!response.ok)throw Error(`HTTP ${response.status}`);return response.json();}
function plot(rows){
  const svg=$('chart');svg.replaceChildren();
  const real=rows.filter(r=>r.mode==='SENSOR'&&Number.isFinite(r.temperature_c)&&Number.isFinite(r.humidity_pct));
  const simulated=rows.filter(r=>r.mode==='SIMULASI'&&Number.isFinite(r.temperature_c)&&Number.isFinite(r.humidity_pct));
  const demo=real.length<2;
  const points=(demo?simulated:real).slice().reverse();
  const W=720,H=268,p={l:34,r:13,t:13,b:28},h=H-p.t-p.b,w=W-p.l-p.r;
  function node(name,attrs,text){const n=document.createElementNS('http://www.w3.org/2000/svg',name);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,v);if(text!==undefined)n.textContent=text;svg.append(n);return n;}
  if(points.length<2){node('text',{x:360,y:129,'text-anchor':'middle',fill:'#91a5b6','font-size':15},'Perlu minimal 2 data untuk grafik');return;}
  if(demo)node('text',{x:W/2,y:11,'text-anchor':'middle',fill:'#e8ac6e','font-size':12},'DATA SIMULASI — BUKAN HASIL SENSOR ASLI');
  const ymin=0,ymax=Math.max(50,Math.ceil(Math.max(...points.map(r=>Math.max(r.temperature_c,r.humidity_pct)))/10)*10);
  for(let j=0;j<=4;j++){const y=p.t+j*h/4;node('line',{x1:p.l,y1:y,x2:W-p.r,y2:y,stroke:'#284058','stroke-dasharray':'4 5'});node('text',{x:8,y:y+4,fill:'#8094a9','font-size':11},String(Math.round(ymax-j*(ymax-ymin)/4)));}
  for(const [field,color] of [['temperature_c','#47c6ee'],['humidity_pct','#aa93f8']]){
    const d=points.map((r,i)=>`${i?'L':'M'}${(p.l+i*w/(points.length-1)).toFixed(1)},${(p.t+(ymax-r[field])/(ymax-ymin)*h).toFixed(1)}`).join(' ');
    node('path',{d,stroke:color,'stroke-width':2.8,fill:'none','stroke-linejoin':'round','stroke-linecap':'round'});
  }
  node('text',{x:p.l,y:H-6,fill:'#8296ac','font-size':11},when(points[0].recorded_at));
  node('text',{x:W-p.r,y:H-6,'text-anchor':'end',fill:'#8296ac','font-size':11},when(points.at(-1).recorded_at));
}
function render(latest,rows,events,stats,meta){
  $('storage').textContent=meta.storage==='DEMO_LOCAL'?'Penyimpanan: demo lokal':'Database: PostgreSQL cloud';
  $('demoBanner').hidden=meta.storage!=='DEMO_LOCAL';
  $('lastSync').textContent=`Diperbarui: ${when(new Date().toISOString())}`;
  const stale=latest && (Date.now()-new Date(latest.recorded_at).getTime()>30000);
  const danger=latest&&(isDanger(latest.system_status)||(latest.system_status.startsWith('TEST')&&latest.system_status!=='TEST NORMAL'));
  $('systemStatus').textContent=latest? (stale?'DATA TIDAK TERBARU':latest.system_status):'Belum ada data';
  $('systemDetail').textContent=latest? `Data terakhir diterima ${when(latest.recorded_at)} · Perangkat ${latest.device_id}`:'Jalankan simulasi atau integrasikan ESP32 untuk mengisi dashboard.';
  $('onlineBadge').textContent=latest?(stale?'Offline / data lama':'Data terbaru tersedia'):'Belum terhubung';
  $('onlineBadge').className=`badge ${latest&&!stale?'ok':'neutral'}`;
  $('modeBadge').textContent=latest?`Mode: ${latest.mode}`:'Mode: —';
  $('modeBadge').className=`badge ${latest?.mode==='SIMULASI'?'danger':'neutral'}`;
  $('sensorBadge').textContent=latest?`MQ-2: ${latest.mq2_status}`:'MQ-2: —';
  $('hero')?.removeAttribute('data-unused');
  const hero=document.querySelector('.hero');hero.className=`hero ${stale||!latest?'neutral':danger?'danger':''}`;
  $('temp').textContent=show(latest?.temperature_c);$('humidity').textContent=show(latest?.humidity_pct);
  $('gas').textContent=latest?.mq2_status==='READY'&&latest.mq2_adc!==null?latest.mq2_adc:'—';
  $('alarms').textContent=stats.real_alarm_events;
  $('tempStat').textContent=`Rata-rata sensor asli: ${show(stats.temperature.avg)} °C`;
  $('humStat').textContent=`Rata-rata sensor asli: ${show(stats.humidity.avg)} %`;
  $('gasStat').textContent=latest?.mq2_status==='READY'?`Rentang ADC: ${show(stats.mq2_adc.min,0)}–${show(stats.mq2_adc.max,0)}`:`Sensor ${latest?.mq2_status??'belum ada'}`;
  $('alarmStat').textContent=`Simulasi: ${stats.simulation_alarm_events} event`;
  $('servo').textContent=latest?`${latest.servo_target_deg}° (perintah)`:'—';
  for(const [id,key] of [['red','led_red_on'],['green','led_green_on'],['buzzer','buzzer_on']]) $(''+id).textContent=latest?b(latest[key]):'—';
  $('threshold').textContent=latest&&latest.gas_threshold_adc!=null?`${latest.gas_threshold_adc} ADC`:'—';
  $('readings').innerHTML=rows.length?rows.slice(0,5).map(r=>`<tr><td>${safe(when(r.recorded_at))}</td><td>${safe(show(r.temperature_c))}°</td><td>${safe(r.mq2_status==='READY'?r.mq2_adc:r.mq2_status)}</td><td>${safe(r.mode)}</td><td>${safe(r.system_status)}</td></tr>`).join(''):'<tr><td colspan="5">Belum ada pembacaan</td></tr>';
  $('events').innerHTML=events.length?events.slice(0,9).map(e=>`<div class="event ${isDanger(e.to_status)?'warn':''}"><h4>${safe(e.type==='ACTUATOR_CHANGE'?'Perintah aktuator berubah':e.to_status)}</h4><p>${safe(e.type==='ACTUATOR_CHANGE'?Object.keys(e.detail||{}).join(', '):`${e.mode} · ${e.from_status||'awal'} → ${e.to_status}`)}</p><p>${safe(when(e.recorded_at))}</p></div>`).join(''):'<p>Belum ada peristiwa</p>';
  plot(rows);$('chartFoot').textContent=`${stats.real_sample_count} sampel sensor asli • ${stats.simulation_sample_count} sampel simulasi`;
}
let loading=false;
async function refresh(){
  if(loading)return;loading=true;
  try{
    const span=$('span').value;
    const [meta,latest,rows,events,stats]=await Promise.all([get('/api/meta'),get('/api/latest'),get('/api/telemetry?span='+span),get('/api/events?span='+span),get('/api/summary?span='+span)]);
    render(latest.data,rows.data,events.data,stats.data,meta);
  }catch(e){$('lastSync').textContent='Gagal mengambil data: '+e.message;}
  finally{loading=false;}
}
$('span').addEventListener('change',refresh);refresh();setInterval(refresh,5000);
