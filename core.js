export const DEFAULT_PARAMS = Object.freeze({ exposure:0, contrast:0, saturation:0, warmth:0, tint:0, highlights:0, shadows:0, fade:0, grain:0, vignette:0 });
export const PARAMS = [
 { key:'exposure',label:'曝光补偿',en:'EXPOSURE',min:-2,max:2,step:.1,unit:' EV',help:'改变预览的整体明暗。降低可让亮部更收敛，也会让主体变暗。'},
 { key:'contrast',label:'对比度',en:'CONTRAST',min:-50,max:50,step:1,help:'提高会拉开明暗差距；降低让画面更柔和。'},
 { key:'saturation',label:'饱和度',en:'SATURATION',min:-100,max:60,step:1,help:'控制颜色的浓淡。降至 −100 时呈现黑白画面。'},
 { key:'warmth',label:'色温倾向',en:'WARMTH',min:-50,max:50,step:1,help:'偏暖让画面更金黄，偏冷让画面更清冽。这是色彩效果，不是硬件白平衡。'},
 { key:'highlights',label:'高光',en:'HIGHLIGHTS',min:-60,max:60,step:1,help:'调整画面较亮区域。降低可以柔化亮部，但无法恢复已经丢失的细节。'},
 { key:'shadows',label:'阴影',en:'SHADOWS',min:-50,max:50,step:1,help:'调整画面较暗区域。提亮阴影能让暗部更可见。'},
 { key:'fade',label:'褪色',en:'FADE',min:0,max:50,step:1,help:'抬高最深的暗部，形成轻柔、略带胶片感的灰调。'},
 { key:'grain',label:'颗粒',en:'GRAIN',min:0,max:50,step:1,help:'给画面加入细小纹理。这里添加的是风格颗粒，与相机 ISO 噪点不同。'},
 { key:'vignette',label:'暗角',en:'VIGNETTE',min:0,max:60,step:1,help:'稍微压暗画面边缘，让注意力更多地落在中央。'}
];
// Initial recipe directions from the 2026-11-08 presentation. IDs retained for saved references.
export const PRESETS = [
 {id:'original',name:'原生色彩',en:'PURE',description:'保留眼前的光线与颜色。',origin:'原生画面',guidance:'从现场的光线开始。',composition:'wide',params:{...DEFAULT_PARAMS},css:'none'},
 {id:'daylight',name:'美国彩色摄影',en:'AMERICAN COLOR',description:'让普通物件与日常环境中的颜色参与画面组织。',origin:'美国彩色摄影 · 威廉·埃格尔斯顿的作品',guidance:'寻找一个主色，让周围的颜色与它呼应。',composition:'subject',params:{...DEFAULT_PARAMS,exposure:.08,contrast:5,saturation:8,warmth:3,highlights:-12,shadows:7},css:'brightness(1.04) saturate(1.12) contrast(1.03)'},
 {id:'coast',name:'文艺复兴',en:'RENAISSANCE',description:'柔和边缘与平缓明暗，保留细腻的层次。',origin:'文艺复兴 · 达·芬奇《岩间圣母》的柔和明暗',guidance:'尝试窗边柔光或阴天散射光，让光线平缓地经过主体。',composition:'wide',params:{...DEFAULT_PARAMS,contrast:-14,saturation:-9,warmth:5,highlights:-25,shadows:12,fade:5,grain:2},css:'saturate(.85) contrast(.88) brightness(1.04)'},
 {id:'film',name:'印象派',en:'IMPRESSIONISM',description:'关注自然光的变化，以及冷暖色彩之间的关系。',origin:'印象派 · 莫奈的户外光色研究',guidance:'寻找水面反光、树影或冷暖呼应，保留现场的空气感。',composition:'wide',params:{...DEFAULT_PARAMS,exposure:.1,contrast:-9,saturation:6,warmth:13,highlights:-22,shadows:12,fade:7,grain:3},css:'sepia(.12) saturate(1.08) contrast(.92) brightness(1.05)'},
 {id:'forest',name:'巴洛克',en:'BAROQUE',description:'让明暗关系突出主体，保留暗部中的必要层次。',origin:'巴洛克 · 卡拉瓦乔的方向光与明暗关系',guidance:'尝试侧光与较暗的背景；现场没有方向光时，单纯压暗无法替代布光。',composition:'subject',params:{...DEFAULT_PARAMS,exposure:-.12,contrast:27,saturation:-12,warmth:6,highlights:-20,shadows:-20,vignette:9},css:'contrast(1.22) saturate(.85) brightness(.92)'},
 {id:'mono',name:'昭和后期',en:'SHOWA · PROVOKE',description:'用黑白、颗粒与局部反差，表达对一个瞬间的感受。',origin:'昭和后期 · Provoke 的摄影实践',guidance:'留意街头的动作与张力，模糊和颗粒应服务于你想表达的感觉。',composition:'lines',params:{...DEFAULT_PARAMS,contrast:23,saturation:-100,highlights:-10,shadows:-7,grain:20},css:'grayscale(1) contrast(1.23)'},
 {id:'geometry',name:'新视觉',en:'NEW VISION',description:'让线条、重复结构和空间关系成为画面的重点。',origin:'新视觉摄影 · 莫霍利-纳吉等人的实验',guidance:'沿建筑边缘寻找线条，尝试改变机位。选择 AI 构图可继续查看引导。',composition:'lines',params:{...DEFAULT_PARAMS,contrast:16,saturation:-30,highlights:-12,shadows:-4},css:'saturate(.65) contrast(1.13)'}
];
export const STARTER_RECIPE_IDS = ['coast','forest','film','geometry','daylight','mono'];
export const clamp = (n,min,max) => Math.min(max,Math.max(min,n));
export const formatValue = (key,value) => key === 'exposure' ? `${value > 0 ? '+' : ''}${Number(value).toFixed(1)}` : `${value > 0 ? '+' : ''}${Math.round(value)}`;
export function blendParams(params,strength){const amount=clamp(Number(strength),0,100)/100;return Object.fromEntries(Object.keys(DEFAULT_PARAMS).map(k=>[k,DEFAULT_PARAMS[k]+((Number(params[k])||0)-DEFAULT_PARAMS[k])*amount]));}
export function recommendAdjustments(params,locked=[],goal='soft',brightness=.55){
 const proposals = goal==='clear' ? [{key:'contrast',target:8,reason:'轻轻拉开明暗，让建筑的层次更清楚。',tradeoff:'阴影也会更深，可以按喜好减少。'},{key:'saturation',target:6,reason:'让色彩稍有精神，保留海岸的清新感。',tradeoff:'颜色会更鲜明。'}] : goal==='mood' ? [{key:'exposure',target:-.3,reason:'让画面沉静一点，留下光影的层次。',tradeoff:'暗部也会更暗。'},{key:'warmth',target:18,reason:'加入柔和暖意，营造午后的氛围。',tradeoff:'中性色会略微偏暖。'},{key:'fade',target:12,reason:'抬起最深的黑，让影调更轻柔。',tradeoff:'画面会减少一些反差。'}] : [{key:'highlights',target:brightness>.65?-35:-24,reason:'收敛亮部，让天空与浅色建筑更柔和。',tradeoff:'不会恢复已经过曝丢失的细节。'},{key:'contrast',target:-14,reason:'减少明暗之间的硬反差，保留轻松的空气感。',tradeoff:'画面会稍显柔和。'},{key:'shadows',target:12,reason:'轻轻提亮暗部，让屋檐下的层次更容易看见。',tradeoff:'暗部纹理也可能更明显。'}];
 const explanations={
  contrast:[['适度增加明暗反差，让轮廓更清楚。','较暗的区域可能会更深。'],['减弱现有的明暗反差，让过渡更柔和。','画面会减少一些力度。']],
  saturation:[['增加颜色浓度，让画面更鲜明。','原本的低饱和或黑白风格会发生改变。'],['收敛颜色浓度，让色彩更安静。','颜色会淡一些。']],
  exposure:[['提高预览亮度，让主体更容易看见。','亮部也会更亮，需要留意细节。'],['降低预览亮度，保留安静的光影氛围。','暗部也会更暗。']],
  warmth:[['增加暖色倾向，让画面更有午后的暖意。','中性色也会略微偏暖。'],['减少暖色倾向，让画面更清爽。','暖调氛围会减弱。']],
  highlights:[['提高较亮区域的亮度，让画面更轻盈。','亮部层次可能减少。'],['降低较亮区域的亮度，让亮部更柔和。','无法恢复已经丢失的高光细节。']],
  shadows:[['轻轻提亮暗部，让阴影里的层次更可见。','暗部纹理也可能更明显。'],['压低暗部，让光影更沉静。','部分暗部细节可能不易看见。']],
  fade:[['增加褪色感，让深黑更轻柔。','画面的反差会减少。'],['减少褪色感，让深黑更扎实。','柔和的灰调会减弱。']]
 };
 return proposals.filter(p=>!locked.includes(p.key)&&Math.abs(params[p.key]-p.target)>.001).map(p=>{const [reason,tradeoff]=explanations[p.key][p.target>params[p.key]?0:1];return {...p,reason,tradeoff,before:params[p.key],after:p.target,label:PARAMS.find(x=>x.key===p.key).label};});
}
export function parseCube(text,name='Custom LUT'){
 if(typeof text!=='string'||text.length>16000000)throw new Error('LUT 文件过大或无效，请使用 16 MB 以内的 .cube 文件。');
 let size=0,title=name,domainMin=[0,0,0],domainMax=[1,1,1];const values=[];
 for(const raw of text.replace(/^\uFEFF/,'').split(/\r?\n/)){
  const line=raw.replace(/\s*#.*$/,'').trim();if(!line)continue;
  if(line.startsWith('TITLE')){title=line.slice(5).trim().replace(/^"|"$/g,'')||name;continue;}
  const parts=line.split(/\s+/);const key=parts[0];
  if(key==='LUT_3D_SIZE'){size=Number(parts[1]);if(!Number.isInteger(size)||size<2||size>65)throw new Error('支持尺寸为 2–65 的 3D LUT。');continue;}
  if(key==='LUT_1D_SIZE')throw new Error('请导入 3D .cube LUT；当前不支持 1D LUT。');
  if(key==='DOMAIN_MIN'||key==='DOMAIN_MAX'){const v=parts.slice(1).map(Number);if(v.length!==3||v.some(x=>!Number.isFinite(x)))throw new Error('LUT 色彩范围无效。');if(key==='DOMAIN_MIN')domainMin=v;else domainMax=v;continue;}
  if(/^[A-Za-z_]/.test(key))throw new Error(`暂不支持此 LUT 指令：${key}`);
  const v=parts.map(Number);if(v.length!==3||v.some(x=>!Number.isFinite(x)))throw new Error('LUT 中存在无效的颜色数值。');values.push(...v);
 }
 if(!size)throw new Error('未找到 LUT_3D_SIZE，请选择标准 3D .cube 文件。');
 if(values.length!==size**3*3)throw new Error(`LUT 数据不完整：应有 ${size**3} 行颜色数据。`);
 if(domainMax.some((x,i)=>x<=domainMin[i]))throw new Error('LUT 最大色彩值必须大于最小值。');
 return {name:title.slice(0,80),size,values,domainMin,domainMax};
}
