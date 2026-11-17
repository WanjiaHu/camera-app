import {recommendAdjustments} from './core.js';

export const clampZoom = value => Math.max(1, Math.min(5, Math.round((Number(value) || 1) * 10) / 10));

export function zoomFromDrag(start, deltaX, width) {
  return clampZoom(start + deltaX / Math.max(1, width) * 6);
}

// Fixed aspect ratios may leave a letterbox; full frame matches the canvas ratio.
// Account for both layouts and a desktop phone scaled with CSS zoom.
export function previewBounds(rect, aspect) {
  const width = Math.min(rect.width, rect.height * aspect);
  const height = width / aspect;
  return {left: rect.left + (rect.width - width) / 2, top: rect.top + (rect.height - height) / 2, width, height};
}

export function subjectPoint(x, y, bounds) {
  const point = {x: (x - bounds.left) / bounds.width, y: (y - bounds.top) / bounds.height};
  return point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1 ? null : point;
}

export function captureLook(state) {
  const look=Object.fromEntries(['selected','params','intensity','lut','lutAmount','zoom','pan','panY','dirty','aiApplied','aiBefore','aiRefined','planName','composition'].map(key => [key, key === 'params' ? {...state.params} : state[key]]));
  look.recommendationContext=state.recommendationContext?structuredClone(state.recommendationContext):null;
  look.aiChanges=(state.aiChanges||[]).map(change=>({...change}));
  return look;
}

export function candidateLook(before, recipe, locked = []) {
  const params = {...recipe.params};
  for (const key of locked) params[key] = before.params[key];
  return {...before, params, selected: recipe.id, dirty: true, aiApplied: true, aiBefore: null, aiRefined: false, aiChanges: []};
}

export function captureMode(mode,liveEnabled){return mode==='video'?'video':liveEnabled?'live':'photo';}

// PRO keeps the current look and changes editable values, instead of selecting a preset.
export function proAdjustmentLook(before,{locked=[],brightness=.55}={}){
  const tonal=recommendAdjustments(before.params,locked,'soft',brightness).filter(p=>p.key!=='contrast');
  const clarity=recommendAdjustments(before.params,locked,'clear',brightness).filter(p=>p.key!=='saturation'||before.params.saturation>-95);
  const changes=[...clarity,...tonal];
  const params={...before.params};
  for(const change of changes)params[change.key]=change.after;
  return {...before,params,dirty:before.dirty||changes.length>0,aiApplied:changes.length>0,aiRefined:false,aiBefore:{...before.params},aiChanges:changes};
}

// Only explicit edits of custom recipes may reuse an existing record id.
export function recipeRecord({look,name,description='',target=null,newId,now,thumbnail,includeCapture=true}){
  const updating=!!target?.custom;
  const record={id:updating?target.id:newId,name,description:description||'自定义配方',en:'MY LOOK',params:{...look.params},intensity:look.intensity,lut:look.lut,lutAmount:look.lutAmount,custom:true,thumbnail,created:updating?target.created:now,updated:now};
  if(includeCapture)record.capture={manual:{...look.manual},locked:[...look.locked]};
  return record;
}
