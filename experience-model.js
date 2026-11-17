import { PRESETS, clamp } from './core.js';

// Curated examples from the presentation, not results of image recognition.
export const REFERENCES = [
  {id:'sea-open',name:'通透的海面',scene:'sea',recipe:'coast',direction:'open',composition:'wide',image:'assets/reference-blue-water.jpg',native:true,detail:'通透蓝绿 · 大片水面'},
  {id:'sea-soft',name:'水面的光',scene:'sea',recipe:'coast',direction:'soft',composition:'subject',image:'assets/reference-water-light.jpg',native:true,detail:'细腻水光 · 柔和层次'},
  {id:'sea-layers',name:'有层次的远景',scene:'sea',recipe:'geometry',direction:'layers',composition:'layers',image:'assets/coast-cliffs.jpg',detail:'前景 · 空间 · 环境叙事'},
  {id:'street-color',name:'街角的颜色',scene:'street',recipe:'daylight',direction:'color',composition:'subject',image:'assets/coast.jpg',detail:'生活细节 · 色彩呼应'},
  {id:'street-film',name:'午后的街区',scene:'street',recipe:'film',direction:'warm',composition:'wide',image:'assets/coast.jpg',detail:'自然光 · 温暖 · 日常氛围'},
  {id:'street-mono',name:'黑白的街头',scene:'street',recipe:'mono',direction:'mono',composition:'lines',image:'assets/coast.jpg',detail:'结构 · 黑白 · 纪实'},
  {id:'sea-clear',name:'海面上的日光',scene:'sea',recipe:'daylight',direction:'color',composition:'subject',image:'assets/harbor.jpg',detail:'明亮 · 清透色彩'},
  {id:'sea-mono',name:'海的明暗',scene:'sea',recipe:'mono',direction:'mono',composition:'layers',image:'assets/harbor.jpg',detail:'黑白 · 明暗层次'}
];
const DIRECTIONS = {
  open:{title:'通透蓝绿，大面积水面',name:'通透蓝绿',recipe:'coast',composition:'wide',params:{exposure:.22,warmth:-13,tint:12,saturation:24,contrast:5,highlights:-24,shadows:17,fade:0,grain:0}},
  soft:{title:'平缓明暗，细腻色彩',name:'水光柔调',recipe:'coast',composition:'subject',params:{exposure:.14,warmth:-5,tint:5,contrast:-10,saturation:4,highlights:-30,shadows:18,fade:2,grain:0}},
  layers:{title:'前后景关系，空间层次',name:'远景 · 层次',recipe:'geometry',composition:'layers',params:{contrast:14,saturation:-8,shadows:14}},
  color:{title:'日常细节，色彩呼应',name:'色彩 · 呼应',recipe:'daylight',composition:'subject',params:{saturation:10,warmth:3}},
  warm:{title:'自然光，温暖的空气感',name:'日光 · 暖意',recipe:'film',composition:'wide',params:{warmth:16,highlights:-26}},
  mono:{title:'黑白与颗粒，保留现场张力',name:'黑白 · 瞬间',recipe:'mono',composition:'lines',params:{saturation:-100,grain:20,contrast:23}},
  geometry:{title:'线条与形状，明确的空间关系',name:'结构 · 线条',recipe:'geometry',composition:'lines',params:{contrast:16,saturation:-30}},
  drama:{title:'方向光，让主体从暗部浮现',name:'光影 · 主体',recipe:'forest',composition:'subject',params:{contrast:27,shadows:-20}}
};
const recipeDirection = {coast:'soft',forest:'drama',film:'warm',geometry:'geometry',daylight:'color',mono:'mono',original:'soft'};
const preset = id => PRESETS.find(p=>p.id===id);
const refById = id => REFERENCES.find(r=>r.id===id);
export const sceneLabel = scene => ({sea:'海边',street:'街区',unknown:'当前画面'})[scene] || '当前画面';
export const referenceChoices = scene => REFERENCES.filter(r=>r.scene===scene).slice(0,3);

function siteFor(scene, context) {
  const site = context.demoIndex===2 ? {
    title:'船与桅杆需要完整保留',constraint:'先照顾桅杆上沿和水平线，再决定留多少海面。',
    guidance:{wide:'保留完整桅杆，多留一些海面',subject:'让主体靠近三分线，保留完整边缘',layers:'用船、海面和远山，组织前后层次',lines:'顺着桅杆与水平线取景'}
  } : context.demoIndex===1 ? {
    title:'海浪、村落与山体形成三层',constraint:'先找到能同时保留前景与远山的机位。',
    guidance:{wide:'把村落放在上侧，给海浪留白',subject:'沿海岸线取景，让村落更突出',layers:'保留海浪、村落和远山三层',lines:'沿海岸轮廓，让视线向远处走'}
  } : scene==='street' ? {
    title:'建筑层叠，明暗与颜色交织',constraint:'先确定一处想保留的生活细节，避免背景过满。',
    guidance:{wide:'让建筑靠一侧，给环境留白',subject:'靠近窗户或色块，避开边缘杂物',lines:'顺着立面与屋顶，保持线条方向',layers:'保留近处建筑与远处山体'}
  } : {
    title:'先确认主体和现场光线',constraint:'示例无法识别这张新画面；先用基础方案，并轻点指定主体。',
    guidance:{wide:'把主体放在一侧，给环境留出空间。',subject:'检查主体边缘，再决定是否靠近。',lines:'寻找重复线条，尝试调整机位。',layers:'保留前景与远景之间的空间关系。'}
  };
  return {...site,guidance:{...site.guidance}};
}

export function recommendationFor(scene, selected, history=[], revision=0, preferredRecipe=null, context={}) {
  const allLocal = context.skipMemory ? [] : history.filter(r=>r.scene===scene && preset(r.recipe));
  const collected = context.skipMemory ? [] : [...new Set(selected)].map(refById).filter(r=>r?.scene===scene);
  // A starter-filter capture is not evidence against subsequently supplied inspiration.
  // Keep adopted reference-based choices, including the user's color alternatives.
  const local = collected.length ? allLocal.filter(r=>r.references?.length) : allLocal;
  const explicit = refById(context.referenceId);
  const reused = context.memoryId ? history.find(r=>r.id===context.memoryId) : null;
  const intent = preset(preferredRecipe);
  const scores = new Map();
  for(const r of collected) scores.set(r.direction,(scores.get(r.direction)||0)+2);
  local.slice(-20).forEach((r,index)=>{const d=r.direction||recipeDirection[r.recipe];scores.set(d,(scores.get(d)||0)+3+index/1000);});
  const strongest = [...scores].sort((a,b)=>b[1]-a[1])[0]?.[0];
  const direction = intent ? recipeDirection[intent.id] : explicit?.direction || reused?.direction || (reused&&recipeDirection[reused.recipe]) || strongest || 'soft';
  const target = DIRECTIONS[direction] || DIRECTIONS.soft;
  const supporting = local.filter(r=>(r.direction||recipeDirection[r.recipe])===direction);
  const source = intent ? null : explicit || [...collected].reverse().find(r=>r.direction===direction) || refById(reused?.references?.[0]) || refById(supporting.at(-1)?.references?.[0]);
  const references = intent ? [] : [...new Set([...(source?[source.id]:[]),...supporting.flatMap(r=>r.references||[])])];
  const personalized = !intent && references.length>0;
  const site = siteFor(scene,context);
  const composition = intent?.composition || explicit?.composition || reused?.composition || supporting.at(-1)?.composition || target.composition;
  let note = intent ? `从「${intent.name}」开始` : explicit ? `这次参考「${explicit.name}」` : reused ? '沿用已拍过的表达，结合这次现场' : supporting.length ? `沿用你在${sceneLabel(scene)}采用过的表达` : source ? `参考灵感库里的「${source.name}」` : '从专业基础风格开始';
  const evidence = intent ? '本次选择优先，保留你主动选定的起点。' : explicit ? '这张图先作为本次线索，拍下后再积累采用记录。' : supporting.length ? `在${sceneLabel(scene)}已采用 ${supporting.length} 次；这次重新结合光线与取景。` : source ? '来自你收藏的参考，先保留为一个可尝试的方向。' : '还没有相关拍摄记录，可以先试，也可以直接拍。';
  if(direction==='soft') {site.title='先判断现场能否保留柔光';site.constraint=scene==='unknown'?site.constraint:'若光线偏硬，尝试换朝向或寻找阴影，保留亮部层次。';}
  if(direction==='layers') site.constraint='前景与远景要同时留得住，影调再帮助区分层次。';
  if(context.demoIndex===2&&personalized){
    if(direction==='open')site.guidance.wide='按灵感多留海面，避开近处护栏';
    if(direction==='soft')site.guidance.subject='靠近水面，让反光与波纹更突出';
  }
  const first = intent?.id || explicit?.recipe || reused?.recipe || supporting.at(-1)?.recipe || target.recipe;
  const ids = [...new Set([first,'daylight','film','mono'])].slice(0,3);
  const looks = ids.map((id,index)=>{
    const base=preset(id);
    const params = {...base.params,...(personalized&&index===0?target.params:{})};
    if(personalized){
      params.highlights=clamp(params.highlights+(scene==='sea'?-8:-2),-60,60);
      params.shadows=clamp(params.shadows+(scene==='street'?4:0),-50,50);
      params.exposure=clamp(params.exposure+((context.brightness??.55)>.65?-.1:.03),-2,2);
    }
    const actualDirection=index===0?direction:recipeDirection[id];
    return {...base,params,name:personalized&&index===0?target.name:base.name,direction:actualDirection,intent:DIRECTIONS[actualDirection].title,references};
  });
  const explore=[...collected].reverse().find(r=>r.direction!==direction);
  return {candidates:looks.map(p=>[p.id,p.name]),looks,composition,note,evidence,references,revision,scene,recipe:first,direction,intent:target.title,explore:explore||null,
    source:source?{id:source.id,name:source.name,image:source.image}:null,site,personalized,origin:intent?'preset':explicit?'current':reused||supporting.length?'history':source?'collection':'initial',
    framing:context.demoIndex===2&&personalized?{wide:{zoom:2.2,pan:-.16,panY:-.12},subject:{zoom:2,pan:.11,panY:-.11},layers:{zoom:1.25,pan:-.04,panY:-.06},lines:{zoom:1.7,pan:-.12,panY:-.1}}:null,
    compositionOptions:scene==='sea'?[['wide','开阔留白'],['subject','完整主体'],['layers','前后层次']]:[['wide','环境留白'],['subject','突出主体'],['lines','几何线条']]};
}

export function recordFromCapture(record) {
  const s=record.settings,p=s.personal;
  return {id:record.id,scene:s.scene,recipe:s.recipeId,composition:s.composition,references:[...(p?.references||[])],at:record.created,
    direction:p?.direction||recipeDirection[s.recipeId]||'soft',intent:p?.intent||preset(s.recipeId)?.description||'本次拍摄',planName:s.planName||s.recipe,
    params:{...s.params},intensity:s.intensity,framing:s.framing?{...s.framing}:null};
}

export function memoryGroups(history) {
  const groups=new Map();
  for(const record of history){
    const key=[record.scene,record.direction||recipeDirection[record.recipe],record.composition].join(':');
    const group=groups.get(key)||{key,scene:record.scene,count:0,latest:null};group.count++;group.latest=record;groups.set(key,group);
  }
  return [...groups.values()].sort((a,b)=>b.latest.at-a.latest.at);
}
