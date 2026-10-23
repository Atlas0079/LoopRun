import { readdirSync,readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
function walk(path){return readdirSync(path,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(join(path,e.name)):[join(path,e.name)]);}
const files=['server','shared','scripts','miniprogram'].flatMap(walk);
for(const file of files.filter(f=>/\.(mjs|js)$/.test(f))) execFileSync(process.execPath,['--check',file],{stdio:'inherit'});
for(const file of files.filter(f=>f.endsWith('.json'))) JSON.parse(readFileSync(file,'utf8'));
console.log(`源码语法与小程序 JSON 检查通过 (${files.length} files)。`);
