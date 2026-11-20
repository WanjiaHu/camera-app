import assert from 'node:assert/strict';
import {browserSession} from './browser-driver.mjs';

const b=await browserSession({reset:true});
const back='.page-header [data-view="camera"]';
try{
 // Exercise the camera connection with a changing local stream.
 await b.tap('#dismiss-inspiration-hint');
 assert.equal(await b.ev(`document.querySelector('#viewfinder-inspiration-hint').hidden`),true);
 assert.equal(await b.ev(`document.activeElement.id`),'inspiration-button');
 await b.send('Page.reload');await b.ready();
 assert.equal(await b.ev(`document.querySelector('#viewfinder-inspiration-hint').hidden`),true);
 await b.ev(`(()=>{
  const source=document.createElement('canvas');source.width=source.height=80;
  const ctx=source.getContext('2d');let frame=0;
  const draw=()=>{ctx.fillStyle=frame++%2?'#358fd2':'#42c091';ctx.fillRect(0,0,80,80);};
  draw();setInterval(draw,150);
  navigator.mediaDevices.getUserMedia=async()=>window.demoStream=source.captureStream(30);
 })()`);
 await b.tap('#about-button');await b.tap('#connect-camera');
 await b.until(`document.querySelector('#toast').textContent==='相机已连接'`);
 const read=`(()=>{
  const gl=document.querySelector('#preview').getContext('webgl'),pixel=new Uint8Array(4);
  gl.readPixels(200,200,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);return pixel.join(',');
 })()`;
 const before=await b.ev(read);
 await b.until(`${read}!==${JSON.stringify(before)}`);
 await b.tap('#ai-help');
 await b.until(`document.querySelector('#ai-flow').hidden&&!document.querySelector('#shutter').disabled`);
 await b.cameraState('viewfinder');
 const filteredFrame=await b.ev(read);
 await b.until(`${read}!==${JSON.stringify(filteredFrame)}`);
 assert.equal((await b.stored('media')).length,0);
 await b.tap('#shutter');
 await b.until(`document.querySelectorAll('.gallery-card').length===1`);
 assert.match((await b.stored('media'))[0].settings.source,/实时相机/);

 await b.ev(`(()=>{
  const track=window.demoStream.getVideoTracks()[0];
  track.stop();track.dispatchEvent(new Event('ended'));
 })()`);
 await b.until(`!document.querySelector('#preview-error').hidden`);
 assert.equal(await b.ev(`document.querySelector('#shutter').disabled&&document.querySelector('#ai-help').disabled`),true);
 await b.tap('#retry-preview');await b.ready();
 assert.notEqual(await b.ev(read),filteredFrame);
 await b.tap('#about-button');
 await b.chooseFile('#import-media');
 await b.addImage('#media-input','取景测试色.png','#368fd2');
 await b.until(`document.querySelector('#toast').textContent==='画面已导入'`);
 for(const type of ['video','live']){
  await b.tap(`[data-mode="${type}"]`);
  assert.equal(await b.ev(`document.querySelector('[data-mode="${type}"]').getAttribute('aria-pressed')`),'true');
  await b.tap('#effects-toggle');await b.tap('[data-recipe="original"]');await b.tap('#effects-toggle');
  const bare=await b.ev(read);
  const beforeCount=(await b.stored('media')).length;
  await b.tap('#ai-help');
  for(const phase of ['scene','preference','apply']){
   await b.until(`document.querySelector('#ai-flow').dataset.phase==='${phase}'`);
   assert.equal(await b.ev(`document.querySelector('#shutter').disabled`),true);
  }
  await b.until(`document.querySelector('#ai-flow').hidden&&!document.querySelector('#shutter').disabled`);
  await b.cameraState('viewfinder');
  const filtered=await b.ev(read);
  assert.notEqual(filtered,bare);
  assert.equal((await b.stored('media')).length,beforeCount);
  await b.tap('#shutter');
  await b.until(`!document.querySelector('#recording-badge').hidden`);
  if(type==='video'){await b.settle(550);await b.tap('#shutter');}
  await b.until(`document.querySelectorAll('.gallery-card').length===${beforeCount+1}`);
  const capture=(await b.stored('media')).find(item=>item.type===type);
  assert.equal(capture.settings.recipeId,'coast');assert.equal(capture.settings.mode,type);
  assert.ok(capture.bytes>0&&capture.videoBytes>0);
  await b.tap('#last-shot');
  await b.tap(`[data-capture="${capture.id}"]`);
  assert.equal(await b.ev(`[...document.querySelectorAll('#media-dialog .media-detail-meta')].every(node=>!node.getClientRects().length)`),true);
  assert.equal(await b.ev(`document.querySelectorAll('#media-dialog [data-export]').length`),type==='live'?2:1);
  if(type==='live'){
   assert.equal(await b.ev(`!document.querySelector('#detail-photo').hidden`),true);
   await b.tap('#play-live');
  }else await b.ev(`document.querySelector('#detail-video').play().then(()=>true)`);
  await b.until(`document.querySelector('#detail-video').currentTime>.05`);
  const videoPixel=await b.ev(`(()=>{
   const video=document.querySelector('#detail-video'),canvas=document.createElement('canvas');
   canvas.width=video.videoWidth;canvas.height=video.videoHeight;
   const ctx=canvas.getContext('2d');ctx.drawImage(video,0,0);
   return [...ctx.getImageData(200,video.videoHeight-201,1,1).data];
  })()`);
  const delta=value=>value.split(',').reduce((sum,channel,index)=>sum+Math.abs(Number(channel)-videoPixel[index]),0);
  assert.ok(delta(filtered)<delta(bare)&&delta(filtered)<25,`${type} decoded WebGL pixel: ${videoPixel} vs ${filtered}`);
  if(type==='live'){
   await b.tap('#play-live');
   assert.equal(await b.ev(`document.querySelector('#detail-video').hidden`),true);
  }
  await b.tap('[data-close="media-dialog"]');await b.tap(back);
 }
 await b.tap('#last-shot');await b.shot('v01-works.png');
 const order=await b.ev(`[...document.querySelectorAll('#gallery-grid time')].map(time=>time.dateTime)`);
 assert.deepEqual(order,[...order].sort().reverse());
 await b.tap('#gallery-grid [data-capture]',{hold:650});
 assert.equal(await b.ev(`document.querySelector('#media-dialog').open`),false);
 assert.equal(await b.ev(`document.querySelectorAll('#gallery-grid [aria-pressed="true"]').length`),1);
 await b.tap('#gallery-grid [aria-pressed="false"]');
 assert.equal(await b.ev(`document.querySelectorAll('#gallery-grid [aria-pressed="true"]').length`),2);
 await b.tap('#gallery-delete');
 await b.until(`document.querySelectorAll('#gallery-grid [data-capture]').length===1`);
 assert.equal((await b.stored('media')).length,1);
 await b.tap('#gallery-grid [data-capture]');
 await b.tap('[data-delete-capture]');
 assert.equal((await b.stored('media')).length,1);
 await b.tap('[data-delete-capture]');
 await b.until(`!document.querySelector('#gallery-grid [data-capture]')`);
 assert.equal((await b.stored('media')).length,0);
 await b.send('Page.navigate',{url:b.url+'?inspirations=sample'});await b.ready();
 await b.tap('#inspiration-button');await b.addImage('#inspiration-input','真实上传.jpg');
 await b.until(`document.querySelector('[data-library-image]')`);
 const [uploaded]=await b.stored('inspirations');
 await b.ev(`new Promise((resolve,reject)=>{
  const open=indexedDB.open('black-pic-v2-camera',1);
  open.onsuccess=()=>{
   const db=open.result,transaction=db.transaction('inspirations','readwrite');
   const store=transaction.objectStore('inspirations'),request=store.get(${JSON.stringify(uploaded.id)});
   request.onsuccess=()=>{
    const oldPhoto=request.result;
    delete oldPhoto.fingerprint;oldPhoto.status='pending';
    store.put(oldPhoto);
   };
   transaction.oncomplete=()=>{db.close();resolve();};
   transaction.onerror=()=>{db.close();reject(transaction.error);};
  };
  open.onerror=()=>reject(open.error);
 })`);
 await b.send('Page.reload');await b.ready();
 const [migrated]=await b.stored('inspirations');
 assert.equal(migrated.id,uploaded.id);
 assert.ok(migrated.fingerprint);
 await b.tap('#about-button');await b.tap('#demo-library-empty');
 assert.equal(await b.ev(`document.querySelector('#inspiration-examples').open`),false);
 assert.equal(await b.ev(`!!document.querySelector('[data-library-image]')`),false);
 assert.equal((await b.stored('inspirations')).length,1);
 await b.tap(back);await b.tap('#about-button');await b.tap('#demo-library-sample');
 assert.equal(await b.ev(`document.querySelector('#inspiration-examples').open`),true);
 assert.equal(await b.ev(`!!document.querySelector('[data-library-image]')`),true);
 await b.tap('[data-library-image]',{hold:650});await b.tap('#inspiration-delete');
 await b.until(`!document.querySelector('[data-library-image]')`);
 assert.equal((await b.stored('inspirations')).length,0);
 assert.deepEqual(b.errors,[]);
 console.log('PASS 取景提示可关闭且刷新不再展示、AI 后动态取景持续更新、画面中断恢复、视频与 Live 三步套用、录制与回放、作品长按删除、旧上传补算和演示切换');
}finally{await b.close();}
