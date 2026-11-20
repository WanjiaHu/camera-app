import {clampZoom, zoomFromDrag} from './interaction-core.js';

export function createAIFlow(root, stepDuration=650) {
  const status=root.querySelector('#ai-status');
  const wait=()=>new Promise(resolve=>setTimeout(resolve,stepDuration));

  return async ({identify,match,apply})=>{
    root.hidden=false;
    try{
      for(const [phase,label,run] of [
        ['scene','识别场景',identify],
        ['preference','匹配偏好',match],
        ['apply','套用',apply]
      ]){
        root.dataset.phase=phase;
        status.textContent=label;
        // Keep each status visible while the local work runs.
        await Promise.all([wait(),Promise.resolve().then(run)]);
      }
    }finally{
      root.hidden=true;
      root.dataset.phase='idle';
    }
  };
}

export function createZoomDial({button, popover, dial, getValue, setValue, canChange, onOpen, onClose}) {
  let timer, press=null, opened=false, dragging=null;
  const $ = selector=>popover.querySelector(selector);
  const clearPress=()=>{clearTimeout(timer);timer=null;press=null;};
  function sync(){
    const value=clampZoom(getValue()),text=value.toFixed(1).replace(/\.0$/,'')+'×';
    button.querySelector('span').textContent=text;
    button.setAttribute('aria-valuetext',text);
    dial.setAttribute('aria-valuenow',String(value));dial.setAttribute('aria-valuetext',text);
    $('#zoom-needle').setAttribute('transform',`translate(100 100) rotate(${-72+(value-1)*36})`);
  }
  function change(value){if(!canChange())return;setValue(clampZoom(value));sync();}
  function open(){if(!canChange())return;opened=true;popover.hidden=false;button.setAttribute('aria-expanded','true');onOpen();sync();}
  function close(){opened=false;dragging=null;popover.hidden=true;button.setAttribute('aria-expanded','false');clearPress();onClose();if(popover.contains(document.activeElement))button.focus({preventScroll:true});}
  function shortTap(){if(opened){close();return;}const value=getValue();change([1,2,3,5].find(v=>v>value+.05)||1);}
  button.addEventListener('pointerdown',event=>{
    if(event.button!==0||!canChange())return;
    event.preventDefault();
    press={id:event.pointerId,x:event.clientX,start:getValue(),dragged:false};button.setPointerCapture(event.pointerId);
    timer=setTimeout(()=>{timer=null;if(press){open();press.dragged=true;}},420);
  });
  button.addEventListener('pointermove',event=>{
    if(!press||press.id!==event.pointerId)return;
    const delta=event.clientX-press.x;
    if(Math.abs(delta)>8){clearTimeout(timer);timer=null;if(!opened)open();press.dragged=true;}
    if(opened&&press.dragged)change(zoomFromDrag(press.start,delta,button.closest('.viewfinder').getBoundingClientRect().width));
  });
  button.addEventListener('pointerup',event=>{
    if(!press||press.id!==event.pointerId)return;
    const dragged=press.dragged;clearPress();
    if(dragged)close();else shortTap();
  });
  button.addEventListener('pointercancel',()=>{clearPress();close();});
  button.addEventListener('lostpointercapture',()=>{if(press)close();});
  button.addEventListener('click',event=>{if(event.detail===0){opened?close():open();if(opened)dial.focus();}});
  button.addEventListener('contextmenu',event=>event.preventDefault());
  function pointerValue(event){
    const rect=dial.getBoundingClientRect();
    const x=(event.clientX-rect.left)/rect.width*200-100;
    const y=100-(event.clientY-rect.top)/rect.height*120;
    const angle=Math.atan2(x,y)*180/Math.PI;
    change(1+(Math.min(72,Math.max(-72,angle))+72)/36);
  }
  dial.addEventListener('pointerdown',event=>{if(event.button!==0)return;event.preventDefault();dragging=event.pointerId;dial.setPointerCapture(event.pointerId);pointerValue(event);});
  dial.addEventListener('pointermove',event=>{if(dragging===event.pointerId)pointerValue(event);});
  const release=()=>{dragging=null;close();};
  dial.addEventListener('pointerup',release);dial.addEventListener('pointercancel',release);dial.addEventListener('lostpointercapture',release);
  dial.addEventListener('keydown',event=>{
    const delta={ArrowRight:.1,ArrowUp:.1,ArrowLeft:-.1,ArrowDown:-.1,PageUp:.5,PageDown:-.5}[event.key];
    if(delta!==undefined){event.preventDefault();change(getValue()+delta);}
    if(event.key==='Home'){event.preventDefault();change(1);}
    if(event.key==='End'){event.preventDefault();change(5);}
    if(event.key==='Escape'||event.key==='Enter'){event.preventDefault();event.stopPropagation();close();}
  });
  document.addEventListener('pointerdown',event=>{if(opened&&!popover.contains(event.target)&&!button.contains(event.target))close();});
  const ticks=$('#zoom-ticks');
  for(let i=0;i<=40;i++){
    const angle=-72+i*3.6,major=i%10===0;
    const line=document.createElementNS('http://www.w3.org/2000/svg','line');
    line.setAttribute('x1','0');line.setAttribute('x2','0');line.setAttribute('y1','-86');line.setAttribute('y2',major?'-75':'-81');line.setAttribute('transform',`translate(100 100) rotate(${angle})`);line.setAttribute('class',major?'major':'');ticks.append(line);
    if(major){const radians=angle*Math.PI/180;const label=document.createElementNS('http://www.w3.org/2000/svg','text');label.setAttribute('x',String(100+Math.sin(radians)*64));label.setAttribute('y',String(103-Math.cos(radians)*64));label.textContent=String(1+i/10);ticks.append(label);}
  }
  sync();return {sync,open,close,get opened(){return opened;}};
}

// Native touch scrolling plus mouse dragging for the desktop phone demo.
export function enableDragScroll(element){
 let press=null,suppressClick=false;
 element.addEventListener('pointerdown',event=>{if(event.pointerType!=='mouse'||event.button!==0)return;suppressClick=false;press={id:event.pointerId,x:event.clientX,left:element.scrollLeft,dragged:false};});
 element.addEventListener('pointermove',event=>{if(!press||event.pointerId!==press.id)return;const delta=event.clientX-press.x;if(Math.abs(delta)>5&&!press.dragged){press.dragged=true;element.setPointerCapture(event.pointerId);}if(press.dragged){event.preventDefault();element.scrollLeft=press.left-delta;}});
 element.addEventListener('pointerup',()=>{if(press?.dragged)suppressClick=true;press=null;});
 element.addEventListener('pointercancel',()=>press=null);
 element.addEventListener('lostpointercapture',()=>press=null);
 element.addEventListener('click',event=>{if(suppressClick){event.preventDefault();event.stopImmediatePropagation();suppressClick=false;}},true);
}

// Long presses, context menus and the keyboard share the same card action.
export function enableCardLongPress(element,selector,onActivate,enabled=()=>true){
 let press,timer,suppressClick=false;
 const clear=()=>{clearTimeout(timer);press=null;};
 const activate=card=>{clear();suppressClick=true;onActivate(card);};
 element.addEventListener('pointerdown',event=>{
  clear();suppressClick=false;
  const card=event.target.closest(selector);
  if(!card||event.button!==0||!event.isPrimary||!enabled())return;
  press={x:event.clientX,y:event.clientY,id:event.pointerId};
  timer=setTimeout(()=>{if(press&&card.isConnected&&enabled())activate(card);},500);
 });
 element.addEventListener('pointermove',event=>{
  if(press&&event.pointerId===press.id&&(Math.abs(event.clientX-press.x)>7||Math.abs(event.clientY-press.y)>7))clear();
 });
 ['pointerup','pointercancel','pointerleave'].forEach(name=>element.addEventListener(name,clear));
 element.addEventListener('click',event=>{
  if(!suppressClick||event.detail===0)return;
  event.preventDefault();event.stopImmediatePropagation();suppressClick=false;
 },true);
 element.addEventListener('contextmenu',event=>{
  const card=event.target.closest(selector);if(!card)return;
  event.preventDefault();
  if(!suppressClick&&enabled())activate(card);
 });
 element.addEventListener('keydown',event=>{
  const card=event.target.closest(selector);
  if(card&&enabled()&&(event.key==='ContextMenu'||event.key==='F10'&&event.shiftKey)){
   event.preventDefault();clear();onActivate(card);
  }
 });
 element.addEventListener('dragstart',event=>{if(event.target.closest(selector))event.preventDefault();});
}

export function enableRecipeEditing(element,onEdit,canEdit=()=>true){
 return enableCardLongPress(element,'[data-recipe],[data-draft]',card=>onEdit(card.dataset.recipe||'draft'),canEdit);
}
