import { PRESETS } from './core.js';

const defaultRecipes={sea:'coast',street:'daylight',nature:'film',lowlight:'forest',unknown:'coast'};
const colorNames={cool:'蓝青',warm:'暖色',green:'绿色',neutral:'中性'};
const sceneNames={sea:'海边',street:'街区',nature:'自然',lowlight:'低光',unknown:'未识别'};

export const EXAMPLES=[
  {id:'sea-open',name:'通透的海面',image:'assets/reference-blue-water.jpg',fingerprint:{scene:'sea',color:'cool',brightness:.66,contrast:.24,saturation:.37,recipe:'daylight'}},
  {id:'sea-soft',name:'水面的光',image:'assets/reference-water-light.jpg',fingerprint:{scene:'sea',color:'cool',brightness:.53,contrast:.13,saturation:.18,recipe:'film'}}
];

export function fingerprintFromPixels(pixels){
  const colors={cool:0,warm:0,green:0};
  let count=0,total=0,squares=0,chroma=0;
  for(let i=0;i<pixels.length;i+=4){
    if(pixels[i+3]<128)continue;
    const r=pixels[i]/255,g=pixels[i+1]/255,b=pixels[i+2]/255;
    const light=.2126*r+.7152*g+.0722*b;
    const spread=Math.max(r,g,b)-Math.min(r,g,b);
    count++;total+=light;squares+=light*light;chroma+=spread;
    if(spread<.08)continue;
    if(b>=r+.04&&b>=g-.08)colors.cool+=spread;
    else if(g>r+.04&&g>b+.04)colors.green+=spread;
    else if(r>=g&&r>=b+.04)colors.warm+=spread;
  }
  if(!count)return null;
  const brightness=total/count;
  const contrast=Math.sqrt(Math.max(0,squares/count-brightness*brightness));
  const saturation=chroma/count;
  const [dominant,weight]=Object.entries(colors).sort((a,b)=>b[1]-a[1])[0];
  const color=weight/count>.025?dominant:'neutral';
  const scene=brightness<.27?'lowlight':({cool:'sea',green:'nature',warm:'street'})[color]||'unknown';
  const recipe=saturation<.05?'mono':brightness<.33?'forest':contrast>.25?'geometry':
    color==='warm'?'film':color==='cool'&&saturation>.22?'daylight':color==='green'?'film':'coast';
  return {scene,color,brightness,contrast,saturation,recipe};
}

export function readFingerprint(image){
  const canvas=document.createElement('canvas');
  canvas.width=canvas.height=32;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  ctx.drawImage(image,0,0,32,32);
  return fingerprintFromPixels(ctx.getImageData(0,0,32,32).data);
}

export function matchEffect(scene,current,profiles){
  const distance=profile=>Math.abs(profile.brightness-current.brightness)+
    Math.abs(profile.contrast-current.contrast)+Math.abs(profile.saturation-current.saturation)+
    (profile.color===current.color?0:.25);
  const match=Object.hasOwn(defaultRecipes,scene)&&scene!=='unknown'&&current
    ? profiles.filter(item=>item.fingerprint?.scene===scene)
      .sort((a,b)=>distance(a.fingerprint)-distance(b.fingerprint))[0]
    : null;
  const id=match?.fingerprint.recipe||defaultRecipes[scene]||defaultRecipes.unknown;
  return {recipe:PRESETS.find(p=>p.id===id)||PRESETS.find(p=>p.id===defaultRecipes.unknown),
    scene,match:match?{id:match.id,name:match.name}:null};
}

export function describeFingerprint(fingerprint){
  if(!fingerprint)return '暂时无法提取影调';
  const {scene,color,brightness,contrast}=fingerprint;
  const light=brightness<.35?'偏暗':brightness>.64?'明亮':'中间调';
  const tone=contrast>.23?'反差较强':contrast<.14?'反差柔和':'反差适中';
  return [sceneNames[scene],colorNames[color],light,tone].join(' · ');
}
