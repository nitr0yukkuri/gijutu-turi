// @ts-nocheck -- the procedural mesh uses the vendored Three.js runtime, whose JS distribution has no declarations.
import * as THREE from '../../vendor/three.module.js';
import { applyFishWater, DOCKER_WHALE_WATER_PROFILE } from './fish-water.js';
import { setDockerWhaleMouthAnchor, whaleSection, whaleSurface as surface } from './docker-whale-profile.js';
export { setDockerWhaleMouthAnchor, whaleSection } from './docker-whale-profile.js';

// Original Docker-inspired creature. Nose -X, back +Y, flukes spread along Z.
// DOM-free model: the same group/update/dispose contract as createGoFish.
const clamp = THREE.MathUtils.clamp;
function geometry(positions,uvs,indices) {
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));g.setIndex(indices);g.computeVertexNormals();
  return g;
}
function makeBody(low) {
  const rings=low?72:112,sides=low?36:64,positions=[],uvs=[],indices=[];
  for(let i=0;i<=rings;i++)for(let j=0;j<=sides;j++){
    const p=surface(i/rings,j/sides*Math.PI*2);positions.push(...p.toArray());uvs.push(i/rings,j/sides);
  }
  for(let i=0;i<rings;i++)for(let j=0;j<sides;j++){
    const a=i*(sides+1)+j,b=a+sides+1;indices.push(a,b,a+1,a+1,b,b+1);
  }
  for(const [ring,reverse] of [[0,false],[rings,true]]){
    const p=whaleSection(ring/rings),center=positions.length/3;positions.push(p.x,p.center,0);uvs.push(ring/rings,.5);
    for(let j=0;j<sides;j++){const a=ring*(sides+1)+j;indices.push(center,reverse?a+1:a,reverse?a:a+1);}
  }
  return geometry(positions,uvs,indices);
}

// Thick, swept hydrofoils with rounded sections, rather than flat triangles.
function makeFin(stations,sign,low) {
  const line=new THREE.CatmullRomCurve3(stations.map(p=>new THREE.Vector3(p[0],p[1],p[2])));
  const size=new THREE.CatmullRomCurve3(stations.map((p,i)=>new THREE.Vector3(i,p[3],p[4])));
  const rings=low?30:48,sides=low?12:20,positions=[],uvs=[],indices=[];
  for(let i=0;i<=rings;i++){
    const t=i/rings,p=line.getPoint(t),s=size.getPoint(t);
    for(let j=0;j<=sides;j++){
      const a=j/sides*Math.PI*2;
      positions.push(p.x+Math.cos(a)*Math.max(.006,s.y),p.y+Math.sin(a)*Math.max(.005,s.z),p.z*sign);
      uvs.push(t,j/sides);
    }
  }
  for(let i=0;i<rings;i++)for(let j=0;j<sides;j++){
    const a=i*(sides+1)+j,b=a+sides+1;
    if(sign>0)indices.push(a,a+1,b,a+1,b+1,b);else indices.push(a,b,a+1,a+1,b,b+1);
  }
  for(const [ring,reverse] of [[0,sign>0],[rings,sign<0]]){
    const p=line.getPoint(ring/rings),center=positions.length/3;positions.push(p.x,p.y,p.z*sign);uvs.push(ring/rings,.5);
    for(let j=0;j<sides;j++){const a=ring*(sides+1)+j;indices.push(center,reverse?a+1:a,reverse?a:a+1);}
  }
  return geometry(positions,uvs,indices);
}

const deformation=`
// uWhalePhase is the server-authored body-wave phase in radians. The renderer
// may interpolate packets, but it must never invent a second whale clock.
uniform float uWhalePhase;
uniform float uWhaleFrequency;
uniform float uWhaleWavelength;
uniform float uWhaleAmplitude;
uniform float uWhaleEffort;
uniform float uWhaleTurn;
uniform float uPower;
float lift(float x){
  float tail=smoothstep(-.5,6.9,x);
  float bodyPosition=clamp((x+5.1)/10.2,0.0,1.0);
  // The torso stays comparatively rigid; the travelling wave accumulates
  // through the peduncle instead of making the whole whale look gelatinous.
  float spatialWave=mix(.58,1.05,clamp(uWhaleWavelength,0.0,1.2));
  float wave=sin(uWhalePhase-bodyPosition*spatialWave);
  float effort=mix(.68,1.16,clamp(uWhaleEffort,0.0,1.0));
  return wave*tail*tail*(.08+uWhaleAmplitude*1.45)*effort+uWhaleTurn*bodyPosition*bodyPosition*.08;
}
float flukeStroke(){
  float stroke=sin(uWhalePhase+.35);
  // Cetacean burst strokes are asymmetric: the power stroke is stronger than
  // the recovery stroke. Keep the difference restrained for a heavy whale.
  return stroke*mix(.72,1.12,1.0-step(0.0,stroke));
}
vec3 swim(vec3 p){
  p.y+=lift(p.x);
  float effort=mix(.68,1.16,clamp(uWhaleEffort,0.0,1.0));
  float fluke=smoothstep(3.85,6.35,p.x);
  float flukeSpan=.62+.38*smoothstep(0.0,2.8,abs(p.z));
  float flukeBeat=flukeStroke()*fluke*flukeSpan*(.08+uWhaleAmplitude*1.8)*effort;
  // The tip travels farther than the peduncle, producing an actual fluke
  // stroke rather than a uniform vertical translation of the mesh.
  p.y+=flukeBeat*(.42+.68*smoothstep(4.35,6.35,p.x));
  float flipper=(1.0-smoothstep(-.1,2.0,p.x))*smoothstep(1.65,4.5,abs(p.z));
  p.y+=sin(uWhalePhase-.8+uWhaleFrequency*.08)*flipper*(.045+uWhaleAmplitude*.35)*mix(.7,1.08,clamp(uWhaleEffort,0.0,1.0));
  p.z+=uWhaleTurn*flipper*.12;
  return p;
}
vec3 swimNormal(vec3 p,vec3 n){
  float eps=.004;
  float dx=(swim(p+vec3(eps,0.,0.)).y-swim(p-vec3(eps,0.,0.)).y)/(2.*eps);
  float dz=(swim(p+vec3(0.,0.,eps)).y-swim(p-vec3(0.,0.,eps)).y)/(2.*eps);
  return normalize(vec3(n.x-dx*n.y,n.y,n.z-dz*n.y));
}`;
function animate(material,uniforms,mode='plain') {
  material.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,uniforms);
    shader.vertexShader=deformation+'\nvarying vec3 vWhale;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <beginnormal_vertex>','#include <beginnormal_vertex>\nobjectNormal=swimNormal(position,objectNormal);');
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvWhale=position;transformed=swim(position);');
    shader.fragmentShader='uniform float uWhalePhase; uniform float uGlow; varying vec3 vWhale;\n'+shader.fragmentShader;
    if(mode==='skin'||mode==='pectoral-skin')shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`
      #include <color_fragment>
      float belly=1.0-smoothstep(-1.65,-.42,vWhale.y);
      float grain=fract(sin(dot(floor(vWhale*120.),vec3(17.13,63.77,41.19)))*43758.5453);
      float mottling=sin(vWhale.x*3.2+sin(vWhale.z*4.1))*sin(vWhale.y*7.3+vWhale.x*.6);
      vec3 ink=mix(vec3(.009,.065,.135),vec3(.055,.23,.31),smoothstep(-.2,1.8,vWhale.y));
      diffuseColor.rgb=mix(ink,vec3(.20,.43,.47),belly*${mode==='pectoral-skin'?'.34':'.75'});
      diffuseColor.rgb*=.91+grain*.07+mottling*.055;
    `);
    if(mode==='glow')shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\ndiffuseColor.rgb*=uGlow*(.87+.13*sin(vWhale.x*1.7-uWhalePhase));');
  };
  material.customProgramCacheKey=()=>`docker-whale-v1-${mode}`;
  return material;
}

function makeCargoHaloTexture() {
  const size=32,data=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const dx=((x+.5)/size-.5)*2,dy=((y+.5)/size-.5)*2;
    const alpha=Math.round(255*Math.pow(clamp(1-Math.sqrt(dx*dx+dy*dy),0,1),1.55));
    const offset=(y*size+x)*4;
    data[offset]=255;data[offset+1]=255;data[offset+2]=255;data[offset+3]=alpha;
  }
  const texture=new THREE.DataTexture(data,size,size,THREE.RGBAFormat,THREE.UnsignedByteType);
  texture.magFilter=THREE.LinearFilter;texture.minFilter=THREE.LinearFilter;
  texture.generateMipmaps=false;texture.needsUpdate=true;
  return texture;
}

// Cargo details do not use the whale-body deformation. They get their own
// server-state-driven boot glow while a heavy pull is active.
function cargoPulseMaterial(material,mode,uniforms) {
  const compile=material.onBeforeCompile;
  material.onBeforeCompile=shader=>{
    compile.call(material,shader);
    shader.uniforms.uCargoPulse=uniforms.uCargoPulse;
    shader.uniforms.uCargoOn=uniforms.uCargoOn;
    if(mode==='glow'){
      shader.uniforms.uGlow=uniforms.uGlow;
      shader.fragmentShader='uniform float uCargoPulse; uniform float uCargoOn; uniform float uGlow;\n'+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\ndiffuseColor.rgb*=uGlow*(1.0+.95*uCargoOn+.75*uCargoPulse);');
    }else if(mode==='halo'){
      shader.fragmentShader='uniform float uCargoPulse; uniform float uCargoOn;\n'+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\nfloat cargoHaloSignal=clamp(.95*uCargoOn+.5*uCargoPulse,0.0,1.0);diffuseColor.a*=cargoHaloSignal;');
    }else{
      shader.fragmentShader='uniform float uCargoPulse; uniform float uCargoOn;\n'+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\ntotalEmissiveRadiance+=vec3(.02,.18,.28)*(uCargoPulse+.9*uCargoOn);');
    }
  };
  material.customProgramCacheKey=()=>`docker-whale-cargo-${mode}-v1`;
  return material;
}

export function createDockerWhale({detail='high',phase=0,waterUniforms}={}) {
  const low=detail==='low',group=new THREE.Group();group.name='Dockerクジラ';
  const habitatUniforms=waterUniforms?{...waterUniforms,uFishCenter:{value:group.position},uFishVisibility:{value:1},uFishCombat:{value:0}}:null;
  const uniforms={
    uWhalePhase:{value:phase},uWhaleFrequency:{value:.78},uWhaleWavelength:{value:.94},
    uWhaleAmplitude:{value:.1},uWhaleEffort:{value:.38},uWhaleTurn:{value:0},
    uPower:{value:.45},uGlow:{value:1},uCargoPulse:{value:0},uCargoOn:{value:0},
  };
  const geometries=new Set(),materials=new Set(),parts=[];
  // Cargo is a rigid load with its own inertial mount. Keeping the mount
  // separate lets it lag behind a turn without deforming the whale's body.
  const cargoMount=new THREE.Group();cargoMount.name='コンテナ慣性マウント';group.add(cargoMount);
  const skin=animate(new THREE.MeshPhysicalMaterial({color:0xffffff,roughness:.66,metalness:.02,clearcoat:.08,clearcoatRoughness:.58,envMapIntensity:.35}),uniforms,'skin');
  const glow=animate(new THREE.MeshBasicMaterial({color:new THREE.Color(.04,1.65,2.8),toneMapped:false}),uniforms,'glow');
  const trace=animate(new THREE.MeshStandardMaterial({color:0x197b9e,emissive:0x14769c,emissiveIntensity:.55,roughness:.3,metalness:.6}),uniforms);
  const black=animate(new THREE.MeshPhysicalMaterial({color:0x010b14,roughness:.12,clearcoat:1,metalness:.15}),uniforms);
  // The load needs a separate readability budget from the whale skin. A
  // slightly brighter painted-blue body plus a restrained cyan edge lets the
  // container remain legible under the water blend without turning it into a
  // glowing billboard.
  const cargo=new THREE.MeshPhysicalMaterial({color:0x12617d,roughness:.56,metalness:.36,clearcoat:.22,clearcoatRoughness:.48,emissive:0x032332,emissiveIntensity:.18});
  const cargoAccent=cargoPulseMaterial(new THREE.MeshStandardMaterial({color:0x3e9caf,emissive:0x0d5367,emissiveIntensity:.42,roughness:.36,metalness:.58}),'accent',uniforms);
  cargoAccent.name='docker-cargo-accent';
  const cargoGlow=cargoPulseMaterial(new THREE.MeshBasicMaterial({color:new THREE.Color(.04,1.65,2.8),toneMapped:false}),'glow',uniforms);
  cargoGlow.name='docker-cargo-status-glow';
  const cargoHaloMap=makeCargoHaloTexture();
  const cargoHalo=cargoPulseMaterial(new THREE.MeshBasicMaterial({
    color:new THREE.Color(.22,1.25,1.8),map:cargoHaloMap,transparent:true,opacity:.92,
    depthWrite:false,toneMapped:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,
  }),'halo',uniforms);
  cargoHalo.name='docker-cargo-status-halo';
  const ribs=new THREE.MeshStandardMaterial({color:0x237596,roughness:.4,metalness:.6});
  const deck=new THREE.MeshStandardMaterial({color:0x061b29,roughness:.48,metalness:.65});
  const finWaterSides=new Map();
  function add(g,m,name,parent=group){
    geometries.add(g);materials.add(m);const mesh=new THREE.Mesh(g,m);mesh.name=name;mesh.frustumCulled=false;parent.add(mesh);parts.push(mesh);return mesh;
  }
  function tube(points,radius,m,name){
    const c=new THREE.CatmullRomCurve3(points.map(p=>p.isVector3?p:new THREE.Vector3(...p)));
    return add(new THREE.TubeGeometry(c,low?24:48,radius,low?5:7,false),m,name);
  }
  function sphere(point,radius,m,name,scale=[1,1,1]){
    const small=radius<.09;
    const g=new THREE.SphereGeometry(radius,small?8:low?12:20,small?6:low?8:14);g.scale(...scale);g.translate(...point);return add(g,m,name);
  }
  const body=add(makeBody(low),skin,'sculpted-whale-body');
  const flippers=[],flukes=[];
  for(const sign of [-1,1]){
    const pectoralSkin=animate(skin.clone(),uniforms,'pectoral-skin');
    pectoralSkin.name='pectoral-skin-'+sign;
    pectoralSkin.roughness=.84;pectoralSkin.clearcoat=.025;pectoralSkin.clearcoatRoughness=.78;pectoralSkin.envMapIntensity=.12;
    finWaterSides.set(pectoralSkin,sign);
    const pectoralGlow=glow.clone();pectoralGlow.name='pectoral-rim-'+sign;finWaterSides.set(pectoralGlow,sign);
    flippers.push(add(makeFin([[-2.5,-.6,1.4,.6,.23],[-1.8,-.9,2.1,.79,.19],[-.85,-1.34,3.05,.65,.12],[.1,-1.48,4.05,.33,.055],[.6,-1.38,4.55,.008,.008]],sign,low),pectoralSkin,'pectoral-'+sign));
    flukes.push(add(makeFin([[4.55,.6,0,.5,.19],[5.0,.65,.55,.8,.2],[5.45,.69,1.4,.86,.16],[5.95,.82,2.25,.56,.09],[6.4,1.0,2.8,.008,.008]],sign,low),skin,'horizontal-fluke-'+sign));
    tube([[4.3,.65,.23*sign],[4.5,.72,.62*sign],[4.72,.76,1.4*sign],[5.4,.9,2.25*sign],[6.4,1.0,2.8*sign]],.025,glow,'fluke-rim');
    tube([[-2.8,-.5,1.7*sign],[-2.48,-.91,2.1*sign],[-1.42,-1.35,3.05*sign],[-.19,-1.47,4.05*sign],[.6,-1.38,4.55*sign]],.025,pectoralGlow,'flipper-rim-'+sign);
    // Mouth folds follow the head surface, and remain attached while swimming.
    tube(Array.from({length:22},(_,i)=>surface(.015+i/21*.28,sign>0?-.24:Math.PI+.24,.017)),.039,black,'mouth-fold');
    tube(Array.from({length:22},(_,i)=>surface(.04+i/21*.29,sign>0?-.30:Math.PI+.30,.022)),.012,trace,'jaw-light');
    const eye=surface(.285,.04+(sign<0?Math.PI:0),.005);
    sphere(eye.toArray(),.215,black,'obsidian-eye',[1,1,.59]);
    const rim=new THREE.TorusGeometry(.202,.022,8,low?24:42);rim.translate(eye.x,eye.y,eye.z+sign*.085);add(rim,trace,'eye-socket');
    const iris=new THREE.TorusGeometry(.15,.009,6,32);iris.translate(eye.x-.025,eye.y,eye.z+sign*.13);add(iris,glow,'cyan-eye-ring');
    sphere([eye.x-.07,eye.y+.055,eye.z+sign*.134],.04,glow,'eye-glint',[1,.75,.35]);
    for(let lane=0;lane<3;lane++){
      const angle=.05+lane*.21,points=[];
      for(let i=0;i<=38;i++){
        const t=.37+i/38*.53,a=angle+Math.sin(t*7+lane)*.035;
        points.push(surface(t,sign>0?a:Math.PI-a,.025));
      }
      tube(points,.012,trace,'flank-conduit');
      for(let i=0;i<16;i++){
        const t=.385+i/16*.5,a=angle+Math.sin(t*7+lane)*.035;
        const p=surface(t,sign>0?a:Math.PI-a,.05);
        sphere(p.toArray(),i%5===0?.073:.027,glow,'flank-node');
      }
    }
    // Ventral pleats reinforce the heavy whale silhouette from below and front.
    for(let lane=0;lane<5;lane++){
      const a=-.57-lane*.20;
      tube(Array.from({length:30},(_,i)=>surface(.045+i/29*.59,sign>0?a:Math.PI-a,.02)),.018,trace,'throat-pleat');
    }
  }
  // A small aft dorsal keel, behind the cargo saddle.
  const dorsal=new THREE.Shape();dorsal.moveTo(1.8,1.43);dorsal.quadraticCurveTo(2.72,1.47,3.02,2.32);dorsal.quadraticCurveTo(3.57,1.6,3.62,.87);dorsal.closePath();
  const dorsalG=new THREE.ExtrudeGeometry(dorsal,{depth:.16,bevelEnabled:true,bevelThickness:.06,bevelSize:.06,bevelSegments:2,steps:1,curveSegments:14});dorsalG.translate(0,0,-.08);add(dorsalG,skin,'dorsal-keel');
  tube([[1.8,1.47,0],[2.6,1.63,0],[3.02,2.32,0],[3.31,1.73,0]],.018,glow,'dorsal-rim');

  function box(w,h,d,point,m,name,bevel=false,parent=group){
    let g;
    if(bevel){
      const s=new THREE.Shape();s.moveTo(-w/2,-h/2);s.lineTo(w/2,-h/2);s.lineTo(w/2,h/2);s.lineTo(-w/2,h/2);s.closePath();
      g=new THREE.ExtrudeGeometry(s,{depth:d-.07,bevelEnabled:true,bevelThickness:.035,bevelSize:.035,bevelSegments:2,steps:1});g.translate(0,0,-(d-.07)/2);
    }else g=new THREE.BoxGeometry(w,h,d);
    g.translate(...point);return add(g,m,name,parent);
  }
  // Lower the whole load a little so the upper containers stay in the whale
  // silhouette instead of floating above it. The mount still supplies the
  // shared inertial lift/roll animation below.
  const cargoVerticalOffset=-.16;
  group.userData.cargoVerticalOffset=cargoVerticalOffset;
  box(5.15,.18,2.65,[-1.25,2.04+cargoVerticalOffset,0],deck,'cargo-saddle',true,cargoMount);
  // A soft dark contact patch keeps the load visually seated on the back in
  // the catalog view. It is intentionally disabled underwater, where the
  // water material already owns the depth/readability treatment.
  const contactShadowGeometry=new THREE.PlaneGeometry(4.35,1.9);
  const contactShadowMaterial=new THREE.MeshBasicMaterial({color:0x020a11,transparent:true,opacity:.24,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});
  const contactShadow=new THREE.Mesh(contactShadowGeometry,contactShadowMaterial);
  contactShadow.name='cargo-contact-shadow';
  contactShadow.rotation.x=-Math.PI/2;
  contactShadow.position.set(-1.25,2.17+cargoVerticalOffset,0);
  contactShadow.visible=!waterUniforms;
  group.add(contactShadow);
  const containers=[];
  // Match the Docker whale logo's nine containers in a centered 4/3/2 stack.
  // Each crate spans the deck width, so the same nine containers read from
  // either side instead of duplicating the logo's visible cargo in depth.
  const slots=[
    [-2.675,0],[-1.725,0],[-.775,0],[.175,0],
    [-2.2,1],[-1.25,1],[-.3,1],
    [-1.725,2],[-.775,2],
  ];
  for(const [x,level] of slots){
    const y=2.48+level*.7+cargoVerticalOffset,w=.92,h=.68,d=2.28,z=0;
    const block=box(w,h,d,[x,y,z],cargo,'container',true,cargoMount);containers.push(block);
    for(const side of [-1,1]){
      for(let i=0;i<7;i++)box(.025,h*.8,.025,[x-w*.39+i*w*.13,y,z+side*(d/2+.037)],ribs,'container-corrugation',false,cargoMount);
      for(const a of [-1,1])box(w+.04,.025,.027,[x,y+a*h/2,z+side*(d/2+.04)],cargoAccent,'container-rail',false,cargoMount);
      box(.025,h,.027,[x-w/2,y,z+side*(d/2+.04)],cargoAccent,'container-corner',false,cargoMount);
      box(.025,h,.027,[x+w/2,y,z+side*(d/2+.04)],cargoAccent,'container-corner',false,cargoMount);
      // Three tiny status windows, not text pasted onto the creature.
      for(let i=0;i<3;i++)box(.082,.035,.018,[x-.16+i*.16,y-h*.33,z+side*(d/2+.065)],cargoGlow,'container-status',false,cargoMount);
      for(let i=0;i<3;i++){
        // The combat camera shows the whale at a fraction of model scale; a
        // sub-decimeter halo collapses to a single pixel after that projection.
        const halo=new THREE.PlaneGeometry(.96,.58);
        if(side<0)halo.rotateY(Math.PI);
        halo.translate(x-.16+i*.16,y-h*.33,z+side*(d/2+.08));
        add(halo,cargoHalo,'container-status-halo',cargoMount);
      }
    }
    for(const side of [-1,1])for(const offset of [-.20,.20])box(.027,h*.76,.027,[x+side*(w/2+.038),y,z+offset],cargoAccent,'door-bar',false,cargoMount);
  }
  sphere([-4.3,1.59,0],.12,black,'blowhole',[1.8,.4,1]);

  // All geometry is in model space: batch small details into shared materials.
  // Keep body/fins separately addressable for model inspection.
  const anatomical=new Set([body,...flippers,...flukes]);
  for(const parent of [group,cargoMount])for(const m of [...materials]){
    const batch=parts.filter(p=>p.parent===parent&&p.material===m&&!anatomical.has(p));if(batch.length<2)continue;
    const positions=[],normals=[],uvs=[];
    for(const mesh of batch){
      const g=mesh.geometry.index?mesh.geometry.toNonIndexed():mesh.geometry;
      for(const [name,out] of [['position',positions],['normal',normals],['uv',uvs]])for(const v of g.attributes[name].array)out.push(v);
      if(g!==mesh.geometry)g.dispose();mesh.parent?.remove(mesh);geometries.delete(mesh.geometry);mesh.geometry.dispose();
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
    add(g,m,'batched-'+(m===glow?'lights':m===cargo?'containers':m===cargoHalo?'container-status-halos':m===ribs?'ribs':'details'),parent);
  }
  if(habitatUniforms){
    for(const material of materials){
       const finSide=finWaterSides.get(material)??0;
       const part=finSide!==0?'fin':material===skin?'body':material===glow?'light':material===cargo||material===cargoAccent||material===cargoGlow||material===cargoHalo?'cargo':'detail';
      applyFishWater(material,habitatUniforms,part,DOCKER_WHALE_WATER_PROFILE,finSide);
    }
  }
  let disposed=false,cargoYaw=0,cargoRoll=0,cargoSide=0,cargoLift=.12,cargoLag=0,cargoPulse=0,cargoGlowOn=0,cargoMomentActive=false;
  return {
    group,body,flippers,flukes,cargoMount,containerCount:containers.length,waterUniforms:habitatUniforms,
    update(time,{power=.45,glow=1,visibility=1,combat=false,bodyPhase,bodyFrequency,bodyWavelength,effort=.38,turn=0,amplitude,tetherLoad=0,cargoMoment=false,styleDelta=1/60}={}){
      const synced=Number.isFinite(bodyPhase)&&Number.isFinite(bodyFrequency)&&bodyFrequency>0;
      uniforms.uWhalePhase.value=synced?bodyPhase:time+phase;
      uniforms.uWhaleFrequency.value=synced?bodyFrequency:.78;
      uniforms.uWhaleWavelength.value=synced&&Number.isFinite(bodyWavelength)?bodyWavelength:.94;
      uniforms.uWhaleAmplitude.value=synced&&Number.isFinite(amplitude)?Math.max(0,amplitude):clamp(power,0,1)*.1;
      uniforms.uWhaleEffort.value=clamp(effort,0,1);
      uniforms.uWhaleTurn.value=clamp(turn,-1,1);
      uniforms.uPower.value=clamp(power,0,1);uniforms.uGlow.value=clamp(glow,0,3);
      if(habitatUniforms)habitatUniforms.uFishVisibility.value=clamp(visibility,0,1);
      if(habitatUniforms)habitatUniforms.uFishCombat.value=combat?1:0;
      const dt=Number.isFinite(styleDelta)?clamp(styleDelta,0,.1):1/60;
      const load=Number.isFinite(tetherLoad)?clamp(tetherLoad,0,1):0,heavyTurn=clamp(turn,-1,1);
      if(cargoMoment&&!cargoMomentActive)cargoPulse=1;
      cargoMomentActive=!!cargoMoment;
      cargoPulse*=Math.exp(-dt*3.8);
      // Keep the container boot light readable for a few seconds after the
      // short server-authored surge ends. This is presentation-only; the
      // physical cargo pulse keeps its original decay and timing.
      cargoGlowOn+=(Number(!!cargoMoment)-cargoGlowOn)*(1-Math.exp(-dt*(cargoMoment?12:.62)));
      uniforms.uCargoPulse.value=cargoPulse;uniforms.uCargoOn.value=cargoGlowOn;
      cargoLag+=(.16*cargoPulse-cargoLag)*(1-Math.exp(-dt*9));
      const settle=1-Math.exp(-dt*1.8);
      // A heavy load resists yaw and settles down instead of bobbing like a
      // buoy. The root whale still owns the authoritative heading.
      cargoYaw+=(-heavyTurn*.13-cargoYaw)*settle;
      cargoSide+=(-heavyTurn*.12-cargoSide)*settle;
      cargoRoll+=(-heavyTurn*.045-load*.018-cargoRoll)*settle;
      cargoLift+=((.12-load*.055)-cargoLift)*(1-Math.exp(-dt*1.45));
      cargoMount.rotation.set(0,cargoYaw,cargoRoll);
      cargoMount.position.set(cargoLag,cargoLift+.035*cargoPulse,cargoSide);
    },
    get stats(){return {meshes:group.children.length,triangles:[...geometries].reduce((sum,g)=>sum+(g.index?g.index.count:g.attributes.position.count)/3,0)};},
    dispose(){if(disposed)return;disposed=true;for(const g of geometries)g.dispose();for(const m of materials)m.dispose();cargoHaloMap.dispose();contactShadowGeometry.dispose();contactShadowMaterial.dispose();group.clear();},
  };
}
