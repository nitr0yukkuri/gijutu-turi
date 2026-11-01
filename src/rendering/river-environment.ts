// @ts-nocheck -- imperative scene construction against the vendored Three.js runtime.
import * as THREE from '../../vendor/three.module.js';
import { riverBankHeightAt, riverCenterAt, riverHalfWidthAt } from './river-channel.js';
import { RIVER_BANK_VIEW } from './river-bank-view.js';
import { createRiverNormalTexture } from './river-water.js';

const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const smooth=(a,b,n)=>{const t=clamp((n-a)/(b-a),0,1);return t*t*(3-2*t);};
const randomSource=seed=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
const noise2=(x,y)=>{
  const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy,u=fx*fx*(3-2*fx),v=fy*fy*(3-2*fy);
  const hash=(a,b)=>{let n=Math.imul(a,374761393)+Math.imul(b,668265263);n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967296;};
  const a=hash(ix,iy),b=hash(ix+1,iy),c=hash(ix,iy+1),d=hash(ix+1,iy+1);
  return (a+(b-a)*u)*(1-v)+(c+(d-c)*u)*v;
};
const bankHeight=riverBankHeightAt;

function canvasTexture(width,height,paint){
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  paint(canvas.getContext('2d'),width,height);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  texture.anisotropy=4;return texture;
}

function groundTexture(){
  return canvasTexture(256,256,(ctx,w,h)=>{
    const random=randomSource(612);ctx.fillStyle='#9b9f80';ctx.fillRect(0,0,w,h);
    for(let i=0;i<11000;i++){
      const tone=Math.floor(70+random()*90);ctx.fillStyle=`rgba(${tone+8},${tone+14},${Math.floor(tone*.65)},${.12+random()*.3})`;
      ctx.fillRect(random()*w,random()*h,.5+random()*3,.5+random()*2);
    }
    for(let i=0;i<900;i++){
      const x=random()*w,y=random()*h;ctx.strokeStyle=random()>.4?'#929b6a70':'#48533765';ctx.lineWidth=.4+random();
      ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+(random()-.5)*7,y-2-random()*6);ctx.stroke();
    }
  });
}

function rockTexture(){
  return canvasTexture(256,256,(ctx,w,h)=>{
    const image=ctx.createImageData(w,h),pixels=image.data;
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      const coarse=noise2(x*.035+4,y*.028+8),middle=noise2(x*.11+3,y*.1+2),fine=noise2(x*.63+1,y*.63+9);
      const seam=1-smooth(.018,.07,Math.abs(noise2(x*.028+y*.009,y*.023)-.5));
      const moss=smooth(.6,.83,noise2(x*.027+22,y*.033+7));
      const tone=(105+coarse*56+middle*28+(fine-.5)*28)*(1-seam*.24),i=(y*w+x)*4;
      pixels[i]=tone-moss*20;pixels[i+1]=tone+5+moss*3;pixels[i+2]=tone-1-moss*21;pixels[i+3]=255;
    }
    ctx.putImageData(image,0,0);
  });
}

function forestTexture(){
  return canvasTexture(256,256,(ctx,w,h)=>{
    const random=randomSource(2097);ctx.fillStyle='#6d7e57';ctx.fillRect(0,0,w,h);
    for(let index=0;index<1800;index++){
      const x=random()*w,y=random()*h,r=1+random()*4;
      ctx.fillStyle=['#4a6140','#536a46','#5c734b','#687e53','#718359'][index%5];
      ctx.beginPath();ctx.ellipse(x,y,r,r*1.45,0,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#a1a66b30';ctx.beginPath();ctx.ellipse(x-r*.2,y-r*.5,r*.7,r*.6,0,0,Math.PI*2);ctx.fill();
    }
  });
}

function treeTexture(seed){
  return canvasTexture(384,512,(ctx,w,h)=>{
    const random=randomSource(seed);const trunkX=w*.5;
    ctx.strokeStyle='#594f32';ctx.lineCap='round';ctx.lineWidth=7;
    ctx.beginPath();ctx.moveTo(trunkX,h-2);ctx.lineTo(trunkX-4,h*.36);ctx.stroke();
    for(let i=0;i<13;i++){
      const y=h*(.38+random()*.41),side=i%2?1:-1;
      ctx.lineWidth=3+random()*4;ctx.beginPath();ctx.moveTo(trunkX,y);ctx.lineTo(trunkX+side*(32+random()*80),y-38-random()*65);ctx.stroke();
    }
    const clumps=[[-.19,.37,.26,.25],[.19,.4,.27,.26],[0,.23,.29,.24],[-.22,.59,.23,.19],[.2,.6,.24,.2],[0,.47,.35,.3]].map(c=>[c[0]+(random()-.5)*.12,c[1]+(random()-.5)*.12,c[2]*(.85+random()*.25),c[3]*(.9+random()*.2)]);
    const colors=['#294e24','#355c28','#466d2d','#557d34','#648b3b','#77964a'];
    for(let pass=0;pass<3;pass++)for(let i=0;i<2100;i++){
      const c=clumps[Math.floor(random()*clumps.length)],angle=random()*Math.PI*2,r=Math.sqrt(random());
      const x=w*(.5+c[0]+Math.cos(angle)*r*c[2]),y=h*(c[1]+Math.sin(angle)*r*c[3]);
      if(x<3||x>w-3||y<3||y>h*.84)continue;
      ctx.fillStyle=colors[clamp(Math.floor(random()*3+pass),0,colors.length-1)];
      ctx.beginPath();ctx.ellipse(x,y,2+random()*5,1.5+random()*3.7,random()*2,0,Math.PI*2);ctx.fill();
    }
  });
}

function reedTexture(){
  return canvasTexture(256,256,(ctx,w,h)=>{
    const random=randomSource(1811);ctx.lineCap='round';
    for(let i=0;i<52;i++){
      const x=w*(.15+random()*.7),top=h*(.03+random()*.62),bend=(random()-.5)*55;
      ctx.strokeStyle=['#7b8b39','#9b9d4c','#526c2b','#b1aa5c'][i%4];ctx.lineWidth=1+random()*2.5;
      ctx.beginPath();ctx.moveTo(x,h);ctx.quadraticCurveTo(x+bend*.4,h*.55,x+bend,top);ctx.stroke();
      if(i%4===0){ctx.strokeStyle='#c1b47b';ctx.lineWidth=2.8;ctx.beginPath();ctx.moveTo(x+bend,top);ctx.lineTo(x+bend*.93,top+14);ctx.stroke();}
    }
  });
}

function makeBank(side,texture){
  const distances=[0,.6,1.7,3.5,6.5,11,18,29,45,70,110],rows=99;
  const positions=[],colors=[],uvs=[],indices=[];
  const grass=new THREE.Color(0xa2b77a),soil=new THREE.Color(0xc1b69c),wet=new THREE.Color(0x899783);
  for(let row=0;row<=rows;row++){
    const z=28-row*3;
    for(const d of distances){
      const x=riverCenterAt(z)+side*(riverHalfWidthAt(z)+d),y=bankHeight(side,d,z);
      positions.push(x,y,z);uvs.push(x*.16,z*.16);
      const c=d<.8?wet.clone():d<2.5?soil.clone().lerp(grass,smooth(.8,3,d)):grass.clone();
      c.multiplyScalar(.8+.18*Math.sin(z*.18+d*.8)+.11*Math.cos(z*.39-d*.55));colors.push(c.r,c.g,c.b);
    }
  }
  const columns=distances.length;
  for(let row=0;row<rows;row++)for(let col=0;col<columns-1;col++){
    const a=row*columns+col,b=a+1,c=a+columns,d=c+1;
    if(side<0)indices.push(a,b,c,b,d,c);else indices.push(a,c,b,b,c,d);
  }
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geo.setIndex(indices);geo.computeVertexNormals();
  return new THREE.Mesh(geo,new THREE.MeshStandardMaterial({map:texture,vertexColors:true,roughness:1,side:THREE.DoubleSide}));
}

function makeMountain(z,span,height,seed,color,texture){
  const random=randomSource(seed),positions=[],colors=[],uvs=[],indices=[],columns=160,rows=30;
  const base=new THREE.Color(color);
  for(let row=0;row<=rows;row++)for(let col=0;col<=columns;col++){
    const x=(col/columns-.5)*span,depth=row/rows;
    const ridge=.45+.23*Math.sin(x*.021+seed)+.13*Math.sin(x*.051+seed*.4)+.07*Math.cos(x*.103-seed);
    const gullies=(Math.sin(x*.087+depth*4)+Math.cos(x*.153-depth*13))*2.5*Math.sin(depth*Math.PI);
    const y=Math.sin(depth*Math.PI)*height*ridge+Math.sin(x*.05+depth*8)*3+gullies;
    positions.push(x,Math.max(.2,y),z-depth*span*.3);uvs.push(x*.065,depth*span*.024);
    const c=base.clone().multiplyScalar(.76+random()*.26+depth*.08);colors.push(c.r,c.g,c.b);
  }
  for(let row=0;row<rows;row++)for(let col=0;col<columns;col++){
    const a=row*(columns+1)+col,b=a+1,c=a+columns+1,d=c+1;indices.push(a,c,b,b,c,d);
  }
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geo.setIndex(indices);geo.computeVertexNormals();
  return new THREE.Mesh(geo,new THREE.MeshLambertMaterial({map:texture,vertexColors:true,side:THREE.DoubleSide}));
}

function rockGeometry(seed){
  const geo=new THREE.SphereGeometry(1,36,26),position=geo.attributes.position,colors=[];
  const moss=new THREE.Color(0xa3b77a),stone=new THREE.Color(0xd0d8d0),wet=new THREE.Color(0x84998c);
  for(let i=0;i<position.count;i++){
    const x=position.getX(i),y=position.getY(i),z=position.getZ(i);
    const distortion=1+.12*Math.sin(x*3+z*4+seed)+.055*Math.sin(y*13-x*8+z*11+seed)+.025*Math.sin(x*27-y*17+z*19);
    position.setXYZ(i,x*distortion,Math.max(-.65,y*distortion),z*distortion);
    const c=stone.clone().lerp(moss,smooth(.2,.82,y)*(.65+.25*Math.sin(x*13+seed))).lerp(wet,1-smooth(-.6,-.12,y));
    c.multiplyScalar(.83+.15*Math.sin(x*21+z*17+seed));colors.push(c.r,c.g,c.b);
  }
  geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geo.computeVertexNormals();return geo;
}

export function createRiverEnvironment({reducedMotion=false}={}){
  let disposed=false;
  const scene=new THREE.Scene();scene.fog=new THREE.FogExp2(0xc4dfe1,.0028);
  const terrain=new THREE.Group();terrain.rotation.y=RIVER_BANK_VIEW.yaw;
  terrain.position.set(RIVER_BANK_VIEW.terrainX,0,RIVER_BANK_VIEW.terrainZ);scene.add(terrain);
  scene.add(new THREE.HemisphereLight(0xe8f4ff,0x465337,2.05));
  const sun=new THREE.DirectionalLight(0xfff1ca,1.7);sun.position.set(-35,60,25);scene.add(sun);
  const textures=[],time={value:0},random=randomSource(81923),scratch=new THREE.Object3D();
  const loadTexture=(url,color,fallback)=>{
    const canvas=document.createElement('canvas');canvas.width=canvas.height=1;
    const context=canvas.getContext('2d');context.fillStyle=fallback;context.fillRect(0,0,1,1);
    const texture=new THREE.CanvasTexture(canvas);texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
    texture.colorSpace=color?THREE.SRGBColorSpace:THREE.NoColorSpace;texture.anisotropy=4;textures.push(texture);
    new THREE.ImageLoader().load(url,image=>{
      if(disposed)return;
      // Reallocate immutable GPU storage when replacing the 1px placeholder.
      texture.dispose();texture.image=image;texture.needsUpdate=true;
    },undefined,()=>console.warn('River material could not be loaded.'));
    return texture;
  };
  const bedTexture=loadTexture(new URL('../../assets/river/river-bed-color.webp',import.meta.url).href,true,'#817d68');
  const rockColor=loadTexture(new URL('../../assets/river/mossy-rock-color.webp',import.meta.url).href,true,'#889180');
  const rockNormal=loadTexture(new URL('../../assets/river/mossy-rock-normal.webp',import.meta.url).href,false,'#8080ff');
  const rockRoughness=loadTexture(new URL('../../assets/river/mossy-rock-roughness.webp',import.meta.url).href,false,'#dddddd');
  const waterNormalTexture=createRiverNormalTexture();textures.push(waterNormalTexture);
  const ground=groundTexture();ground.wrapS=ground.wrapT=THREE.RepeatWrapping;textures.push(ground);
  terrain.add(makeBank(-1,ground),makeBank(1,ground));
  const rocks=rockTexture();rocks.wrapS=rocks.wrapT=THREE.RepeatWrapping;rocks.repeat.set(2.5,2.5);textures.push(rocks);
  const forest=forestTexture();forest.wrapS=forest.wrapT=THREE.RepeatWrapping;textures.push(forest);
  terrain.add(makeMountain(-490,1450,175,32,0xa6c2bc,rocks),makeMountain(-310,950,125,18,0xb5c6b4,forest),makeMountain(-196,650,60,7,0xb0c198,forest));
  const rockMaterial=new THREE.MeshStandardMaterial({map:rockColor,normalMap:rockNormal,roughnessMap:rockRoughness,roughness:.96});
  rockMaterial.onBeforeCompile=shader=>{
    const varyings='varying vec3 vRiverRockWorld;\nvarying vec3 vRiverRockNormal;\n';
    shader.vertexShader=varyings+shader.vertexShader
      .replace('#include <begin_vertex>','#include <begin_vertex>\nvRiverRockWorld=(modelMatrix*vec4(transformed,1.0)).xyz;')
      .replace('#include <defaultnormal_vertex>','#include <defaultnormal_vertex>\nvRiverRockNormal=inverseTransformDirection(transformedNormal,viewMatrix);');
    shader.fragmentShader=varyings+`
vec3 riverRockWeights(){vec3 weights=pow(abs(normalize(vRiverRockNormal)),vec3(4.0));return weights/max(dot(weights,vec3(1.0)),0.001);}
vec4 riverRockSample(sampler2D surfaceMap,vec3 weights){vec3 p=vRiverRockWorld/3.0;return texture2D(surfaceMap,p.zy)*weights.x+texture2D(surfaceMap,p.xz)*weights.y+texture2D(surfaceMap,p.xy)*weights.z;}
`+shader.fragmentShader
      .replace('#include <clipping_planes_fragment>','#include <clipping_planes_fragment>\nif(vRiverRockWorld.y<0.025)discard;')
      .replace('#include <map_fragment>','diffuseColor*=riverRockSample(map,riverRockWeights());\ndiffuseColor.rgb*=mix(0.58,1.0,smoothstep(0.04,1.1,vRiverRockWorld.y));')
      .replace('#include <roughnessmap_fragment>','float roughnessFactor=roughness*riverRockSample(roughnessMap,riverRockWeights()).g;\nroughnessFactor=mix(0.32,roughnessFactor,smoothstep(0.03,0.85,vRiverRockWorld.y));')
      .replace('#include <normal_fragment_maps>',`
vec3 rockWeights=riverRockWeights(),rockPoint=vRiverRockWorld/3.0;
vec2 rockX=texture2D(normalMap,rockPoint.zy).xy*2.0-1.0;
vec2 rockY=texture2D(normalMap,rockPoint.xz).xy*2.0-1.0;
vec2 rockZ=texture2D(normalMap,rockPoint.xy).xy*2.0-1.0;
vec3 rockBase=normalize(vRiverRockNormal);
vec3 rockDetail=vec3(rockY.x*rockWeights.y+rockZ.x*rockWeights.z,rockX.y*rockWeights.x+rockZ.y*rockWeights.z,rockX.x*rockWeights.x+rockY.y*rockWeights.y);
rockDetail-=rockBase*dot(rockBase,rockDetail);
normal=normalize(mat3(viewMatrix)*normalize(rockBase+rockDetail*0.6));
`);
  };
  rockMaterial.customProgramCacheKey=()=> 'river-rock-triplanar-v2';
  const rockForms=[rockGeometry(3),rockGeometry(17),rockGeometry(39)];
  const rockPlacements=[[30,7,-63,17,16,24],[28,4,-40,8,7,11],[31,7,-92,12,14,16],[-26,1,-46,3,2.6,5],[-24,.8,-27,2,1.6,3],[-30,1.5,-79,5,3.3,5.5],[23,.6,-17,2.1,1.7,3.3],[-17,0,-104,3.8,2.6,3.2],[17,.2,-122,4,3.7,6]];
  rockPlacements.forEach((p,index)=>{const mesh=new THREE.Mesh(rockForms[index%3],rockMaterial);mesh.position.set(p[0],p[1],p[2]);mesh.scale.set(p[3],p[4],p[5]);mesh.rotation.y=index*1.73;terrain.add(mesh);});

  const treePositions=[];
  for(let index=0;index<230;index++){
    const side=index%2?1:-1,z=-7-random()*246,d=5+Math.pow(random(),1.3)*57;
    const x=riverCenterAt(z)+side*(riverHalfWidthAt(z)+d);
    if(side>0&&z<-26&&z>-110&&d<24)continue;
    if(Math.hypot(x-RIVER_BANK_VIEW.riverX,z-RIVER_BANK_VIEW.riverZ)<8)continue;
    treePositions.push({x,y:bankHeight(side,d,z)-.1,z,height:z>-45?5+random()*5:6+random()*9,width:.5+random()*.35,tint:.7+random()*.25,variant:index%4});
  }
  for(let index=0;index<35;index++){
    const side=index%2?1:-1,z=-8-random()*145,d=2.2+random()*3;
    treePositions.push({x:riverCenterAt(z)+side*(riverHalfWidthAt(z)+d),y:bankHeight(side,d,z)-.5,z,height:1.8+random()*2.3,width:1.1+random()*.35,tint:.72+random()*.2,variant:index%4});
  }
  for(let variant=0;variant<4;variant++){
    const map=treeTexture(1101+variant*97);textures.push(map);
    const material=new THREE.MeshBasicMaterial({map,alphaTest:.38,side:THREE.DoubleSide,fog:true});
    const trees=treePositions.filter(tree=>tree.variant===variant),mesh=new THREE.InstancedMesh(new THREE.PlaneGeometry(1,1),material,trees.length*2);
    let instance=0;
    for(const tree of trees)for(const cross of [-.43,.43]){
      scratch.position.set(tree.x,tree.y+tree.height*.5,tree.z);scratch.rotation.set(0,Math.atan2(-tree.x,7-tree.z)+cross,0);scratch.scale.set(tree.height*tree.width,tree.height,1);scratch.updateMatrix();mesh.setMatrixAt(instance,scratch.matrix);
      mesh.setColorAt(instance,new THREE.Color().setRGB(tree.tint,tree.tint,tree.tint*.94));instance++;
    }
    mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();terrain.add(mesh);
  }

  const reeds=reedTexture();textures.push(reeds);
  const reedMaterial=new THREE.MeshBasicMaterial({map:reeds,alphaTest:.32,side:THREE.DoubleSide,fog:true});
  reedMaterial.onBeforeCompile=shader=>{
    shader.uniforms.uRiverWind=time;
    shader.vertexShader='uniform float uRiverWind;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\ntransformed.x+=sin(uRiverWind*1.35+instanceMatrix[3].x*.51+instanceMatrix[3].z*.28)*pow(position.y+.5,2.0)*.035;');
  };
  reedMaterial.customProgramCacheKey=()=> 'river-reeds-v1';
  const reedMesh=new THREE.InstancedMesh(new THREE.PlaneGeometry(1,1),reedMaterial,640);
  for(let index=0;index<640;index++){
    const side=index%2?1:-1,z=-5-random()*192,d=.25+random()*2.2,height=.55+random()*1.2;
    const x=riverCenterAt(z)+side*(riverHalfWidthAt(z)+d);
    scratch.position.set(x,bankHeight(side,d,z)+height*.48,z);scratch.rotation.set(0,random()*Math.PI,0);scratch.scale.set(.7+random()*1.15,height,1);scratch.updateMatrix();reedMesh.setMatrixAt(index,scratch.matrix);
    reedMesh.setColorAt(index,new THREE.Color().setHSL(.17+random()*.04,.23,.65+random()*.15));
  }
  reedMesh.instanceMatrix.needsUpdate=true;reedMesh.computeBoundingSphere();terrain.add(reedMesh);

  const reflectionTarget=new THREE.WebGLRenderTarget(512,288,{type:THREE.HalfFloatType,depthBuffer:true});
  const reflectionCamera=new THREE.PerspectiveCamera(),reflectionMatrix=new THREE.Matrix4(),reflectionLook=new THREE.Vector3(),reflectionSize=new THREE.Vector2(),savedClear=new THREE.Color();
  const bias=new THREE.Matrix4().set(.5,0,0,.5,0,.5,0,.5,0,0,.5,.5,0,0,0,1);
  return {
    scene,
    reflectionTexture:reflectionTarget.texture,
    reflectionMatrix,
    bedTexture,
    waterNormalTexture,
    update(seconds){time.value=reducedMotion?0:seconds;},
    renderReflection(renderer,camera){
      renderer.getDrawingBufferSize(reflectionSize);
      const width=Math.min(640,Math.max(128,Math.round(reflectionSize.x*.4))),height=Math.max(96,Math.round(width*reflectionSize.y/reflectionSize.x));
      if(reflectionTarget.width!==width||reflectionTarget.height!==height)reflectionTarget.setSize(width,height);
      reflectionCamera.copy(camera,false);reflectionCamera.position.copy(camera.position);reflectionCamera.position.y=-camera.position.y;
      camera.getWorldDirection(reflectionLook).add(camera.position);reflectionLook.y=-reflectionLook.y;
      reflectionCamera.up.set(0,-1,0);reflectionCamera.lookAt(reflectionLook);reflectionCamera.updateMatrixWorld();
      reflectionMatrix.copy(bias).multiply(reflectionCamera.projectionMatrix).multiply(reflectionCamera.matrixWorldInverse);
      const previous=renderer.getRenderTarget(),alpha=renderer.getClearAlpha();renderer.getClearColor(savedClear);
      renderer.setRenderTarget(reflectionTarget);renderer.setClearColor(0xbcdde5,1);renderer.clear();renderer.render(scene,reflectionCamera);
      renderer.setRenderTarget(previous);renderer.setClearColor(savedClear,alpha);
    },
    dispose(){
      disposed=true;
      const geometries=new Set(),materials=new Set();scene.traverse(object=>{if(object.geometry)geometries.add(object.geometry);if(object.material)for(const material of Array.isArray(object.material)?object.material:[object.material])materials.add(material);});
      for(const geometry of geometries)geometry.dispose();for(const material of materials)material.dispose();for(const texture of textures)texture.dispose();reflectionTarget.dispose();scene.clear();
    },
  };
}
