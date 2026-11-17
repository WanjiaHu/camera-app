import test from 'node:test';
import assert from 'node:assert/strict';
import { recommendationFor } from '../personal-style.js';
import { recordFromCapture, memoryGroups } from '../experience-model.js';
import { PRESETS } from '../core.js';

test('the explicitly selected initial recipe takes priority without erasing scene preferences', () => {
  const references = ['sea-soft', 'street-mono'];
  const current = recommendationFor('street', references, [], 4, 'geometry');
  assert.equal(current.candidates[0][0], 'geometry');
  assert.deepEqual(current.references, []);
  assert.equal(current.composition, 'lines');
  assert.equal(recommendationFor('street', references, [], 4).candidates[0][0], 'mono');
  assert.equal(recommendationFor('sea', references, [], 4).candidates[0][0], 'coast');
  assert.deepEqual(references, ['sea-soft', 'street-mono']);
});

test('the deck references change both the photographic intent and the scene-specific plan',()=>{
  const open=recommendationFor('sea',[],[],0,null,{referenceId:'sea-open',demoIndex:2,brightness:.7});
  const layers=recommendationFor('sea',[],[],0,null,{referenceId:'sea-layers',demoIndex:1,brightness:.5});
  assert.equal(open.composition,'wide');assert.equal(layers.composition,'layers');
  assert.match(open.site.title,/桅杆/);assert.match(layers.site.guidance.layers,/海浪/);
  assert.notDeepEqual(open.looks[0].params,layers.looks[0].params);
  assert.notDeepEqual(open.looks[0].params,PRESETS.find(p=>p.id==='coast').params);
});

test('new inspirations change framing and color even after several starter-filter captures',()=>{
  const context={demoIndex:2,brightness:.7};
  const initial=recommendationFor('sea',[],[],0,null,context);
  assert.equal(initial.personalized,false);assert.equal(initial.framing,null);
  assert.deepEqual(initial.looks[0].params,PRESETS.find(p=>p.id==='coast').params);
  const starters=Array.from({length:5},(_,at)=>({at,scene:'sea',recipe:'coast',direction:'soft',composition:'subject',references:[]}));
  const inspired=recommendationFor('sea',['sea-open','sea-soft'],starters,0,null,context);
  assert.equal(inspired.personalized,true);assert.equal(inspired.source.id,'sea-open');
  assert.equal(inspired.framing[inspired.composition].zoom,2.2);assert.equal(inspired.looks[0].name,'通透蓝绿');
  assert.notDeepEqual(inspired.looks[0].params,initial.looks[0].params);
  const waterLight=recommendationFor('sea',['sea-soft'],starters,0,null,context);
  assert.equal(waterLight.looks[0].name,'水光柔调');
  assert.notDeepEqual(waterLight.framing[waterLight.composition],inspired.framing[inspired.composition]);
  assert.notDeepEqual(waterLight.looks[0].params,inspired.looks[0].params);
});

test('multiple adopted photographs contribute to memory while an explicit new reference takes priority',()=>{
  const history=[1,2,3].map(at=>({id:String(at),at,scene:'sea',recipe:'coast',direction:'open',composition:'wide',references:['sea-open']}));
  const remembered=recommendationFor('sea',['sea-layers'],history);
  assert.equal(remembered.direction,'open');assert.match(remembered.evidence,/3 次/);
  assert.equal(remembered.explore.id,'sea-layers');
  const current=recommendationFor('sea',['sea-layers'],history,4,null,{referenceId:'sea-layers'});
  assert.equal(current.direction,'layers');assert.equal(current.origin,'current');
  assert.deepEqual(current.references,['sea-layers']);
});

test('new street interests do not replace sea memory and a new site gets new execution values',()=>{
  const history=[{id:'sea-1',at:1,scene:'sea',recipe:'coast',direction:'open',composition:'wide',references:['sea-open']}];
  const sea=recommendationFor('sea',['street-mono'],history,0,null,{demoIndex:2,brightness:.8});
  const street=recommendationFor('street',['street-mono'],history,0,null,{demoIndex:0});
  assert.equal(sea.direction,'open');assert.equal(street.direction,'mono');
  assert.deepEqual(street.references,['street-mono']);
  const newSite=recommendationFor('street',[],history,0,null,{memoryId:'sea-1',demoIndex:0,brightness:.4});
  assert.equal(newSite.direction,'open');assert.notDeepEqual(newSite.looks[0].params,sea.looks[0].params);
  assert.match(newSite.site.title,/建筑/);
});

test('a capture freezes actual parameters and similar captures form an automatic group',()=>{
  const settings={scene:'sea',recipeId:'coast',recipe:'文艺复兴',planName:'留白 · 蓝调',composition:'wide',params:{contrast:17},intensity:80,personal:{direction:'open',intent:'开阔留白',references:['sea-open']}};
  const first=recordFromCapture({id:'1',created:10,settings});
  settings.params.contrast=99;
  assert.equal(first.params.contrast,17);
  const second=recordFromCapture({id:'2',created:20,settings});
  const groups=memoryGroups([first,second]);assert.equal(groups.length,1);assert.equal(groups[0].count,2);assert.equal(groups[0].latest.id,'2');
});

test('unknown scenes do not claim recognition or recall another scene automatically',()=>{
  const result=recommendationFor('unknown',['sea-open'],[{scene:'sea',recipe:'coast',direction:'open',at:1}],0,null,{brightness:.6});
  assert.equal(result.origin,'initial');assert.deepEqual(result.references,[]);assert.match(result.site.constraint,/无法识别/);
});

test('adopting a color alternative to a monochrome reference records the color choice',()=>{
  const plan=recommendationFor('street',[],[],0,null,{referenceId:'street-mono'});
  const chosen=plan.looks.find(p=>p.id==='daylight');assert.equal(chosen.direction,'color');
  const adopted=recordFromCapture({id:'color',created:2,settings:{scene:'street',recipeId:chosen.id,params:chosen.params,composition:'lines',personal:{...plan,direction:chosen.direction,intent:chosen.intent}}});
  const remembered=recommendationFor('street',[],[adopted]);
  assert.equal(remembered.direction,'color');assert.equal(remembered.recipe,'daylight');
});
