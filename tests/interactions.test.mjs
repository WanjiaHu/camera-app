import test from 'node:test';
import assert from 'node:assert/strict';
import {clampZoom,zoomFromDrag,previewBounds,subjectPoint,captureLook,candidateLook,captureMode,proAdjustmentLook,recipeRecord} from '../interaction-core.js';
import {DEFAULT_PARAMS,PRESETS} from '../core.js';

test('zoom gestures clamp safely at both limits and remain proportional on scaled phones',()=>{
  assert.equal(clampZoom(0),1);assert.equal(clampZoom(12),5);
  assert.equal(zoomFromDrag(2,65,390),3);
  assert.equal(zoomFromDrag(2,32.5,195),3);
  assert.equal(zoomFromDrag(1,-1000,390),1);
  assert.equal(zoomFromDrag(5,1000,390),5);
});
test('subject selection excludes letterbox and maps the visible image accurately',()=>{
  const bounds=previewBounds({left:100,top:50,width:300,height:500},.75);
  assert.deepEqual(bounds,{left:100,top:100,width:300,height:400});
  assert.equal(subjectPoint(250,60,bounds),null);
  assert.deepEqual(subjectPoint(200,300,bounds),{x:1/3,y:.5});
});
test('cancel snapshot is isolated from preview edits and preserves custom LUT and intensity',()=>{
  const lut={name:'custom'};
  const state={selected:'custom',params:{...DEFAULT_PARAMS,exposure:.7},intensity:42,lut,lutAmount:65,zoom:2.2,pan:.05,dirty:false,aiApplied:true,aiBefore:null,aiRefined:true,aiChanges:[{key:'contrast',before:0,after:8}]};
  const before=captureLook(state), candidate=candidateLook(before,PRESETS[3],['exposure']);
  candidate.params.contrast=32;state.params.exposure=-1;
  assert.equal(before.params.exposure,.7);assert.equal(before.params.contrast,0);
  assert.equal(candidate.params.exposure,.7);assert.equal(candidate.lut,lut);
  assert.equal(candidate.intensity,42);assert.equal(candidate.zoom,2.2);
  assert.equal(before.dirty,false);assert.equal(candidate.dirty,true);
  assert.equal(before.aiChanges.length,1);assert.deepEqual(candidate.aiChanges,[]);assert.equal(candidate.aiRefined,false);
});

test('Live augments photo capture and never changes video recording',()=>{
  assert.equal(captureMode('photo',false),'photo');
  assert.equal(captureMode('photo',true),'live');
  assert.equal(captureMode('video',true),'video');
  assert.equal(captureMode('video',false),'video');
});

test('PRO AI edits the current look without replacing its recipe or LUT and respects locks',()=>{
  const originalContrast=PRESETS[2].params.contrast;
  const before={selected:'my-recipe',params:{...PRESETS[2].params},lut:{name:'custom'},lutAmount:45,intensity:80,dirty:false};
  const after=proAdjustmentLook(before,{locked:['highlights'],brightness:.7});
  assert.equal(after.selected,before.selected);assert.equal(after.lut,before.lut);
  assert.equal(after.intensity,80);assert.equal(after.lutAmount,45);
  assert.equal(after.params.highlights,before.params.highlights);
  assert.notEqual(after.params.contrast,before.params.contrast);
  assert.equal(before.params.contrast,originalContrast);
  assert.ok(after.aiChanges.every(change=>after.params[change.key]===change.after&&before.params[change.key]===change.before));
  const snapshot=captureLook(after);after.aiChanges[0].after=999;
  assert.notEqual(snapshot.aiChanges[0].after,999);
});

test('PRO AI preserves monochrome and leaves fully locked values untouched',()=>{
  const before={selected:'mono',params:{...PRESETS[5].params},dirty:false};
  assert.equal(proAdjustmentLook(before).params.saturation,-100);
  const after=proAdjustmentLook(before,{locked:Object.keys(DEFAULT_PARAMS)});
  assert.deepEqual(after.params,before.params);assert.deepEqual(after.aiChanges,[]);assert.equal(after.dirty,false);
});

test('built-in recipe edits always create a copy while custom edits retain identity',()=>{
  const originalContrast=PRESETS[2].params.contrast;
  const look={params:{...PRESETS[2].params,contrast:18},intensity:79,lut:null,lutAmount:100,manual:{iso:'400'},locked:new Set(['highlights'])};
  const input={look,name:'My edit',newId:'new-id',now:20,thumbnail:'preview'};
  const copy=recipeRecord({...input,target:PRESETS[2]});
  assert.equal(copy.id,'new-id');assert.equal(PRESETS[2].params.contrast,originalContrast);
  const edited=recipeRecord({...input,target:{id:'saved-id',custom:true,created:5}});
  assert.equal(edited.id,'saved-id');assert.equal(edited.created,5);assert.equal(edited.updated,20);
  assert.equal(edited.params.contrast,18);assert.equal(edited.capture.manual.iso,'400');
  look.params.contrast=0;look.manual.iso='AUTO';look.locked.clear();
  assert.equal(edited.params.contrast,18);assert.equal(edited.capture.manual.iso,'400');assert.deepEqual(edited.capture.locked,['highlights']);
});
