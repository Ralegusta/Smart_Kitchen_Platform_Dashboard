'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const {changesBetween,summary}=require('./logic');
function rangeMs(span) {return span==='1h'?3600000:span==='7d'?7*86400000:86400000;}
function bounds(span) {return new Date(Date.now()-rangeMs(span)).toISOString();}
function deviceFilter(rows,deviceId,cutoff) {return rows.filter(x=>x.device_id===deviceId&&x.recorded_at>=cutoff);}
async function localStore() {
  const filename=path.resolve(process.env.LOCAL_DATA_FILE||path.join(process.cwd(),'data','local.json'));
  await fs.mkdir(path.dirname(filename),{recursive:true});
  let state={telemetry:[],events:[]};
  try { state=JSON.parse(await fs.readFile(filename,'utf8')); } catch(e){if(e.code!=='ENOENT') throw e;}
  async function persist(){ await fs.writeFile(filename+'.tmp',JSON.stringify(state,null,2));await fs.rename(filename+'.tmp',filename);}
  let lock=Promise.resolve();
  return {
    mode:'DEMO_LOCAL',
    async insert(value){
      let result;
      // Serialkan penulisan JSON untuk menghindari tabrakan request
      lock=lock.then(async()=>{
        const sample_id=value.sample_id || randomUUID();
        const old=state.telemetry.find(x=>x.sample_id===sample_id);
        if(old) {result={record:old,events:[],duplicate:true};return;}
        const prev=state.telemetry.filter(x=>x.device_id===value.device_id).at(-1)||null;
        const record={...value,sample_id,id:state.telemetry.length+1,recorded_at:new Date().toISOString()};
        const ev=changesBetween(prev,record).map((e,i)=>({...e,id:state.events.length+i+1,recorded_at:record.recorded_at,device_id:record.device_id,sample_id,mode:record.mode}));
        state.telemetry.push(record);state.events.push(...ev);
        state.telemetry=state.telemetry.slice(-20000);state.events=state.events.slice(-20000);
        await persist();result={record,events:ev,duplicate:false};
      });
      await lock;return result;
    },
    async list(deviceId,span){return deviceFilter(state.telemetry,deviceId,bounds(span)).slice(-500).reverse();},
    async events(deviceId,span){return deviceFilter(state.events,deviceId,bounds(span)).slice(-100).reverse();},
    async stats(deviceId,span){
      const since=bounds(span);
      return summary(deviceFilter(state.telemetry,deviceId,since),deviceFilter(state.events,deviceId,since));
    },
    async latest(deviceId){return state.telemetry.filter(x=>x.device_id===deviceId).at(-1)||null;},
    async check(){return true;},
    async close(){}
  };
}
async function postgresStore() {
  const {Pool}=require('pg');
  const ssl=process.env.DATABASE_SSL_CA ? {ca:await fs.readFile(process.env.DATABASE_SSL_CA,'utf8'),rejectUnauthorized:true} : {rejectUnauthorized:true};
  const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl,max:5,connectionTimeoutMillis:8000});
  await pool.query(await fs.readFile(path.join(__dirname,'../sql/schema.sql'),'utf8'));
  return {
    mode:'POSTGRES_CLOUD',
    async insert(value){
      const client=await pool.connect();
      const sample_id=value.sample_id||randomUUID();
      try {
        await client.query('BEGIN');
        const q=`INSERT INTO telemetry
          (sample_id,device_id,temperature_c,humidity_pct,mq2_adc,mq2_status,gas_threshold_adc,system_status,mode,servo_target_deg,led_red_on,led_green_on,buzzer_on,alarm_active)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
          ON CONFLICT (sample_id) DO NOTHING RETURNING *`;
        const vals=[sample_id,value.device_id,value.temperature_c,value.humidity_pct,value.mq2_adc,value.mq2_status,value.gas_threshold_adc,value.system_status,value.mode,value.servo_target_deg,value.led_red_on,value.led_green_on,value.buzzer_on,value.alarm_active];
        const ins=await client.query(q,vals);
        if(!ins.rows.length){
          await client.query('COMMIT');
          return {record:(await pool.query('SELECT * FROM telemetry WHERE sample_id=$1',[sample_id])).rows[0],events:[],duplicate:true};
        }
        const record=ins.rows[0];
        const prev=(await client.query('SELECT * FROM telemetry WHERE device_id=$1 AND id<$2 ORDER BY id DESC LIMIT 1',[record.device_id,record.id])).rows[0]||null;
        const events=changesBetween(prev,record);
        for(const ev of events){
          await client.query('INSERT INTO device_events (device_id,sample_id,type,from_status,to_status,mode,detail) VALUES ($1,$2,$3,$4,$5,$6,$7)',[record.device_id,sample_id,ev.type,ev.from_status,ev.to_status,record.mode,ev.detail]);
        }
        await client.query('COMMIT');
        return {record,events:events.map(e=>({...e,device_id:record.device_id,mode:record.mode})),duplicate:false};
      } catch(e){await client.query('ROLLBACK');throw e;} finally{client.release();}
    },
    async list(deviceId,span){return (await pool.query('SELECT * FROM telemetry WHERE device_id=$1 AND recorded_at>=NOW()-($2::bigint * interval \'1 millisecond\') ORDER BY recorded_at DESC LIMIT 500',[deviceId,rangeMs(span)])).rows;},
    async events(deviceId,span){return (await pool.query('SELECT * FROM device_events WHERE device_id=$1 AND recorded_at>=NOW()-($2::bigint * interval \'1 millisecond\') ORDER BY recorded_at DESC LIMIT 100',[deviceId,rangeMs(span)])).rows;},
    async stats(deviceId,span){
      const [r,e]=await Promise.all([
        pool.query('SELECT * FROM telemetry WHERE device_id=$1 AND recorded_at>=NOW()-($2::bigint * interval \'1 millisecond\') ORDER BY recorded_at DESC LIMIT 20000',[deviceId,rangeMs(span)]),
        pool.query('SELECT * FROM device_events WHERE device_id=$1 AND recorded_at>=NOW()-($2::bigint * interval \'1 millisecond\') ORDER BY recorded_at DESC LIMIT 20000',[deviceId,rangeMs(span)])
      ]);
      return {...summary(r.rows,e.rows),analytics_limited:r.rows.length===20000||e.rows.length===20000};
    },
    async latest(deviceId){return (await pool.query('SELECT * FROM telemetry WHERE device_id=$1 ORDER BY id DESC LIMIT 1',[deviceId])).rows[0]||null;},
    async check(){await pool.query('SELECT 1');return true;},
    async close(){await pool.end();}
  };
}
async function createStore(){
  if(process.env.DATABASE_URL) return postgresStore();
  if(process.env.DEMO_LOCAL==='1') return localStore();
  throw Error('Atur DATABASE_URL untuk cloud atau DEMO_LOCAL=1 untuk latihan lokal');
}
module.exports={createStore};
