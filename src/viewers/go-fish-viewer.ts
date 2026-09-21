// @ts-nocheck -- standalone model viewer DOM and vendored Three.js boundary.
import * as THREE from '../../vendor/three.module.js';
import { OrbitControls } from '../../vendor/addons/controls/OrbitControls.js';
import { EffectComposer } from '../../vendor/addons/postprocessing/EffectComposer.js';
import { RenderPass } from '../../vendor/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '../../vendor/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from '../../vendor/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from '../../vendor/addons/environments/RoomEnvironment.js';
import { createGoFish } from '../rendering/go-fish.js';

const mount = document.querySelector('#fish-model');
const status = document.querySelector('#viewer-status');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

try {
  const renderer = new THREE.WebGLRenderer({alpha:true,antialias:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.7));
  renderer.setClearColor(0x07151d,0);renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
  mount.append(renderer.domElement);
  const scene=new THREE.Scene(), camera=new THREE.PerspectiveCamera(33,1,.1,80);
  const rig=new THREE.Group();scene.add(rig);
  const fish=[createGoFish()];rig.add(fish[0].group);
  const pmrem=new THREE.PMREMGenerator(renderer), studio=new RoomEnvironment();
  const environment=pmrem.fromScene(studio,.08);scene.environment=environment.texture;scene.environmentIntensity=.25;studio.dispose();pmrem.dispose();
  scene.add(new THREE.HemisphereLight(0xc6e9fb,0x062441,.9));
  const key=new THREE.DirectionalLight(0xa3e6ff,1.65);key.position.set(-3,5,5);scene.add(key);
  const rim=new THREE.DirectionalLight(0x178cbf,4.2);rim.position.set(2,3,-5);scene.add(rim);
  const fill=new THREE.DirectionalLight(0x3d74c2,1.2);fill.position.set(-2,-2,3);scene.add(fill);
  const composer=new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene,camera));
  const bloom=new UnrealBloomPass(new THREE.Vector2(1,1),.25,.38,1.1);composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const controls=new OrbitControls(camera,renderer.domElement);
  controls.enableDamping=true;controls.dampingFactor=.065;controls.enablePan=false;controls.minDistance=3;controls.maxDistance=45;
  let time=0,last=0,frame,paused=reducedMotion,swarm=false,burst=0,swarmProgress=0,view='hero',disposed=false,frameCount=0;
  const pauseButton=document.querySelector('#pause'), swarmButton=document.querySelector('#swarm');
  pauseButton.setAttribute('aria-pressed',String(paused));pauseButton.textContent=paused?'動きを再開':'動きを止める';
  const viewTargets={hero:[[.6,.11,0],[-1.8,1.2,10.2]],side:[[.65,.12,0],[.65,.12,10.3]],front:[[-.12,.02,0],[-10,.32,.06]],detail:[[-.75,.13,0],[-1.5,.55,3.9]]};
  function selectView(name){
    view=name;const [target,position]=viewTargets[name];controls.target.fromArray(target);camera.position.fromArray(position);
    const aspect=mount.clientWidth/mount.clientHeight;
    if(aspect<.85 && name!=='detail' && name!=='front')camera.position.sub(controls.target).multiplyScalar(1.14/aspect).add(controls.target);
    if(aspect<.85 && name==='front')camera.position.sub(controls.target).multiplyScalar(1.15).add(controls.target);
    if(swarm&&name!=='detail')camera.position.sub(controls.target).multiplyScalar(1.32).add(controls.target);
    controls.update();document.querySelectorAll('button[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===name)));mount.dataset.view=name;
  }
  function setSwarm(value){
    swarm=value;burst=value?1:0;
    if(value&&fish.length===1)for(let i=1;i<7;i++){const member=createGoFish({detail:'low',phase:i*1.137});member.group.scale.setScalar(0);rig.add(member.group);fish.push(member);}
    swarmButton.setAttribute('aria-pressed',String(value));swarmButton.innerHTML=value?'一匹に戻す <span>7 → 1</span>':'並列化を見る <span>1 → 7</span>';
    mount.dataset.school=value?'7':'1';selectView('hero');
  }
  document.querySelectorAll('button[data-view]').forEach(button=>button.addEventListener('click',()=>selectView(button.dataset.view)));
  swarmButton.addEventListener('click',()=>setSwarm(!swarm));
  pauseButton.addEventListener('click',()=>{paused=!paused;pauseButton.textContent=paused?'動きを再開':'動きを止める';pauseButton.setAttribute('aria-pressed',String(paused));mount.dataset.paused=String(paused);});
  mount.addEventListener('keydown',event=>{
    if(event.key==='ArrowLeft'||event.key==='ArrowRight'){const delta=event.key==='ArrowLeft'?.15:-.15;const offset=camera.position.clone().sub(controls.target).applyAxisAngle(new THREE.Vector3(0,1,0),delta);camera.position.copy(controls.target).add(offset);controls.update();event.preventDefault();}
  });
  const resize=()=>{const width=mount.clientWidth,height=mount.clientHeight;if(!width||!height)return;camera.aspect=width/height;camera.updateProjectionMatrix();renderer.setSize(width,height,false);composer.setSize(width,height);selectView(view);};
  const observer=new ResizeObserver(resize);observer.observe(mount);resize();
  function render(now){
    if(disposed)return;frame=requestAnimationFrame(render);
    const dt=Math.min(.05,(now-(last||now))/1000);last=now;if(document.hidden)return;
    if(!paused)time+=dt;
    swarmProgress=reducedMotion?Number(swarm):THREE.MathUtils.damp(swarmProgress,swarm?1:0,3.8,dt);burst=Math.max(0,burst-dt*.55);
    const destinations=[[0,0,0],[-2.05,1.05,-1.5],[1.05,1.7,-2.0],[-2.5,-1.1,-.8],[2.2,-1.25,-1.7],[3.25,.65,-2.7],[.7,-2.05,-2.9]];
    for(let i=0;i<fish.length;i++){
      const model=fish[i];model.update(time,{power:paused?0:.45+burst*.5,glow:i? .78:1});
      if(i===0){model.group.position.y=Math.sin(time*.7)*.034;continue;}
      const spread=swarmProgress;const destination=destinations[i];
      model.group.visible=spread>.005;
      model.group.position.set(destination[0]*spread+Math.sin(time*.65+i)*.17*spread,destination[1]*spread+Math.sin(time*.8+i*2)*.12*spread,destination[2]*spread);
      model.group.rotation.y=Math.sin(time*.45+i)*.1*spread;model.group.rotation.z=Math.sin(time*.55+i)*.055*spread;
      model.group.scale.setScalar(.65*spread);
    }
    controls.update();composer.render();
    if(frameCount++%30===0){mount.dataset.frame=String(frameCount);mount.dataset.camera=camera.position.toArray().map(v=>v.toFixed(2)).join(',');}
    if(!mount.dataset.ready){mount.dataset.ready='true';mount.dataset.school='1';document.body.classList.add('is-ready');status.textContent='';}
  }
  renderer.domElement.addEventListener('webglcontextlost',event=>{event.preventDefault();document.body.classList.remove('is-ready');status.dataset.error='true';status.textContent='3D描画が中断しました。ページを再読み込みしてください。';cancelAnimationFrame(frame);});
  frame=requestAnimationFrame(render);
  window.addEventListener('pagehide',()=>{disposed=true;cancelAnimationFrame(frame);observer.disconnect();controls.dispose();for(const model of fish)model.dispose();for(const pass of composer.passes)pass.dispose?.();composer.dispose();environment.dispose();renderer.dispose();});
  window.addEventListener('pageshow',event=>{if(event.persisted)location.reload();});
}catch(error){
  console.error('Go fish renderer failed',error);status.dataset.error='true';status.textContent='3Dモデルを表示できません。WebGLを使えるブラウザで開き直してください。';
  document.querySelectorAll('button').forEach(button=>button.disabled=true);
}
