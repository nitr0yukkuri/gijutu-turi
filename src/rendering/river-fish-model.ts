// @ts-nocheck -- the model uses the vendored Three.js runtime without declarations.
import * as THREE from "../../vendor/three.module.js";
import { getRiverFishDesign, type RiverBodyPoint, type RiverFinPlan, type RiverFishDesign } from "../river-fish-designs.js";
import { applyFishWater, DEFAULT_FISH_WATER_PROFILE } from "./fish-water.js";

const TAU = Math.PI * 2;
const clamp = THREE.MathUtils.clamp;
const point = values => new THREE.Vector3(...values);
const curve = values => new THREE.CatmullRomCurve3(values.map(point), false, "centripetal");

function bodyShape(profile: readonly RiverBodyPoint[]) {
  const profileCurve = curve(profile.map(([x, height, width]) => [x, height, width]));
  const centerCurve = curve(profile.map(([x, , , centerY]) => [x, centerY, 0]));
  return { profileCurve, centerCurve };
}

function bodySection(shape, t: number) {
  const p = shape.profileCurve.getPoint(clamp(t, 0, 1));
  const center = shape.centerCurve.getPoint(clamp(t, 0, 1));
  return { x: p.x, height: Math.max(.004, p.y), width: Math.max(.004, p.z), center: center.y };
}

function bodyHalfWidthAtX(profile: readonly RiverBodyPoint[], x: number) {
  let rightIndex = profile.findIndex(([pointX]) => pointX >= x);
  if (rightIndex < 0) rightIndex = profile.length - 1;
  const left = profile[Math.max(0, rightIndex - 1)];
  const right = profile[rightIndex];
  const span = right[0] - left[0];
  const t = span > 0 ? clamp((x - left[0]) / span, 0, 1) : 0;
  return left[2] + (right[2] - left[2]) * t;
}

function bodySurface(shape, t: number, angle: number, lift = 0) {
  const section = bodySection(shape, t);
  return new THREE.Vector3(
    section.x,
    section.center + Math.sin(angle) * (section.height + lift),
    Math.cos(angle) * (section.width + lift),
  );
}

function makeBodyGeometry(shape, low: boolean) {
  const rings = low ? 52 : 96;
  const sides = low ? 28 : 48;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= rings; i++) {
    const t = i / rings;
    for (let j = 0; j <= sides; j++) {
      const v = j / sides;
      const p = bodySurface(shape, t, v * TAU);
      positions.push(p.x, p.y, p.z);
      uvs.push(t, v);
    }
  }
  for (let i = 0; i < rings; i++) for (let j = 0; j < sides; j++) {
    const a = i * (sides + 1) + j;
    const b = a + sides + 1;
    indices.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function shapeGeometry(points: readonly (readonly [number, number])[], z = 0, outwardSide = 0, outward = 0, rootX = 0) {
  const shape = new THREE.Shape();
  points.forEach(([x, y], index) => index === 0 ? shape.moveTo(x, y) : shape.lineTo(x, y));
  shape.closePath();
  const geometry = new THREE.ShapeGeometry(shape, 10);
  geometry.translate(0, 0, z);
  if (outwardSide !== 0 && outward > 0) {
    const positions = geometry.attributes.position;
    for (let index = 0; index < positions.count; index++) {
      const span = clamp((positions.getX(index) - rootX) / .54, 0, 1);
      positions.setZ(index, positions.getZ(index) + outwardSide * outward * span);
    }
    positions.needsUpdate = true;
  }
  geometry.computeVertexNormals();
  return geometry;
}

function finOutline(fin: RiverFinPlan) {
  return [...fin.root, ...fin.edge.slice().reverse()];
}

function tailOutline(kind: RiverFishDesign["tail"]) {
  if (kind === "rounded") return [[1.30, 0], [1.54, .10], [1.82, .29], [2.08, .34], [2.25, .24], [2.30, 0], [2.25, -.24], [2.08, -.34], [1.82, -.29], [1.54, -.10]] as const;
  if (kind === "shallow-forked") return [[1.30, 0], [1.52, .10], [1.95, .25], [2.16, .23], [2.05, .08], [1.98, 0], [2.05, -.08], [2.16, -.23], [1.95, -.25], [1.52, -.10]] as const;
  if (kind === "truncate") return [[1.28, .055], [1.52, .16], [1.82, .22], [1.96, .17], [1.96, -.17], [1.82, -.22], [1.52, -.16], [1.28, -.055]] as const;
  return [[1.36, 0], [1.58, .09], [2.36, .53], [2.17, .16], [1.90, .035], [2.17, -.16], [2.36, -.53], [1.58, -.09]] as const;
}

const bodyVertexMotion = `
uniform float uRiverVisibility;
uniform float uRiverPhase;
uniform float uRiverAmplitude;
uniform float uRiverWavelength;
uniform float uRiverTurn;
uniform float uRiverEffort;
uniform float uRiverTetherLoad;
uniform float uRiverFlexStart;
uniform float uRiverFlexLength;
uniform float uRiverBendGain;
uniform float uRiverTurnGain;
uniform float uRiverFinLag;
float riverEnvelope(float x) {
  float s=clamp((x-uRiverFlexStart)/uRiverFlexLength,0.0,1.0);
  return s*s;
}
float riverBend(float x) {
  float s=sqrt(riverEnvelope(x));
  float wave=sin(s*(6.2831853/max(.5,uRiverWavelength))-uRiverPhase);
  return wave*riverEnvelope(x)*uRiverAmplitude*uRiverBendGain
    +riverEnvelope(x)*uRiverTurn*uRiverTurnGain;
}
float riverFinAmplitude(float finClass) {
  return finClass>2.5?.044:finClass>.5?.028:.018;
}
vec3 riverDeform(vec3 p,float fin,float finClass,float finSide) {
  float phaseLag=mix(0.0,uRiverFinLag,clamp(fin,0.0,1.0));
  float effort=clamp(uRiverEffort,0.0,1.0);
  float response=clamp(fin,0.0,1.0);
  if(finClass>1.5&&finClass<2.5) {
    // Paired fins scull while cruising, then tuck slightly under a strong pull.
    float strokePhase=uRiverPhase*.65+finSide*.55;
    float slowScull=1.0-effort*.7;
    p.z*=1.0-response*(effort*.36-uRiverTetherLoad*.22);
    p.x+=response*slowScull*(.10*sin(strokePhase)+finSide*uRiverTurn*.12);
    p.y+=response*.035*sin(strokePhase-finSide*.55);
  } else if(finClass>2.5) {
    // The tail cups under load instead of following the body as a rigid paddle.
    p.y*=1.0-response*(effort*.14+uRiverTetherLoad*.08);
  } else if(finClass>.5) {
    p.y*=1.0-response*effort*.08;
  }
  float finBeat=sin(uRiverPhase-phaseLag-p.x*1.7)*fin*riverFinAmplitude(finClass)*mix(.75,1.2,effort);
  p.z+=riverBend(p.x)+finBeat;
  return p;
}`;

function animatedMaterial(material, uniforms, withBodyPattern = false) {
  const originalCompile = material.onBeforeCompile;
  material.onBeforeCompile = shader => {
    originalCompile.call(material, shader);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = `${bodyVertexMotion}\nattribute float aRiverFin; attribute float aRiverFinClass; attribute float aRiverFinSide;${withBodyPattern ? "varying vec2 vRiverUv; varying vec3 vRiverLocal;" : ""}\n${shader.vertexShader}`;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <beginnormal_vertex>",
      `#include <beginnormal_vertex>
      float riverSlope=(riverBend(position.x+.004)-riverBend(position.x-.004))/.008;
      float finFlutter=cos(uRiverPhase-uRiverFinLag*clamp(aRiverFin,0.0,1.0)-position.x*1.7)
        *aRiverFin*riverFinAmplitude(aRiverFinClass)*1.7;
      objectNormal=normalize(vec3(objectNormal.x-(riverSlope+finFlutter)*objectNormal.z,objectNormal.y,objectNormal.z));`,
    );
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
      ${withBodyPattern ? "vRiverUv=uv; vRiverLocal=position;" : ""}
      transformed=riverDeform(position,aRiverFin,aRiverFinClass,aRiverFinSide);`,
    );
    shader.fragmentShader = `uniform float uRiverVisibility;\n${shader.fragmentShader}`;
    shader.fragmentShader = shader.fragmentShader.replace("#include <opaque_fragment>", `diffuseColor.a*=uRiverVisibility;\n\t#include <opaque_fragment>`);
    if (withBodyPattern) {
      shader.fragmentShader = `uniform float uRiverPhase; uniform vec3 uRiverBodyColor; uniform vec3 uRiverDorsalColor; uniform vec3 uRiverBellyColor; uniform vec3 uRiverMarkColor; uniform vec3 uRiverSeasonColor; uniform float uRiverSeason; uniform float uRiverPattern; varying vec2 vRiverUv; varying vec3 vRiverLocal;\n${shader.fragmentShader}`;
      shader.fragmentShader = shader.fragmentShader.replace("#include <color_fragment>", `
        #include <color_fragment>
        float dorsal=smoothstep(-.04,.34,vRiverLocal.y);
        float belly=1.0-smoothstep(-.27,.06,vRiverLocal.y);
        vec3 fishSkin=mix(uRiverBodyColor,uRiverDorsalColor,dorsal*.78);
        fishSkin=mix(fishSkin,uRiverBellyColor,belly*.72);
        float seasonalFlank=(1.0-smoothstep(.14,.52,abs(sin(vRiverUv.y*6.2831853))));
        float seasonalRange=uRiverPattern>2.5&&uRiverPattern<3.5
          ? smoothstep(.18,.30,vRiverUv.x)*(1.0-smoothstep(.76,.88,vRiverUv.x))
          : 1.0-smoothstep(.47,.68,vRiverUv.x);
        fishSkin=mix(fishSkin,uRiverSeasonColor,seasonalFlank*seasonalRange*uRiverSeason*.62);
        float gillAngle=vRiverUv.y*6.2831853;
        float gillSide=smoothstep(-.35,.25,cos(gillAngle))*(1.0-smoothstep(.68,.82,abs(sin(gillAngle))));
        float gillCenter=.31+.035*cos(gillAngle);
        float gillCrease=(1.0-smoothstep(.006,.020,abs(vRiverUv.x-gillCenter)))*gillSide;
        float gillBreath=.92+.08*sin(uRiverPhase*.58);
        fishSkin=mix(fishSkin,fishSkin*vec3(.78,.82,.79),gillCrease*gillBreath*.38);
        float flank=1.0-smoothstep(.10,.34,abs(sin(vRiverUv.y*6.2831853)));
        vec2 cell=vRiverUv*vec2(20.0,13.0);
        vec2 cellId=floor(cell),within=fract(cell);
        float hash=fract(sin(dot(cellId,vec2(127.1,311.7)))*43758.5453);
        vec2 center=vec2(.50+.18*sin(hash*6.283),.50+.16*cos(hash*12.4));
        float spot=(1.0-smoothstep(.10,.21,length((within-center)*vec2(1.0,1.2))))*flank;
        float bars=pow(max(0.0,sin(vRiverUv.x*6.283*10.0+.18*sin(vRiverUv.y*6.283))),12.0)*flank;
        float lateral=(1.0-smoothstep(.035,.13,abs(sin(vRiverUv.y*6.2831853))))*flank;
        float scales=pow(max(0.0,sin(vRiverUv.x*6.283*22.0+cos(vRiverUv.y*6.283*16.0))),14.0)*flank;
        float parrPhase=vRiverUv.x*18.0;
        float parrAcross=abs(fract(parrPhase+.5)-.5)*2.0;
        float parrVertical=abs(sin(gillAngle));
        float parrDistance=length(vec2(parrAcross/.40,parrVertical/.46));
        float parrSide=smoothstep(-.25,.20,cos(gillAngle));
        float parrMarks=(1.0-smoothstep(.72,1.14,parrDistance))*parrSide*smoothstep(.27,.34,vRiverUv.x)*(1.0-smoothstep(.76,.84,vRiverUv.x));
        float marks=uRiverPattern<.5?0.0:uRiverPattern<1.5?spot:uRiverPattern<2.5?bars:uRiverPattern<3.5?lateral:uRiverPattern<4.5?scales:uRiverPattern<5.5?spot*.45:parrMarks;
        fishSkin=mix(fishSkin,uRiverMarkColor,clamp(marks*(uRiverPattern<3.5?.55:uRiverPattern<4.5?.10:uRiverPattern<5.5?.20:.72),0.0,.72));
        diffuseColor.rgb*=fishSkin;
      `);
    }
  };
  const baseKey = material.customProgramCacheKey?.() ?? "river-standard";
  material.customProgramCacheKey = () => `${baseKey}-river-swim-v1-${withBodyPattern ? "pattern" : "fin"}`;
  return material;
}

const patternValue = pattern => ({ plain: 0, spots: 1, bars: 2, "lateral-line": 3, "scale-arc": 4, mottled: 5, "parr-marks": 6 })[pattern] ?? 0;

/** Create one anatomically distinct river-fish model using the same body-wave clock as game fish. */
export function createRiverFish(modelKey: string, { detail = "high", phase = 0, waterUniforms = null } = {}) {
  const design = getRiverFishDesign(modelKey);
  if (!design) throw new Error(`unknown_river_fish_model:${modelKey}`);

  const low = detail === "low";
  const shape = bodyShape(design.profile);
  const group = new THREE.Group();
  group.name = design.name;
  const habitatUniforms = waterUniforms
    ? {
        ...waterUniforms,
        uFishCenter: { value: group.position },
        // River meshes already fade through uRiverVisibility; keep water optics fully enabled.
        uFishVisibility: { value: 1 },
      }
    : null;
  const geometries = new Set();
  const materials = new Set();
  const waterAppliedMaterials = new Set();
  const uniforms = {
    uRiverVisibility: { value: 1 }, uRiverPhase: { value: phase }, uRiverAmplitude: { value: .11 }, uRiverWavelength: { value: .82 }, uRiverTurn: { value: 0 },
    uRiverEffort: { value: .3 }, uRiverTetherLoad: { value: 0 },
    uRiverFlexStart: { value: design.motion.flexStartX }, uRiverFlexLength: { value: design.motion.flexLength },
    uRiverBendGain: { value: design.motion.bendGain }, uRiverTurnGain: { value: design.motion.turnGain },
    uRiverFinLag: { value: design.motion.finLag },
    uRiverBodyColor: { value: new THREE.Color(design.palette.body) }, uRiverDorsalColor: { value: new THREE.Color(design.palette.dorsal) },
    uRiverBellyColor: { value: new THREE.Color(design.palette.belly) }, uRiverMarkColor: { value: new THREE.Color(design.palette.marking) },
    uRiverSeasonColor: { value: new THREE.Color(design.id === "river-ugui" ? 0xb83f32 : 0x3b8292) }, uRiverSeason: { value: 0 },
    uRiverPattern: { value: patternValue(design.pattern) },
  };

  const add = (geometry, material, name, finFactor = 0, waterPart = "detail", finClass = 0, finSide = 0) => {
    const positions = geometry.attributes.position;
    if (!geometry.attributes.aRiverFin) {
      const flex = new Float32Array(positions.count);
      for (let i = 0; i < positions.count; i++) {
        const s = clamp((positions.getX(i) - design.motion.flexStartX) / design.motion.flexLength, 0, 1);
        flex[i] = Math.max(finFactor, s * s);
      }
      geometry.setAttribute("aRiverFin", new THREE.Float32BufferAttribute(flex, 1));
    }
    if (!geometry.attributes.aRiverFinClass) {
      geometry.setAttribute("aRiverFinClass", new THREE.Float32BufferAttribute(new Float32Array(positions.count).fill(finClass), 1));
      geometry.setAttribute("aRiverFinSide", new THREE.Float32BufferAttribute(new Float32Array(positions.count).fill(finSide), 1));
    }
    if (habitatUniforms && !waterAppliedMaterials.has(material)) {
      applyFishWater(material, habitatUniforms, waterPart, DEFAULT_FISH_WATER_PROFILE);
      waterAppliedMaterials.add(material);
    }
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.frustumCulled = false;
    geometry.computeVertexNormals();
    geometries.add(geometry); materials.add(material); group.add(mesh);
    return mesh;
  };

  const bodyMaterial = animatedMaterial(new THREE.MeshPhysicalMaterial({
    color: 0xffffff, roughness: .52, metalness: .04, clearcoat: .22, clearcoatRoughness: .44, side: THREE.DoubleSide, transparent: true, depthWrite: true,
  }), uniforms, true);
  add(makeBodyGeometry(shape, low), bodyMaterial, "river-fish-body", 0, "body");

  const finMaterial = animatedMaterial(new THREE.MeshPhysicalMaterial({
    color: design.palette.fin, roughness: .62, metalness: .015, clearcoat: .08, side: THREE.DoubleSide, transparent: true, depthWrite: true,
  }), uniforms);
  const addFin = (name, outline, z = 0, finClass = 1, finSide = 0, outward = 0, rootX = 0) =>
    add(shapeGeometry(outline, z, finSide, outward, rootX), finMaterial, name, .8, "fin", finClass, finSide);
  addFin("dorsal-fin", finOutline(design.dorsal), 0);
  addFin("anal-fin", finOutline(design.anal), 0);
  addFin("caudal-fin", tailOutline(design.tail), 0, 3);

  // Attach paired fins to each species' flank width so broad-bodied fish do not swallow them.
  const pectoralSideZ = Math.max(.11, bodyHalfWidthAtX(design.profile, -.78) * .94);
  for (const side of [-1, 1]) {
    const sideZ = side * pectoralSideZ;
    addFin(`pectoral-fin-${side}`, [[-.98,-.09],[-.75,-.12],[-.38,-.26],[-.28,-.38],[-.50,-.40],[-.82,-.27]], sideZ, 2, side, .10, -.82);
    addFin(`pelvic-fin-${side}`, [[.04,-.24],[.30,-.21],[.54,-.28],[.66,-.40],[.48,-.42],[.20,-.34]], side * .095, 2, side);
  }

  // Adipose fins are a small, identifying silhouette cue on the two trout-like forms.
  if (design.id === "river-ayu" || design.id === "river-yamame") {
    addFin("adipose-fin", [[.83,.17],[.98,.17],[1.10,.27],[1.00,.30],[.91,.23]], 0);
  }
  if (design.id === "river-ayu") {
    addFin("second-dorsal-fin", [[.12,.30],[.38,.25],[.66,.20],[.54,.34],[.38,.41],[.23,.39]]);
  }

  const darkMaterial = animatedMaterial(new THREE.MeshStandardMaterial({ color: 0x1d2925, roughness: .54, transparent: true, depthWrite: true }), uniforms);
  const eyeMaterial = animatedMaterial(new THREE.MeshPhysicalMaterial({ color: 0x080d0e, roughness: .18, clearcoat: .8, transparent: true, depthWrite: true }), uniforms);
  const irisMaterial = animatedMaterial(new THREE.MeshStandardMaterial({ color: 0xc9b87b, roughness: .28, metalness: .12, transparent: true, depthWrite: true }), uniforms);
  const makeTube = (points, radius, material, name) => {
    const geometry = new THREE.TubeGeometry(curve(points), low ? 12 : 20, radius, 5, false);
    return add(geometry, material, name, 0);
  };
  const eyeX = design.id === "river-kamatsuka" ? -1.42 : design.id === "river-namazu" ? -1.60 : -1.48;
  const eyeY = design.id === "river-kamatsuka" ? .12 : design.id === "river-namazu" ? .17 : .14;
  const eyeZ = design.id === "river-dojo" ? .09 : design.id === "river-namazu" ? .205 : .17;
  for (const side of [-1, 1]) {
    const eye = new THREE.SphereGeometry(1, low ? 12 : 18, low ? 10 : 14);
    eye.scale(design.id === "river-namazu" ? .076 : .082, .083, .045);
    eye.translate(eyeX, eyeY, side * eyeZ);
    add(eye, eyeMaterial, `eye-${side}`, 0, "light");
    const iris = new THREE.SphereGeometry(1, low ? 8 : 12, low ? 8 : 10);
    iris.scale(.033,.035,.018);
    iris.translate(eyeX-.012, eyeY+.006, side*(eyeZ+.036));
    add(iris, irisMaterial, `iris-${side}`, 0, "light");

  }
  if (design.id === "river-yamame") {
    const spotMaterial = animatedMaterial(new THREE.MeshStandardMaterial({ color: design.palette.marking, roughness: .82, transparent: true, depthWrite: true }), uniforms);
    for (let index = 0; index < 8; index++) {
      const t = .24 + index * .061;
      const spot = bodySurface(shape, t, Math.PI / 2, .008);
      const geometry = new THREE.SphereGeometry(1, low ? 8 : 10, low ? 6 : 8);
      geometry.scale(.026, .014, .018);
      geometry.translate(spot.x, spot.y, spot.z);
      add(geometry, spotMaterial, `yamame-dorsal-black-spot-${index}`);
    }
  }
  if (design.id === "river-kamatsuka") {
    makeTube([[-2.04,-.04,.075],[-1.98,-.078,.116],[-1.88,-.09,.13]], .006, darkMaterial, "downturned-suction-mouth");
  }

  const barbelCount = design.id === "river-namazu" ? 4 : design.id === "river-dojo" ? 10 : design.id === "river-koi" ? 4 : design.id === "river-kamatsuka" ? 2 : 0;
  for (let index = 0; index < barbelCount; index++) {
    const side = index % 2 === 0 ? -1 : 1;
    const pair = Math.floor(index / 2);
    const x = design.id === "river-koi" ? -1.83 : -1.86 + pair * .035;
    const z = design.id === "river-koi" ? .07 + pair * .035 : .04 + pair * .032;
    const length = design.id === "river-namazu" ? .42 - pair * .055 : design.id === "river-dojo" ? .19 - pair * .012 : .15;
    makeTube([[x,-.03,side*z],[x-.06,-.10,side*(z+length*.48)],[x-.16,-.16,side*(z+length)]], .009, darkMaterial, `barbel-${index}`);
  }

  let disposed = false;
  return {
    group,
    update(time, { power = .35, amplitude, bodyPhase, bodyFrequency, bodyWavelength = .82, turn = 0, effort = power, tetherLoad = 0, visibility = 1 } = {}) {
      const syncedPhase = Number.isFinite(bodyPhase);
      const swimPower = clamp(power, 0, 1);
      uniforms.uRiverVisibility.value = clamp(visibility, 0, 1);
      uniforms.uRiverPhase.value = syncedPhase ? bodyPhase : time * TAU * (Number.isFinite(bodyFrequency) ? clamp(bodyFrequency, .3, 4) : 1.35) + phase;
      const waveAmplitude = Number.isFinite(amplitude) ? amplitude : .10 + swimPower * .10;
      uniforms.uRiverAmplitude.value = clamp(Math.max(waveAmplitude, .04 + swimPower * .05), .015, .34);
      uniforms.uRiverWavelength.value = clamp(bodyWavelength, .5, 1.5);
      uniforms.uRiverTurn.value = clamp(turn, -1, 1);
      uniforms.uRiverEffort.value = clamp(effort, 0, 1);
      uniforms.uRiverTetherLoad.value = clamp(tetherLoad, 0, 1);
    },
    setSeasonalState(value: number) {
      if (design.id === "river-oikawa" || design.id === "river-ugui") uniforms.uRiverSeason.value = clamp(value, 0, 1);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      group.clear();
    },
  };
}
