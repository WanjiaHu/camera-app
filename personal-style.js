import { PRESETS } from './core.js';
import { REFERENCES, recommendationFor, recordFromCapture } from './experience-model.js';
export { REFERENCES, recommendationFor } from './experience-model.js';

const STORE = 'black-pic-v2-personal-style';
export function createPersonalStyle({getScene,getView,getMedia=()=>[],onChoose,toast,database,icon,onChange}) {
  const $=selector=>document.querySelector(selector);
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let selected=[],history=[],revision=0,imported=[],storageOK=true,editing=false,picked=new Set(),demoHidden=null;
  const valid=id=>REFERENCES.some(r=>r.id===id);
  const example=record=>record.source==='demo-upload'&&record.status==='example'?REFERENCES.find(r=>r.id===record.referenceId):null;
  const visibleSelected=()=>selected.filter(id=>!demoHidden?.references.includes(id));
  const visibleImports=()=>imported.filter(r=>!demoHidden?.imports.includes(r.id));
  const activeHistory=()=>demoHidden?history.filter(r=>r.at>demoHidden.before):history;
  const availableReferences=()=>[...new Set([...visibleSelected(),...visibleImports().map(example).filter(Boolean).map(r=>r.id)])];
  function items(){
    const uploads=visibleImports().map(r=>({key:'upload:'+r.id,name:r.name,image:r.thumbnail,referenceId:example(r)?.id,pending:!example(r)}));
    const ids=new Set(uploads.map(r=>r.referenceId));
    return [...uploads,...visibleSelected().filter(id=>!ids.has(id)).map(id=>{const r=REFERENCES.find(x=>x.id===id);return {key:'reference:'+id,name:r.name,image:r.image,referenceId:id,filter:r.native?'none':PRESETS.find(p=>p.id===r.recipe).css};})];
  }
  try{
    const saved=JSON.parse(localStorage.getItem(STORE)||'null');
    if([1,2].includes(saved?.version)){
      selected=Array.isArray(saved.selected)?[...new Set(saved.selected.filter(valid))]:[];
      history=Array.isArray(saved.history)?saved.history.filter(r=>r&&['sea','street'].includes(r.scene)&&PRESETS.some(p=>p.id===r.recipe)).slice(-50):[];
      revision=Number.isInteger(saved.revision)&&saved.revision>=0?saved.revision:0;
      if(Array.isArray(saved.demoHidden?.imports)&&Array.isArray(saved.demoHidden?.references)&&Number.isFinite(saved.demoHidden?.before))demoHidden=saved.demoHidden;
    }else{
      const old=JSON.parse(localStorage.getItem('black-pic-v2-concept-1')||'null');
      const id={calm:'sea-soft',color:'sea-clear',mono:'sea-mono'}[old?.preference];
      if(id)selected.push(id);if(old?.interest)selected.push('street-mono');
    }
  }catch{storageOK=false;}
  function persist(){try{localStorage.setItem(STORE,JSON.stringify({version:2,selected,history,revision,demoHidden}));storageOK=true;}catch{storageOK=false;}}
  function render(){
    const photos=items(),empty=!photos.length;
    if(empty){editing=false;picked.clear();}
    const grid=$('#inspiration-grid');grid.dataset.editing=String(editing);grid.classList.toggle('is-empty',empty);
    grid.innerHTML=empty?`<div class="inspiration-empty"><div class="empty-photo">${icon('gallery')}</div><h2>放进喜欢的照片</h2><p>也可以先用初始滤镜开始拍摄。</p><button class="button primary" data-upload-inspiration>添加照片</button></div>`:photos.map(r=>`<button class="inspiration-photo" data-library-image="${escape(r.key)}" aria-label="${editing?'选择':r.pending?'查看':'按这张拍摄：'}${escape(r.name)}" ${editing?'aria-pressed="'+picked.has(r.key)+'"':''}><img src="${escape(r.image)}" style="filter:${escape(r.filter||'none')}" alt="${escape(r.name)}">${editing?`<span class="photo-check">${picked.has(r.key)?icon('check'):''}</span>`:r.pending?'<span class="photo-pending">待处理</span>':''}</button>`).join('');
    $('#inspiration-intro').hidden=empty;$('#inspiration-intro').textContent=editing?'选择要移除的照片':'选一张，带到这次拍摄。';
    $('#inspiration-manage').hidden=empty;$('#inspiration-manage').textContent=editing?'完成':'选择';
    $('#inspiration-manage').setAttribute('aria-pressed',String(editing));$('#inspiration-upload').hidden=editing;
    $('#inspiration-return').hidden=!empty;$('#inspiration-delete').hidden=!editing;$('#inspiration-delete').disabled=!picked.size;
    $('#inspiration-delete').textContent=picked.size?`删除 ${picked.size} 张`:'删除';
    $('#inspiration-storage').textContent=storageOK?'':'本次选择暂未保存，刷新后可能丢失。';
    $('.inspiration-footer').hidden=!empty&&!editing&&storageOK;
    $('#inspiration-button').classList.toggle('has-inspirations',!empty);
    $('#demo-library-empty').setAttribute('aria-pressed',String(empty));
    $('#demo-library-sample').setAttribute('aria-pressed',String(!empty));
  }
  async function removePicked(){
    const oldReferences=availableReferences();let removed=0;
    $('#inspiration-delete').disabled=true;
    try{
      for(const key of [...picked]){
        if(key.startsWith('upload:')){
          const id=key.slice(7),ref=example(imported.find(r=>r.id===id)||{});
          await database('inspirations','delete',id);imported=imported.filter(r=>r.id!==id);
          if(ref)selected=selected.filter(id=>id!==ref.id);
        }else selected=selected.filter(id=>id!==key.slice(10));
        picked.delete(key);removed++;
      }
      editing=false;
    }catch(error){toast(error.message);}
    if(removed){
      const remaining=new Set(availableReferences()),deleted=oldReferences.filter(id=>!remaining.has(id));
      history=history.filter(r=>!r.references?.some(id=>deleted.includes(id)));revision++;persist();
      toast(`已移除 ${removed} 张照片`);
    }
    render();onChange();
  }
  document.addEventListener('click',event=>{
    const b=event.target.closest('button');if(!b)return;
    if(b.dataset.libraryImage){
      const item=items().find(r=>r.key===b.dataset.libraryImage);if(!item)return;
      if(editing){picked.has(item.key)?picked.delete(item.key):picked.add(item.key);render();}
      else if(item.referenceId)onChoose(item.referenceId);
      else toast('图片已收录，暂时还不能用于拍摄');
    }
    if(b.id==='inspiration-manage'){editing=!editing;picked.clear();render();}
    if(b.id==='inspiration-delete')void removePicked();
    if(b.id==='inspiration-upload'||b.hasAttribute('data-upload-inspiration'))$('#inspiration-input').click();
  });
  $('#inspiration-input').addEventListener('change',async event=>{
    const files=[...event.target.files];event.target.value='';if(!files.length)return;
    let added=0;
    for(const file of files){
      if(!file.type.startsWith('image/')||file.size>20000000){toast('请选择 20 MB 以内的图片');continue;}
      const url=URL.createObjectURL(file);
      try{
        const image=new Image();image.src=url;await image.decode();
        const scale=Math.min(1,720/Math.max(image.naturalWidth,image.naturalHeight)),canvas=document.createElement('canvas');
        canvas.width=Math.round(image.naturalWidth*scale);canvas.height=Math.round(image.naturalHeight*scale);canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
        const record={id:crypto.randomUUID(),name:file.name,thumbnail:canvas.toDataURL('image/jpeg',.85),created:Date.now(),status:'pending'};
        await database('inspirations','put',record);imported.unshift(record);added++;
      }catch(error){toast(error.message||'图片未能加入，请换一张重试');}finally{URL.revokeObjectURL(url);}
    }
    editing=false;picked.clear();render();onChange();if(added)toast(`已加入 ${added} 张照片`);
  });
  return {
    render,
    open(){editing=false;picked.clear();render();},
    startEmptyDemo(){
      // Hide the previous session for presentation without deleting photos or choices.
      demoHidden={imports:imported.map(r=>r.id),references:[...selected],before:Date.now()};
      editing=false;picked.clear();revision++;persist();render();onChange();
    },
    async loadDemoUploads({restart=false}={}){
      // Presentation fixture only; arbitrary uploads do not receive these predefined features.
      const created=Date.now();let added=0;
      for(const [index,referenceId] of ['sea-open','sea-soft'].entries()){
        const id='demo-upload-'+referenceId;if(imported.some(r=>r.id===id))continue;
        const ref=REFERENCES.find(r=>r.id===referenceId),record={id,referenceId,name:ref.name,thumbnail:ref.image,created:created-index,source:'demo-upload',status:'example'};
        await database('inspirations','put',record);imported.push(record);added++;
      }
      imported.sort((a,b)=>b.created-a.created);
      if(added||demoHidden||restart){demoHidden=restart?{imports:[],references:[],before:Date.now()}:null;revision++;persist();}editing=false;picked.clear();render();onChange();
    },
    async load(){
      try{imported=(await database('inspirations','getAll')).sort((a,b)=>b.created-a.created);}catch{}
      history=history.map(r=>{const photo=getMedia().find(m=>m.created===r.at);return photo?{...recordFromCapture(photo),...r,id:photo.id}:{...r,id:r.id||String(r.at)};});
      persist();render();
    },
    recommendation(preferredRecipe=null,context={}){return recommendationFor(getScene(),availableReferences(),activeHistory(),revision,preferredRecipe,context);},
    hasRelevantHistory(){return activeHistory().some(r=>r.scene===getScene()&&r.references?.length);},
    remember(record){if(!['sea','street'].includes(record.settings.scene))return;history.push(recordFromCapture(record));history=history.slice(-50);revision++;persist();render();},
    get count(){return items().length;}
  };
}
