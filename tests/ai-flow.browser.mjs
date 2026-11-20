import assert from 'node:assert/strict';
import {browserSession} from './browser-driver.mjs';

const b=await browserSession({reset:true});
const back='.page-header [data-view="camera"]';
const inspirationEntry='#recipe-grid > .inspiration-recipe-entry';
const hintHidden=()=>b.ev(`document.querySelector('#viewfinder-inspiration-hint').hidden`);
const dialogOpen=()=>b.ev(`!!document.querySelector('dialog[open]')`);
const image=()=>b.ev(`document.querySelector('#preview').toDataURL('image/jpeg',.94)`);
const savedImage=id=>b.ev(`new Promise((resolve,reject)=>{
 const open=indexedDB.open('black-pic-v2-camera',1);
 open.onerror=()=>reject(open.error);
 open.onsuccess=()=>{
  const db=open.result,request=db.transaction('media').objectStore('media').get(${JSON.stringify(id)});
  request.onsuccess=()=>{
   db.close();
   const reader=new FileReader();
   reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(reader.error);
   reader.readAsDataURL(request.result.still);
  };
  request.onerror=()=>{db.close();reject(request.error);};
 };
})`);
const comparePressed=()=>b.ev(`document.querySelector('#compare-button').getAttribute('aria-pressed')==='true'`);
const originalHidden=()=>b.ev(`document.querySelector('#original-badge').hidden`);
const cameraLayoutAligned=()=>b.ev(`(()=>{
 const control=document.querySelector('#effects-toggle'),button=control.getBoundingClientRect();
 const bounds=selector=>document.querySelector(selector).getBoundingClientRect();
 const midX=rect=>rect.left+rect.width/2,midY=rect=>rect.top+rect.height/2;
 const modes=bounds('.media-modes'),live=bounds('[data-mode="live"]'),shutter=bounds('#shutter');
 const view=bounds('#viewfinder'),ai=bounds('#ai-help'),compare=bounds('#compare-button'),zoom=bounds('#zoom-button');
 const toolbar=document.querySelector('.camera-toolbar'),brand=bounds('.camera-toolbar .brand');
 const settings=bounds('#about-button'),flip=bounds('#flip-camera'),works=bounds('#last-shot'),inspiration=bounds('#inspiration-button');
 const row=control.closest('.capture-mode-row')?.getBoundingClientRect();
 const lowerEdge=document.querySelector('#inspector.open')?bounds('#inspector').top:view.bottom;
 return !!row&&!control.closest('.viewfinder')&&button.width>0&&button.left>live.right&&
  Math.abs(button.right-row.right)<1&&Math.abs(midY(button)-midY(live))<1&&
  Math.abs(midX(modes)-midX(shutter))<1&&Math.abs(midX(shutter)-midX(view))<1&&
  toolbar.contains(document.querySelector('#about-button'))&&toolbar.contains(document.querySelector('#flip-camera'))&&
  !toolbar.querySelector('#inspiration-button')&&settings.right<brand.left&&brand.right<flip.left&&
  Math.abs(midX(brand)-midX(view))<1&&Math.abs(midY(settings)-midY(flip))<1&&
  works.right<shutter.left&&shutter.right<inspiration.left&&Math.abs(midY(shutter)-midY(inspiration))<1&&
  Math.abs(midY(ai)-midY(zoom))<1&&Math.abs(midY(compare)-midY(zoom))<1&&
  ai.right<zoom.left&&zoom.right<compare.left&&Math.abs(midX(zoom)-midX(view))<1&&
  lowerEdge-Math.max(ai.bottom,compare.bottom,zoom.bottom)>0&&lowerEdge-zoom.bottom<=10.5;
})()`);


try{
 assert.equal(await hintHidden(),false);
 assert.equal(await dialogOpen(),false);
 assert.deepEqual(await b.ev(`[...document.querySelectorAll('[data-mode]')].map(button=>button.dataset.mode)`),['photo','video','live']);
 await b.viewport(280,630);
 assert.equal(await cameraLayoutAligned(),true);
 await b.viewport(320,680);
 assert.equal(await cameraLayoutAligned(),true);
 await b.shot('v01-live-view-small.png');
 await b.viewport(390,844);
 assert.equal(await cameraLayoutAligned(),true);
 assert.equal(await b.ev(`(()=>{
  const rect=id=>document.querySelector('#'+id).getBoundingClientRect();
  return rect('inspiration-button').width>0&&rect('compare-button').width>0&&
   ['adjust-toggle','live-toggle','exit-result','original-badge','focus-ring','aspect-button','recipes-view'].every(id=>rect(id).width===0);
 })()`),true);

 const raw=await image();
 await b.ev(`window.aiStages=[];new MutationObserver(()=>{
  const flow=document.querySelector('#ai-flow');
  if(!flow.hidden&&window.aiStages.at(-1)?.phase!==flow.dataset.phase)
   window.aiStages.push({phase:flow.dataset.phase,time:performance.now()});
 }).observe(document.querySelector('#ai-flow'),{attributes:true})`);
 await b.tap('#ai-help');
 for(const [phase,label] of [['scene','识别场景'],['preference','匹配偏好'],['apply','套用']]){
  await b.until(`document.querySelector('#ai-flow').dataset.phase==='${phase}'`);
  assert.equal(await b.ev(`document.querySelector('#ai-status').textContent`),label);
  assert.equal(await b.ev(`document.querySelector('#shutter').disabled`),true);
  await b.cameraState('viewfinder');
 }
 await b.until(`document.querySelector('#ai-flow').hidden&&!document.querySelector('#shutter').disabled`);
 const stages=await b.ev('window.aiStages');
 assert.deepEqual(stages.map(x=>x.phase),['scene','preference','apply']);
 for(let i=1;i<stages.length;i++)assert.ok(stages[i].time-stages[i-1].time>=580);
 assert.equal((await b.stored('media')).length,0);
 assert.equal(await dialogOpen(),false);
 assert.equal(await hintHidden(),true);
 const filtered=await image();
 assert.notEqual(filtered,raw);

 for(const touch of [false,true]){
  await b.tap('#compare-button',{touch,whilePressed:async()=>{
   assert.equal(await comparePressed(),false);
   assert.equal(await originalHidden(),true);
  }});
  assert.equal(await comparePressed(),true);
  assert.equal(await originalHidden(),false);
  assert.equal(await image(),raw);
  await b.tap('#compare-button',{touch});
  assert.equal(await comparePressed(),false);
  assert.equal(await originalHidden(),true);
  assert.equal(await image(),filtered);
 }
 assert.equal(await b.ev(`document.querySelector('#compare-button').focus();document.activeElement.id`),'compare-button');
 for(const [key,code,windowsVirtualKeyCode] of [['Enter','Enter',13],[' ','Space',32]]){
  const stroke={key,code,windowsVirtualKeyCode};
  await b.send('Input.dispatchKeyEvent',{type:'keyDown',...stroke,text:key==='Enter'?'\r':key});
  await b.send('Input.dispatchKeyEvent',{type:'keyUp',...stroke});
  assert.equal(await comparePressed(),true);
  assert.equal(await originalHidden(),false);
  assert.equal(await image(),raw);
  await b.send('Input.dispatchKeyEvent',{type:'keyDown',...stroke,text:key==='Enter'?'\r':key});
  await b.send('Input.dispatchKeyEvent',{type:'keyUp',...stroke});
  assert.equal(await comparePressed(),false);
  assert.equal(await originalHidden(),true);
  assert.equal(await image(),filtered);
 }
 assert.equal((await b.stored('media')).length,0);

 await b.tap('#shutter');
 await b.until(`document.querySelectorAll('.gallery-card').length===1`);
 const [aiPhoto]=await b.stored('media');
 assert.equal(aiPhoto.settings.recipeId,'coast');
 assert.equal(aiPhoto.settings.personal.match,null);
 assert.equal(await savedImage(aiPhoto.id),filtered);
 await b.cameraState('viewfinder');

 await b.tap('#effects-toggle');
 assert.equal(await b.ev(`document.querySelector('#effects-toggle').getAttribute('aria-expanded')`),'true');
 assert.equal(await b.ev(`document.querySelector('#effects-toggle').textContent.trim()`),'收起效果');
 assert.equal(await b.ev(`document.querySelector('#effects-toggle').getAttribute('aria-label')`),'收起效果');
 assert.equal(await cameraLayoutAligned(),true);
 const effects=await b.ev(`[...document.querySelectorAll('#recipe-grid [data-recipe]')].map(button=>button.dataset.recipe)`);
 assert.equal(effects.length,5);assert.ok(effects.includes('original'));
 assert.equal(await b.ev(`['adjust-toggle','recipe-summary','recipe-tool','parameter-scroll','panel-adjust'].every(id=>!document.getElementById(id).getClientRects().length)`),true);
 assert.equal(await b.ev(`(()=>{
  const entry=document.querySelector('#recipe-grid').firstElementChild;
  const square=entry.querySelector('.recipe-image').getBoundingClientRect();
  return entry.matches('.inspiration-recipe-entry')&&square.width>0&&square.width===square.height;
 })()`),true);
 await b.tap('[data-recipe="film"]');
 assert.equal(await b.ev(`document.querySelector('[data-recipe="film"]').getAttribute('aria-pressed')`),'true');
 await b.ev(`(()=>{
  const slider=document.querySelector('#intensity');slider.value=23;
  slider.dispatchEvent(new Event('input',{bubbles:true}));
  slider.dispatchEvent(new Event('change',{bubbles:true}));
 })()`);
 const adjusted=await image();
 assert.notEqual(adjusted,filtered);
 assert.equal((await b.stored('media')).length,1);
 await b.shot('v01-live-effects.png');
 await b.tap('#effects-toggle');
 assert.equal(await b.ev(`document.querySelector('#effects-toggle').textContent.trim()`),'换效果');
 assert.equal(await image(),adjusted);

 await b.tap('[data-mode="video"]');
 assert.equal(await image(),adjusted);
 await b.tap('[data-mode="photo"]');
 await b.tap('#effects-toggle');await b.tap(inspirationEntry);
 assert.equal(await b.ev(`document.querySelector('.phone-screen').dataset.view`),'inspiration');
 await b.tap(back);
 assert.equal(await image(),adjusted);
 await b.tap('#shutter');
 await b.until(`document.querySelectorAll('.gallery-card').length===2`);
 const second=(await b.stored('media')).find(item=>item.id!==aiPhoto.id);
 assert.equal(second.settings.recipeId,'film');assert.equal(second.settings.intensity,23);
 assert.equal(await savedImage(second.id),adjusted);
 assert.equal(await savedImage(aiPhoto.id),filtered);

 await b.tap('#compare-button',{touch:true});
 assert.equal(await image(),raw);
 await b.tap('#effects-toggle');
 assert.equal(await originalHidden(),false);
 assert.equal(await image(),raw);
 await b.tap('#shutter');
 await b.until(`document.querySelectorAll('.gallery-card').length===3`);
 assert.equal(await originalHidden(),false);
 const comparedPhoto=(await b.stored('media')).find(item=>item.id!==aiPhoto.id&&item.id!==second.id);
 assert.equal(comparedPhoto.settings.recipeId,'original');
 assert.equal(await savedImage(comparedPhoto.id),raw);
 await b.tap('#compare-button',{touch:true});
 assert.equal(await originalHidden(),true);
 assert.equal(await image(),adjusted);
 await b.tap('#last-shot');await b.tap(back);
 assert.equal(await image(),adjusted);
 await b.tap('#effects-toggle');
 assert.equal(await b.ev(`document.querySelector('#intensity').value`),'23');
 await b.tap('[data-recipe="original"]');
 assert.equal(await image(),raw);
 await b.tap('#effects-toggle');
 for(const [width,height] of [[320,680],[1280,900]]){
  await b.viewport(width,height);
  assert.equal(await b.ev(`document.documentElement.scrollWidth<=innerWidth`),true);
  assert.equal(await cameraLayoutAligned(),true);
  const frame=await b.ev(`document.querySelector('.phone-frame').getBoundingClientRect().width`);
  assert.equal(width<=480?frame===width:frame<width,true);
  await b.cameraState('viewfinder');
 }
 await b.send('Page.reload');await b.ready();
 assert.equal(await hintHidden(),true);
 assert.deepEqual(b.errors,[]);
 console.log('PASS 照片 AI 三步且不保存、快门保存所见画面、鼠标/触控/键盘点击对比、原片角标、顶栏、取景区和底部两排布局、四款滤镜与原生色彩、调强度、取景单状态');
}finally{await b.close();}
