const {defineConfig}=require('eslint/config');
const expo=require('eslint-config-expo/flat');
module.exports=defineConfig([expo,{ignores:['android/**','ios/**','modules/**/android/**']},{rules:{'@typescript-eslint/no-explicit-any':'off'}}]);
