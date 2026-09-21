// @ts-nocheck -- the procedural mesh uses the vendored Three.js runtime, whose JS distribution has no declarations.
import * as THREE from '../../vendor/three.module.js';

// Original procedural model. See docs/go-fish-design.md for study references.
// Local axes: nose = -X, dorsal = +Y, left flank = +Z. No browser dependency.
const TAU = Math.PI * 2;
const profile = [
  [-1.86, .018, .016, -.012], [-1.67, .19, .12, .016],
  [-1.38, .34, .22, .041], [-.94, .475, .305, .045],
  [-.37, .51, .32, .034], [.23, .43, .282, .018],
  [.79, .28, .192, .005], [1.28, .125, .097, 0],
  [1.72, .061, .052, 0], [1.9, .052, .041, 0],
];
const profileCurve = new THREE.CatmullRomCurve3(profile.map(p => new THREE.Vector3(p[0], p[1], p[2])), false, 'centripetal');
const centerCurve = new THREE.CatmullRomCurve3(profile.map(p => new THREE.Vector3(p[0], p[3], 0)), false, 'centripetal');
const clamp = THREE.MathUtils.clamp;
const vector = p => new THREE.Vector3(...p);
const curve = points => new THREE.CatmullRomCurve3(points.map(vector), false, 'centripetal');

export function bodySection(t) {
  const point = profileCurve.getPoint(clamp(t, 0, 1));
  const center = centerCurve.getPoint(clamp(t, 0, 1));
  return { x: point.x, height: point.y, width: point.z, center: center.y };
}

function bodySurface(t, angle, extra = 0) {
  const p = bodySection(t);
  return new THREE.Vector3(p.x, p.center + Math.sin(angle) * (p.height + extra), Math.cos(angle) * (p.width + extra));
}

function makeBodyGeometry(detail) {
  const rings = detail === 'low' ? 64 : 112, sides = detail === 'low' ? 32 : 56;
  const positions = [], uvs = [], indices = [];
  for (let i = 0; i <= rings; i++) {
    for (let j = 0; j <= sides; j++) {
      const p = bodySurface(i / rings, j / sides * TAU);
      positions.push(p.x, p.y, p.z); uvs.push(i / rings, j / sides);
    }
  }
  for (let i = 0; i < rings; i++) for (let j = 0; j < sides; j++) {
    const a = i * (sides + 1) + j, b = a + sides + 1;
    indices.push(a, b, a + 1, a + 1, b, b + 1);
  }
  // Small end caps rather than open geometry at the mouth/peduncle.
  for (const [ring, reverse] of [[0, false], [rings, true]]) {
    const section = bodySection(ring / rings), center = positions.length / 3;
    positions.push(section.x, section.center, 0); uvs.push(ring / rings, .5);
    for (let j = 0; j < sides; j++) {
      const a = ring * (sides + 1) + j;
      indices.push(center, reverse ? a + 1 : a, reverse ? a : a + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  return geometry;
}

// A single continuous lateral wave is shared by every anatomical part. Fin
// membranes add a small delayed flutter instead of rotating rigid triangles.
const deformation = `
uniform float uSwimTime;
uniform float uSwimFrequency;
uniform float uSwimPower;
uniform float uGlow;
float swimPhase() { return uSwimTime * uSwimFrequency; }
float bendZ(float x) {
  float s = clamp((x + 1.45) / 4.8, 0.0, 1.0);
  return sin(s * 6.6 - swimPhase()) * s * s * (0.18 + uSwimPower * 0.43);
}
vec3 swimPosition(vec3 p, float fin) {
  p.z += bendZ(p.x);
  p.z += sin(p.x * 3.0 + p.y * 2.1 - swimPhase()) * fin * 0.07;
  return p;
}
vec3 swimNormal(vec3 p, vec3 n, float fin) {
  float slope = (bendZ(p.x + .003) - bendZ(p.x - .003)) / .006;
  slope += cos(p.x * 3.0 + p.y * 2.1 - swimPhase()) * fin * .21;
  vec3 deformed = vec3(n.x - slope * n.z, n.y, n.z);
  return deformed / max(length(deformed), .00001);
}`;

function animateMaterial(material, uniforms, mode = 'plain') {
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = deformation + '\nattribute float aFin; varying vec2 vFishUv; varying vec3 vFishLocal;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nobjectNormal = swimNormal(position, objectNormal, aFin);');
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvFishUv = uv; vFishLocal = position; transformed = swimPosition(position, aFin);');
    shader.fragmentShader = 'uniform float uSwimTime; uniform float uSwimFrequency; uniform float uGlow; float swimPhase() { return uSwimTime * uSwimFrequency; } varying vec2 vFishUv; varying vec3 vFishLocal;\n' + shader.fragmentShader;
    if (mode === 'body') {
      shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
        #include <color_fragment>
        // Staggered organic scales, not a mesh wireframe.
        vec2 cell = vFishUv * vec2(31.0, 22.0);
        vec2 origin = floor(cell), within = fract(cell);
        float nearest = 10.0, second = 10.0;
        for(int row=-1;row<=1;row++) for(int col=-1;col<=1;col++) {
          vec2 offset=vec2(float(col),float(row));
          vec2 id=origin+offset;
          vec2 jitter=fract(sin(vec2(dot(id,vec2(127.1,311.7)),dot(id,vec2(269.5,183.3))))*43758.5453);
          vec2 toCell=offset+.5+(jitter-.5)*.38-within;
          toCell.x+=mod(id.y,2.0)*.28;
          float distanceToCell=dot(toCell,toCell);
          if(distanceToCell<nearest){second=nearest;nearest=distanceToCell;}else second=min(second,distanceToCell);
        }
        float scaleDistance=sqrt(nearest);
        float border=sqrt(second)-scaleDistance;
        float aa=max(fwidth(border),.008);
        float scaleRim=1.0-smoothstep(.012,.012+aa,border);
        float scaleMask = smoothstep(.15, .27, vFishUv.x) * (1.0 - smoothstep(.88, .99, vFishUv.x));
        float dorsal = smoothstep(-.2, .45, vFishLocal.y);
        vec3 skin = mix(vec3(.014,.092,.155), vec3(.003,.018,.062), dorsal);
        skin += vec3(.003,.012,.028) * (1.0-scaleDistance) * scaleMask;
        skin += vec3(.01,.055,.105) * scaleRim * scaleMask * .36;
        diffuseColor.rgb *= skin * 1.3;
      `);
      shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', `
        #include <emissivemap_fragment>
        float seam = pow(max(0.0, 1.0-abs(vFishLocal.y-.015)*9.0), 3.0);
        totalEmissiveRadiance += vec3(.001,.012,.027) * scaleRim * scaleMask * uGlow;
        totalEmissiveRadiance += vec3(.0,.045,.085) * seam * scaleMask * uGlow;
      `);
      // Shallow scale micro-relief via the surface derivatives.
      shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', `
        #include <normal_fragment_maps>
        vec3 sx = dFdx(vViewPosition); sx /= max(length(sx), .00001);
        vec3 sy = dFdy(vViewPosition); sy /= max(length(sy), .00001);
        normal = normalize(normal + (sx*dFdx(scaleDistance) + sy*dFdy(scaleDistance)) * scaleMask * .18);
      `);
    }
    if (mode === 'light') shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= uGlow * (.8 + .2 * sin(swimPhase() * .91 - vFishLocal.x * 7.0));');
  };
  material.customProgramCacheKey = () => 'go-fish-v1-' + mode;
  return material;
}

function makeFinGeometry(base, edge, low) {
  const root = curve(base), rim = curve(edge);
  const nu = low ? 28 : 52, nv = low ? 9 : 16;
  const positions = [], uvs = [], free = [], indices = [];
  for (let i = 0; i <= nu; i++) {
    const u = i / nu, a = root.getPoint(u), b = rim.getPoint(u);
    for (let j = 0; j <= nv; j++) {
      const v = j / nv, p = a.clone().lerp(b, v);
      p.z += Math.sin(Math.PI * v) * Math.sin(Math.PI * u) * .065;
      positions.push(p.x, p.y, p.z); uvs.push(u, v); free.push(v * v);
    }
  }
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
    const a = i * (nv + 1) + j, b = a + nv + 1;
    indices.push(a, a + 1, b, a + 1, b + 1, b);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('aFin', new THREE.Float32BufferAttribute(free, 1));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  return geometry;
}

function finMaterial(uniforms, rays) {
  return new THREE.ShaderMaterial({
    uniforms: { ...uniforms, uRays: { value: rays } },
    side: THREE.DoubleSide, transparent: true, depthWrite: false,
    vertexShader: deformation + `
      attribute float aFin; varying vec2 vUv; varying vec3 vNormal; varying vec3 vView;
      void main() {
        vUv=uv;
        vec3 p=swimPosition(position,aFin);
        vec4 mv=modelViewMatrix*vec4(p,1.0);
        vView=-mv.xyz; vNormal=normalMatrix*swimNormal(position,normal,aFin);
        gl_Position=projectionMatrix*mv;
      }`,
    fragmentShader: `
      uniform float uGlow; uniform float uRays; varying vec2 vUv; varying vec3 vNormal; varying vec3 vView;
      void main() {
        float fold=sin(vUv.x*uRays*6.283 + sin(vUv.y*4.0)*.5);
        float rays=pow(max(0.0,fold),22.0);
        float veins=pow(max(0.0,sin(vUv.x*uRays*12.566+vUv.y*16.0)),34.0)*.18;
        float edge=smoothstep(.93,1.0,vUv.y);
        vec3 n=vNormal/max(length(vNormal),.00001);
        vec3 eye=vView/max(length(vView),.00001);
        float fresnel=pow(clamp(1.0-abs(dot(n,eye)),0.0,1.0),2.2);
        float structure=rays*.65+edge*.8+veins;
        vec3 color=mix(vec3(.006,.055,.14),vec3(.025,.26,.38),fold*.5+.5);
        color+=vec3(.06,.7,.98)*structure*uGlow;
        color+=vec3(.025,.2,.29)*fresnel;
        float alpha=clamp(.19+rays*.30+edge*.30+fresnel*.10,0.0,.88);
        alpha*=smoothstep(0.0,.035,vUv.x)*(1.0-smoothstep(.97,1.0,vUv.x));
        gl_FragColor=vec4(color,alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

export function createGoFish({ detail = 'high', phase = 0 } = {}) {
  const group = new THREE.Group(); group.name = 'Go魚';
  const uniforms = { uSwimTime: { value: phase }, uSwimFrequency: { value: 3.5 }, uSwimPower: { value: .48 }, uGlow: { value: 1 } };
  const low = detail === 'low', geometries = new Set(), materials = new Set();
  function add(geometry, material, name, fin = 0) {
    if (!geometry.attributes.aFin) geometry.setAttribute('aFin', new THREE.Float32BufferAttribute(new Float32Array(geometry.attributes.position.count).fill(fin), 1));
    if (!geometry.attributes.uv) geometry.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(geometry.attributes.position.count * 2), 2));
    const mesh = new THREE.Mesh(geometry, material); mesh.name = name; mesh.frustumCulled = false;
    geometries.add(geometry); materials.add(material); group.add(mesh); return mesh;
  }
  const skin = animateMaterial(new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: .4, metalness: .16, clearcoat: .48, clearcoatRoughness: .3, iridescence: .15, iridescenceIOR: 1.3, envMapIntensity: .3 }), uniforms, 'body');
  const body = add(makeBodyGeometry(detail), skin, 'sculpted-body');
  const luminous = animateMaterial(new THREE.MeshBasicMaterial({ color: new THREE.Color(.055, 2.5, 3.4), toneMapped: false }), uniforms, 'light');
  const subtle = animateMaterial(new THREE.MeshStandardMaterial({ color: 0x43b9cd, emissive: 0x04758e, emissiveIntensity: .35, roughness: .33, metalness: .65 }), uniforms);
  const dark = animateMaterial(new THREE.MeshPhysicalMaterial({ color: 0x010810, roughness: .2, metalness: 0, clearcoat: .45, envMapIntensity: .08 }), uniforms);
  function tube(points, radius, mat, name, fin = 0) {
    return add(new THREE.TubeGeometry(curve(points.map(p => p.isVector3 ? p.toArray() : p)), low ? 30 : 64, radius, 5, false), mat, name, fin);
  }
  const fins = [];
  function fin(name, base, edge, rays = 22) { const mesh = add(makeFinGeometry(base, edge, low), finMaterial(uniforms, rays), name); fins.push(mesh); }
  fin('dorsal-sail', [[-.85,.47,0],[-.3,.52,0],[.45,.36,0],[1.27,.11,0]], [[-.85,.47,0],[-.48,.95,0],[.58,1.51,-.025],[.33,.91,-.02],[.75,.56,0],[1.27,.11,0]], 22);
  fin('anal-sail', [[-.12,-.48,0],[.55,-.32,0],[1.35,-.1,0]], [[-.12,-.48,0],[.48,-.93,.025],[.94,-1.04,0],[.72,-.51,0],[1.35,-.1,0]], 16);
  for (const sign of [-1, 1]) {
    fin('pectoral-' + sign, [[-.86,-.14,.27*sign],[-.68,-.23,.28*sign],[-.49,-.33,.24*sign]], [[-.86,-.14,.27*sign],[-.44,-.42,.76*sign],[.1,-.88,1.0*sign],[-.16,-.73,.60*sign],[-.49,-.33,.24*sign]], 15);
    fin('pelvic-' + sign, [[.35,-.35,.15*sign],[.68,-.23,.14*sign],[.91,-.16,.12*sign]], [[.35,-.35,.15*sign],[.86,-.72,.35*sign],[1.4,-.78,.43*sign],[1.05,-.42,.22*sign],[.91,-.16,.12*sign]], 13);
  }
  for (const sign of [-1, 1]) {
    fin('forked-tail-' + sign, [[1.7,0,0],[1.83,.035*sign,0],[1.94,.016*sign,0],[1.89,0,0]], [[1.7,0,0],[2.2,.48*sign,.012],[3.22,1.12*sign,.03],[2.8,.45*sign,.018],[2.32,.13*sign,0],[1.89,0,0]], 22);
    // Two terminal streamers per tail lobe, not disconnected trailing lines.
    for (let i = 0; i < 2; i++) {
      const points = [[3.05-i*.33,(1.01-i*.43)*sign,.025],[3.42-i*.16,(1.17-i*.45)*sign,.04],[3.8-i*.16,(1.12-i*.42)*sign,.08],[4.06-i*.23,(.96-i*.36)*sign,.12]];
      tube(points, .006, subtle, `tail-filament-${sign}-${i}`, .8);
      const tip = new THREE.SphereGeometry(.026, 10, 8); tip.translate(...points.at(-1)); add(tip, luminous, 'filament-light', .8);
    }
  }
  for (const sign of [-1, 1]) {
    const x = -1.455, y = .112, z = .196 * sign;
    const eyeball = new THREE.SphereGeometry(1, 28, 22); eyeball.scale(.153,.157,.088); eyeball.translate(x,y,z);
    add(eyeball, dark, 'black-eye-' + sign);
    const socket = new THREE.TorusGeometry(.148,.015,8,42); socket.translate(x,y,z + .017*sign); add(socket, subtle, 'orbital-rim');
    const iris = new THREE.TorusGeometry(.121,.0065,8,40); iris.translate(x,y,z + .061*sign); add(iris, luminous, 'cyan-iris');
    const glint = new THREE.SphereGeometry(.024,10,8); glint.scale(1,.7,.3); glint.translate(x-.033,y+.06,z+.087*sign); add(glint, luminous, 'eye-catchlight');
    const gill = [];
    for (let j = 0; j <= 18; j++) {
      const angle = -.98 + j / 18 * 2.05, t = .27 + Math.cos(angle) * .037;
      gill.push(bodySurface(t, angle + (sign < 0 ? Math.PI : 0), .007));
    }
    tube(gill,.009,dark,'gill-slit');
    tube(gill.map(p => [p.x+.02,p.y,p.z+sign*.004]),.006,subtle,'gill-lip');
    tube([[-1.86,-.012,.013*sign],[-1.70,-.071,.088*sign],[-1.49,-.13,.165*sign]],.009,dark,'mouth-line');
    // Branching luminous conduits follow the *surface* so they remain coherent
    // under rotation and deformation, rather than being a 2D decal.
    for (let lane = 0; lane < 4; lane++) {
      const points = [];
      for (let j = 0; j <= 26; j++) {
        const t = .34 + j / 26 * .61;
        const angle = -.63 + lane * .40 + Math.sin(t * 8 + lane) * .17;
        points.push(bodySurface(t, sign > 0 ? angle : Math.PI-angle, .008));
      }
      tube(points,.0045,subtle,`light-channel-${sign}-${lane}`);
      for (let j = 0; j < (low ? 11 : 18); j++) {
        const t = .35+j/(low?11:18)*.59;
        const angle = -.63+lane*.40+Math.sin(t*8+lane)*.17;
        const p = bodySurface(t,sign>0?angle:Math.PI-angle,.017);
        const dot = new THREE.SphereGeometry(.010 + (1-t)*.008,6,5); dot.translate(p.x,p.y,p.z); add(dot,luminous,'thread-pulse');
      }
    }
    const nodes = [[.34,-.39,.042],[.408,-.16,.065],[.46,.30,.033],[.35,.14,.072],[.42,.56,.054],[.49,-.49,.035],[.51,.05,.032],[.385,.88,.045],[.30,.54,.028]];
    for (const [t, angle, radius] of nodes) {
      const p = bodySurface(t, sign>0 ? angle : Math.PI-angle, .012);
      const gem = new THREE.SphereGeometry(radius,low?10:16,10); gem.scale(1,1,.60); gem.translate(p.x,p.y,p.z);
      add(gem,luminous,'bioluminescent-node');
    }
  }
  // Merge tiny light meshes sharing a material into one draw, keeping original
  // vertex positions for the exact same GPU swim deformation.
  for (const mat of [luminous, subtle, dark]) {
    const meshes = group.children.filter(child => child.material===mat);
    if (meshes.length < 2) continue;
    const attributes = {position:[],normal:[],uv:[],aFin:[]};
    for (const mesh of meshes) {
      const expanded = mesh.geometry.toNonIndexed();
      for (const key of Object.keys(attributes)) attributes[key].push(...expanded.attributes[key].array);
      expanded.dispose(); group.remove(mesh); geometries.delete(mesh.geometry); mesh.geometry.dispose();
    }
    const merged = new THREE.BufferGeometry();
    for (const [key, values] of Object.entries(attributes)) merged.setAttribute(key,new THREE.Float32BufferAttribute(values,key==='aFin'?1:key==='uv'?2:3));
    add(merged,mat,'merged-'+(mat===luminous?'lights':mat===dark?'eyes-and-anatomy':'veins'));
  }
  let disposed = false;
  return {
    group, body, fins,
    update(time, {power=.48, glow=1, bodyPhase, bodyFrequency}={}) {
      const synced=Number.isFinite(bodyPhase)&&Number.isFinite(bodyFrequency)&&bodyFrequency>0;
      uniforms.uSwimTime.value=synced?bodyPhase/(bodyFrequency*TAU):time+phase;
      uniforms.uSwimFrequency.value=synced?bodyFrequency*TAU:3.5;
      uniforms.uSwimPower.value=clamp(power,0,1);
      uniforms.uGlow.value=glow*(.96+.04*Math.sin((synced?bodyPhase:time*3.5+phase)*.49));
    },
    get stats() { return { meshes:group.children.length, triangles:[...geometries].reduce((n,g)=>n+(g.index?g.index.count:g.attributes.position.count)/3,0), materials:materials.size }; },
    dispose() { if(disposed)return;disposed=true;for(const g of geometries)g.dispose();for(const m of materials)m.dispose();group.clear(); },
  };
}
