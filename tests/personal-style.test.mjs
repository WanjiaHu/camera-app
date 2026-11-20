import test from 'node:test';
import assert from 'node:assert/strict';
import { EXAMPLES, fingerprintFromPixels, matchEffect } from '../experience-model.js';

const pixels=(...colors)=>Uint8ClampedArray.from(colors.flatMap(color=>[...color,255]));
const cool=fingerprintFromPixels(pixels([35,145,215],[60,175,240]));
const warm=fingerprintFromPixels(pixels([220,140,55],[230,172,100]));
const green=fingerprintFromPixels(pixels([65,190,55],[95,195,60]));

test('像素取样分出主色、亮度、反差和场景',()=>{
  assert.equal(cool.color,'cool');assert.equal(cool.scene,'sea');
  assert.equal(warm.color,'warm');assert.equal(warm.scene,'street');
  assert.equal(green.color,'green');assert.equal(green.scene,'nature');
  assert.equal(fingerprintFromPixels(pixels([20,27,30])).scene,'lowlight');
  assert.equal(fingerprintFromPixels(pixels([128,128,128])).scene,'unknown');
  assert.equal(fingerprintFromPixels(new Uint8ClampedArray(4)),null);
  assert.ok(fingerprintFromPixels(pixels([0,0,0],[255,255,255])).contrast>cool.contrast);
});

test('同场景匹配最近的单图指纹，移除后使用剩余指纹或默认效果',()=>{
  const photo={id:'upload',name:'我的照片',fingerprint:cool};
  const other={id:'street',name:'街区照片',fingerprint:warm};
  const [example]=EXAMPLES;
  assert.equal(matchEffect('sea',cool,[example,other,photo]).match.id,photo.id);
  assert.equal(matchEffect('sea',cool,[example,other]).match.id,example.id);
  assert.equal(matchEffect('sea',cool,[other]).match,null);
  assert.equal(matchEffect('sea',cool,[]).recipe.id,'coast');
});

test('取样或场景识别失败时使用默认效果',()=>{
  assert.equal(matchEffect('street',null,EXAMPLES).recipe.id,'daylight');
  assert.equal(matchEffect('unknown',cool,EXAMPLES).match,null);
  assert.equal(matchEffect('unknown',null,[]).recipe.id,'coast');
});
