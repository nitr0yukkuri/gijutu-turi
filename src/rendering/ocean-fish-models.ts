// @ts-nocheck -- fish constructors use the vendored Three.js runtime.
import * as THREE from '../../vendor/three.module.js';
import { K8S_ECHO_COUNT } from './k8s-fight-presentation.js';
import { createLazyModelRegistry } from './lazy-model-registry.js';

/** Own species model loading, construction, and disposal for the ocean scene. */
export function createOceanFishModels(scene, waterUniforms, createFishOrientationScratch) {
  let disposed=false;
  let goFishModulePromise=null,dockerWhaleModulePromise=null,createGoFishModel=null;
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
  const ensureCssFishAfterimages=()=>{
    if(cssFishAfterimages.length)return Promise.resolve(cssFishAfterimages);
    if(cssFishAfterimagesPromise)return cssFishAfterimagesPromise;
    if(disposed)return Promise.resolve(cssFishAfterimages);
    cssFishAfterimagesPromise=loadGoFishModule().then(({createGoFish})=>{
      if(disposed)return cssFishAfterimages;
      cssFishAfterimages=Array.from({length:2},(_,index)=>{
        const model=createGoFish({detail:'high',phase:.7+index*.11,waterUniforms,visualProfile:'css'});
        model.group.visible=false;model.group.renderOrder=3;
        model.group.traverse(object=>{
          object.renderOrder=3;
          for(const material of Array.isArray(object.material)?object.material:object.material?[object.material]:[])material.depthWrite=false;
        });
        scene.add(model.group);
        return model;
      });
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
  const ensureSchoolFish=()=>{
    if(schoolFish.length||!createGoFishModel||disposed)return;
    schoolFish=Array.from({length:6},(_,index)=>{
      const model=createGoFishModel({detail:'low',phase:index*.87,waterUniforms});
      model.group.visible=false;model.group.renderOrder=3;schoolSlot.add(model.group);return model;
    });
  };

  let clusterEchoes=[],clusterEchoMotion=[],clusterEchoesPromise=null;
  const ensureClusterEchoes=()=>{
    if(clusterEchoes.length)return Promise.resolve(clusterEchoes);
    if(clusterEchoesPromise)return clusterEchoesPromise;
    if(disposed)return Promise.resolve(clusterEchoes);
    clusterEchoesPromise=loadGoFishModule().then(({createGoFish})=>{
      if(disposed)return clusterEchoes;
      clusterEchoes=Array.from({length:K8S_ECHO_COUNT},(_,index)=>{
        const model=createGoFish({detail:'low',phase:1.7+index,waterUniforms,visualProfile:'cluster'});
        model.group.visible=false;model.group.renderOrder=3;scene.add(model.group);return model;
      });
      clusterEchoMotion=Array.from({length:K8S_ECHO_COUNT},()=>({
        position:new THREE.Vector3(),velocity:new THREE.Vector3(),orientation:new THREE.Quaternion(),
        orientationScratch:createFishOrientationScratch(),initialized:false,
      }));
      return clusterEchoes;
    }).finally(()=>{clusterEchoesPromise=null;});
    return clusterEchoesPromise;
  };

  const fightModelFor=fishId=>fishId==='k8s-001'?clusterFish:fightModels.peek(fishId==='whale-001'||fishId==='css-001'||fishId==='rust-001'||fishId==='js-001'?fishId:'fish-001');
  const requestFightModel=async fishId=>{
    if(fishId==='k8s-001')await Promise.all([ensureClusterFish(),ensureClusterEchoes()]);
    else{
      await fightModels.load(fishId==='whale-001'||fishId==='css-001'||fishId==='rust-001'||fishId==='js-001'?fishId:'fish-001');
      if(fishId==='fish-001')ensureSchoolFish();
    }
    if(fishId==='css-001')await ensureCssFishAfterimages();
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
      fightModels.dispose();
      for(const model of cssFishAfterimages)model.dispose();
      clusterFish?.dispose();
      for(const model of clusterEchoes)model.dispose();
      for(const model of schoolFish)model.dispose();
    },
  };
}
