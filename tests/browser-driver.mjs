import fs from 'node:fs/promises';
export async function browserSession({width=390,height=844,scale=1,reset=false}={}){
 const endpoint=process.env.CAMERA_CDP_ENDPOINT||'http://127.0.0.1:9227',url=process.env.CAMERA_DEMO_URL||'http://localhost:4175/';
 const target=await(await fetch(`${endpoint}/json/new?about:blank`,{method:'PUT'})).json(),ws=new WebSocket(target.webSocketDebuggerUrl);
 await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
 let sequence=0;const pending=new Map(),listeners=new Map(),errors=[];
 ws.onmessage=({data})=>{const m=JSON.parse(data);if(m.id){const p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(new Error(JSON.stringify(m.error))):p.resolve(m.result);}}else{if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);if(m.method==='Runtime.consoleAPICalled'&&m.params.type==='error')errors.push(m.params.args);for(const fn of listeners.get(m.method)||[])fn(m.params);}};
 const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(new Error('CDP timeout: '+method));},20000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}));});
 async function ev(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;}
 async function until(expression){return ev(`new Promise((resolve,reject)=>{let n=0;const check=()=>{if(${expression})resolve(true);else if(++n>150)reject(new Error('Timed out: '+${JSON.stringify(expression)}));else setTimeout(check,60)};check()})`);}
 async function settle(ms=100){await ev(`new Promise(r=>setTimeout(()=>requestAnimationFrame(()=>requestAnimationFrame(r)),${ms}))`);}
 async function tap(selector,{hold=0,touch=false,whilePressed}={}){
  await ev(`(()=>{const b=document.querySelector(${JSON.stringify(selector)});if(!b||b.disabled||!b.getBoundingClientRect().width)throw new Error('Unavailable: '+${JSON.stringify(selector)});b.scrollIntoView({block:'nearest',inline:'nearest'});})()`);await settle(20);
  const p=await ev(`(()=>{const b=document.querySelector(${JSON.stringify(selector)}),r=b.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2;if(!b.contains(document.elementFromPoint(x,y)))throw new Error('Obstructed: '+${JSON.stringify(selector)});return {x,y};})()`);
  if(touch)await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[p]});
  else{
   await send('Input.dispatchMouseEvent',{type:'mouseMoved',...p});
   await send('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',clickCount:1});
  }
  try{
   if(hold)await settle(hold);
   if(whilePressed)await whilePressed();
  }finally{
   if(touch)await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
   else await send('Input.dispatchMouseEvent',{type:'mouseReleased',...p,button:'left',clickCount:1});
  }
  return p;
 }
 async function chooseFile(selector){
  await send('Page.setInterceptFileChooserDialog',{enabled:true});
  let timer;
  const opened=new Promise((resolve,reject)=>{
   timer=setTimeout(()=>reject(new Error('File chooser did not open: '+selector)),3000);
   listeners.set('Page.fileChooserOpened',[resolve]);
  });
  try{await Promise.all([tap(selector),opened]);}
  finally{clearTimeout(timer);listeners.delete('Page.fileChooserOpened');}
 }
 async function shot(name){await settle(400);const s=await send('Page.captureScreenshot',{format:'png'});await fs.mkdir(new URL('../previews/',import.meta.url),{recursive:true});await fs.writeFile(new URL('../previews/'+name,import.meta.url),Buffer.from(s.data,'base64'));}
 async function viewport(width,height,deviceScaleFactor=scale){await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor,mobile:width<500});await settle();}
 async function ready(){await until(`document.querySelector('#shutter')?.disabled===false&&document.querySelector('#recipe-grid img')?.naturalWidth>0`);await settle();}
 async function cameraState(state){await until(`document.querySelector('#camera-view').dataset.cameraState===${JSON.stringify(state)}`);}
 async function stored(store){return ev(`new Promise((resolve,reject)=>{
  const open=indexedDB.open('black-pic-v2-camera',1);
  open.onerror=()=>reject(open.error);
  open.onsuccess=()=>{
   const db=open.result,request=db.transaction(${JSON.stringify(store)}).objectStore(${JSON.stringify(store)}).getAll();
   request.onsuccess=()=>{db.close();resolve(request.result.map(({still,video,thumbnail,...item})=>({...item,bytes:still?.size,videoBytes:video?.size})));};
   request.onerror=()=>{db.close();reject(request.error);};
  };
 })`);}
 async function addImage(selector,name,color=null){
  await ev(`(async()=>{
   let blob;
   const color=${JSON.stringify(color)};
   if(color){
    const canvas=document.createElement('canvas');canvas.width=canvas.height=64;
    const ctx=canvas.getContext('2d');ctx.fillStyle=color;ctx.fillRect(0,0,64,64);
    blob=await new Promise(resolve=>canvas.toBlob(resolve));
   }else blob=await(await fetch('assets/harbor-original.jpg')).blob();
   const transfer=new DataTransfer();
   transfer.items.add(new File([blob],${JSON.stringify(name)},{type:blob.type}));
   const input=document.querySelector(${JSON.stringify(selector)});
   input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));
  })()`);
 }
 await send('Page.enable');await send('Runtime.enable');if(reset)await send('Storage.clearDataForOrigin',{origin:new URL(url).origin,storageTypes:'all'});
 await viewport(width,height,scale);await send('Page.navigate',{url});await ready();
 return {send,ev,until,tap,chooseFile,shot,viewport,ready,cameraState,stored,addImage,settle,errors,url,on(method,fn){const list=listeners.get(method)||[];list.push(fn);listeners.set(method,list);},async close(){await send('Page.close').catch(()=>{});ws.close();}};
}
