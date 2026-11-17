import assert from 'node:assert/strict';
import {browserSession} from './browser-driver.mjs';
const b=await browserSession({reset:true});
const phase=()=>b.ev(`document.querySelector('#ai-flow').dataset.phase`);
async function filters(){await b.until(`document.querySelector('#ai-flow').dataset.phase==='composition'`);await b.tap('#ai-next');assert.equal(await phase(),'filters');}
try{
 assert.equal(await b.ev(`document.querySelector('#ai-help span').textContent`),'AI');
 await b.tap('#ai-help');assert.equal(await phase(),'scene');
 assert.match(await b.ev(`document.querySelector('#ai-status').textContent`),/识别到海边场景/);
 assert.equal(await b.ev(`document.querySelector('#zoom-button span').textContent`),'1×');
 await b.shot('ai-scene.png');await b.tap('#ai-cancel');await b.settle(1500);
 assert.equal(await b.ev(`document.querySelector('#ai-flow').hidden`),true);
 assert.equal(await b.ev(`document.querySelector('#ai-help').hidden`),false);
 await b.tap('#adjust-toggle');await b.tap('[data-recipe="forest"]');await b.tap('#adjust-toggle');await b.tap('#ai-help');await filters();
 assert.match(await b.ev(`document.querySelector('#current-style-name').textContent`),/巴洛克/);await b.tap('#ai-cancel');
 console.log('PASS AI starts with scene recognition, cancellation stops progression, and the starting filter is preserved');
 for(const [width,height] of [[390,844],[320,680],[1280,900]]){
  await b.viewport(width,height);await b.send('Page.navigate',{url:b.url+'?inspirations=sample'});await b.ready();
  if(width===390){await b.tap('#adjust-toggle');await b.tap('[data-recipe="coast"]');await b.tap('#adjust-toggle');}
  await b.tap('#ai-help');assert.equal(await phase(),'scene');
  await b.until(`document.querySelector('#ai-flow').dataset.phase==='composition'`);
  assert.equal(await b.ev(`document.querySelector('#zoom-button span').textContent`),'2.2×');
  assert.equal(await b.ev(`document.querySelector('#ai-filter-options').hidden`),true);
  assert.match(await b.ev(`document.querySelector('#current-style-name').textContent`),/文艺复兴/);
  assert.match(await b.ev(`document.querySelector('#ai-source-name').textContent`),/通透的海面/);
  const compositionPicture=await b.ev(`document.querySelector('#preview').toDataURL()`);
  if(width===390)await b.shot('composition.png');
  if(width===390)await b.until(`document.querySelector('#ai-flow').dataset.phase==='filters'`);else await b.tap('#ai-next');
  assert.equal(await phase(),'filters');
  assert.match(await b.ev(`document.querySelector('#ai-status').textContent`),/通透蓝绿 · 已应用/);
  assert.equal(await b.ev(`document.querySelector('#ai-filter-options').hidden`),true);
  assert.equal(await b.ev(`document.querySelectorAll('[data-ai-filter]').length`),3);
  assert.equal(await b.ev(`document.querySelector('#ai-framing-guide').hidden`),true);
  if(width===390)await b.shot('ai-help.png');if(width===320)await b.shot('small-screen.png');
  const after=await b.ev(`document.querySelector('#preview').toDataURL()`);await b.tap('#compare-button');await b.settle();
  assert.notEqual(after,compositionPicture);
  assert.notEqual(await b.ev(`document.querySelector('#preview').toDataURL()`),after);await b.tap('#compare-button');
  await b.tap('#ai-back');assert.equal(await phase(),'composition');await b.tap('#ai-next');assert.equal(await phase(),'filters');
  await b.tap('#ai-cancel');assert.equal(await b.ev(`document.querySelector('#zoom-button span').textContent`),'1×');
  assert.equal(await b.ev(`document.documentElement.scrollWidth<=innerWidth`),true);
  await b.tap('#inspiration-button');assert.equal(await b.ev(`document.querySelectorAll('.inspiration-photo').length`),2);
  assert.equal(await b.ev(`!!document.querySelector('[data-inspiration-tab]')`),false);if(width===390)await b.shot('inspiration-uploaded.png');
  await b.tap('[data-library-image="upload:demo-upload-sea-open"]');await filters();await b.tap('#ai-cancel');
  console.log('PASS',width,'scene → composition → filters can advance, go back, compare and cancel');
 }
 await b.tap('#ai-help');await filters();await b.tap('#ai-more-filters');await b.tap('[data-ai-filter="film"]');await b.tap('#ai-back');await b.settle(2800);
 assert.equal(await phase(),'composition');await b.tap('#ai-next');
 assert.equal(await b.ev(`document.querySelector('[data-ai-filter="film"]').getAttribute('aria-pressed')`),'true');
 await b.tap('#shutter');await b.until(`JSON.parse(localStorage.getItem('black-pic-v2-personal-style')).history.length===1`);
 assert.equal(await b.ev(`JSON.parse(localStorage.getItem('black-pic-v2-personal-style')).history[0].direction`),'warm');
 await b.tap('#inspiration-button');await b.tap('[data-library-image="upload:demo-upload-sea-open"]');await b.until(`document.querySelector('#ai-flow').dataset.phase==='composition'`);
 await b.tap('#shutter');await b.until(`JSON.parse(localStorage.getItem('black-pic-v2-personal-style')).history.length===2`);
 assert.deepEqual(await b.ev(`JSON.parse(localStorage.getItem('black-pic-v2-personal-style')).history[1].references`),[]);
 console.log('PASS selected filters are saved accurately; shooting during composition does not falsely adopt a filter');
 assert.deepEqual(b.errors,[]);
}finally{await b.close();}
