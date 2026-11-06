// Hanya data simulasi untuk pengujian dashboard, BUKAN pembacaan ESP32.
const url=process.env.API_URL||'http://localhost:3000/api/v1/telemetry';
const token=process.env.DEVICE_API_KEY;
if(!token){console.error('Isi DEVICE_API_KEY di environment dahulu.');process.exit(1);}
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const id=Date.now().toString(36);
const states=['TEST GAS','TEST GAS','TEST SUHU','TEST G+S','TEST GAS','TEST SUHU'];
for(let i=0;i<18;i++){
  const active=i>=7&&i<13;
  const status=active?states[i-7]:'TEST NORMAL';
  const data={
    sample_id:`demo_${id}_${String(i).padStart(3,'0')}`,
    device_id:'smart-kitchen-001',
    temperature_c:27+Math.sin(i/3)*2+i*.15,
    humidity_pct:62-Math.sin(i/5)*4,
    mq2_adc:null,mq2_status:'OFFLINE',gas_threshold_adc:4000,
    system_status:status,mode:'SIMULASI',servo_target_deg:active?90:10,
    led_red_on:active,led_green_on:!active,buzzer_on:active,alarm_active:active
  };
  const res=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','X-Device-Key':token},body:JSON.stringify(data)});
  if(!res.ok){console.error('Gagal:',res.status,await res.text());process.exit(1);}
  console.log(i+1,'/18 data SIMULASI terkirim');await pause(280);
}
console.log('Demo selesai. Dashboard berisi data SIMULASI, bukan sensor asli.');
