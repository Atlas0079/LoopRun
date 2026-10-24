process.env.NODE_ENV='production';
if((await import('node:fs')).existsSync('.env'))process.loadEnvFile('.env');
await import('../server/index.mjs');
