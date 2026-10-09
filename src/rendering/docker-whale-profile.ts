import * as THREE from '../../vendor/three.module.js';

const clamp = THREE.MathUtils.clamp;
const profile = [
  [-5.8,.03,.035,-.12],[-5.58,.42,.47,-.08],[-5.12,.98,.96,.05],
  [-4.3,1.4,1.34,.13],[-3.15,1.67,1.55,.14],[-1.6,1.72,1.58,.13],
  [0,1.58,1.47,.1],[1.55,1.28,1.16,.16],[2.85,.72,.64,.28],
  [3.9,.33,.30,.43],[4.75,.15,.17,.57],[5.1,.12,.14,.62],
];
const sectionCurve = new THREE.CatmullRomCurve3(profile.map(p=>new THREE.Vector3(p[0],p[1],p[2])));
const centerCurve = new THREE.CatmullRomCurve3(profile.map(p=>new THREE.Vector3(p[0],p[3],0)));

export function whaleSection(t:number) {
  const p=sectionCurve.getPoint(clamp(t,0,1)), c=centerCurve.getPoint(clamp(t,0,1));
  return {x:p.x,height:p.y,width:p.z,center:c.y};
}

export function whaleSurface(t:number,a:number,offset=0,target=new THREE.Vector3()) {
  const p=whaleSection(t);
  return target.set(p.x,p.center+Math.sin(a)*(p.height+offset),Math.cos(a)*(p.width+offset));
}

export function setDockerWhaleMouthAnchor(target:THREE.Vector3,side=1) {
  return whaleSurface(.06,side>=0?-.24:Math.PI+.24,.055,target);
}
