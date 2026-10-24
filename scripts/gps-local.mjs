import {existsSync,mkdirSync,writeFileSync,unlinkSync,readdirSync} from 'node:fs';
import {resolve,dirname,join,delimiter} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const windows=process.platform==='win32',exe=windows?'.exe':'';
const installed=windows?join(process.env.ProgramFiles||'C:/Program Files','PostgreSQL'):null;
const candidates=[process.env.PG_BIN,join(root,'.local-tools/pgsql/bin'),join(root,'.local-tools/Postgres.app/Contents/Versions/18/bin'),...(installed&&existsSync(installed)?readdirSync(installed).sort((a,b)=>Number(b)-Number(a)).map(v=>join(installed,v,'bin')):[]),...(process.env.PATH||'').split(delimiter)];
const bin=candidates.filter(Boolean).find(p=>existsSync(join(p,'initdb'+exe)));
if(!bin)throw new Error('请先安装 PostgreSQL / PostGIS，或解压至 .local-tools/pgsql；也可通过 PG_BIN 指定 bin 目录。');
const development=process.argv.includes('--development');
const envPath=join(root,development?'.env.development.local':'.env.gps.local'),data=join(root,'.local-runtime/postgres'),socket=join(root,'.local-runtime/socket');
mkdirSync(dirname(data),{recursive:true,mode:0o700});mkdirSync(socket,{recursive:true,mode:0o700});
if(!existsSync(envPath)){
  let databaseUrl;
  if(development){
    const ordinary=join(root,'.env.gps.local');if(!existsSync(ordinary))throw new Error('请先运行 npm run gps:db 初始化本机 PostgreSQL。');
    // Reuse the local cluster credentials while keeping a separate database and invitation.
    const {parseEnv}=await import('node:util');databaseUrl=new URL(parseEnv((await import('node:fs')).readFileSync(ordinary,'utf8')).DATABASE_URL);databaseUrl.pathname='/looprun_development';
  }else databaseUrl=new URL(`postgresql://looprun:${randomBytes(30).toString('base64url')}@127.0.0.1:55432/looprun_beta`);
  writeFileSync(envPath,`DATABASE_URL=${databaseUrl}\nBETA_ACCESS_CODE=${randomBytes(6).toString('hex').toUpperCase()}\nGPS_HOST=127.0.0.1\nGPS_PORT=${development?4182:4180}\nGPS_DEVELOPER_MODE=${development}\n`,{mode:0o600});
}
process.loadEnvFile(envPath);
const url=new URL(process.env.DATABASE_URL);
if(!['127.0.0.1','localhost'].includes(url.hostname))throw new Error('gps:db 只管理本机数据库；远程数据库请独立配置和启动。');
const database=decodeURIComponent(url.pathname.slice(1)),user=decodeURIComponent(url.username),port=url.port||'5432';
if(!database||!user)throw new Error('DATABASE_URL 需指定数据库与用户名。');
const env={...process.env,PGPASSWORD:decodeURIComponent(url.password)};
function pg(command,args,quiet=false){
  const result=spawnSync(join(bin,command+exe),args,{env,encoding:'utf8',stdio:quiet?'pipe':'inherit'});
  if(result.error)throw result.error;return result;
}
function requireSuccess(result,message){if(result.status!==0)throw new Error(message);return result;}
if(!existsSync(join(data,'PG_VERSION'))){
  const passwordFile=join(root,'.local-runtime/pg-password');writeFileSync(passwordFile,decodeURIComponent(url.password),{mode:0o600});
  try{requireSuccess(pg('initdb',['-D',data,'--username='+user,'--encoding=UTF8','--locale=C','--auth-local=scram-sha-256','--auth-host=scram-sha-256','--pwfile='+passwordFile]),'数据库初始化失败。');}
  finally{unlinkSync(passwordFile);}
}
if(pg('pg_ctl',['-D',data,'status'],true).status!==0){
  const options=`-p ${port} -h 127.0.0.1${windows?'':` -k "${socket}"`}`;
  requireSuccess(pg('pg_ctl',['-D',data,'-l',join(root,'.local-runtime/postgres.log'),'-o',options,'-w','start']),'数据库启动失败。');
}
const args=['-h','127.0.0.1','-p',port,'-U',user];
const found=requireSuccess(pg('psql',[...args,'-d','postgres','-Atc',`SELECT 1 FROM pg_database WHERE datname='${database.replaceAll("'","''")}'`],true),'PostgreSQL 连接失败，请核对 .env.gps.local。');
if(found.stdout.trim()!=='1')requireSuccess(pg('createdb',[...args,database]),'创建数据库失败。');
const extension=pg('psql',[...args,'-d',database,'-v','ON_ERROR_STOP=1','-c','CREATE EXTENSION IF NOT EXISTS postgis'],true);
if(extension.status!==0){console.error(extension.stderr);throw new Error('PostGIS 初始化失败，请安装与 PostgreSQL 主版本匹配的 PostGIS 扩展。');}
console.log(`Local ${development?'development':'GPS'} database ready at 127.0.0.1:${port}/${database}. API: npm run ${development?'developer:dev':'gps:dev'}; invitation code is in ${development?'.env.development.local':'.env.gps.local'}.`);
