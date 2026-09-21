// @ts-nocheck -- standalone model viewer DOM and vendored Three.js boundary.
import * as THREE from '../../vendor/three.module.js';
import { OrbitControls } from '../../vendor/addons/controls/OrbitControls.js';
import { EffectComposer } from '../../vendor/addons/postprocessing/EffectComposer.js';
import { RenderPass } from '../../vendor/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '../../vendor/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from '../../vendor/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from '../../vendor/addons/environments/RoomEnvironment.js';
import { createDockerWhale } from '../rendering/docker-whale.js';
import { createGoFish } from '../rendering/go-fish.js';

const mount=document.querySelector('#whale-model'),status=document.querySelector('#viewer-status');
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
try {
  const renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));renderer.setClearColor(0x030c16,0);
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;mount.append(renderer.domElement);
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(33,1,.1,160);
  const whale=createDockerWhale(),go=createGoFish({detail:'low',phase:2});
  scene.add(whale.group,go.group);go.group.visible=false;
  const pmrem=new THREE.PMREMGenerator(renderer),studio=new RoomEnvironment();
  const environment=pmrem.fromScene(studio,.08);scene.environment=environment.texture;scene.environmentIntensity=.32;studio.dispose();pmrem.dispose();
  scene.add(new THREE.HemisphereLight(0x99d7f2,0x122a43,1.15));
  const key=new THREE.DirectionalLight(0x9cdbff,2.7);key.position.set(-6,9,8);scene.add(key);
  const rim=new THREE.DirectionalLight(0x20b9ee,4);rim.position.set(4,5,-8);scene.add(rim);
  const fill=new THREE.DirectionalLight(0x386ac8,1.8);fill.position.set(-8,-3,4);scene.add(fill);
  const composer=new EffectComposer(renderer);composer.addPass(new RenderPass(scene,camera));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(1,1),.22,.38,1.35));composer.addPass(new OutputPass());
  const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=.065;
  controls.enablePan=false;controls.minDistance=7;controls.maxDistance=85;
  const pauseButton=document.querySelector('#pause'),compareButton=document.querySelector('#compare');
  let paused=reduced,compare=false,view='hero',time=0,last=0,frame,disposed=false,frames=0;
  const views={hero:{target:[-2.3,.4,0],position:[-15,7.4,25]},side:{target:[.15,.55,0],position:[.15,2.1,31]},front:{target:[-1.1,.35,0],position:[-28,3.2,.06]},cargo:{target:[-1.3,1.7,0],position:[-7,11,12]}};
  function selectView(name){
    view=name;const pose=views[name];controls.target.fromArray(pose.target);camera.position.fromArray(pose.position);
    const aspect=mount.clientWidth/mount.clientHeight;
    if(aspect<.85&&name==='hero')controls.target.x=.3;
    if(aspect<.85&&name!=='front')camera.position.sub(controls.target).multiplyScalar(1.05/aspect).add(controls.target);
    if(compare){controls.target.y-=1.2;camera.position.sub(controls.target).multiplyScalar(1.10).add(controls.target);}
    controls.update();document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===name)));mount.dataset.view=name;
  }
  function updatePause(){pauseButton.setAttribute('aria-pressed',String(paused));pauseButton.textContent=paused?'泳ぎを再開':'泳ぎを止める';mount.dataset.paused=String(paused);}
  document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>selectView(b.dataset.view)));
  pauseButton.addEventListener('click',()=>{paused=!paused;updatePause();});updatePause();
  compareButton.addEventListener('click',()=>{
    compare=!compare;go.group.visible=compare;compareButton.setAttribute('aria-pressed',String(compare));
    compareButton.innerHTML=compare?'クジラだけ見る <span>↔</span>':'Go魚と比べる <span>↔</span>';
    document.querySelector('#comparison-note').textContent=compare?'下のGo魚も同じ縮尺。クジラは全長約2倍、胴の厚み約4倍。':'厚い胴体。ゆっくり打つ、水平の尾。';
    mount.dataset.comparison=String(compare);selectView('side');
  });
  mount.addEventListener('keydown',event=>{
    if(['ArrowLeft','ArrowRight'].includes(event.key)){
      camera.position.sub(controls.target).applyAxisAngle(new THREE.Vector3(0,1,0),event.key==='ArrowLeft'?.16:-.16).add(controls.target);controls.update();event.preventDefault();
    }
  });
  const resize=()=>{const w=mount.clientWidth,h=mount.clientHeight;if(!w||!h)return;camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h,false);composer.setSize(w,h);selectView(view);};
  const observer=new ResizeObserver(resize);observer.observe(mount);resize();
  function render(now){
    if(disposed)return;frame=requestAnimationFrame(render);const dt=Math.min(.05,(now-(last||now))/1000);last=now;if(document.hidden)return;
    if(!paused)time+=dt;
    whale.update(time,{power:.45,glow:1});whale.group.position.y=Math.sin(time*.55)*.12;whale.group.rotation.z=Math.sin(time*.4)*.012;
    if(compare){go.group.position.set(-.7,-3.65+Math.sin(time*.8)*.11,1.0);go.update(time,{power:.45,glow:.8});}
    controls.update();composer.render();
    if(frames++%30===0){mount.dataset.frame=String(frames);mount.dataset.camera=camera.position.toArray().map(v=>v.toFixed(2)).join(',');}
    if(!mount.dataset.ready){mount.dataset.ready='true';document.body.classList.add('is-ready');status.textContent='';}
  }
  renderer.domElement.addEventListener('webglcontextlost',event=>{event.preventDefault();document.body.classList.remove('is-ready');status.dataset.error='true';status.textContent='3D描画が中断しました。再読み込みしてください。';cancelAnimationFrame(frame);});
  frame=requestAnimationFrame(render);
  window.addEventListener('pagehide',()=>{disposed=true;cancelAnimationFrame(frame);observer.disconnect();controls.dispose();whale.dispose();go.dispose();for(const pass of composer.passes)pass.dispose?.();composer.dispose();environment.dispose();renderer.dispose();});
  window.addEventListener('pageshow',event=>{if(event.persisted)location.reload();});
}catch(error){console.error('Docker whale renderer failed',error);status.dataset.error='true';status.textContent='3Dモデルを表示できません。WebGLが使えるブラウザで開いてください。';document.querySelectorAll('button').forEach(b=>b.disabled=true);}
