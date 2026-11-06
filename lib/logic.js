'use strict';
const STATES = new Set(['NORMAL','BAHAYA GAS','SUHU TINGGI','GAS + SUHU','ERROR DHT11','WARMUP','TEST GAS','TEST SUHU','TEST G+S','TEST NORMAL','MQ2 OFFLINE']);
const MODES = new Set(['SENSOR','SIMULASI']);
const MQ_STATES = new Set(['READY','OFFLINE','WARMUP','ERROR']);
const isBool = (x) => typeof x === 'boolean';
const isNum = (x, min, max) => typeof x === 'number' && Number.isFinite(x) && x >= min && x <= max;
function checkNullable(value, fn, name, errs) {
  if (value !== null && value !== undefined && !fn(value)) errs.push(name + ' tidak valid');
}
function validateTelemetry(input) {
  const errs=[];
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {errors:['JSON harus berupa objek']};
  const v={
    sample_id: input.sample_id,
    device_id: input.device_id,
    temperature_c: input.temperature_c ?? null,
    humidity_pct: input.humidity_pct ?? null,
    mq2_adc: input.mq2_adc ?? null,
    mq2_status: input.mq2_status,
    gas_threshold_adc: input.gas_threshold_adc ?? null,
    system_status: input.system_status,
    mode: input.mode,
    servo_target_deg: input.servo_target_deg,
    led_red_on: input.led_red_on,
    led_green_on: input.led_green_on,
    buzzer_on: input.buzzer_on,
    alarm_active: input.alarm_active
  };
  if (typeof v.device_id !== 'string' || !/^[a-zA-Z0-9_-]{3,64}$/.test(v.device_id)) errs.push('device_id harus 3-64 karakter a-z, 0-9, - atau _');
  if (v.sample_id !== undefined && (typeof v.sample_id !== 'string' || !/^[a-zA-Z0-9_-]{8,96}$/.test(v.sample_id))) errs.push('sample_id tidak valid');
  if (!STATES.has(v.system_status)) errs.push('system_status tidak dikenal');
  if (!MODES.has(v.mode)) errs.push('mode tidak valid');
  if (!MQ_STATES.has(v.mq2_status)) errs.push('mq2_status tidak valid');
  checkNullable(v.temperature_c, x=>isNum(x,-40,100),'temperature_c',errs);
  checkNullable(v.humidity_pct, x=>isNum(x,0,100),'humidity_pct',errs);
  checkNullable(v.mq2_adc, x=>Number.isInteger(x)&&x>=0&&x<=4095,'mq2_adc',errs);
  checkNullable(v.gas_threshold_adc, x=>Number.isInteger(x)&&x>=0&&x<=4095,'gas_threshold_adc',errs);
  if (v.mq2_status !== 'READY' && v.mq2_adc !== null) errs.push('mq2_adc harus null jika sensor tidak READY');
  if (!Number.isInteger(v.servo_target_deg) || v.servo_target_deg < 0 || v.servo_target_deg > 180) errs.push('servo_target_deg harus 0..180');
  for (const key of ['led_red_on','led_green_on','buzzer_on','alarm_active']) if (!isBool(v[key])) errs.push(key+' harus true/false');
  if (v.mode === 'SIMULASI' && !v.system_status.startsWith('TEST')) errs.push('mode SIMULASI harus menggunakan status TEST');
  if (v.mode === 'SENSOR' && v.system_status.startsWith('TEST')) errs.push('status TEST harus bermode SIMULASI');
  if (v.system_status === 'NORMAL' && v.mq2_status !== 'READY') errs.push('NORMAL hanya jika MQ-2 READY');
  if (errs.length) return {errors:errs};
  return {value:v};
}
const riskStatus = s => ['BAHAYA GAS','SUHU TINGGI','GAS + SUHU'].includes(s);
function changesBetween(prev, record) {
  if (!prev) return [{type:'INITIAL', from_status:null,to_status:record.system_status,detail:{note:'Sampel pertama perangkat'}}];
  const events=[];
  if (prev.system_status!==record.system_status || prev.mode!==record.mode)
    events.push({type:'STATUS_CHANGE',from_status:prev.system_status,to_status:record.system_status,detail:{from_mode:prev.mode,to_mode:record.mode}});
  const fields=['servo_target_deg','led_red_on','led_green_on','buzzer_on','alarm_active'];
  const diff={};
  for(const field of fields) if(prev[field]!==record[field]) diff[field]={from:prev[field],to:record[field]};
  if(Object.keys(diff).length) events.push({type:'ACTUATOR_CHANGE',from_status:prev.system_status,to_status:record.system_status,detail:diff});
  return events;
}
function summary(rows, events) {
  const nums=(field)=>rows.map(x=>x[field]).filter(Number.isFinite);
  const stats=(arr)=>arr.length ? {min:Math.min(...arr),max:Math.max(...arr),avg:Math.round(arr.reduce((a,b)=>a+b,0)/arr.length*100)/100} : {min:null,max:null,avg:null};
  const real=rows.filter(x=>x.mode==='SENSOR');
  const test=rows.filter(x=>x.mode==='SIMULASI');
  return {
    sample_count: rows.length, real_sample_count:real.length, simulation_sample_count:test.length,
    temperature:stats(real.map(x=>x.temperature_c).filter(Number.isFinite)),
    humidity:stats(real.map(x=>x.humidity_pct).filter(Number.isFinite)),
    mq2_adc:stats(real.filter(x=>x.mq2_status==='READY').map(x=>x.mq2_adc).filter(Number.isFinite)),
    real_alarm_events:events.filter(x=>['STATUS_CHANGE','INITIAL'].includes(x.type)&&x.mode==='SENSOR'&&riskStatus(x.to_status)).length,
    simulation_alarm_events:events.filter(x=>['STATUS_CHANGE','INITIAL'].includes(x.type)&&x.mode==='SIMULASI'&&x.to_status.startsWith('TEST')&&x.to_status!=='TEST NORMAL').length,
    actuator_events:events.filter(x=>x.type==='ACTUATOR_CHANGE').length
  };
}
module.exports={validateTelemetry, changesBetween,summary,riskStatus};
