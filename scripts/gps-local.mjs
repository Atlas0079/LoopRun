import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const bin=process.env.PG_BIN||join(root,'.local-tools/Postgres.app/Contents/Versions/18/bin');
if(!existsSync(join(bin,'initdb')))throw new Error('请先安装 PostgreSQL / PostGIS，并通过 PG_BIN 指定 bin 目录。');
const envPath=join(root,'.env.gps.local'),data=join(root,'.local-runtime/postgres'),socket=join(root,'.local-runtime/socket');
mkdirSync(dirname(data),{recursive:true,mode:0o700});mkdirSync(socket,{recursive:true,mode:0o700});
if(!existsSync(envPath))writeFileSync(envPath,`DATABASE_URL=postgresql://looprun:${randomBytes(30).toString('base64url')}@127.0.0.1:55432/looprun_beta\nBETA_ACCESS_CODE=${randomBytes(6).toString('hex').toUpperCase()}\nGPS_HOST=127.0.0.1\nGPS_PORT=4180\n`,{mode:0o600});
process.loadEnvFile(envPath);
const url=new URL(process.env.DATABASE_URL),env={...process.env,PGPASSWORD:decodeURIComponent(url.password)};
function pg(command,args,quiet=false){return spawnSync(join(bin,command),args,{env,encoding:'utf8',stdio:quiet?'pipe':'inherit'});}
if(!existsSync(join(data,'PG_VERSION'))){
  const passwordFile=join(root,'.local-runtime/pg-password');writeFileSync(passwordFile,decodeURIComponent(url.password),{mode:0o600});
  if(pg('initdb',['-D',data,'--username=looprun','--encoding=UTF8','--locale=C','--auth-local=scram-sha-256','--auth-host=scram-sha-256','--pwfile='+passwordFile]).status!==0)process.exit(1);
}
if(pg('pg_ctl',['-D',data,'status'],true).status!==0&&pg('pg_ctl',['-D',data,'-l',join(root,'.local-runtime/postgres.log'),'-o',`-p ${url.port} -h 127.0.0.1 -k ${socket}`,'start']).status!==0)process.exit(1);
const args=['-h','127.0.0.1','-p',url.port,'-U',url.username];
const found=pg('psql',[...args,'-d','postgres','-Atc',"SELECT 1 FROM pg_database WHERE datname='looprun_beta'"],true);
if(found.status!==0)throw new Error('PostgreSQL 连接失败');
if(found.stdout.trim()!=='1'&&pg('createdb',[...args,'looprun_beta']).status!==0)process.exit(1);
console.log('Local GPS database ready. API: npm run gps:dev; invitation code is in .env.gps.local.');
