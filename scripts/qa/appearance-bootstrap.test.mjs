import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const script=readFileSync(new URL('../../public/appearance.js',import.meta.url),'utf8');
function boot(value,blocked=false){
  const classes=new Set(),root={dataset:{},style:{},classList:{toggle(name,on){on?classes.add(name):classes.delete(name);}}},meta={content:''};
  vm.runInNewContext(script,{localStorage:{getItem(){if(blocked)throw new Error('storage denied');return value;}},document:{documentElement:root,querySelector(){return meta;}}});
  return {root,meta,classes};
}
test('saved light preference is applied before React starts',()=>{const {root,meta,classes}=boot('light');assert.equal(root.dataset.theme,'light');assert.equal(root.style.colorScheme,'light');assert.equal(meta.content,'#f4f6fb');assert.equal(classes.has('dark'),false);});
test('absent, invalid and dark preferences preserve dark default',()=>{for(const value of [null,'invalid','dark']){const {root,meta,classes}=boot(value);assert.equal(root.dataset.theme,'dark');assert.equal(root.style.colorScheme,'dark');assert.equal(meta.content,'#07111a');assert.equal(classes.has('dark'),true);}});
test('blocked browser storage does not break application startup',()=>assert.equal(boot(null,true).root.dataset.theme,'dark'));
