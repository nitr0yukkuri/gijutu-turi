import assert from 'node:assert/strict';
import test from 'node:test';
import {
  interpolateK8sPresentationSample,
  k8sSurfaceWakeStrength,
  updateK8sSurfaceExposure,
} from './k8s-surface-motion.js';

test('K8s lunge clock and mode are interpolated with the displayed fish snapshot',()=>{
  const first={phase:'fighting' as const,mode:'rest' as const,fightTime:2,distance:30};
  const second={phase:'fighting' as const,mode:'split' as const,fightTime:3,distance:28};

  assert.deepEqual(interpolateK8sPresentationSample(first,second,.25),{
    phase:'fighting',mode:'rest',fightTime:2.25,distance:29.5,
  });
  assert.deepEqual(interpolateK8sPresentationSample(first,second,.75),{
    phase:'fighting',mode:'split',fightTime:2.75,distance:28.5,
  });
});

test('K8s surface exposure emits one breach and one re-entry with wave hysteresis',()=>{
  let exposed=false;
  const shallowCrest=updateK8sSurfaceExposure(exposed,.01);
  assert.deepEqual(shallowCrest,{exposed:false,transition:null});

  const breach=updateK8sSurfaceExposure(shallowCrest.exposed,.04);
  assert.deepEqual(breach,{exposed:true,transition:'breach'});
  assert.deepEqual(updateK8sSurfaceExposure(breach.exposed,-.03),{exposed:true,transition:null});
  assert.deepEqual(updateK8sSurfaceExposure(breach.exposed,-.1),{exposed:false,transition:'reentry'});
});

test('K8s wake becomes stronger with propulsion, body effort, tail stroke and surface lunge',()=>{
  const glide=k8sSurfaceWakeStrength(.8,.08,Math.PI*1.5,0);
  const drive=k8sSurfaceWakeStrength(4.2,.28,Math.PI/2,1);
  assert.ok(glide>=0&&glide<=1);
  assert.ok(drive>glide);
});
