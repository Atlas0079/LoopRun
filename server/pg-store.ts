import { Pool, type PoolClient } from 'pg';
import { readFile } from 'node:fs/promises';
import { emptyState } from './game.mjs';
import { cellCenter } from '../shared/geo.mjs';

export type World = {
  version:number; demoOffsetMs:number;
  players: Record<string, any>; pools: Record<string, any>; activities: Record<string, any>;
  sessions: Record<string, any>; invites: Record<string, any>; events: any[];
};
export type Sample = {seq:number;lat:number;lng:number;time:number;accuracy:number};
const collections = ['players','pools','activities','sessions','invites','events'] as const;
const lock = 'SELECT pg_advisory_xact_lock(7242051)';
const same = (a:unknown,b:unknown) => JSON.stringify(a)===JSON.stringify(b);

export class PgStore {
  readonly db: Pool;
  constructor(url:string){this.db=new Pool({connectionString:url,max:8});}
  async init(environment:'gps'|'development'='gps'){
    await this.db.query(await readFile(new URL('./schema.sql',import.meta.url),'utf8'));
    const row=(await this.db.query('SELECT schema_version FROM gps_meta WHERE id=1')).rows[0];
    if(row.schema_version!==1)throw new Error('GPS 数据库结构不匹配，请使用当前独立内测库。');
    await this.db.query('INSERT INTO gps_environment VALUES (1,$1) ON CONFLICT DO NOTHING',[environment]);
    const marker=(await this.db.query('SELECT name FROM gps_environment WHERE id=1')).rows[0];
    if(marker.name!==environment)throw new Error('数据库环境不匹配，普通 GPS 与开发测试必须使用独立数据库。');
  }
  private async load(c:Pool|PoolClient):Promise<World>{
    const state=emptyState() as World;
    for(const table of collections){
      const rows=(await c.query(`SELECT id,data FROM ${table}`)).rows;
      if(table==='events')state.events=rows.map(r=>r.data).sort((a,b)=>a.time-b.time);
      else for(const row of rows)(state[table] as Record<string,any>)[row.id]=row.data;
    }
    for(const p of Object.values(state.pools))p.cells={};
    for(const row of (await c.query('SELECT pool_id,cell_key,owner_id,fortification FROM territory_cells')).rows){
      if(state.pools[row.pool_id])state.pools[row.pool_id].cells[row.cell_key]={owner:row.owner_id,fortification:row.fortification};
    }
    return state;
  }
  async read(){
    const c=await this.db.connect();
    try{await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');const result=await this.load(c);await c.query('COMMIT');return result;}
    catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
  }
  private async save(c:PoolClient,before:World,after:World){
    for(const table of collections){
      const a:Record<string,any>=table==='events'?Object.fromEntries(before.events.map(e=>[e.id,e])):before[table];
      const b:Record<string,any>=table==='events'?Object.fromEntries(after.events.map(e=>[e.id,e])):after[table];
      for(const [id,value] of Object.entries(b)){
        if(same(a[id],value))continue;
        const data=table==='pools'?Object.fromEntries(Object.entries(value).filter(([k])=>k!=='cells')):value;
        if(table==='activities')await c.query('INSERT INTO activities(id,player_id,data) VALUES($1,$2,$3) ON CONFLICT(id) DO UPDATE SET data=EXCLUDED.data',[id,value.playerId,data]);
        else await c.query(`INSERT INTO ${table}(id,data) VALUES($1,$2) ON CONFLICT(id) DO UPDATE SET data=EXCLUDED.data`,[id,data]);
      }
      for(const id of Object.keys(a))if(!b[id])await c.query(`DELETE FROM ${table} WHERE id=$1`,[id]);
    }
    for(const pool of Object.values(after.pools)){
      const old=before.pools[pool.id]?.cells||{};
      for(const [key,cell] of Object.entries(pool.cells) as [string,any][]){
        if(same(old[key],cell))continue;
        const center=cellCenter(key);
        await c.query('INSERT INTO territory_cells(pool_id,cell_key,owner_id,fortification,center) VALUES($1,$2,$3,$4,ST_SetSRID(ST_MakePoint($5,$6),4326)) ON CONFLICT(pool_id,cell_key) DO UPDATE SET owner_id=EXCLUDED.owner_id,fortification=EXCLUDED.fortification',[pool.id,key,cell.owner,cell.fortification,center.lng,center.lat]);
      }
    }
  }
  async change<T>(fn:(s:World)=>T|Promise<T>):Promise<T>{
    const c=await this.db.connect();
    try{
      await c.query('BEGIN');await c.query(lock);
      const before=await this.load(c),next=structuredClone(before),result=await fn(next);
      await this.save(c,before,next);await c.query('COMMIT');return result;
    }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
  }
  async append(playerId:string,activityId:string,points:Sample[],now:number){
    const c=await this.db.connect();
    try{
      await c.query('BEGIN');await c.query(lock);
      const a=(await c.query('SELECT player_id,data FROM activities WHERE id=$1',[activityId])).rows[0];
      if(!a||a.player_id!==playerId)throw new Error('活动不存在。');
      if(a.data.status!=='active')throw new Error('活动已经结束，不能继续上传。');
      let through=Number((await c.query('SELECT COALESCE(MAX(seq),0) AS seq FROM run_samples WHERE activity_id=$1',[activityId])).rows[0].seq);
      for(const point of points){
        if(!Number.isInteger(point.seq)||point.seq<1||point.seq>6000||![point.lat,point.lng,point.time,point.accuracy].every(Number.isFinite)||Math.abs(point.lat)>80||Math.abs(point.lng)>180||point.accuracy<0||point.accuracy>80||!Number.isSafeInteger(point.time)||point.time<a.data.startedAt-10000||point.time>now+10000)throw new Error('采样格式、时间或精度无效。');
        if(point.seq<=through){
          const old=(await c.query('SELECT lat,lng,recorded_at,accuracy FROM run_samples WHERE activity_id=$1 AND seq=$2',[activityId,point.seq])).rows[0];
          if(!old||old.lat!==point.lat||old.lng!==point.lng||Number(old.recorded_at)!==point.time||old.accuracy!==point.accuracy)throw new Error('相同采样序号内容冲突，未覆盖原始轨迹。');
        }else{
          if(point.seq!==through+1)throw new Error(`采样序号不连续，请从 ${through+1} 继续上传。`);
          await c.query('INSERT INTO run_samples VALUES($1,$2,$3,$4,$5,$6)',[activityId,point.seq,point.lat,point.lng,point.time,point.accuracy]);through=point.seq;
        }
      }
      await c.query('COMMIT');return {acceptedThrough:through};
    }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
  }
  async samples(id:string){return (await this.db.query('SELECT seq,lat,lng,recorded_at,accuracy FROM run_samples WHERE activity_id=$1 ORDER BY seq',[id])).rows.map(p=>({seq:p.seq,lat:p.lat,lng:p.lng,time:Number(p.recorded_at),accuracy:p.accuracy}));}
  async cells(poolId:string,bbox:number[],owner?:string){
    const params:unknown[]=[poolId,...bbox];
    const filter=owner?' AND owner_id=$6':'';if(owner)params.push(owner);
    const rows=(await this.db.query(`SELECT cell_key AS key,owner_id AS owner,fortification FROM territory_cells WHERE pool_id=$1 AND center && ST_MakeEnvelope($2,$3,$4,$5,4326)${filter} ORDER BY cell_key LIMIT 3001`,params)).rows;
    return {cells:rows.slice(0,3000),limited:rows.length>3000};
  }
  async close(){await this.db.end();}
}
