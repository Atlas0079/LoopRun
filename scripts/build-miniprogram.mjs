import { build } from 'esbuild';
await build({entryPoints:['shared/geo.mjs'],outfile:'miniprogram/lib/geo.js',bundle:true,format:'cjs',platform:'neutral',target:'es2018',legalComments:'none'});
console.log('微信共用地理模块已生成。');
