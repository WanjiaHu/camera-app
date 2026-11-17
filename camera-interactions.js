import {clampZoom, zoomFromDrag, captureLook, candidateLook} from './interaction-core.js';
export function createAIFlow({root, getState, getRecommendation, thumbnail, canStart, onStart, onPreview, onRestore, onCommit, onChange, onPickReference}) {
  const $=selector=>root.querySelector(selector);
  let active=false,phase='idle',before=null,showingBefore=false,chosen=null,recommendation=null,phaseTimer=null,alternatives=false;
  const sceneText=()=>({sea:'识别到海边场景',street:'识别到街景场景',unknown:'当前画面暂未识别'})[recommendation.scene]||'当前画面暂未识别';
  function framingLook(){
    const framing=recommendation.framing?.[recommendation.composition];
    return {...before,params:{...before.params},composition:recommendation.composition,zoom:framing?.zoom??before.zoom,pan:framing?.pan??before.pan,panY:framing?.panY??before.panY??0};
  }
  function update(){
    root.hidden=!active;root.parentElement.dataset.aiPhase=active?phase:'idle';
    root.dataset.phase=active?phase:'idle';root.dataset.before=String(showingBefore);
    if(active){
      $('#ai-stage-label').textContent={scene:'场景',composition:'构图',filters:'滤镜'}[phase];
      $('#ai-status').textContent=phase==='scene'?sceneText():phase==='filters'?`${chosen?.name||recommendation.looks[0].name} · 已应用`:recommendation.site.guidance[recommendation.composition];
      $('#ai-framing-guide').hidden=phase!=='composition';
      $('#ai-next').hidden=phase!=='composition';$('#ai-back').hidden=phase!=='filters';
      $('#ai-filter-options').hidden=phase!=='filters'||!alternatives;$('#ai-result-actions').hidden=phase!=='filters';
      $('#ai-more-filters').textContent=alternatives?'收起效果':'换个效果';$('#ai-more-filters').setAttribute('aria-expanded',String(phase==='filters'&&alternatives));
      $('#ai-source-name').textContent=recommendation.source?'参考 · '+recommendation.source.name:'选择灵感';
      $('#ai-change-reference').hidden=phase==='scene';
      const image=$('#ai-source-image');image.hidden=!recommendation.source;
      if(recommendation.source)image.src=recommendation.source.image;else image.removeAttribute('src');
      root.querySelectorAll('[data-ai-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.aiFilter===chosen?.id)));
    }
    onChange();
  }
  function showComposition({automatic=false}={}){
    if(!active)return;clearTimeout(phaseTimer);phase='composition';showingBefore=false;alternatives=false;
    onPreview(framingLook());update();
    if(automatic)phaseTimer=setTimeout(showFilters,2600);
  }
  function choose(id){
    const look=recommendation.looks.find(r=>r.id===id);if(!active||phase!=='filters'||!look)return;
    chosen=look;showingBefore=false;
    onPreview({...candidateLook(framingLook(),look,[...getState().locked]),planName:look.name});update();
  }
  function renderFilters(){
    const area=$('#ai-filter-options');area.replaceChildren();
    for(const look of recommendation.looks){
      const b=document.createElement('button');b.className='ai-filter-choice';b.dataset.aiFilter=look.id;
      const name=look.name;
      b.setAttribute('aria-label','使用'+name);b.setAttribute('aria-pressed',String(chosen?.id===look.id));
      const img=document.createElement('img');img.src=thumbnail(look);img.alt='';
      const label=document.createElement('span');label.textContent=name;b.append(img,label);area.append(b);
    }
  }
  function showFilters(){
    if(!active)return;clearTimeout(phaseTimer);phase='filters';alternatives=false;
    choose(chosen?.id||recommendation.looks[0].id);renderFilters();update();
  }
  function exit(keep=false){
    if(!active)return;clearTimeout(phaseTimer);phaseTimer=null;
    const previousPhase=phase;active=false;showingBefore=false;
    if(keep&&previousPhase==='filters'&&chosen)onCommit(before,{composition:recommendation.composition,recommendation:{...recommendation,recipe:chosen.id,planName:chosen.name,direction:chosen.direction,intent:chosen.intent}});
    else if(keep&&previousPhase==='composition')onCommit(before,{composition:recommendation.composition,recommendation:null});
    else onRestore(before);
    chosen=null;phase='idle';update();
    if(root.contains(document.activeElement))document.querySelector('#ai-help').focus({preventScroll:true});
  }
  function start(input={}){
    if(!canStart())return;if(active)exit(false);
    onStart();before=captureLook(getState());recommendation=getRecommendation(input);
    chosen=null;active=true;showingBefore=false;alternatives=false;
    if(input.resume){showFilters();return;}
    phase='scene';update();
    // A paced presentation of the preset scene result, not a remote analysis request.
    phaseTimer=setTimeout(()=>showComposition({automatic:true}),1300);
  }
  root.addEventListener('click',event=>{
    const b=event.target.closest('button');if(!b)return;
    if(b.id==='ai-change-reference')onPickReference();
    if(b.id==='ai-cancel')exit(false);
    if(b.id==='ai-next')showFilters();
    if(b.id==='ai-back')showComposition();
    if(b.id==='ai-more-filters'){alternatives=!alternatives;update();}
    if(b.dataset.aiFilter)choose(b.dataset.aiFilter);
  });
  return {start,exit,pick(){return false;},layout(){},get canCompare(){return active&&phase!=='scene';},get isComparing(){return showingBefore;},toggleComparison(){if(active&&phase!=='scene'){clearTimeout(phaseTimer);showingBefore=!showingBefore;update();}},showAfter(){if(showingBefore){showingBefore=false;update();}},get active(){return active;},get phase(){return phase;},get comparison(){return active&&showingBefore?before:null;},destroy(){exit(false);}};
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

// A long press edits; horizontal movement remains a scroll gesture.
export function enableRecipeEditing(element,onEdit){
 let press=null,timer=null,suppressClick=false;
 const clear=()=>{clearTimeout(timer);timer=null;press=null;};
 element.addEventListener('pointerdown',event=>{
  const card=event.target.closest('[data-recipe],[data-draft]');if(!card||event.button!==0)return;
  clear();suppressClick=false;press={id:event.pointerId,x:event.clientX,y:event.clientY,card};
  timer=setTimeout(()=>{if(!press)return;suppressClick=true;const target=press.card;clear();onEdit(target.dataset.recipe||'draft');},500);
 });
 element.addEventListener('pointermove',event=>{if(press&&(Math.abs(event.clientX-press.x)>7||Math.abs(event.clientY-press.y)>7))clear();});
 element.addEventListener('pointerup',clear);element.addEventListener('pointercancel',clear);element.addEventListener('pointerleave',clear);
 element.addEventListener('click',event=>{if(suppressClick){event.preventDefault();event.stopImmediatePropagation();suppressClick=false;}},true);
 element.addEventListener('contextmenu',event=>{const card=event.target.closest('[data-recipe],[data-draft]');if(card){event.preventDefault();clear();if(!suppressClick)onEdit(card.dataset.recipe||'draft');}});
 element.addEventListener('keydown',event=>{const card=event.target.closest('[data-recipe],[data-draft]');if(card&&(event.key==='ContextMenu'||event.key==='F10'&&event.shiftKey)){event.preventDefault();onEdit(card.dataset.recipe||'draft');}});
 element.addEventListener('dragstart',event=>event.preventDefault());
}
