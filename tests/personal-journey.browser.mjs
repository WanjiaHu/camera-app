import assert from 'node:assert/strict';
import {browserSession} from './browser-driver.mjs';
const b=await browserSession({reset:true});
const memory=()=>b.ev(`JSON.parse(localStorage.getItem('black-pic-v2-personal-style'))`);
async function shoot(){const n=(await memory()).history.length;await b.tap('#shutter');await b.until(`JSON.parse(localStorage.getItem('black-pic-v2-personal-style')).history.length===${n+1}`);}
try{
 await b.shot('mobile.png');await b.viewport(1280,900);await b.shot('desktop.png');await b.viewport(390,844);
 await b.tap('#inspiration-button');assert.match(await b.ev(`document.querySelector('#inspiration-grid').textContent`),/放进喜欢的照片/);await b.shot('inspiration-empty.png');
 await b.tap('#inspiration-return');assert.equal(await b.ev(`document.querySelector('#adjust-toggle').getAttribute('aria-expanded')`),'true');
 assert.deepEqual(await b.ev(`[...document.querySelectorAll('#recipe-grid .recipe-title')].slice(0,6).map(x=>x.textContent)`),['文艺复兴','巴洛克','印象派','新视觉','美国彩色摄影','昭和后期']);
 await b.tap('[data-recipe="forest"]');await b.shot('adjust.png');await b.tap('#adjust-toggle');await shoot();
 assert.deepEqual((await memory()).history[0].references,[]);console.log('PASS an empty library can use a starting filter and capture a photo');
 await b.send('Page.navigate',{url:b.url+'?inspirations=sample'});await b.ready();
 if(!await b.ev(`document.querySelector('#ai-flow').hidden`))await b.tap('#ai-cancel');
 await b.tap('#ai-help');await b.until(`document.querySelector('#ai-flow').dataset.phase==='composition'`);
 assert.match(await b.ev(`document.querySelector('#ai-status').textContent`),/按灵感多留海面/);
 await b.until(`document.querySelector('#ai-flow').dataset.phase==='filters'`);
 assert.match(await b.ev(`document.querySelector('#ai-status').textContent`),/通透蓝绿/);
 await shoot();let saved=await memory();assert.equal(saved.history[1].direction,'open');assert.equal(saved.history[1].framing.zoom,2.2);assert.equal(saved.history[1].framing.panY,-.12);
 await b.tap('#flip-camera');await b.until(`document.querySelector('#ai-flow').dataset.phase==='filters'`);
 assert.equal((await memory()).history.length,2);await b.shot('returning.png');await shoot();
 saved=await memory();assert.equal(saved.history[2].direction,'open');assert.equal(saved.history[2].framing.zoom,1);
 assert.match(await b.ev(`document.querySelector('#toast').textContent`),/^照片已保存$/);console.log('PASS the reference affects capture; a new sea scene automatically uses the adopted preference');
 await b.tap('#last-shot');assert.equal(await b.ev(`document.querySelectorAll('.gallery-card').length`),3);await b.shot('gallery.png');await b.tap('.page-header [data-view="camera"]');
 await b.tap('#flip-camera');await b.until(`document.querySelector('#ai-flow').hidden`);
 await b.tap('#adjust-toggle');await b.tap('[data-recipe="mono"]');await b.tap('#adjust-toggle');await shoot();assert.equal((await memory()).history.at(-1).scene,'street');
 await b.tap('#flip-camera');await b.until(`document.querySelector('#ai-flow').dataset.phase==='filters'`);
 assert.match(await b.ev(`document.querySelector('#ai-source-name').textContent`),/通透的海面/);await b.tap('#ai-cancel');assert.equal((await memory()).history.length,4);
 await b.send('Page.reload');await b.ready();await b.until(`!document.querySelector('#ai-flow').hidden`);assert.match(await b.ev(`document.querySelector('#ai-source-name').textContent`),/通透的海面/);
 assert.equal(await b.ev(`!!document.querySelector('#memory-cue,#insight-dialog,[data-inspiration-tab],[data-library="auto"]')`),false);
 assert.doesNotMatch(await b.ev(`document.querySelector('.phone-screen').innerText`),/记忆|自动积累|示例理解/);
 assert.deepEqual(b.errors,[]);console.log('PASS street and sea stay independent, reopening recalls the effect, and no memory UI is exposed');
}finally{await b.close();}
