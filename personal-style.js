import { enableCardLongPress } from './camera-interactions.js';
import { EXAMPLES, describeFingerprint, matchEffect, readFingerprint } from './experience-model.js';

const STORE='black-pic-v2-personal-style';

export function createPersonalStyle({toast,database,icon}){
  const $=selector=>document.querySelector(selector);
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let uploads=[],liked=new Set(),hidden=null,editing=false,picked=new Set(),storageOK=true,deleting=false,uploading=false;

  try{
    const saved=JSON.parse(localStorage.getItem(STORE)||'null');
    if(saved?.version===3){
      liked=new Set(EXAMPLES.filter(example=>saved.liked?.includes(example.id)).map(example=>example.id));
      if(Array.isArray(saved.hidden?.uploads)&&Array.isArray(saved.hidden?.liked))hidden=saved.hidden;
    }else if(Array.isArray(saved?.demoHidden?.imports)){
      hidden={uploads:saved.demoHidden.imports,liked:[]};
    }
  }catch{storageOK=false;}

  function persist(){
    try{localStorage.setItem(STORE,JSON.stringify({version:3,liked:[...liked],hidden}));storageOK=true;}
    catch{storageOK=false;}
  }

  const visibleUploads=()=>uploads.filter(item=>!hidden?.uploads.includes(item.id));
  const isLiked=id=>liked.has(id)&&!hidden?.liked.includes(id);
  const exampleById=id=>EXAMPLES.find(item=>item.id===id);
  const visibleProfiles=visibleUploads;

  function render(){
    const photos=visibleUploads();
    if(!photos.length){editing=false;picked.clear();}
    $('#inspiration-intro').hidden=!photos.length;
    $('#example-grid').innerHTML=EXAMPLES.map(item=>
      `<button class="inspiration-photo" data-example="${item.id}" aria-label="查看示例 ${escape(item.name)}"><img src="${item.image}" alt="${escape(item.name)}"><span class="photo-tag">示例</span>${isLiked(item.id)?`<span class="photo-liked" aria-label="已喜欢" hidden>${icon('heart')}</span>`:''}</button>`
    ).join('');
    $('#inspiration-grid').innerHTML=photos.length?photos.map(item=>
      `<button class="inspiration-photo" data-library-image="${escape(item.id)}"><img src="${escape(item.thumbnail)}" alt="${escape(item.name)}"><span class="photo-check" aria-hidden="true">${icon('check')}</span></button>`
    ).join(''):`<div class="inspiration-empty"><p>上传几张你喜欢的照片，AI 会学着按你的审美来。</p><button class="button primary" data-upload-inspiration>上传照片</button></div>`;
    syncSelection();
    $('#inspiration-storage').textContent=storageOK?'':'浏览器暂时无法保存灵感库设置。';
    const entry=$('#inspiration-button'),personalized=visibleProfiles().length>0;
    entry.classList.toggle('has-inspirations',personalized);
    entry.setAttribute('aria-label',personalized?'打开灵感库，个性化已开启':'打开灵感库');
    entry.title=personalized?'个性化已开启':'个人灵感库';
    $('#demo-library-empty').setAttribute('aria-pressed',String(!!hidden));
    $('#demo-library-sample').setAttribute('aria-pressed',String(!hidden));
  }

  function syncSelection(){
    for(const card of $('#inspiration-grid').querySelectorAll('[data-library-image]')){
      const image=card.querySelector('img');
      card.setAttribute('aria-label',`${editing?'选择':'查看'} ${image.alt}`);
      if(editing)card.setAttribute('aria-pressed',String(picked.has(card.dataset.libraryImage)));
      else card.removeAttribute('aria-pressed');
    }
    $('#inspiration-manage').hidden=!editing;
    $('#inspiration-manage').textContent=editing?'完成':'选择';
    $('#inspiration-manage').setAttribute('aria-pressed',String(editing));
    $('#inspiration-manage').disabled=deleting;
    $('#inspiration-upload').hidden=editing||!visibleUploads().length;
    $('#inspiration-delete').hidden=!editing;
    $('#inspiration-delete').disabled=!picked.size||deleting;
    $('#inspiration-delete').textContent=picked.size?`删除 ${picked.size} 张`:'删除';
    $('.inspiration-footer').hidden=!editing&&storageOK;
  }

  enableCardLongPress($('#inspiration-grid'),'[data-library-image]',card=>{
    editing=true;picked.add(card.dataset.libraryImage);syncSelection();
  },()=>!editing&&!deleting);

  function showDetail(item,example){
    const title=escape(item.name);
    $('#inspiration-detail').innerHTML=`<div class="dialog-heading"><h2 id="inspiration-detail-title">${title}</h2><button class="icon-button" data-close="inspiration-dialog" aria-label="关闭图片详情">${icon('close')}</button></div>
      <img class="media-detail-image" src="${escape(example?item.image:item.thumbnail)}" alt="${title}">
      <p class="media-detail-meta" hidden>${describeFingerprint(item.fingerprint)}</p>
      <div class="media-actions" hidden>${example
        ?`<button class="button subtle" data-like-example="${item.id}" aria-pressed="${isLiked(item.id)}">${icon('heart')}${isLiked(item.id)?'已喜欢':'喜欢'}</button>`
        :`<button class="button subtle" data-remove-upload="${escape(item.id)}">${icon('trash')}删除图片</button>`}</div>`;
    const dialog=$('#inspiration-dialog');
    if(!dialog.open)dialog.showModal();
  }

  async function removeUploads(ids){
    if(deleting||!ids.length)return;
    deleting=true;
    syncSelection();
    try{
      await database('inspirations','deleteMany',ids);
      uploads=uploads.filter(item=>!ids.includes(item.id));
      ids.forEach(id=>picked.delete(id));
      editing=false;
      $('#inspiration-dialog').close();
      toast(`已删除 ${ids.length} 张照片`);
    }catch(error){toast(error.message);}
    finally{
      deleting=false;
      render();
    }
  }

  document.addEventListener('click',event=>{
    const button=event.target.closest('button');
    if(!button||button.closest('[hidden]'))return;
    if(button.dataset.example){
      const item=exampleById(button.dataset.example);
      if(item)showDetail(item,true);
    }
    if(button.dataset.likeExample){
      const item=exampleById(button.dataset.likeExample);
      if(!item)return;
      if(isLiked(item.id))liked.delete(item.id);
      else liked.add(item.id);
      if(hidden)hidden.liked=hidden.liked.filter(id=>id!==item.id);
      persist();render();showDetail(item,true);
      $('#inspiration-detail [data-like-example]').focus();
    }
    if(button.dataset.libraryImage){
      const item=visibleUploads().find(item=>item.id===button.dataset.libraryImage);
      if(!item)return;
      if(editing){
        if(deleting)return;
        if(picked.has(item.id))picked.delete(item.id);else picked.add(item.id);
        syncSelection();
      }else showDetail(item,false);
    }
    if(button.dataset.removeUpload&&visibleUploads().some(item=>item.id===button.dataset.removeUpload)){
      if(button.dataset.confirm){
        button.disabled=true;
        void removeUploads([button.dataset.removeUpload]).finally(()=>button.disabled=false);
      }else{
        button.dataset.confirm='true';
        button.textContent='确认删除';
      }
    }
    if(button.id==='inspiration-manage'){editing=!editing;picked.clear();syncSelection();}
    if(button.id==='inspiration-delete')void removeUploads([...picked]);
    if(button.id==='inspiration-upload'||button.hasAttribute('data-upload-inspiration'))$('#inspiration-input').click();
  });

  $('#inspiration-input').addEventListener('change',async event=>{
    const files=[...event.target.files];event.target.value='';
    if(!files.length||uploading)return;
    uploading=true;
    let added=0;
    try{
      for(const file of files){
        if(!file.type.startsWith('image/')||file.size>20000000){toast('请选择 20 MB 以内的图片');continue;}
        const url=URL.createObjectURL(file);
        try{
          const image=new Image();image.src=url;await image.decode();
          const scale=Math.min(1,720/Math.max(image.naturalWidth,image.naturalHeight));
          const canvas=document.createElement('canvas');
          canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));
          canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
          canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
          const record={id:crypto.randomUUID(),name:file.name,thumbnail:canvas.toDataURL('image/jpeg',.85),
            created:Date.now(),fingerprint:readFingerprint(image)};
          await database('inspirations','put',record);uploads.unshift(record);added++;
        }catch(error){toast(error.message||'图片未能加入，请换一张重试。');}
        finally{URL.revokeObjectURL(url);}
      }
    }finally{
      uploading=false;editing=false;picked.clear();render();
      if(added)toast(`已加入 ${added} 张照片`);
    }
  });

  return {
    render,
    open(){editing=false;picked.clear();render();},
    startEmptyDemo(){
      hidden={uploads:uploads.map(item=>item.id),liked:[...liked]};
      $('#inspiration-examples').open=false;
      persist();render();
    },
    restoreDemo(){
      hidden=null;
      $('#inspiration-examples').open=true;
      persist();render();
    },
    async load(){
      try{
        uploads=(await database('inspirations','getAll')).filter(item=>item.source!=='demo-upload').sort((a,b)=>b.created-a.created);
        for(const item of uploads){
          if('fingerprint' in item)continue;
          try{
            const image=new Image();image.src=item.thumbnail;await image.decode();
            item.fingerprint=readFingerprint(image);
            await database('inspirations','put',item);
          }catch{storageOK=false;}
        }
      }catch{storageOK=false;}
      if(hidden)$('#inspiration-examples').open=false;
      render();
    },
    match(scene,current){return matchEffect(scene,current,visibleProfiles());}
  };
}
