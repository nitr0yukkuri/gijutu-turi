// @ts-nocheck -- fish constructors use the vendored Three.js runtime.
import * as THREE from '../../vendor/three.module.js';
import { K8S_ECHO_COUNT } from './k8s-fight-presentation.js';
import { createLazyModelRegistry } from './lazy-model-registry.js';

/** Own species model loading, construction, and disposal for the ocean scene. */
export function createOceanFishModels(scene, waterUniforms, createFishOrientationScratch) {
  let disposed=false;
  let goFishModulePromise=null,dockerWhaleModulePromise=null,createGoFishModel=null;
  const optionalModelPreparation=new Set();
  const optionalModelTasks=[];
  let idleWorkHandle=null,idleWorkTimer=null,idleWorkScheduledAt=0;
  const runOptionalModelTask=deadline=>{
    idleWorkHandle=null;idleWorkTimer=null;
    if(disposed){optionalModelTasks.length=0;idleWorkScheduledAt=0;return;}
    if(!deadline.didTimeout&&deadline.timeRemaining()<5){scheduleOptionalModelTask();return;}
    const task=optionalModelTasks.shift();
    try{task?.();}catch(error){console.error('Optional fish model preparation failed',error);}
    if(optionalModelTasks.length)scheduleOptionalModelTask();
    else idleWorkScheduledAt=0;
  };
  const scheduleOptionalModelTask=()=>{
    if(disposed||!optionalModelTasks.length||idleWorkHandle!==null||idleWorkTimer!==null)return;
    if(idleWorkScheduledAt===0)idleWorkScheduledAt=performance.now();
    const idleWindow=typeof window==='undefined'?null:window;
    const requestIdleCallback=idleWindow?.requestIdleCallback;
    if(requestIdleCallback){
      idleWorkHandle=requestIdleCallback.call(idleWindow,runOptionalModelTask,{
        timeout:Math.max(0,900-(performance.now()-idleWorkScheduledAt)),
      });
      return;
    }
    idleWorkTimer=setTimeout(()=>runOptionalModelTask({didTimeout:true,timeRemaining:()=>0}),16);
  };
  const enqueueOptionalModelTasks=tasks=>{
    if(disposed||!tasks.length)return;
    optionalModelTasks.push(...tasks);scheduleOptionalModelTask();
  };
  const loadGoFishModule=()=>goFishModulePromise??=(import('./go-fish.js').then(module=>{createGoFishModel=module.createGoFish;return module;}).catch(error=>{goFishModulePromise=null;throw error;}));
  const loadDockerWhaleModule=()=>dockerWhaleModulePromise??=(import('./docker-whale.js').catch(error=>{dockerWhaleModulePromise=null;throw error;}));

  // Empty slots retain the original species order for transparent sorting.
  const fightModelSlots={
    'fish-001':new THREE.Group(),
    'whale-001':new THREE.Group(),
    'css-001':new THREE.Group(),
    'rust-001':new THREE.Group(),
    'js-001':new THREE.Group(),
  };
  for(const slot of Object.values(fightModelSlots)){slot.renderOrder=4;scene.add(slot);}
  const prepareFightModel=(fishId,model)=>{
    model.group.visible=false;model.group.renderOrder=4;
    model.group.traverse(object=>{object.renderOrder=4;});
    fightModelSlots[fishId].add(model.group);
    return model;
  };
  const fightModels=createLazyModelRegistry({
    'fish-001':async()=>{
      const {createGoFish}=await loadGoFishModule();
      return prepareFightModel('fish-001',createGoFish({detail:'high',phase:.7,waterUniforms}));
    },
    'whale-001':async()=>{
      const {createDockerWhale}=await loadDockerWhaleModule();
      const model=createDockerWhale({detail:'high',phase:.7,waterUniforms});
      model.group.scale.setScalar(.42);
      return prepareFightModel('whale-001',model);
    },
    'css-001':async()=>{const {createGoFish}=await loadGoFishModule();return prepareFightModel('css-001',createGoFish({detail:'high',phase:.7,waterUniforms,visualProfile:'css'}));},
    'rust-001':async()=>{const {createGoFish}=await loadGoFishModule();return prepareFightModel('rust-001',createGoFish({detail:'high',phase:.7,waterUniforms,visualProfile:'rust'}));},
    'js-001':async()=>{const {createGoFish}=await loadGoFishModule();return prepareFightModel('js-001',createGoFish({detail:'high',phase:.7,waterUniforms,visualProfile:'eel'}));},
  });
  const fightFish=()=>fightModels.peek('fish-001');
  const dockerWhale=()=>fightModels.peek('whale-001');
  const cssFish=()=>fightModels.peek('css-001');
  const rustFish=()=>fightModels.peek('rust-001');
  const jsEel=()=>fightModels.peek('js-001');

  let cssFishAfterimages=[],cssFishAfterimagesPromise=null;
  const createNextCssFishAfterimage=()=>{
    if(disposed||!createGoFishModel||cssFishAfterimages.length>=2)return false;
    const index=cssFishAfterimages.length;
    const model=createGoFishModel({detail:'high',phase:.7+index*.11,waterUniforms,visualProfile:'css'});
    model.group.visible=false;model.group.renderOrder=3;
    model.group.traverse(object=>{
      object.renderOrder=3;
      for(const material of Array.isArray(object.material)?object.material:object.material?[object.material]:[])material.depthWrite=false;
    });
    scene.add(model.group);cssFishAfterimages.push(model);
    return true;
  };
  const ensureCssFishAfterimages=()=>{
    if(cssFishAfterimages.length>=2)return Promise.resolve(cssFishAfterimages);
    if(cssFishAfterimagesPromise)return cssFishAfterimagesPromise;
    if(disposed)return Promise.resolve(cssFishAfterimages);
    cssFishAfterimagesPromise=loadGoFishModule().then(()=>{
      while(createNextCssFishAfterimage());
      return cssFishAfterimages;
    }).finally(()=>{cssFishAfterimagesPromise=null;});
    return cssFishAfterimagesPromise;
  };

  let clusterFish=null,clusterFishPromise=null;
  const ensureClusterFish=()=>{
    if(clusterFish)return Promise.resolve(clusterFish);
    if(clusterFishPromise)return clusterFishPromise;
    if(disposed)return Promise.resolve(null);
    clusterFishPromise=loadGoFishModule().then(({createGoFish})=>{
      if(disposed)return null;
      clusterFish=createGoFish({detail:'high',phase:.7,waterUniforms,visualProfile:'cluster'});
      clusterFish.group.visible=false;clusterFish.group.renderOrder=4;
      clusterFish.group.traverse(object=>{object.renderOrder=4;});
      scene.add(clusterFish.group);
      return clusterFish;
    }).finally(()=>{clusterFishPromise=null;});
    return clusterFishPromise;
  };

  const schoolSlot=new THREE.Group();schoolSlot.renderOrder=3;scene.add(schoolSlot);
  let schoolFish=[];
  const createNextSchoolFish=()=>{
    if(disposed||!createGoFishModel||schoolFish.length>=6)return false;
    const index=schoolFish.length;
    const model=createGoFishModel({detail:'low',phase:index*.87,waterUniforms});
    model.group.visible=false;model.group.renderOrder=3;schoolSlot.add(model.group);schoolFish.push(model);
    return true;
  };
  const ensureSchoolFish=()=>{while(createNextSchoolFish());};

  let clusterEchoes=[],clusterEchoMotion=[],clusterEchoesPromise=null;
  const createNextClusterEcho=()=>{
    if(disposed||!createGoFishModel||clusterEchoes.length>=K8S_ECHO_COUNT)return false;
    const index=clusterEchoes.length;
    const model=createGoFishModel({detail:'low',phase:1.7+index,waterUniforms,visualProfile:'cluster'});
    model.group.visible=false;model.group.renderOrder=3;scene.add(model.group);
    clusterEchoes.push(model);
    clusterEchoMotion.push({
      position:new THREE.Vector3(),velocity:new THREE.Vector3(),orientation:new THREE.Quaternion(),
      orientationScratch:createFishOrientationScratch(),initialized:false,
    });
    return true;
  };
  const ensureClusterEchoes=()=>{
    if(clusterEchoes.length>=K8S_ECHO_COUNT)return Promise.resolve(clusterEchoes);
    if(clusterEchoesPromise)return clusterEchoesPromise;
    if(disposed)return Promise.resolve(clusterEchoes);
    clusterEchoesPromise=loadGoFishModule().then(()=>{
      if(disposed)return clusterEchoes;
      while(createNextClusterEcho());
      return clusterEchoes;
    }).finally(()=>{clusterEchoesPromise=null;});
    return clusterEchoesPromise;
  };

  const fightModelFor=fishId=>fishId==='k8s-001'?clusterFish:fightModels.peek(fishId==='whale-001'||fishId==='css-001'||fishId==='rust-001'||fishId==='js-001'?fishId:'fish-001');
  const scheduleOptionalModelPreparation=fishId=>{
    if(optionalModelPreparation.has(fishId))return;
    const createNext=fishId==='fish-001'?createNextSchoolFish:fishId==='k8s-001'?createNextClusterEcho:fishId==='css-001'?createNextCssFishAfterimage:null;
    const count=fishId==='fish-001'?6:fishId==='k8s-001'?K8S_ECHO_COUNT:fishId==='css-001'?2:0;
    if(!createNext||!count)return;
    optionalModelPreparation.add(fishId);
    void loadGoFishModule().then(()=>{
      if(disposed)return;
      enqueueOptionalModelTasks(Array.from({length:count},()=>createNext));
    }).catch(error=>{
      optionalModelPreparation.delete(fishId);
      console.error('Optional fish models unavailable',error);
    });
  };
  const fightModelRequests=new Map();
  const requestFightModel=fishId=>{
    const existing=fightModelRequests.get(fishId);
    if(existing)return existing;
    const request=(async()=>{
      if(fishId==='k8s-001')await ensureClusterFish();
      else await fightModels.load(fishId==='whale-001'||fishId==='css-001'||fishId==='rust-001'||fishId==='js-001'?fishId:'fish-001');
      scheduleOptionalModelPreparation(fishId);
    })();
    fightModelRequests.set(fishId,request);
    void request.catch(()=>{if(fightModelRequests.get(fishId)===request)fightModelRequests.delete(fishId);});
    return request;
  };

  return {
    fightFish,dockerWhale,cssFish,rustFish,jsEel,fightModelFor,requestFightModel,
    ensureCssFishAfterimages,ensureClusterFish,ensureSchoolFish,ensureClusterEchoes,
    get cssFishAfterimages(){return cssFishAfterimages;},
    get clusterFish(){return clusterFish;},
    get schoolFish(){return schoolFish;},
    get clusterEchoes(){return clusterEchoes;},
    get clusterEchoMotion(){return clusterEchoMotion;},
    dispose(){
      if(disposed)return;
      disposed=true;
      if(idleWorkHandle!==null&&typeof window!=='undefined')window.cancelIdleCallback?.(idleWorkHandle);
      if(idleWorkTimer!==null)clearTimeout(idleWorkTimer);
      optionalModelTasks.length=0;
      fightModels.dispose();
      for(const model of cssFishAfterimages)model.dispose();
      clusterFish?.dispose();
      for(const model of clusterEchoes)model.dispose();
      for(const model of schoolFish)model.dispose();
    },
  };
}
