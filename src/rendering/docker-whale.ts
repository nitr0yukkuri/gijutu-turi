// @ts-nocheck -- the procedural mesh uses the vendored Three.js runtime, whose JS distribution has no declarations.
import * as THREE from '../../vendor/three.module.js';
import { applyFishWater } from './fish-water.js';

// Original Docker-inspired creature. Nose -X, back +Y, flukes spread along Z.
// DOM-free model: the same group/update/dispose contract as createGoFish.
const clamp = THREE.MathUtils.clamp;
const profile = [
  [-5.8,.04,.045,-.12],[-5.58,.65,.76,-.08],[-5.12,1.43,1.44,.05],
  [-4.3,1.91,1.87,.13],[-3.15,2.05,2.02,.14],[-1.6,2.05,2.03,.13],
  [0,1.86,1.85,.1],[1.55,1.42,1.38,.16],[2.85,.86,.77,.28],
  [3.9,.4,.35,.43],[4.75,.2,.24,.57],[5.1,.17,.23,.62],
];
const sectionCurve = new THREE.CatmullRomCurve3(profile.map(p=>new THREE.Vector3(p[0],p[1],p[2])));
const centerCurve = new THREE.CatmullRomCurve3(profile.map(p=>new THREE.Vector3(p[0],p[3],0)));
export function whaleSection(t) {
  const p=sectionCurve.getPoint(clamp(t,0,1)), c=centerCurve.getPoint(clamp(t,0,1));
  return {x:p.x,height:p.y,width:p.z,center:c.y};
}
function surface(t,a,offset=0) {
  const p=whaleSection(t);
  return new THREE.Vector3(p.x,p.center+Math.sin(a)*(p.height+offset),Math.cos(a)*(p.width+offset));
}
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
uniform float uWhaleTime;
uniform float uPower;
float lift(float x){
  float tail=smoothstep(-.5,6.9,x);
  return sin(uWhaleTime*1.25-x*.42)*tail*tail*(.32+uPower*.55);
}
vec3 swim(vec3 p){
  p.y+=lift(p.x);
  float flipper=(1.0-smoothstep(-.1,2.0,p.x))*smoothstep(1.65,4.5,abs(p.z));
  p.y+=sin(uWhaleTime*1.25-.8)*flipper*(.08+uPower*.24);
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
    shader.fragmentShader='uniform float uWhaleTime; uniform float uGlow; varying vec3 vWhale;\n'+shader.fragmentShader;
    if(mode==='skin')shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`
      #include <color_fragment>
      float belly=1.0-smoothstep(-1.65,-.42,vWhale.y);
      float grain=fract(sin(dot(floor(vWhale*120.),vec3(17.13,63.77,41.19)))*43758.5453);
      float mottling=sin(vWhale.x*3.2+sin(vWhale.z*4.1))*sin(vWhale.y*7.3+vWhale.x*.6);
      vec3 ink=mix(vec3(.009,.065,.135),vec3(.055,.23,.31),smoothstep(-.2,1.8,vWhale.y));
      diffuseColor.rgb=mix(ink,vec3(.20,.43,.47),belly*.75);
      diffuseColor.rgb*=.91+grain*.07+mottling*.055;
    `);
    if(mode==='glow')shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\ndiffuseColor.rgb*=uGlow*(.87+.13*sin(vWhale.x*1.7-uWhaleTime*1.2));');
  };
  material.customProgramCacheKey=()=>`docker-whale-v1-${mode}`;
  return material;
}

export function createDockerWhale({detail='high',phase=0,waterUniforms}={}) {
  const low=detail==='low',group=new THREE.Group();group.name='Dockerクジラ';
  const habitatUniforms=waterUniforms?{...waterUniforms,uFishCenter:{value:group.position},uFishVisibility:{value:1}}:null;
  const uniforms={uWhaleTime:{value:phase},uPower:{value:.45},uGlow:{value:1}};
  const geometries=new Set(),materials=new Set(),parts=[];
  const skin=animate(new THREE.MeshPhysicalMaterial({color:0xffffff,roughness:.37,metalness:.18,clearcoat:.65,clearcoatRoughness:.24,envMapIntensity:.55}),uniforms,'skin');
  const glow=animate(new THREE.MeshBasicMaterial({color:new THREE.Color(.04,1.65,2.8),toneMapped:false}),uniforms,'glow');
  const trace=animate(new THREE.MeshStandardMaterial({color:0x197b9e,emissive:0x14769c,emissiveIntensity:.55,roughness:.3,metalness:.6}),uniforms);
  const black=animate(new THREE.MeshPhysicalMaterial({color:0x010b14,roughness:.12,clearcoat:1,metalness:.15}),uniforms);
  const cargo=new THREE.MeshPhysicalMaterial({color:0x0c4565,roughness:.60,metalness:.32,clearcoat:.12,clearcoatRoughness:.55});
  const ribs=new THREE.MeshStandardMaterial({color:0x237596,roughness:.4,metalness:.6});
  const deck=new THREE.MeshStandardMaterial({color:0x061b29,roughness:.48,metalness:.65});
  function add(g,m,name){
    geometries.add(g);materials.add(m);const mesh=new THREE.Mesh(g,m);mesh.name=name;mesh.frustumCulled=false;group.add(mesh);parts.push(mesh);return mesh;
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
    flippers.push(add(makeFin([[-2.5,-.6,1.4,.6,.23],[-1.8,-.9,2.1,.79,.19],[-.85,-1.34,3.05,.65,.12],[.1,-1.48,4.05,.33,.055],[.6,-1.38,4.55,.008,.008]],sign,low),skin,'pectoral-'+sign));
    flukes.push(add(makeFin([[4.65,.6,0,.43,.17],[5.1,.65,.7,.83,.2],[5.6,.69,1.9,.9,.16],[6.25,.87,3.0,.62,.09],[6.85,1.12,3.75,.008,.008]],sign,low),skin,'horizontal-fluke-'+sign));
    tube([[4.35,.65,.23*sign],[4.5,.72,.7*sign],[4.77,.76,1.8*sign],[5.69,.92,3.0*sign],[6.85,1.12,3.75*sign]],.025,glow,'fluke-rim');
    tube([[-2.8,-.5,1.7*sign],[-2.48,-.91,2.1*sign],[-1.42,-1.35,3.05*sign],[-.19,-1.47,4.05*sign],[.6,-1.38,4.55*sign]],.025,glow,'flipper-rim');
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

  function box(w,h,d,point,m,name,bevel=false){
    let g;
    if(bevel){
      const s=new THREE.Shape();s.moveTo(-w/2,-h/2);s.lineTo(w/2,-h/2);s.lineTo(w/2,h/2);s.lineTo(-w/2,h/2);s.closePath();
      g=new THREE.ExtrudeGeometry(s,{depth:d-.07,bevelEnabled:true,bevelThickness:.035,bevelSize:.035,bevelSegments:2,steps:1});g.translate(0,0,-(d-.07)/2);
    }else g=new THREE.BoxGeometry(w,h,d);
    g.translate(...point);return add(g,m,name);
  }
  box(5.15,.18,2.65,[-1.25,2.04,0],deck,'cargo-saddle',true);
  const containers=[];
  const slots=[[-2.95,0],[-1.3,0],[.35,0],[-2.12,1],[-.47,1]];
  for(const [x,level] of slots)for(const z of [-.68,.68]){
    const y=2.68+level*1.11,w=1.49,h=.95,d=1.21;
    const block=box(w,h,d,[x,y,z],cargo,'container',true);containers.push(block);
    for(const side of [-1,1]){
      for(let i=0;i<7;i++)box(.025,h*.8,.025,[x-w*.39+i*w*.13,y,z+side*(d/2+.037)],ribs,'container-corrugation');
      for(const a of [-1,1])box(w+.04,.025,.027,[x,y+a*h/2,z+side*(d/2+.04)],trace,'container-rail');
      box(.025,h,.027,[x-w/2,y,z+side*(d/2+.04)],trace,'container-corner');
      box(.025,h,.027,[x+w/2,y,z+side*(d/2+.04)],trace,'container-corner');
      // Three tiny status windows, not text pasted onto the creature.
      for(let i=0;i<3;i++)box(.082,.035,.018,[x-.40+i*.16,y-.32,z+side*(d/2+.065)],glow,'container-status');
    }
    for(const side of [-1,1])for(const offset of [-.20,.20])box(.027,.73,.027,[x+side*(w/2+.038),y,z+offset],ribs,'door-bar');
  }
  sphere([-4.3,1.93,0],.12,black,'blowhole',[1.8,.4,1]);

  // All geometry is in model space: batch small details into shared materials.
  // Keep body/fins separately addressable for model inspection.
  const anatomical=new Set([body,...flippers,...flukes]);
  for(const m of [...materials]){
    const batch=parts.filter(p=>p.material===m&&!anatomical.has(p));if(batch.length<2)continue;
    const positions=[],normals=[],uvs=[];
    for(const mesh of batch){
      const g=mesh.geometry.index?mesh.geometry.toNonIndexed():mesh.geometry;
      for(const [name,out] of [['position',positions],['normal',normals],['uv',uvs]])for(const v of g.attributes[name].array)out.push(v);
      if(g!==mesh.geometry)g.dispose();group.remove(mesh);geometries.delete(mesh.geometry);mesh.geometry.dispose();
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
    add(g,m,'batched-'+(m===glow?'lights':m===cargo?'containers':m===ribs?'ribs':'details'));
  }
  if(habitatUniforms){
    for(const material of materials){
      const part=material===skin?'body':material===glow?'light':'detail';
      applyFishWater(material,habitatUniforms,part);
    }
  }
  let disposed=false;
  return {
    group,body,flippers,flukes,containerCount:containers.length,waterUniforms:habitatUniforms,
    update(time,{power=.45,glow=1,visibility=1}={}){uniforms.uWhaleTime.value=time+phase;uniforms.uPower.value=clamp(power,0,1);uniforms.uGlow.value=clamp(glow,0,3);if(habitatUniforms)habitatUniforms.uFishVisibility.value=clamp(visibility,0,1);},
    get stats(){return {meshes:group.children.length,triangles:[...geometries].reduce((sum,g)=>sum+(g.index?g.index.count:g.attributes.position.count)/3,0)};},
    dispose(){if(disposed)return;disposed=true;for(const g of geometries)g.dispose();for(const m of materials)m.dispose();group.clear();},
  };
}
