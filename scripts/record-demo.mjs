import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {browserSession} from '../tests/browser-driver.mjs';
const b=await browserSession({width:390,height:844,scale:2,reset:true});
const directory=await fs.mkdtemp('/tmp/black-pic-record-');
const out=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../recordings');
const frames=[],writes=[],chapters=[];let capturing=false,clockStart=0;
const hold=ms=>new Promise(r=>setTimeout(r,ms));
const mark=label=>{const time=(Date.now()-clockStart)/1000;chapters.push({label,time});console.log('CHAPTER',label,time.toFixed(1)+'s');};
const tap=async selector=>{await b.tap(selector);await b.settle(120);};
b.on('Page.screencastFrame',event=>{
 b.send('Page.screencastFrameAck',{sessionId:event.sessionId}).catch(()=>{});
 if(!capturing)return;
 const file=path.join(directory,String(frames.length).padStart(6,'0')+'.jpg');
 frames.push({file,time:event.metadata.timestamp});writes.push(fs.writeFile(file,Buffer.from(event.data,'base64')));
});
const decorate=()=>b.ev(`(()=>{const dot=document.createElement('div');Object.assign(dot.style,{position:'fixed',width:'28px',height:'28px',border:'2px solid #f1f6e6',borderRadius:'50%',background:'#e3edcf38',pointerEvents:'none',zIndex:'99999',opacity:'0',transform:'translate(-50%,-50%)'});document.body.append(dot);addEventListener('pointerdown',e=>{if(document.querySelector('#recording-transition'))return;dot.style.left=e.clientX+'px';dot.style.top=e.clientY+'px';dot.getAnimations().forEach(a=>a.cancel());dot.animate([{opacity:1,scale:.65},{opacity:0,scale:1.25}],{duration:650,easing:'ease-out'});});})()`);
const back='.page-header [data-view="camera"]';
const startCast=()=>b.send('Page.startScreencast',{format:'jpeg',quality:90,maxWidth:780,maxHeight:1688,everyNthFrame:3});
try{
 await decorate();await b.settle(600);capturing=true;clockStart=Date.now();await startCast();
 mark('1 AI 套用到取景');await hold(900);await tap('#ai-help');
 await b.until(`document.querySelector('#ai-flow').hidden&&!document.querySelector('#shutter').disabled`);await hold(1500);
 mark('2 换效果与拍摄照片');await tap('#effects-toggle');await tap('[data-recipe="film"]');await hold(1000);
 await b.ev(`(()=>{
  const slider=document.querySelector('#intensity');slider.value=45;
  slider.dispatchEvent(new Event('input',{bubbles:true}));
  slider.dispatchEvent(new Event('change',{bubbles:true}));
 })()`);
 await hold(1200);await tap('#effects-toggle');
 await tap('#compare-button');await hold(850);await tap('#compare-button');await hold(600);await tap('#shutter');
 await b.until(`document.querySelectorAll('#gallery-grid [data-capture]').length===1`);
 mark('3 查看灵感并上传');await tap('#inspiration-button');await hold(1300);
 await tap('[data-example="sea-open"]');await hold(1000);
 await tap('[data-close="inspiration-dialog"]');
 await b.addImage('#inspiration-input','我的海边灵感.jpg');
 await b.until(`document.querySelector('[data-library-image]')`);await hold(1300);await tap(back);
 mark('4 套用 AI 影调并录制 Live');await tap('[data-mode="live"]');await tap('#ai-help');
 await b.until(`document.querySelector('#ai-flow').hidden&&!document.querySelector('#shutter').disabled`);await hold(1000);
 await tap('#shutter');await b.until(`document.querySelectorAll('#gallery-grid [data-capture]').length===2`);
 await tap('#last-shot');await hold(1400);await tap('#gallery-grid [data-capture]');
 await tap('#play-live');await hold(2400);
 await b.send('Page.stopScreencast');capturing=false;await Promise.all(writes);
 if(frames.length<20||b.errors.length)throw new Error('Capture incomplete: '+JSON.stringify({frames:frames.length,errors:b.errors}));
 const duration=(Date.now()-clockStart)/1000,manifest=[];
 for(let i=0;i<frames.length;i++){manifest.push(`file '${frames[i].file}'`);manifest.push('duration '+Math.max(.01,i<frames.length-1?frames[i+1].time-frames[i].time:.3).toFixed(5));}
 manifest.push(`file '${frames.at(-1).file}'`);await fs.writeFile(path.join(directory,'frames.ffconcat'),manifest.join('\n'));
 await fs.mkdir(out,{recursive:true});
 const destination=path.join(out,'BlackPIC_核心流程.mp4');
 console.log('ENCODING',frames.length+' frames',duration.toFixed(1)+' seconds');
 await new Promise((resolve,reject)=>{const p=spawn('/opt/homebrew/bin/ffmpeg',['-hide_banner','-loglevel','error','-y','-f','concat','-safe','0','-i',path.join(directory,'frames.ffconcat'),'-vf','fps=30,format=yuv420p','-c:v','libx264','-preset','medium','-crf','19','-movflags','+faststart',destination],{stdio:['ignore','ignore','pipe']});let error='';p.stderr.on('data',d=>error+=d);p.on('error',reject);p.on('exit',code=>code===0?resolve():reject(new Error(error)));});
 await fs.writeFile(path.join(out,'chapters.json'),JSON.stringify({duration,chapters,source:'本地 Chrome 演示录屏。包含 AI 实时套用、手动换效果、点击对比、拍摄照片、灵感上传和 Live 回放。'},null,2));
 console.log('SAVED',destination);await fs.rm(directory,{recursive:true,force:true});
}finally{capturing=false;await b.close();}
