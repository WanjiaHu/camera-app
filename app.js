import { DEFAULT_PARAMS, PARAMS, PRESETS, STARTER_RECIPE_IDS, formatValue, parseCube } from './core.js';
import { CameraRenderer } from './renderer.js';
import { captureMode, previewBounds, captureLook, recipeRecord } from './interaction-core.js';
import { createAIFlow, createZoomDial, enableDragScroll, enableRecipeEditing, enableCardLongPress } from './camera-interactions.js';
import { createPersonalStyle } from './personal-style.js';
import { readFingerprint } from './experience-model.js';
const $ = (q,root=document)=>root.querySelector(q);
const $$ = (q,root=document)=>[...root.querySelectorAll(q)];
const icon = name=>`<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;
const escapeHTML = value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid=()=>globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`;
const state={view:'camera',panel:'effects',adjustKey:'contrast',library:'all',mode:'photo',liveEnabled:false,recipeIntent:null,selected:'original',params:{...DEFAULT_PARAMS},intensity:0,lut:null,lutAmount:100,locked:new Set(),manual:{iso:'AUTO',shutter:'AUTO',whiteBalance:'AUTO',focus:50},zoom:1,panY:0,aspect:'full',original:false,source:'demo',sourceLabel:'示例画面 · 海岸漫游',demoIndex:2,pan:0,brightness:.55,goal:'soft',aiBefore:null,aiApplied:false,aiRefined:false,aiChanges:[],mine:[],media:[],favorites:new Set(),recording:false,dirty:false};
let renderer,sourceImage,stream,sourceObjectURL,frameId,recorder,recordStream,recordStarted,recordTimer,liveTimer,currentCapturePromise,toastTimer,db,focusTimer,sourceVersion=0;
let recordingThumbnail=null,recordingSettings=null,zoomDial,displayedLut,recipeEdit=null,parkedDraft=null,saveTarget=null,restorePoint=null;
let displayedSource,sourceLoading=false,sourceError='',pendingPhoto=null,result=null,inspirationHintSeen=false;
const inspirationHintKey='black-pic-v2-viewfinder-inspiration-hint-seen';
const thumbs=new Map(),mediaURLs=new Set();
const resultFilterIds=['coast','forest','film','daylight'];
const originalLook=resultLook(PRESETS[0]);
const galleryPicked=new Set();
let recordingAppearance=null,suggestedFilterId=null,galleryEditing=false,galleryDeleting=false;
const activeMode=()=>captureMode(state.mode,state.liveEnabled);
const effectIdsFor=id=>!id||id==='original'||resultFilterIds.includes(id)
 ?resultFilterIds:[id,...resultFilterIds.slice(0,-1)];
const demoScenes=[{image:'assets/coast.jpg',label:'海岸街区',scene:'street'},{image:'assets/coast-cliffs.jpg',label:'海边山崖',scene:'sea'},{image:'assets/harbor-original.jpg',label:'海港日光',scene:'sea'}];
const currentScene=()=>state.source==='demo'?demoScenes[state.demoIndex].scene:'unknown';
const personalStyle=createPersonalStyle({toast:message=>toast(message),database,icon});
const runAI=createAIFlow($('#ai-flow'));
state.composition='wide';state.recommendationContext=null;state.planName=null;
const sourceVideo=$('#source-video'),preview=$('#preview');
const readyImage=image=>new Promise((resolve,reject)=>{if(image.complete&&image.naturalWidth){resolve(image);return;}image.onload=()=>resolve(image);image.onerror=()=>reject(new Error('画面读取失败，请换一张图片。'));});
const toast=(message)=>{$('#toast').textContent=message;$('#toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),3600);};
function openDB(){return new Promise((resolve,reject)=>{const request=indexedDB.open('black-pic-v2-camera',1);request.onupgradeneeded=()=>{for(const name of ['recipes','media','inspirations'])if(!request.result.objectStoreNames.contains(name))request.result.createObjectStore(name,{keyPath:'id'});};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}
function database(store,method,value){return new Promise((resolve,reject)=>{
 if(!db){reject(new Error('浏览器未允许本地存储，请在普通窗口中打开。'));return;}
 const transaction=db.transaction(store,method==='getAll'?'readonly':'readwrite');
 const records=transaction.objectStore(store);
 let result;
 if(method==='deleteMany')value.forEach(id=>records.delete(id));
 else{
  const request=records[method](value);
  request.onsuccess=()=>result=request.result;
 }
 transaction.oncomplete=()=>resolve(result);
 transaction.onerror=()=>reject(transaction.error||new Error('本地存储空间不足，请删除部分作品后重试。'));
 transaction.onabort=()=>reject(transaction.error||new Error('保存中断，请重试。'));
});}
function allRecipes(){return [...PRESETS,...state.mine];}
function selectedRecipe(){return allRecipes().find(x=>x.id===state.selected)||PRESETS[0];}
function persistFavorites(){try{localStorage.setItem('black-pic-v2-favorites',JSON.stringify([...state.favorites]));}catch{toast('收藏暂时只保留在本次打开中。');}}
function setRangeFill(input){const amount=(Number(input.value)-Number(input.min))/(Number(input.max)-Number(input.min))*100;input.style.setProperty('--fill',amount+'%');}
function snapshot(width=400){const c=document.createElement('canvas');c.width=width;c.height=Math.round(width*preview.height/preview.width);c.getContext('2d').drawImage(preview,0,0,c.width,c.height);return c.toDataURL('image/jpeg',.84);}
function snapshotBlob(){return new Promise((resolve,reject)=>preview.toBlob(b=>b?resolve(b):reject(new Error('无法保存当前画面，请重试。')),'image/jpeg',.94));}
function setDisplayedLut(lut){if(displayedLut===lut)return;renderer.setLut(lut);displayedLut=lut;}
function hasPreview(){
 const moving=state.source==='camera'||state.source==='video';
 return !!renderer&&!sourceLoading&&!sourceError&&(moving?sourceVideo.readyState>=2:!!sourceImage);
}
function useTexture(source){
 if(source!==displayedSource||source===sourceVideo){renderer.setSource(source);displayedSource=source;}
}
function paint({refreshSource=true}={}){
 if(!renderer)return;
 const photo=result||pendingPhoto;
 if(photo){
  useTexture(photo.frame);
  setDisplayedLut(photo.look.lut||null);
  renderer.draw(photo.look.params,photo.look.strength,1,[0,0],!!photo.original,photo.look.lutAmount);
  return;
 }
 const movingSource=state.source==='camera'||state.source==='video';
 if(movingSource&&sourceVideo.readyState<2)return;
 const source=movingSource?sourceVideo:sourceImage;
 if(!source||sourceError)return;
 if(refreshSource||source!==displayedSource)useTexture(source);
 const shift=state.recording&&!movingSource?Math.sin((performance.now()-recordStarted)/3500)*.005:0;
 const look=recordingAppearance;
 setDisplayedLut(look?look.lut||null:state.lut);
 renderer.draw(look?.params||state.params,look?.strength??state.intensity,state.zoom*(state.recording&&!movingSource?1.025:1),
  [state.pan+shift,state.panY||0],!look&&state.original,look?.lutAmount??state.lutAmount);
}
function animate(){if(!pendingPhoto&&!result&&state.view==='camera')paint();frameId=requestAnimationFrame(animate);}
function makeThumbnails(){if(!hasPreview()||state.source==='camera'||state.source==='video')return;useTexture(sourceImage);setDisplayedLut(null);for(const recipe of PRESETS){renderer.draw(recipe.params,100,1,[0,0],false,0);thumbs.set(recipe.id,snapshot(240));}paint();renderRecipes();renderLibrary();}
function syncInspirationHint(eligible){
 const hint=$('#viewfinder-inspiration-hint');
 if(!eligible){hint.hidden=true;return;}
 if(inspirationHintSeen)return;
 inspirationHintSeen=true;
 try{
  if(localStorage.getItem(inspirationHintKey)==='1')return;
  localStorage.setItem(inspirationHintKey,'1');
 }catch{}
 hint.hidden=false;
}
function updateMeta(){
 syncRecipeSummary();renderParameterRail();syncEditorSession();zoomDial?.sync();
 const busy=!!pendingPhoto||!!currentCapturePromise;
 syncInspirationHint(state.view==='camera'&&!result&&!busy&&!state.recording&&hasPreview());
 $('#camera-view').dataset.cameraState=result?'result':pendingPhoto?'processing':'viewfinder';
 $('#ai-help').hidden=!!result;
 $('#ai-help').disabled=!hasPreview()||state.recording||busy;
 $('#shutter').disabled=!state.recording&&(!hasPreview()||busy||!!result);
 $('#adjust-toggle').disabled=busy||!renderer||(!result&&!hasPreview());
 $('#adjust-toggle span').textContent=result?'换效果':'调节';
 const editorOpen=$('#inspector').classList.contains('open');
 $('#effects-toggle').disabled=busy||state.recording||!hasPreview();
 $('#intensity').disabled=busy||state.recording;
 $('#effects-toggle').hidden=!!result;
 syncEffectsToggle(editorOpen&&state.panel==='effects');
 $('#adjust-toggle').setAttribute('aria-label',result?(editorOpen?'收起效果面板':'换效果'):(editorOpen?'收起调节':'打开调节'));
 $('#exit-result').hidden=!result;
 $('#shutter').hidden=!!result;
 $('#flip-camera').hidden=!!result;
 $('#flip-camera').disabled=busy||sourceLoading;
 $('#about-button').disabled=busy||!!result||state.recording;
 $('#inspiration-button').disabled=busy;
 $('#last-shot').disabled=busy;
 $('.capture-mode-row').hidden=!!result;
 $('.zoom-controls').hidden=!!result||!!pendingPhoto;
 $('#result-label').hidden=!result;
 preview.setAttribute('aria-label',result?'成片预览':'相机取景画面');
 if(result){
  $('#result-label').textContent=result.look.name;
  $('#intensity').value=result.look.strength;
  $('#intensity-value').textContent=result.look.strength+'%';
  setRangeFill($('#intensity'));
 }else if(state.panel==='effects'){
  $('#intensity').value=state.intensity;
  $('#intensity-value').textContent=state.intensity+'%';
  setRangeFill($('#intensity'));
 }
 $('#preview-error').hidden=!sourceError||!!result;
 $('#preview-error p').textContent=sourceError;
 $('#header-count').hidden=state.view==='gallery'&&galleryEditing;
 $('#header-count').textContent=state.view==='recipes'?allRecipes().length:state.view==='gallery'?state.media.length:state.view==='inspiration'?'':'';
 const mode=activeMode();
 $$('[data-mode]').forEach(button=>{
  const selected=button.dataset.mode===mode;
  button.classList.toggle('active',selected);
  button.setAttribute('aria-pressed',String(selected));
  button.disabled=busy||state.recording;
 });
 $('#shutter').classList.toggle('video',mode==='video');$('#shutter').classList.toggle('recording',state.recording);$('#shutter').classList.toggle('live',mode==='live');
 $('#shutter').setAttribute('aria-label',state.recording?'停止录制':mode==='video'?'开始录制视频':mode==='live'?'拍摄 Live 动态照片':'拍摄照片');
 const live=state.mode==='photo'&&state.liveEnabled;
 $('#live-toggle').hidden=true;
 $('#live-toggle').setAttribute('aria-pressed',String(live));$('#live-toggle').disabled=state.mode==='video'||state.recording||busy;
 $('#live-toggle').title=state.mode==='video'?'照片模式可使用 Live':live?'关闭 Live':'开启 Live';
 const before=result?result.original:state.original;
 $('#compare-button').setAttribute('aria-pressed',String(before));$('#compare-button').disabled=state.recording||busy||!hasPreview();
 $('#original-badge').hidden=!before||!hasPreview();
}
function navigate(view){
 $('#about-dialog').close();
 if(pendingPhoto||currentCapturePromise)return;
 if(state.recording){toast('先结束录制');return;}
 if(view===state.view)return;
 if(state.view==='gallery'){galleryEditing=false;galleryPicked.clear();syncGallerySelection();}
 if(result&&state.view==='camera')result.panelOpen=$('#inspector').classList.contains('open');
 if(!result&&state.original)endCompare();
 zoomDial?.close();closePanel();state.view=view;$('.phone-screen').dataset.view=view;
 $$('.view').forEach(v=>{const active=v.id===view+'-view';v.classList.toggle('active',active);v.hidden=!active;});
 $('#page-title').textContent=view==='recipes'?'配方库':view==='gallery'?'作品集':view==='inspiration'?'个人灵感库':'相机';
 if(view==='recipes')renderLibrary();if(view==='gallery')renderGallery();if(view==='inspiration')personalStyle.open();
 if(view==='camera'&&result?.panelOpen){
  const wasOriginal=result.original;
  setPanel('recipes');
  result.original=wasOriginal;paint();
 }
 updateMeta();
}
function syncEffectsToggle(open){
 const button=$('#effects-toggle');
 const label=open?'收起效果':'换效果';
 button.setAttribute('aria-expanded',String(open));
 button.setAttribute('aria-label',label);
 button.querySelector('span').textContent=label;
}
function closePanel(){
 const panel=$('#inspector');if(panel.contains(document.activeElement))$(state.panel==='effects'?'#effects-toggle':'#adjust-toggle').focus({preventScroll:true});
 $('#viewfinder').dataset.editorOpen='false';
 panel.classList.remove('open');panel.setAttribute('aria-hidden','true');panel.inert=true;
 syncEffectsToggle(false);
 $('#adjust-toggle').setAttribute('aria-expanded','false');$('#adjust-toggle').setAttribute('aria-label','打开调节');
}
function setPanel(tab,open=true){
 if(result)tab='recipes';
 else{
  if(recipeEdit&&tab==='recipes')tab='tools';
  if(tab==='recipes'&&state.dirty)parkCurrentDraft();
 }
 const focusWasOnTool=$('#parameter-scroll').contains(document.activeElement);
 zoomDial?.close();if(tab!=='effects')endCompare();state.panel=tab;
 const inspector=$('#inspector');inspector.dataset.panel=tab;
 const effects=tab==='effects';
 inspector.setAttribute('aria-label',effects?'效果与强度':'配方与参数调节');
 $('#intensity').setAttribute('aria-label',effects?'效果强度':'配方强度');
 $$('.panel').forEach(panel=>{const active=panel.id==='panel-'+(effects?'recipes':tab);panel.classList.toggle('active',active);panel.hidden=!active;});
 $('#parameter-scroll').hidden=tab!=='tools';$('#recipe-intensity').hidden=!effects&&(tab!=='recipes'||!result);$('#recipe-summary').hidden=tab!=='recipes';
 if(tab==='adjust')renderAdjust();else if(tab==='recipes'||effects)renderRecipes();
 renderParameterRail();syncEditorSession();if(focusWasOnTool&&tab!=='tools')$('#recipe-tool').focus({preventScroll:true});
 if(open){inspector.inert=false;inspector.setAttribute('aria-hidden','false');inspector.classList.add('open');$('#viewfinder').dataset.editorOpen='true';syncEditorHeight();$('#adjust-toggle').setAttribute('aria-expanded','true');$('#adjust-toggle').setAttribute('aria-label','收起调节');}
 if(effects)updateMeta();
}
function canAdjust(){if(state.recording){toast('录制后可继续调节');return false;}return !pendingPhoto&&!currentCapturePromise&&!result&&!sourceLoading;}
function captureAdjustment(){return {...captureLook(state),manual:{...state.manual},locked:[...state.locked],original:state.original};}
function captureSession(){return {...captureAdjustment(),restorePoint};}
function restoreSession(session){const {manual,locked,restorePoint:savedPoint=null,...look}=session;state.manual={...manual};state.locked=new Set(locked);restorePoint=savedPoint;applyLook(look);}
function parkCurrentDraft(){if(state.dirty){endCompare();paint();parkedDraft={session:captureSession(),thumbnail:snapshot(180)};}}
function beginAdjustment(){if(!state.dirty)restorePoint=captureAdjustment();}
function markDirty(){beginAdjustment();state.dirty=true;if(state.aiApplied)state.aiRefined=true;}
function resetAdjustments(){
 if(!state.dirty||!restorePoint||!canAdjust())return;
 const baseline=restorePoint,hadFocus=document.activeElement===$('#reset-adjust');
 endCompare();restoreSession({...baseline,zoom:state.zoom,pan:state.pan});
 if(parkedDraft?.session.restorePoint===baseline)parkedDraft=null;
 renderRecipes();renderAdjust();updateMeta();
 if(hadFocus)(recipeEdit&&state.panel==='tools'?$('#edit-save'):$('#recipe-tool')).focus({preventScroll:true});
 toast('已复原');
}
function applyRecipe(id,{preserveDraft=true}={}){
 if(!canAdjust())return;
 const recipe=allRecipes().find(x=>x.id===id);if(!recipe)return;
 zoomDial?.close();if(preserveDraft)parkCurrentDraft();recipeEdit=null;endCompare();
 try{setDisplayedLut(recipe.lut||null);}catch(error){toast(error.message);return;}
 restorePoint=null;state.planName=null;state.recommendationContext=null;state.recipeIntent=id;state.composition=recipe.composition||'wide';state.selected=id;state.params={...DEFAULT_PARAMS,...recipe.params};state.intensity=recipe.intensity??(id==='original'?100:80);state.lut=recipe.lut||null;state.lutAmount=recipe.lutAmount??100;state.dirty=false;state.aiBefore=null;state.aiApplied=false;state.aiRefined=false;state.aiChanges=[];
 if(recipe.capture)state.manual={...state.manual,...recipe.capture.manual};
 state.locked.clear(); // Ignore legacy locks now that parameters are always editable.
 $('#intensity').value=state.intensity;$('#intensity-value').textContent=state.intensity+'%';setRangeFill($('#intensity'));
 renderRecipes();if(state.panel==='adjust')renderAdjust();updateMeta();paint();
}
function resumeDraft(){if(!parkedDraft||!canAdjust())return;recipeEdit=null;endCompare();restoreSession(parkedDraft.session);renderRecipes();setPanel('tools');}
function beginRecipeEdit(id){
 if(!canAdjust())return;
 const previous=captureSession();
 if(id==='draft'){resumeDraft();recipeEdit={sourceId:'draft',name:'当前调整',before:previous};}
 else{const recipe=allRecipes().find(r=>r.id===id);if(!recipe)return;if(state.selected!==id||!state.dirty)applyRecipe(id,{preserveDraft:false});recipeEdit={sourceId:id,id:recipe.custom?id:null,name:recipe.name,before:previous};}
 setPanel('tools');$('#edit-save').focus({preventScroll:true});
}
function cancelRecipeEdit(){if(!recipeEdit)return;const before=recipeEdit.before;recipeEdit=null;endCompare();restoreSession(before);setPanel('recipes');}
function syncEditorSession(){
 const visible=!result&&state.panel!=='recipes'&&(state.dirty||!!recipeEdit);
 $('#editor-session').hidden=!visible;$('#edit-cancel').hidden=!recipeEdit;
 $('#edit-title').textContent=recipeEdit?'编辑 · '+recipeEdit.name:'';
 $('#reset-adjust').disabled=!state.dirty||!restorePoint;
 $('#edit-save').textContent=recipeEdit?.id?'保存修改':'存为配方';
 $('#recipe-tool').hidden=!!recipeEdit&&state.panel==='tools';
}
function recipeImage(recipe){return recipe.thumbnail||thumbs.get(recipe.id)||'assets/coast.jpg';}
function renderRecipes(){
 const effects=!!result||state.panel==='effects';
 const recipes=effects?
  [...(result?.effectIds||effectIdsFor(suggestedFilterId)).map(id=>PRESETS.find(recipe=>recipe.id===id)),PRESETS[0]]:
  [...STARTER_RECIPE_IDS.map(id=>PRESETS.find(r=>r.id===id)),PRESETS[0],...state.mine];
 const editHelp=effects?'':' aria-description="长按或右键编辑配方" title="长按编辑"';
 const selected=result?.look.id||state.selected,dirty=!effects&&state.dirty;
 const inspirationEntry=effects?`<button type="button" class="recipe-card inspiration-recipe-entry" data-view="inspiration" aria-label="打开灵感库"><span class="recipe-image">${icon('plus')}</span><span class="recipe-title">灵感库</span></button>`:'';
 const draft=!effects&&parkedDraft?`<button class="recipe-card draft-card ${state.dirty?'active':''}" data-draft="true" aria-label="继续未保存的调整" aria-pressed="${state.dirty}"><div class="recipe-image"><img src="${escapeHTML(parkedDraft.thumbnail)}" alt="未保存调整"><span class="draft-dot"></span></div><span class="recipe-title">未保存</span></button>`:'';
 $('#recipe-grid').innerHTML=inspirationEntry+draft+recipes.map(recipe=>`<button class="recipe-card ${selected===recipe.id&&!dirty?'active':''}" data-recipe="${escapeHTML(recipe.id)}" aria-pressed="${selected===recipe.id&&!dirty}" aria-label="应用${escapeHTML(recipe.name)}${effects?'效果':'配方'}" ${editHelp}><div class="recipe-image"><img src="${escapeHTML(recipeImage(recipe))}" alt="${escapeHTML(recipe.name)}效果"><span class="selected-check">${icon('check')}</span></div><span class="recipe-title">${escapeHTML(recipe.name)}</span></button>`).join('');
 updateMeta();
}
function syncRecipeSummary(){
 const recipe=selectedRecipe();
 $('#recipe-summary-label').textContent=result?'换效果':'基础配方';
 $('#current-style-name').textContent=recipe.name+(state.dirty?' · 已调整':'');
}
function showStyleInfo(){
 const recipe=selectedRecipe();
 $('#style-title').textContent=state.planName||recipe.name;
 $('#style-origin').textContent=recipe.origin||'你的自定配方';
 $('#style-description').textContent=recipe.description||'沿用当前的影调与参数。';
 $('#style-guidance').textContent=recipe.guidance||'可以继续根据眼前场景调整。';
 $('#style-dialog').showModal();
}
function shortLabel(key){return {exposure:'曝光',contrast:'对比度',saturation:'饱和度',warmth:'冷暖',highlights:'高光',shadows:'阴影',fade:'褪色',grain:'颗粒',vignette:'暗角'}[key]||key;}
function paramIcon(key){return {exposure:'sun',contrast:'contrast',saturation:'drop',warmth:'warm',highlights:'sun',shadows:'moon',fade:'fade',grain:'grain',vignette:'live'}[key];}
const professionalControls = [
 {key:'lut',label:'LUT',title:'LUT',icon:'cube'},
 {key:'iso',label:'ISO',title:'感光度',icon:'iso',options:['AUTO','100','200','400','800','1600','3200'],help:'光线不足时提高 ISO；数值越高，噪点也会增加。'},
 {key:'shutter',label:'S',title:'快门',icon:'shutter',options:['AUTO','1/30','1/60','1/125','1/250','1/500','1/1000'],help:'拍运动用更快的快门；慢快门能留下运动轨迹，也更容易手抖。'},
 {key:'whiteBalance',label:'WB',title:'白平衡',icon:'warm',options:['AUTO','3200K','4500K','5600K','6500K'],help:'钨丝灯下试试 3200K，日光下试试 5600K，调整到白色看起来自然。'},
 {key:'focus',label:'MF',title:'对焦',icon:'focus',help:'靠左对焦近处，靠右对焦远处；固定焦点适合反复拍摄同一主体。'},
 {key:'exposure',label:'EV',title:'曝光',icon:'sun'}
];
function controlValue(key){
 if(key==='lut')return state.lut?state.lutAmount+'%':'未载入';
 if(key==='focus')return state.manual.focus+'%';
 if(key in state.manual)return state.manual[key];
 return formatValue(key,state.params[key]);
}
function toolInfo(key){return professionalControls.find(p=>p.key===key)||{key,title:shortLabel(key),icon:paramIcon(key)};}
function toolGlyph(control){return ['iso','shutter','whiteBalance'].includes(control.key)?`<span class="tool-code">${control.label}</span>`:icon(control.icon);}
function toolLabel(control){return control.key==='iso'?'ISO':control.title;}
function renderParameterRail(){
 const container=$('#parameter-scroll');
 if(!container.childElementCount){
  const controls=[professionalControls.find(p=>p.key==='exposure'),...professionalControls.filter(p=>p.key!=='exposure'),...PARAMS.filter(p=>p.key!=='exposure').map(p=>toolInfo(p.key))];
  container.innerHTML=controls.map(p=>`<button class="rail-control" data-editor-tool="${p.key}" aria-label="调节${p.title}">${toolGlyph(p)}<small>${toolLabel(p)}</small><em data-control-value="${p.key}"></em></button>`).join('');
 }
 for(const value of $$('[data-control-value]')){const key=value.dataset.controlValue;value.textContent=controlValue(key);value.closest('button').classList.toggle('ai-touched',state.aiChanges.some(change=>change.key===key));}
 const anchor=$('#recipe-tool'),key=state.panel==='adjust'?state.adjustKey:'recipes',focused=state.panel!=='tools';
 const signature=key+focused;
 if(anchor.dataset.display!==signature){
  const control=key==='recipes'?{key,title:'配方',icon:'recipes'}:toolInfo(key);
  anchor.innerHTML=(focused?'<span class="anchor-back">'+icon('back')+'</span>':'')+toolGlyph(control)+`<small>${toolLabel(control)}</small>`;
  anchor.dataset.display=signature;anchor.dataset.editorTool=focused?'back':'recipes';anchor.classList.toggle('active',focused);
  anchor.setAttribute('aria-label',focused?`返回全部调节，当前${control.title}`:'选择配方');
 }
}
function parameterHelp(key,label){return `<button class="parameter-help-button" data-help="${key}" aria-label="了解${label}" aria-expanded="false">${icon('info')}</button>`;}
function toneParameter(p){
 return `<div class="inline-adjust"><input id="param-${p.key}" data-param="${p.key}" aria-label="${shortLabel(p.key)}" type="range" min="${p.min}" max="${p.max}" step="${p.step}" value="${state.params[p.key]}"><output id="value-${p.key}" for="param-${p.key}">${formatValue(p.key,state.params[p.key])}${p.unit||''}</output>${parameterHelp(p.key,p.label)}</div><p class="param-help" id="help-${p.key}" hidden>${p.help}</p>`;
}
function professionalParameter(control){
 if(control.key==='exposure')return toneParameter(PARAMS.find(p=>p.key==='exposure'));
 if(control.key==='lut')return `<div class="lut-control"><button class="lut-box" id="import-lut" aria-label="导入 LUT">${icon(state.lut?'cube':'upload')}<span>${state.lut?escapeHTML(state.lut.name):'导入 LUT'}</span><small>${state.lut?state.lut.size+'³':'.cube'}</small></button>${state.lut?`<div class="compact-slider"><input type="range" id="lut-strength" aria-label="LUT 强度" min="0" max="100" value="${state.lutAmount}"><output id="lut-strength-value">${state.lutAmount}%</output><button id="remove-lut" aria-label="移除 LUT">${icon('close')}</button></div>`:''}</div>`;
 const input=control.options?`<input id="manual-${control.key}" data-manual-slider="${control.key}" aria-label="${control.title}" type="range" min="0" max="${control.options.length-1}" step="1" value="${Math.max(0,control.options.indexOf(state.manual[control.key]))}" aria-valuetext="${controlValue(control.key)}">`:`<input id="manual-focus" aria-label="对焦" type="range" min="0" max="100" value="${state.manual.focus}">`;
 return `<div class="inline-adjust">${input}<span class="manual-reading"><output id="${control.key==='focus'?'focus-value':'manual-value'}">${controlValue(control.key)}</output><small>演示</small></span>${parameterHelp(control.key,control.title)}</div><p class="param-help" id="help-${control.key}" hidden>${control.help}</p>`;
}
function renderAdjust(){
 const professional=professionalControls.find(p=>p.key===state.adjustKey);
 const tone=PARAMS.find(p=>p.key===state.adjustKey);
 const change=state.aiChanges.find(c=>c.key===state.adjustKey);
 const history=change?`<div class="ai-value-history">${icon('spark')}<span>${formatValue(change.key,change.before)}</span><span>→</span><strong>${formatValue(change.key,change.after)}</strong></div>`:'';
 $('#panel-adjust').innerHTML=history+(professional?professionalParameter(professional):toneParameter(tone||PARAMS[0]));
 $$('input[type=range]',$('#panel-adjust')).forEach(setRangeFill);renderParameterRail();
}

function renderLibrary(){
 let recipes=allRecipes();if(state.library==='mine')recipes=state.mine;if(state.library==='favorites')recipes=recipes.filter(r=>state.favorites.has(r.id));
 $('#library-grid').innerHTML=recipes.length?recipes.map(r=>`<article class="library-card"><div class="library-image"><img src="${escapeHTML(recipeImage(r))}" alt="${escapeHTML(r.name)}配方"><button data-favorite="${escapeHTML(r.id)}" class="${state.favorites.has(r.id)?'favorited':''}" aria-pressed="${state.favorites.has(r.id)}" aria-label="${state.favorites.has(r.id)?'取消收藏':'收藏'}${escapeHTML(r.name)}">${icon('heart')}</button></div><div class="library-info"><h3>${escapeHTML(r.name)}</h3><div class="library-card-actions"><button class="button subtle" data-use-recipe="${escapeHTML(r.id)}" aria-label="使用${escapeHTML(r.name)}">使用 ${icon('chevron')}</button>${r.custom?`<button class="icon-button" data-delete-recipe="${escapeHTML(r.id)}" aria-label="删除${escapeHTML(r.name)}">${icon('trash')}</button>`:''}</div></div></article>`).join(''):`<div class="empty-state">${icon('recipes')}<h2>${state.library==='favorites'?'暂无收藏':'暂无配方'}</h2><button class="button primary" data-view="camera">返回拍摄</button></div>`;
}
function openSaveDialog(){
 if(!canAdjust())return;endCompare();paint();
 saveTarget=recipeEdit?.id?state.mine.find(r=>r.id===recipeEdit.id):null;
 $('#save-thumbnail').src=snapshot(180);$('#save-base-name').textContent=recipeEdit?.name||selectedRecipe().name;
 $('#save-settings-summary').textContent=`配方强度 ${state.intensity}%${state.lut?' · 含 LUT':''}`;
 $('#recipe-name').value=saveTarget?saveTarget.name:recipeEdit?recipeEdit.name+' · 自定':'';
 $('#recipe-note').value=saveTarget?.description||'';$('#save-copy').checked=false;$('#save-copy-option').hidden=!saveTarget;
 $('#save-title').textContent=saveTarget?'编辑配方':'保存新配方';$('#save-submit').textContent=saveTarget?'保存修改':'保存';
 $('#save-capture-settings').checked=true;
 $('#save-dialog').showModal();$('#recipe-name').focus();
}
async function saveRecipe(event){
 event.preventDefault();const name=$('#recipe-name').value.trim();if(!name){$('#recipe-name').setCustomValidity('请输入名称');$('#recipe-name').reportValidity();return;}
 const button=$('#save-submit');button.disabled=true;
 const target=$('#save-copy').checked?null:saveTarget;
 const recipe=recipeRecord({look:captureSession(),name,description:$('#recipe-note').value.trim(),target,newId:uid(),now:Date.now(),thumbnail:snapshot(400),includeCapture:$('#save-capture-settings').checked});
 try{await database('recipes','put',recipe);state.mine=[recipe,...state.mine.filter(r=>r.id!==recipe.id)];state.selected=recipe.id;restorePoint=null;state.dirty=false;state.aiApplied=false;state.aiRefined=false;state.aiChanges=[];state.aiBefore=null;if(!recipeEdit)parkedDraft=null;recipeEdit=null;saveTarget=null;$('#save-dialog').close();renderRecipes();renderAdjust();renderLibrary();updateMeta();toast(target?'配方已更新':`已保存「${name}」`);}catch(error){toast(error.message||'配方未保存，请检查浏览器存储空间。');}finally{button.disabled=false;}
}
function captureSettings(){
 const look=state.original?originalLook:null;
 const settings={recipeId:state.selected,planName:state.planName,scene:state.recommendationContext?.scene||currentScene(),composition:state.composition,
  framing:{zoom:state.zoom,pan:state.pan,panY:state.panY||0},personal:state.recommendationContext?structuredClone(state.recommendationContext):null,
  recipe:selectedRecipe().name,params:{...state.params},intensity:state.intensity,lutName:state.lut?.name||null,
  mode:activeMode(),aspect:state.aspect,manual:{...state.manual},source:state.sourceLabel};
 if(look)Object.assign(settings,{recipeId:look.id,planName:null,recipe:look.name,params:{...look.params},intensity:look.strength,
  lutName:null,personal:null});
 return settings;
}
function updateLastShot(){
 $('#last-shot').innerHTML=state.media.length?`<img src="${escapeHTML(state.media[0].thumbnail)}" alt="最近拍摄的作品">`:icon('gallery');
}
async function saveMedia(record,{update=false}={}){
 await database('media','put',record);
 if(update)state.media=state.media.map(item=>item.id===record.id?record:item);
 else{state.media.push(record);state.media.sort((a,b)=>b.created-a.created);}
 renderGallery();updateLastShot();updateMeta();
 if(!update)toast(record.type==='photo'?'照片已保存':record.type==='live'?'Live 已保存':'视频已保存');
}
function freezeFrame(){
 const movingSource=state.source==='camera'||state.source==='video';
 if(!hasPreview())throw new Error('取景画面暂不可用');
 useTexture(movingSource?sourceVideo:sourceImage);
 renderer.draw(DEFAULT_PARAMS,100,state.zoom,[state.pan,state.panY],true,0);
 const frame=document.createElement('canvas');
 frame.width=preview.width;frame.height=preview.height;
 frame.getContext('2d').drawImage(preview,0,0);
 return frame;
}
function resultLook(recipe,strength=recipe.intensity??(recipe.id==='original'?0:80)){
 return {id:recipe.id,name:recipe.name,params:recipe.params,strength,lut:recipe.lut,lutAmount:recipe.lutAmount??100};
}
async function encodePhoto(photo){
 if(!renderer)throw new Error('画面渲染不可用，请重试。');
 const look=photo.look;
 const compare=photo.original;
 photo.original=false;
 paint();
 const thumbnail=snapshot(360),blob=snapshotBlob();
 if(compare){photo.original=true;paint();}
 return {...photo.record,thumbnail,still:await blob,settings:{...photo.record.settings,
  recipeId:look.id,recipe:look.name,planName:null,params:{...look.params},intensity:look.strength,
  lutName:look.lut?.name||null}};
}
function recommendForFrame(frame,apply){
 let fingerprint,scene,selection;
 return runAI({
  identify(){
   try{fingerprint=readFingerprint(frame);}catch{fingerprint=null;}
   scene=state.source==='demo'?currentScene():fingerprint?.scene||'unknown';
  },
  match(){selection=personalStyle.match(scene,fingerprint);},
  apply(){return apply(selection,scene);}
 });
}
function applyViewfinderFilter(recipe,context=null){
 const look=resultLook(recipe);
 applyLook({selected:look.id,params:look.params,intensity:look.strength,lut:look.lut||null,
  lutAmount:look.lutAmount,planName:null,recommendationContext:context,dirty:false});
}
function resetViewfinderFilter(){
 if($('#inspector').classList.contains('open'))closePanel();
 suggestedFilterId=null;
 Object.assign(state,{selected:originalLook.id,params:{...originalLook.params},intensity:originalLook.strength,
  lut:null,lutAmount:originalLook.lutAmount,planName:null,recommendationContext:null,original:false});
}
async function applyViewfinderAI(){
 if(!hasPreview()||state.view!=='camera'||result||pendingPhoto||state.recording||currentCapturePromise)return;
 const frame=freezeFrame();
 zoomDial.close();endCompare();
 currentCapturePromise=recommendForFrame(frame,(selection,scene)=>{
  if(!hasPreview())throw new Error('取景画面暂不可用');
  suggestedFilterId=selection.recipe.id;
  applyViewfinderFilter(selection.recipe,{scene,match:selection.match});
  renderRecipes();
 }).finally(()=>{currentCapturePromise=null;updateMeta();});
 updateMeta();paint();
 await currentCapturePromise;
}
async function takePhoto(ai=false){
 if(!hasPreview()||state.view!=='camera'||result||pendingPhoto||state.recording||currentCapturePromise)return;
 const photo={frame:freezeFrame(),look:resultLook(PRESETS[0]),original:false,previousPanel:state.panel,
  revision:0,savedRevision:0,record:{id:uid(),type:'photo',created:Date.now(),settings:{...captureSettings(),mode:'photo',personal:null}}};
 pendingPhoto=photo;
 closePanel();zoomDial.close();clearTimeout(focusTimer);$('#focus-ring').hidden=true;
 updateMeta();paint();
 const flash=$('#capture-flash');flash.classList.add('flash');setTimeout(()=>flash.classList.remove('flash'),80);
 const save=async()=>{
  photo.record=await encodePhoto(photo);
  await saveMedia(photo.record);
 };
 try{
  if(ai)await recommendForFrame(photo.frame,(selection,scene)=>{
   photo.look=resultLook(selection.recipe);
   photo.record.settings.scene=scene;
   photo.record.settings.personal={match:selection.match};
   return save();
  });
  else await save();
  const appliedId=photo.look.id;
  photo.effectIds=effectIdsFor(appliedId);
  result=photo;
  result.savedLook=result.look;
 }finally{
  pendingPhoto=null;
  if(!result)fitPreview();
  updateMeta();paint();
 }
 setPanel('recipes');
 $('#recipe-grid').scrollLeft=0;
}
function changeResult(look){
 if(!renderer)return;
 setDisplayedLut(look.lut||null);
 result.look=look;
 result.original=false;
 result.revision++;
 updateMeta();paint();
 clearTimeout(result.saveTimer);
 result.saveTimer=setTimeout(()=>void flushResult(),200);
}
async function flushResult(){
 const photo=result;
 if(!photo)return;
 clearTimeout(photo.saveTimer);
 if(photo.saving)return photo.saving;
 if(photo.revision===photo.savedRevision)return;
 photo.saving=(async()=>{
  while(photo.revision!==photo.savedRevision){
   const revision=photo.revision,look=photo.look;
   try{
    const record=await encodePhoto(photo);
    await saveMedia(record,{update:true});
    photo.record=record;photo.savedLook=look;photo.savedRevision=revision;
   }catch(error){
    toast(error.message||'成片更新失败');
    if(photo.revision===revision){
     photo.look=photo.savedLook;photo.savedRevision=revision;
     renderRecipes();paint();
    }
   }
  }
 })();
 try{await photo.saving;}finally{photo.saving=null;}
}
function closeResult(){
 if(!result)return;
 const previousPanel=result.previousPanel;
 clearTimeout(result.saveTimer);
 closePanel();result=null;
 state.panel=previousPanel;
 setPanel(previousPanel,false);
 if(state.view==='camera')fitPreview();
 renderRecipes();updateMeta();paint();
}
async function saveViewfinderPhoto(){
 paint();
 const record={id:uid(),type:'photo',created:Date.now(),thumbnail:snapshot(360),settings:captureSettings()};
 const still=snapshotBlob();
 const flash=$('#capture-flash');flash.classList.add('flash');setTimeout(()=>flash.classList.remove('flash'),80);
 await saveMedia({...record,still:await still});
}
async function startRecording(type){if(!window.MediaRecorder||!preview.captureStream){toast('当前浏览器不支持录制，请使用较新的 Chrome 或 Safari。');return;}if(state.recording)return;
 recordingSettings=captureSettings();
 recordingAppearance=state.original?originalLook:{params:state.params,strength:state.intensity,lut:state.lut,lutAmount:state.lutAmount};
 paint();
 recordingThumbnail=snapshot(360);
 const still=await snapshotBlob();const chunks=[];recordStream=preview.captureStream(24);const mime=['video/webm;codecs=vp9','video/webm;codecs=vp8','video/mp4','video/webm'].find(t=>MediaRecorder.isTypeSupported(t));try{recorder=new MediaRecorder(recordStream,mime?{mimeType:mime,videoBitsPerSecond:4500000}:undefined);}catch(error){recordStream.getTracks().forEach(t=>t.stop());toast('录制初始化失败，请换一个浏览器重试。');return;}state.recording=true;recordStarted=performance.now();$('#recording-badge').hidden=false;$('#recording-badge span').textContent=type==='live'?'LIVE · 00:00':'00:00';closePanel();updateMeta();recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};recorder.onstop=async()=>{const duration=(performance.now()-recordStarted)/1000;clearInterval(recordTimer);clearTimeout(liveTimer);state.recording=false;recordingAppearance=null;$('#recording-badge').hidden=true;recordStream.getTracks().forEach(t=>t.stop());updateMeta();const video=new Blob(chunks,{type:recorder.mimeType||mime||'video/webm'});if(!video.size){toast('没有录制到画面，请重试。');return;}try{await saveMedia({id:uid(),type,created:Date.now(),thumbnail:recordingThumbnail,still,video,duration,settings:recordingSettings});}catch(error){toast(error.message||'视频未保存，请检查存储空间。');}};recorder.onerror=()=>{toast('录制中断，请重新尝试。');stopRecording();};recorder.start(200);recordTimer=setInterval(()=>{const sec=Math.floor((performance.now()-recordStarted)/1000);$('#recording-badge span').textContent=(type==='live'?'LIVE · ':'')+`${String(Math.floor(sec/60)).padStart(2,'0')}:${String(sec%60).padStart(2,'0')}`;},200);if(type==='live')liveTimer=setTimeout(stopRecording,3000);}
function stopRecording(){if(recorder&&recorder.state!=='inactive')recorder.stop();}
async function shutter(){
 if(state.view!=='camera'||pendingPhoto||result||currentCapturePromise)return;
 if(state.recording){stopRecording();return;}
 if(!hasPreview())return;
 const mode=activeMode();
 zoomDial.close();
 const capture=mode==='photo'?saveViewfinderPhoto():startRecording(mode);
 currentCapturePromise=capture.finally(()=>{
  if(!state.recording)recordingAppearance=null;
  currentCapturePromise=null;updateMeta();paint();
 });
 updateMeta();
 await currentCapturePromise;
}
const captureLabels={photo:'照片',video:'视频',live:'Live'};
function syncGallerySelection(){
 for(const card of $$('#gallery-grid [data-capture]')){
  if(galleryEditing)card.setAttribute('aria-pressed',String(galleryPicked.has(card.dataset.capture)));
  else card.removeAttribute('aria-pressed');
 }
 $('#gallery-done').hidden=!galleryEditing;
 $('#gallery-done').disabled=galleryDeleting;
 $('#gallery-selection').hidden=!galleryEditing;
 $('#gallery-delete').disabled=!galleryPicked.size||galleryDeleting;
 $('#gallery-delete').textContent=galleryPicked.size?`删除 ${galleryPicked.size} 项`:'删除';
 $('#header-count').hidden=state.view==='gallery'&&galleryEditing;
}
function renderGallery(){
 $('#gallery-summary').hidden=true;
 $('#gallery-grid').innerHTML=state.media.length?state.media.map(item=>
  `<button class="gallery-card" data-capture="${escapeHTML(item.id)}" aria-label="查看${captureLabels[item.type]}">
    <img src="${escapeHTML(item.thumbnail)}" alt="">
    <span>${captureLabels[item.type]}${item.duration?' · '+item.duration.toFixed(1)+'s':''}</span>
    <span class="photo-check" aria-hidden="true">${icon('check')}</span>
    <div><time datetime="${new Date(item.created).toISOString()}">${new Date(item.created).toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})}</time><span hidden>${escapeHTML(item.settings.recipe)}</span></div>
   </button>`
 ).join(''):`<div class="empty-state">${icon('gallery')}<h2>暂无作品</h2><button class="button primary" data-view="camera">${icon('camera')}开始拍摄</button></div>`;
 syncGallerySelection();
}
async function removeCaptures(ids){
 if(galleryDeleting||!ids.length)return;
 galleryDeleting=true;syncGallerySelection();
 try{
  await database('media','deleteMany',ids);
  state.media=state.media.filter(item=>!ids.includes(item.id));
  if(ids.includes(result?.record.id))closeResult();
  $('#media-dialog').close();
  galleryEditing=false;galleryPicked.clear();renderGallery();updateMeta();updateLastShot();
  toast(ids.length===1?'作品已删除。':`已删除 ${ids.length} 项作品。`);
 }finally{galleryDeleting=false;syncGallerySelection();}
}
function objectURL(blob){const url=URL.createObjectURL(blob);mediaURLs.add(url);return url;}
function cleanupMediaURLs(){const video=$('#detail-video');if(video)video.pause();for(const url of mediaURLs)URL.revokeObjectURL(url);mediaURLs.clear();}
function openCapture(id){const item=state.media.find(x=>x.id===id);if(!item)return;cleanupMediaURLs();const stillURL=objectURL(item.still);const videoURL=item.video?objectURL(item.video):null;$('#media-detail').innerHTML=`<div class="dialog-heading"><span class="micro">${captureLabels[item.type]} · ${new Date(item.created).toLocaleDateString('zh-CN')}</span><button class="icon-button" data-close="media-dialog" aria-label="关闭">${icon('close')}</button></div>${item.type==='video'?`<video id="detail-video" class="media-detail-video" controls playsinline src="${videoURL}" poster="${escapeHTML(item.thumbnail)}"></video>`:`<img id="detail-photo" class="media-detail-image" src="${stillURL}" alt="拍摄作品">${item.video?`<video id="detail-video" class="media-detail-video" controls playsinline loop hidden src="${videoURL}"></video>`:''}`}<div class="media-detail-meta" hidden><b>${escapeHTML(item.settings.planName||item.settings.recipe)}</b> · 强度 ${item.settings.intensity}% · ${escapeHTML(item.settings.aspect)}<br>${escapeHTML(item.settings.source)}${item.type==='live'?'<br>照片 + 短视频':''}</div><div class="media-actions">${item.type==='live'?`<button class="button primary" id="play-live">${icon('play')}播放</button>`:''}${item.type!=='video'?`<button class="button subtle" data-export="photo" data-id="${escapeHTML(item.id)}">${icon('download')}保存照片</button>`:''}${item.video?`<button class="button subtle" data-export="video" data-id="${escapeHTML(item.id)}">${icon('download')}保存视频</button>`:''}<button class="button delete-capture" data-delete-capture="${escapeHTML(item.id)}" aria-label="删除这份作品">${icon('trash')}</button></div>`;$('#media-dialog').showModal();}
function download(blob,name){const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
function stopSource(){if(stream){stream.getTracks().forEach(t=>t.stop());stream=null;}sourceVideo.pause();sourceVideo.srcObject=null;sourceVideo.removeAttribute('src');if(sourceObjectURL){URL.revokeObjectURL(sourceObjectURL);sourceObjectURL=null;}$('#connect-camera').innerHTML=icon('camera')+'<span>连接相机</span>';}
async function useDemo(index=state.demoIndex){
 const version=++sourceVersion;
 sourceLoading=true;sourceError='';updateMeta();
 stopSource();
 resetViewfinderFilter();state.source='demo';state.demoIndex=index;state.sourceLabel='示例画面 · '+demoScenes[index].label;
 const image=new Image();image.src=demoScenes[index].image;
 try{
  await readyImage(image);
  if(version!==sourceVersion)return;
  sourceImage=image;state.pan=0;state.panY=0;state.zoom=1;state.original=false;
 }catch(error){if(version===sourceVersion)sourceError=error.message;}
 finally{
  if(version===sourceVersion){
   sourceLoading=false;fitPreview();updateMeta();makeThumbnails();
  }
 }
}
function switchDemoLibrary(sample){
 if(!canAdjust())return;
 if(sample)personalStyle.restoreDemo();else personalStyle.startEmptyDemo();
 navigate('inspiration');
}
async function importMedia(file){
 if(!file||!canAdjust())return;
 if(!file.type.startsWith('image/')&&!file.type.startsWith('video/')){toast('请选择图片或视频文件。');return;}
 const version=++sourceVersion;
 sourceLoading=true;sourceError='';updateMeta();stopSource();
 sourceObjectURL=URL.createObjectURL(file);
 try{
  if(file.type.startsWith('image/')){
   const image=new Image();image.src=sourceObjectURL;await readyImage(image);
   if(version!==sourceVersion)return;
   sourceImage=image;state.source='image';
  }else{
   await new Promise((resolve,reject)=>{
    sourceVideo.onloadeddata=resolve;
    sourceVideo.onerror=()=>reject(new Error('这个视频格式无法预览，请换一个 MP4 或 WebM 文件。'));
    sourceVideo.src=sourceObjectURL;sourceVideo.loop=true;sourceVideo.load();
   });
   await sourceVideo.play();
   if(version!==sourceVersion)return;
   state.source='video';
  }
  resetViewfinderFilter();state.sourceLabel='导入画面 · '+file.name;
  state.pan=0;state.panY=0;state.zoom=1;state.original=false;sourceLoading=false;
  updateMeta();makeThumbnails();toast('画面已导入');
 }catch(error){
  if(version===sourceVersion){await useDemo();toast(error.message);}
 }
}
let facingMode='environment';
async function connectCamera(force=false){
 if(!canAdjust())return;
 if(stream&&!force){await useDemo();toast('已断开相机，回到示例画面。');return;}
 if(!navigator.mediaDevices?.getUserMedia){toast('相机需要在 localhost 或 HTTPS 中打开。');return;}
 const button=$('#connect-camera');
 button.disabled=true;sourceLoading=true;updateMeta();
 let switched=false;
 try{
  const nextStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:facingMode},width:{ideal:1920},height:{ideal:1080}},audio:false});
  switched=true;stopSource();stream=nextStream;sourceVideo.srcObject=stream;await sourceVideo.play();
  resetViewfinderFilter();state.source='camera';state.sourceLabel='实时相机 · '+(facingMode==='environment'?'后置优先':'前置优先');
  state.pan=0;state.panY=0;state.zoom=1;state.original=false;sourceError='';
  for(const track of nextStream.getVideoTracks())track.addEventListener('ended',()=>{
   if(stream!==nextStream)return;
   sourceError='摄像头画面已中断。';updateMeta();
  });
  button.innerHTML=icon('camera')+'<span>断开相机</span>';
  toast('相机已连接');
 }catch(error){
  if(switched)await useDemo();
  toast(error.name==='NotAllowedError'?'相机权限未开启。可在浏览器中允许，或继续使用示例画面。':error.name==='NotFoundError'?'没有找到可用摄像头。':'相机暂时无法连接。');
 }finally{sourceLoading=false;button.disabled=false;updateMeta();}
}
function setMode(mode){
 if(!canAdjust()||mode===activeMode())return;
 zoomDial?.close();
 state.mode=mode==='live'?'photo':mode;state.liveEnabled=mode==='live';
 endCompare();updateMeta();
}
function fitPreview(){
 if(result||pendingPhoto)return;
 const frame=$('#viewfinder');if(!frame.clientWidth||!frame.clientHeight)return;
 const ratio=state.aspect==='full'?frame.clientWidth/frame.clientHeight:(()=>{const [w,h]=state.aspect.split(':').map(Number);return w/h;})();
 const height=Math.round(900/ratio);if(preview.width!==900||preview.height!==height){preview.width=900;preview.height=height;}
 frame.dataset.aspect=state.aspect;frame.style.setProperty('--ratio',ratio);positionLiveToggle();paint();
}
function setAspect(){if(!canAdjust())return;const values=['full','3:4','1:1','9:16'];state.aspect=values[(values.indexOf(state.aspect)+1)%values.length];$('#aspect-button').textContent=state.aspect==='full'?'全屏':state.aspect;fitPreview();updateMeta();}
function endCompare(){
 state.original=false;
 if(result)result.original=false;
 $('#original-badge').hidden=true;$('#compare-button').setAttribute('aria-pressed','false');
 paint();
}
function toggleCompare(){
 if($('#compare-button').disabled)return;
 if(result)result.original=!result.original;
 else state.original=!state.original;
 updateMeta();paint({refreshSource:false});
}
function applyLook(look){
 Object.assign(state,look,{params:{...look.params}});setDisplayedLut(state.lut);
 $('#intensity').value=state.intensity;$('#intensity-value').textContent=state.intensity+'%';setRangeFill($('#intensity'));
 updateMeta();paint();
}
zoomDial=createZoomDial({button:$('#zoom-button'),popover:$('#zoom-popover'),dial:$('#zoom-dial'),getValue:()=>state.zoom,setValue:value=>{state.zoom=value;paint();},canChange:canAdjust,onOpen:()=>{$('#viewfinder').dataset.zoomOpen='true';},onClose:()=>{$('#viewfinder').dataset.zoomOpen='false';}});
enableDragScroll($('#parameter-scroll'));enableDragScroll($('#recipe-grid'));enableRecipeEditing($('#recipe-grid'),id=>{if(!result)beginRecipeEdit(id);},()=>!result&&state.panel!=='effects');
function syncEditorHeight(){$('#viewfinder').style.setProperty('--editor-height',$('#inspector').offsetHeight+'px');}
enableCardLongPress($('#gallery-grid'),'[data-capture]',card=>{
 galleryEditing=true;galleryPicked.add(card.dataset.capture);syncGallerySelection();
},()=>!galleryEditing&&!galleryDeleting);
const editorSizeObserver=new ResizeObserver(syncEditorHeight);editorSizeObserver.observe($('#inspector'));
function positionLiveToggle(){const rect=preview.getBoundingClientRect();if(!rect.width)return;const bounds=previewBounds(rect,preview.width/preview.height);$('#live-toggle').style.top=((bounds.top-rect.top)*preview.clientWidth/rect.width+10)+'px';}
const viewfinderSizeObserver=new ResizeObserver(()=>{if(!state.recording)fitPreview();});viewfinderSizeObserver.observe($('#viewfinder'));
document.addEventListener('click',async event=>{
 const button=event.target.closest('button');if(!button)return;
 try{
  if(button.dataset.view){
   if(state.view==='camera'&&button.dataset.view!=='camera'&&result)await flushResult();
   navigate(button.dataset.view);return;
  }
  if(button.dataset.close){$('#'+button.dataset.close).close();return;}
  if(button.dataset.editorTool){if(!canAdjust())return;const key=button.dataset.editorTool;if(key==='back')setPanel('tools');else if(key==='recipes')setPanel('recipes');else{state.adjustKey=key;setPanel('adjust');}return;}
  if(button.dataset.recipe){
   const recipe=allRecipes().find(item=>item.id===button.dataset.recipe);
   if(result&&recipe){
    if(result.look.id!==recipe.id){changeResult(resultLook(recipe));renderRecipes();await flushResult();}
   }else if(state.panel==='effects'&&recipe&&canAdjust()){
    if(state.selected!==recipe.id){applyViewfinderFilter(recipe);renderRecipes();}
   }else if(state.panel!=='effects')applyRecipe(button.dataset.recipe);
   return;
  }
  if(button.dataset.draft){resumeDraft();return;}
  if(button.dataset.mode){setMode(button.dataset.mode);return;}
  if(button.dataset.help){const p=$('#help-'+button.dataset.help);p.hidden=!p.hidden;button.setAttribute('aria-expanded',String(!p.hidden));return;}
  if(button.dataset.library){state.library=button.dataset.library;$$('[data-library]').forEach(b=>b.classList.toggle('active',b===button));renderLibrary();return;}
  if(button.dataset.favorite){const id=button.dataset.favorite;state.favorites.has(id)?state.favorites.delete(id):state.favorites.add(id);persistFavorites();renderLibrary();return;}
  if(button.dataset.useRecipe){navigate('camera');if(result)return;applyRecipe(button.dataset.useRecipe);toast('已应用「'+selectedRecipe().name+'」。');return;}
  if(button.dataset.deleteRecipe){if(!button.dataset.confirm){button.dataset.confirm='true';button.innerHTML=icon('check');button.setAttribute('aria-label','再次点击确认删除配方');toast('再次点击确认删除这份配方。');return;}const id=button.dataset.deleteRecipe;await database('recipes','delete',id);state.mine=state.mine.filter(r=>r.id!==id);state.favorites.delete(id);persistFavorites();if(state.selected===id)applyRecipe('original');renderRecipes();renderLibrary();toast('配方已删除。');return;}
  if(button.dataset.capture){
   const id=button.dataset.capture;
   if(galleryEditing){
    if(galleryDeleting)return;
    if(galleryPicked.has(id))galleryPicked.delete(id);else galleryPicked.add(id);
    syncGallerySelection();
   }else openCapture(id);
   return;
  }
  if(button.dataset.export){const item=state.media.find(x=>x.id===button.dataset.id);if(!item)return;const blob=button.dataset.export==='photo'?item.still:item.video;const ext=button.dataset.export==='photo'?'jpg':blob.type.includes('mp4')?'mp4':'webm';download(blob,`Black-PIC-${new Date(item.created).toISOString().replace(/[:.]/g,'-')}.${ext}`);return;}
  if(button.dataset.deleteCapture){
   if(!button.dataset.confirm){
    button.dataset.confirm='true';button.innerHTML=icon('check');button.setAttribute('aria-label','再次点击确认删除作品');toast('再次点击确认删除这份作品。');return;
   }
   button.disabled=true;
   try{await removeCaptures([button.dataset.deleteCapture]);}
   finally{button.disabled=false;}
   return;
  }
  switch(button.id){
   case 'ai-help':await applyViewfinderAI();break;
   case 'exit-result':await flushResult();closeResult();$('#shutter').focus();break;
   case 'dismiss-inspiration-hint':
    $('#viewfinder-inspiration-hint').hidden=true;$('#inspiration-button').focus({preventScroll:true});break;
   case 'retry-preview':if(renderer)await useDemo();else location.reload();break;
   case 'style-info':showStyleInfo();break;
   case 'about-button':zoomDial?.close();$('#about-dialog').showModal();break;
   case 'demo-library-empty':await switchDemoLibrary(false);break;
   case 'demo-library-sample':await switchDemoLibrary(true);break;
   case 'adjust-toggle':if(result||canAdjust()){$('#inspector').classList.contains('open')?closePanel():setPanel(state.panel);}break;
   case 'live-toggle':if(state.mode==='photo'&&canAdjust()){state.liveEnabled=!state.liveEnabled;updateMeta();}break;
   case 'effects-toggle':
    if(!canAdjust())break;
    if($('#inspector').classList.contains('open'))closePanel();
    else setPanel('effects');
    break;
   case 'compare-button':toggleCompare();break;
   case 'edit-save':case 'library-save':openSaveDialog();break;
   case 'edit-cancel':cancelRecipeEdit();break;
   case 'aspect-button':setAspect();break;
   case 'import-media':if(canAdjust()){$('#about-dialog').close();$('#media-input').click();}break;
   case 'import-lut':if(canAdjust())$('#lut-input').click();break;
   case 'remove-lut':if(canAdjust()){endCompare();markDirty();state.lut=null;setDisplayedLut(null);state.dirty=true;renderAdjust();updateMeta();toast('LUT 已移除');}break;
   case 'connect-camera':$('#about-dialog').close();await connectCamera();break;
   case 'flip-camera':if(!canAdjust())break;$('#about-dialog').close();if(stream){facingMode=facingMode==='environment'?'user':'environment';await connectCamera(true);}else if(state.source==='demo'){await useDemo((state.demoIndex+demoScenes.length-1)%demoScenes.length);}else{state.pan=state.pan===0?.05:state.pan>0?-.05:0;paint();toast('已改变取景位置。');}break;
   case 'shutter':await shutter();break;
   case 'last-shot':await flushResult();navigate('gallery');break;
   case 'gallery-done':galleryEditing=false;galleryPicked.clear();syncGallerySelection();break;
   case 'gallery-delete':await removeCaptures([...galleryPicked]);break;
   case 'reset-adjust':resetAdjustments();break;
   case 'play-live':{const video=$('#detail-video');const photo=$('#detail-photo');if(video.hidden){video.hidden=false;photo.hidden=true;await video.play();button.innerHTML=icon('gallery')+'照片';}else{video.pause();video.hidden=true;photo.hidden=false;button.innerHTML=icon('play')+'播放';}}break;
  }
 }catch(error){toast(error.message||'操作暂时未完成，请再试一次。');}
});
document.addEventListener('input',event=>{
 const input=event.target;if(input.id==='recipe-name'){input.setCustomValidity('');return;}if(input.type!=='range')return;
 if(result&&input.id==='intensity'){changeResult({...result.look,strength:Number(input.value)});return;}
 if(state.panel==='effects'&&input.id==='intensity'){
  if(canAdjust()){state.intensity=Number(input.value);updateMeta();paint();}
  return;
 }
 if(state.recording){toast('录制结束后可以继续调整。');if(input.dataset.param)input.value=state.params[input.dataset.param];else if(input.id==='intensity')input.value=state.intensity;else if(input.id==='lut-strength')input.value=state.lutAmount;else if(input.id==='manual-focus')input.value=state.manual.focus;else if(input.dataset.manualSlider)input.value=professionalControls.find(c=>c.key===input.dataset.manualSlider).options.indexOf(state.manual[input.dataset.manualSlider]);setRangeFill(input);return;}
 endCompare();markDirty();setRangeFill(input);if(input.dataset.param){state.params[input.dataset.param]=Number(input.value);const p=PARAMS.find(x=>x.key===input.dataset.param);$('#value-'+p.key).textContent=formatValue(p.key,Number(input.value))+(p.unit||'');state.dirty=true;}
 else if(input.id==='intensity'){state.intensity=Number(input.value);state.dirty=true;$('#intensity-value').textContent=input.value+'%';}
 else if(input.id==='lut-strength'){state.lutAmount=Number(input.value);$('#lut-strength-value').textContent=input.value+'%';state.dirty=true;}
 else if(input.id==='manual-focus'){state.manual.focus=Number(input.value);state.dirty=true;$('#focus-value').textContent=input.value+'%';}
 else if(input.dataset.manualSlider){const key=input.dataset.manualSlider,control=professionalControls.find(c=>c.key===key);state.manual[key]=control.options[Number(input.value)];state.dirty=true;$('#manual-value').textContent=state.manual[key];input.setAttribute('aria-valuetext',state.manual[key]);}
 updateMeta();paint();
});
document.addEventListener('change',event=>{if(result&&event.target.id==='intensity'){void flushResult();return;}if(state.panel==='effects'&&event.target.id==='intensity')return;if(event.target.type==='range'&&state.panel==='recipes'&&state.dirty){parkCurrentDraft();renderRecipes();}if(event.target.id==='save-copy'){const copy=event.target.checked;$('#save-title').textContent=copy?'保存新配方':'编辑配方';$('#save-submit').textContent=copy?'保存':'保存修改';if(copy&&$('#recipe-name').value===saveTarget?.name)$('#recipe-name').value+=' · 副本';}if(event.target.dataset.manual){if(!canAdjust()){event.target.value=state.manual[event.target.dataset.manual];return;}state.manual[event.target.dataset.manual]=event.target.value;updateMeta();}});
$('.brand').addEventListener('click',event=>{event.preventDefault();navigate('camera');});
$('#save-form').addEventListener('submit',saveRecipe);
$('#media-input').addEventListener('change',async event=>{const file=event.target.files[0];event.target.value='';await importMedia(file);});
$('#lut-input').addEventListener('change',async event=>{const file=event.target.files[0];event.target.value='';if(!file)return;if(file.size>16000000){toast('请选择 16 MB 以内的 .cube 文件。');return;}try{endCompare();const lut=parseCube(await file.text(),file.name.replace(/\.cube$/i,''));setDisplayedLut(lut);markDirty();state.lut=lut;state.lutAmount=100;state.dirty=true;renderAdjust();updateMeta();toast('LUT 已应用');}catch(error){toast(error.message);}});
preview.addEventListener('pointerdown',event=>{if(result||pendingPhoto||!hasPreview())return;const rect=preview.getBoundingClientRect();const focus=$('#focus-ring');focus.style.left=((event.clientX-rect.left)*preview.clientWidth/rect.width)+'px';focus.style.top=((event.clientY-rect.top)*preview.clientHeight/rect.height)+'px';focus.hidden=false;clearTimeout(focusTimer);focusTimer=setTimeout(()=>focus.hidden=true,1800);});
window.addEventListener('keydown',event=>{if($('dialog[open]'))return;if(event.key==='Escape'){if(zoomDial.opened)zoomDial.close();else if(result){void flushResult().then(()=>{closeResult();$('#shutter').focus();});}else closePanel();return;}if(event.target.closest('input,textarea,select,button,a,[role=slider]'))return;if(event.code==='Space'){event.preventDefault();void shutter().catch(error=>toast(error.message));}});
$('#media-dialog').addEventListener('close',cleanupMediaURLs);
$$('dialog').forEach(dialog=>dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const rect=dialog.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)dialog.close();}));
window.addEventListener('pagehide',()=>{zoomDial?.close();cancelAnimationFrame(frameId);if(state.recording)stopRecording();if(stream)stream.getTracks().forEach(track=>track.stop());});
function fitPhone(){const scale=window.innerWidth<=480?1:Math.min(1,(window.innerHeight-36)/866,(window.innerWidth-48)/410);document.documentElement.style.setProperty('--demo-scale',String(Math.max(.3,scale)));}
fitPhone();window.addEventListener('resize',fitPhone);
try{
 try{db=await openDB();const [recipes,media]=await Promise.all([database('recipes','getAll'),database('media','getAll')]);state.mine=recipes.sort((a,b)=>b.created-a.created);state.media=media.sort((a,b)=>b.created-a.created);}catch(error){toast('本地存储不可用，拍摄与保存需要允许浏览器网站数据。');}
 try{const favoriteData=JSON.parse(localStorage.getItem('black-pic-v2-favorites')||'[]');if(Array.isArray(favoriteData))state.favorites=new Set(favoriteData);}catch{}
 await personalStyle.load();
 const launchURL=new URL(location.href);
 if(launchURL.searchParams.get('inspirations')==='sample'){personalStyle.restoreDemo();launchURL.searchParams.delete('inspirations');window.history.replaceState(null,'',launchURL);}
 renderer=new CameraRenderer(preview);fitPreview();await useDemo();renderRecipes();renderLibrary();renderGallery();updateMeta();setRangeFill($('#intensity'));updateLastShot();animate();
}catch(error){sourceError=error.message;updateMeta();toast(error.message);}

preview.addEventListener('webglcontextlost',event=>{
 event.preventDefault();
 renderer=null;sourceError='画面渲染已中断。';updateMeta();
});
preview.addEventListener('webglcontextrestored',()=>{
 try{
  renderer=new CameraRenderer(preview);
  displayedSource=undefined;displayedLut=undefined;sourceError='';
  fitPreview();updateMeta();paint();
 }catch(error){sourceError=error.message;updateMeta();}
});
sourceVideo.addEventListener('error',()=>{
 if(sourceLoading||state.source!=='video')return;
 sourceError='导入的取景视频无法播放。';updateMeta();
});
