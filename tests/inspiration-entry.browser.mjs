import assert from 'node:assert/strict';
import {browserSession} from './browser-driver.mjs';

const b=await browserSession({reset:true});
const back='.page-header [data-view="camera"]';
const close='[data-close="inspiration-dialog"]';
const example='[data-example="sea-open"]';
const upload='[data-library-image]';
const personalizationDot=()=>b.ev(`(()=>{
 const entry=document.querySelector('#inspiration-button');
 return entry.title==='个性化已开启'&&entry.getAttribute('aria-label').includes('个性化已开启')&&
  getComputedStyle(entry,'::after').content!=='none';
})()`);
const latest=async()=>(await b.stored('media')).sort((a,c)=>c.created-a.created)[0];
async function ai(){
 const count=(await b.stored('media')).length;
 await b.tap('#ai-help');
 await b.until(`document.querySelector('#ai-flow').hidden&&!document.querySelector('#shutter').disabled`);
 await b.cameraState('viewfinder');
 assert.equal((await b.stored('media')).length,count);
 await b.tap('#shutter');
 await b.until(`document.querySelectorAll('.gallery-card').length===${count+1}`);
 return (await latest()).settings;
}
try{
 assert.equal(await personalizationDot(),false);
 await b.tap('#viewfinder-inspiration-hint [data-view="inspiration"]');
 assert.equal(await b.ev(`document.querySelectorAll('#example-grid .photo-tag').length`),2);
 assert.equal(await b.ev(`document.querySelector('#uploads-title').textContent`),'我的上传');
 await b.tap('#inspiration-examples summary');
 assert.equal(await b.ev(`document.querySelector('#inspiration-examples').open`),false);
 await b.tap('#inspiration-examples summary');
 await b.tap(example);
 assert.equal(await b.ev(`document.querySelector('#inspiration-dialog').open`),true);
 assert.equal(await b.ev(`[...document.querySelectorAll('#inspiration-dialog :is([data-like-example],.media-detail-meta,[data-remove-upload])')].every(node=>!node.getClientRects().length)`),true);
 await b.tap(close);await b.tap(back);
 assert.equal(await b.ev(`document.querySelector('#viewfinder-inspiration-hint').hidden`),true);
 assert.equal((await ai()).personal.match,null);
 assert.equal(await b.ev(`!!document.querySelector('dialog[open]')`),false);
 await b.tap('#inspiration-button');

 assert.match(await b.ev(`document.querySelector('.inspiration-empty p').textContent`),/上传几张你喜欢的照片/);
 await b.shot('inspiration-empty-upload.png');
 await b.chooseFile('.inspiration-empty [data-upload-inspiration]');
 assert.equal(await b.ev(`document.querySelector('.phone-screen').dataset.view`),'inspiration');
 await b.tap(back);await b.cameraState('viewfinder');
 assert.equal((await b.stored('media')).length,1);
 await b.ev(`localStorage.setItem('black-pic-v2-personal-style',JSON.stringify({version:3,liked:['sea-open'],hidden:null}))`);
 await b.send('Page.reload');await b.ready();
 let settings=await ai();
 assert.equal(settings.personal.match,null);
 assert.equal(settings.recipeId,'coast');

 await b.tap('#inspiration-button');
 await b.addImage('#inspiration-input','蓝色海面.png','#2f97d2');
 await b.until(`document.querySelectorAll('[data-library-image]').length===1`);
 await b.addImage('#inspiration-input','绿色树林.png','#74c845');
 await b.until(`document.querySelectorAll('[data-library-image]').length===2`);
 const photo=(await b.stored('inspirations')).find(item=>item.name==='蓝色海面.png');
 assert.equal(photo.fingerprint.scene,'sea');
 assert.equal(await b.ev(`!!document.querySelector('.inspiration-empty')`),false);
 await b.tap(upload);
 assert.equal(await b.ev(`[...document.querySelectorAll('#inspiration-detail :is(.media-detail-meta,[data-remove-upload])')].every(node=>!node.getClientRects().length)`),true);
 await b.tap(close);await b.shot('agent-inspiration-library.png');await b.tap(back);
 assert.equal(await personalizationDot(),true);
 await b.shot('v01-camera-personalized.png');
 settings=await ai();
 assert.equal(settings.personal.match.id,photo.id);
 assert.equal(settings.recipeId,photo.fingerprint.recipe);
 const matchedWork=await latest();
 await b.tap('#last-shot');await b.tap(`[data-capture="${matchedWork.id}"]`);
 await b.tap('[data-delete-capture]');await b.tap('[data-delete-capture]');
 await b.until(`!document.querySelector('[data-capture="${matchedWork.id}"]')`);
 assert.equal((await b.stored('inspirations')).length,2);
 await b.tap(back);await b.cameraState('viewfinder');
 assert.equal((await ai()).personal.match.id,photo.id);

 await b.tap('#flip-camera');await b.until(`!document.querySelector('#shutter').disabled`);
 await b.tap('#flip-camera');await b.until(`!document.querySelector('#shutter').disabled`);
 settings=await ai();
 assert.equal(settings.scene,'street');
 assert.equal(settings.personal.match,null);
 assert.equal(settings.recipeId,'daylight');
 await b.addImage('#media-input','无明显示例特征.png','#808080');
 await b.until(`document.querySelector('#toast').textContent==='画面已导入'`);
 settings=await ai();
 assert.equal(settings.scene,'unknown');
 assert.equal(settings.recipeId,'coast');
 assert.equal(settings.personal.match,null);

 await b.tap('#inspiration-button');
 await b.tap(upload,{hold:650,touch:true});
 assert.equal(await b.ev(`document.querySelector('#inspiration-dialog').open`),false);
 assert.equal(await b.ev(`document.querySelectorAll('#inspiration-grid [aria-pressed="true"]').length`),1);
 await b.tap(`${upload}[aria-pressed="false"]`);
 assert.equal(await b.ev(`document.querySelectorAll('#inspiration-grid [aria-pressed="true"]').length`),2);
 await b.shot('v01-inspiration-selection.png');
 await b.tap('#inspiration-delete');
 await b.until(`!document.querySelector('[data-library-image]')`);
 assert.equal((await b.stored('inspirations')).length,0);
 assert.equal(await personalizationDot(),false);
 assert.equal(await b.ev(`document.querySelectorAll('#example-grid .photo-tag').length`),2);
 await b.send('Page.reload');await b.ready();
 settings=await ai();
 assert.equal(settings.recipeId,'coast');
 assert.equal(settings.personal.match,null);
 assert.deepEqual(b.errors,[]);
 console.log('PASS 示例可折叠且旧喜欢状态也不参与匹配、取景提示直达灵感库、空态上传按钮打开选择器、返回取景、上传匹配、跨场景和识别失败回退、触控长按多选删除移除指纹');
}finally{await b.close();}
