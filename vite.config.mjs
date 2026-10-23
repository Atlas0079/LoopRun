import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { dirname,resolve } from 'node:path';
const root=dirname(fileURLToPath(import.meta.url));
export default defineConfig({root:resolve(root,'web'),build:{outDir:resolve(root,'dist'),emptyOutDir:true},server:{fs:{allow:[root],deny:['.env','.env.*','**/.git/**','**/.local-*/**','**/data/**','**/*.jks','**/*.keystore','**/*.pem','**/*.crt']},allowedHosts:['localhost','127.0.0.1']}});
