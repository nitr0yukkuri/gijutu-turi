// @ts-nocheck -- the procedural mesh uses the vendored Three.js runtime, whose JS distribution has no declarations.
import * as THREE from '../../vendor/three.module.js';
import { applyFishWater, CSS_FISH_WATER_PROFILE, K8S_LEVIATHAN_WATER_PROFILE } from './fish-water.js';
import { JS_EEL_SWIM_VISUAL_PROFILE, K8S_LEVIATHAN_SWIM_VISUAL_PROFILE, RUST_BILLFISH_SWIM_VISUAL_PROFILE, STANDARD_FISH_SWIM_VISUAL_PROFILE } from './fish-swim-visual-profile.js';
import { cssFishRedStateStrength, getCssFishPalette, type CssFishVisualState } from '../css-fish-style.js';

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
// CSS fish shares the renderer and the swimming shader, but it must read as a
// small anatomical fish rather than a rounded Go mascot. The body tapers into
// a visible peduncle and the tail keeps two readable lobes at fight distance.
const cssProfile = [
  // Keep the nose anchor shared with the fishing line, then use a normal
  // fusiform body: fuller behind the head, slimmer at the caudal peduncle.
  [-1.86, .018, .016, -.012], [-1.72, .14, .11, .006],
  [-1.49, .29, .20, .028], [-1.14, .405, .275, .05],
  [-.72, .455, .29, .065], [-.30, .43, .265, .05],
  [.08, .335, .21, .028], [.40, .205, .13, .008],
  [.68, .09, .06, 0], [.88, .045, .036, 0],
];
// Dunkleosteus-inspired K8s predator: a short, deep body carries a heavy
// armored head and shoulder, then tapers quickly into a powerful tail root.
// The living outline is an art direction (most of the post-cranial skeleton
// is not preserved), not a claim of exact fossil reconstruction.
const clusterProfile = [
  [-1.86, .028, .024, -.01], [-1.78, .19, .145, 0],
  [-1.58, .39, .285, .025], [-1.30, .56, .395, .045],
  [-.90, .65, .455, .052], [-.42, .62, .43, .042],
  [.06, .49, .35, .025], [.48, .31, .22, .01],
  [.84, .155, .115, 0], [1.14, .07, .052, 0], [1.38, .044, .035, 0],
];
// Striped marlin: a long, streamlined trunk with a narrow caudal peduncle.
// The rounded spear-like bill and crescent tail are separate meshes so their
// silhouette remains legible at the fight camera.
const rustProfile = [
  [-1.86, .022, .018, -.012], [-1.69, .16, .115, -.002],
  [-1.42, .32, .19, .015], [-1.08, .43, .255, .032],
  [-.68, .46, .285, .045], [-.24, .42, .265, .038],
  [.20, .32, .205, .022], [.62, .19, .12, .008],
  [1.02, .095, .064, 0], [1.42, .052, .038, 0], [1.72, .045, .032, 0],
];
// Ma-anago: an elongated body with a blunt, slightly projecting head and a
// continuous taper. The body itself remains the main propulsor; low dorsal
// and anal folds meet at the pointed tail instead of forming a large tail fin.
const eelProfile = [
  [-1.96, .021, .018, .01], [-1.78, .12, .075, .012],
  [-1.50, .17, .105, .006], [-1.14, .19, .12, .012],
  [-.72, .185, .116, .012], [-.30, .17, .108, .008],
  [.14, .15, .096, .004], [.56, .125, .079, 0],
  [.98, .095, .061, 0], [1.38, .071, .046, 0],
  [1.76, .052, .034, 0], [2.12, .036, .024, 0],
  [2.42, .019, .013, 0],
];
const makeShape = points => ({
  profileCurve: new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(p[0], p[1], p[2])), false, 'centripetal'),
  centerCurve: new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(p[0], p[3], 0)), false, 'centripetal'),
});
const goShape = makeShape(profile);
const cssShape = makeShape(cssProfile);
const clusterShape = makeShape(clusterProfile);
const rustShape = makeShape(rustProfile);
const eelShape = makeShape(eelProfile);
const clamp = THREE.MathUtils.clamp;
const vector = p => new THREE.Vector3(...p);
const curve = points => new THREE.CatmullRomCurve3(points.map(vector), false, 'centripetal');

function bodySectionAt(t, shape) {
  const point = shape.profileCurve.getPoint(clamp(t, 0, 1));
  const center = shape.centerCurve.getPoint(clamp(t, 0, 1));
  return { x: point.x, height: point.y, width: point.z, center: center.y };
}

export function bodySection(t) {
  return bodySectionAt(t, goShape);
}

function bodySurfaceAt(shape, t, angle, extra = 0) {
  const p = bodySectionAt(t, shape);
  return new THREE.Vector3(p.x, p.center + Math.sin(angle) * (p.height + extra), Math.cos(angle) * (p.width + extra));
}

function makeBodyGeometry(detail, shape = goShape, smoothAngularSeam = false) {
  const rings = detail === 'low' ? 64 : 112, sides = detail === 'low' ? 32 : 56;
  const positions = [], uvs = [], indices = [];
  for (let i = 0; i <= rings; i++) {
    for (let j = 0; j <= sides; j++) {
      const p = bodySurfaceAt(shape, i / rings, j / sides * TAU);
      positions.push(p.x, p.y, p.z); uvs.push(i / rings, j / sides);
    }
  }
  for (let i = 0; i < rings; i++) for (let j = 0; j < sides; j++) {
    const a = i * (sides + 1) + j, b = a + sides + 1;
    indices.push(a, b, a + 1, a + 1, b, b + 1);
  }
  // Small end caps rather than open geometry at the mouth/peduncle.
  for (const [ring, reverse] of [[0, false], [rings, true]]) {
    const section = bodySectionAt(ring / rings, shape), center = positions.length / 3;
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
  if (smoothAngularSeam) {
    const normals = geometry.attributes.normal;
    const stride = sides + 1;
    for (let ring = 0; ring <= rings; ring++) {
      const first = ring * stride;
      const last = first + sides;
      const x = normals.getX(first) + normals.getX(last);
      const y = normals.getY(first) + normals.getY(last);
      const z = normals.getZ(first) + normals.getZ(last);
      const length = Math.hypot(x, y, z) || 1;
      normals.setXYZ(first, x / length, y / length, z / length);
      normals.setXYZ(last, x / length, y / length, z / length);
    }
    normals.needsUpdate = true;
  }
  return geometry;
}

function makeSurfaceArmorGeometry(shape, tStart, tEnd, centerAngle, halfAngle, detail = 'high') {
  const rows = detail === 'low' ? 8 : 14, columns = detail === 'low' ? 6 : 10;
  const positions = [], uvs = [], indices = [];
  for (let row = 0; row <= rows; row++) {
    const u = row / rows;
    const taper = .2 + .8 * Math.pow(Math.sin(Math.PI * u), .42);
    for (let column = 0; column <= columns; column++) {
      const v = column / columns;
      const angle = centerAngle + (v * 2 - 1) * halfAngle * taper;
      const ridge = Math.sin(Math.PI * u) * Math.sin(Math.PI * v);
      // Armor sits on the skin like a fused shield. A high lift makes each
      // plate read as a detached pebble at the close result-camera distance.
      const point = bodySurfaceAt(shape, tStart + (tEnd - tStart) * u, angle, .006 + ridge * .02);
      positions.push(point.x, point.y, point.z);
      uvs.push(u, v);
    }
  }
  for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
    const a = row * (columns + 1) + column, b = a + columns + 1;
    indices.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

// A single continuous lateral wave is shared by every anatomical part. Fin
// membranes add a small delayed flutter instead of rotating rigid triangles.
const deformation = `
uniform float uSwimTime;
uniform float uSwimFrequency;
uniform float uSwimPower;
uniform float uGlow;
uniform float uSwimWavelength;
uniform float uNaturalSwim;
uniform float uTurn;
uniform float uEffort;
uniform float uTetherLoad;
uniform float uBodyFlexStart;
uniform float uBodyFlexLength;
uniform float uBodyBendGain;
uniform float uTurnBendGain;
uniform float uFinPhaseLag;
uniform float uFinFlutterGain;
float swimPhase() { return uSwimTime * uSwimFrequency; }
float bendZ(float x) {
  float s = clamp((x - uBodyFlexStart) / uBodyFlexLength, 0.0, 1.0);
  float amplitude=mix(0.18+uSwimPower*0.43,uSwimPower*uBodyBendGain,uNaturalSwim);
  return sin(s * uSwimWavelength - swimPhase()) * s * s * amplitude+uTurn*s*s*uTurnBendGain*uNaturalSwim;
}
vec3 swimPosition(vec3 p, float fin) {
  // Fold median fins during a drive, cup the forked tail, and scull paired
  // fins during slow swimming/turns. The head/mouth stays an anchor (fin=0).
  float response=fin*uNaturalSwim;
  if(p.x>1.6){p.y*=1.0-response*uEffort*.22;}
  else if(abs(p.z)<.12){p.y*=1.0-response*(.24+uEffort*.2);}
  else {
    float side=sign(p.z);
    p.z*=1.0-response*(uEffort*.36-uTetherLoad*.22);
    p.x+=response*(1.0-uEffort*.7)*(.10*sin(swimPhase()*.65+side*.55)+side*uTurn*.12);
    p.y+=response*.035*sin(swimPhase()*.65-side*.55);
  }
  p.z += bendZ(p.x);
  p.z += sin(p.x * 3.0 + p.y * 2.1 - swimPhase() - uFinPhaseLag*uNaturalSwim) * fin * uFinFlutterGain * mix(1.0,uSwimPower,uNaturalSwim);
  return p;
}
vec3 swimNormal(vec3 p, vec3 n, float fin) {
  float slope = (bendZ(p.x + .003) - bendZ(p.x - .003)) / .006;
  float flutter=cos(p.x*3.0+p.y*2.1-swimPhase()-uFinPhaseLag*uNaturalSwim)*fin*uFinFlutterGain*mix(1.0,uSwimPower,uNaturalSwim);
  slope += flutter*3.0;
  vec3 deformed = vec3(n.x - slope * n.z, n.y-flutter*2.1*n.z*uNaturalSwim, n.z);
  return deformed / max(length(deformed), .00001);
}`;

function animateMaterial(material, uniforms, mode = 'plain', cssStyle = false, clusterStyle = false, rustStyle = false, eelStyle = false) {
  material.userData.fishPart=mode==='body'?'body':mode==='light'?'light':mode==='fin'?'fin':'detail';
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = deformation + '\nattribute float aFin; varying vec2 vFishUv; varying vec3 vFishLocal;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nobjectNormal = swimNormal(position, objectNormal, aFin);');
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvFishUv = uv; vFishLocal = position; transformed = swimPosition(position, aFin);');
    shader.fragmentShader = 'uniform float uSwimTime; uniform float uSwimFrequency; uniform float uGlow; uniform float uImmersion;' + (cssStyle ? ' uniform vec3 uStyleBody; uniform vec3 uStyleShade; uniform vec3 uStyleAccent; uniform vec3 uStyleEmission; uniform float uStyleGlow; uniform float uStylePattern;' : '') + (rustStyle ? ' uniform float uRustSurge;' : '') + (eelStyle ? ' uniform float uEffort;' : '') + ' float swimPhase() { return uSwimTime * uSwimFrequency; } varying vec2 vFishUv; varying vec3 vFishLocal;\n' + shader.fragmentShader;
    if (mode === 'body') {
      shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
        #include <color_fragment>
        // Staggered organic scales, not a mesh wireframe.
        vec2 cell = vFishUv * ${cssStyle ? 'vec2(15.0, 10.0)' : clusterStyle ? 'vec2(11.0, 8.0)' : rustStyle ? 'vec2(22.0, 15.0)' : eelStyle ? 'vec2(17.0, 8.0)' : 'vec2(31.0, 22.0)'};
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
        ${eelStyle ? `
        // Only server-synchronized high effort (the opening/surge) lights the
        // anago; the moving highlight follows the authoritative body-wave phase.
        float anagoBurstGlow = smoothstep(.62,.84,uEffort);
        float anagoGlowPulse = .55 + .45*sin(swimPhase()*1.6-vFishLocal.x*2.3);
        ` : ''}
        // The Rust marlin uses pigment bars instead of a scale-cell overlay;
        // other species retain their own scale/circuit patterns.
        float scaleMask = ${rustStyle || eelStyle ? '0.0' : `smoothstep(${cssStyle ? '.08' : clusterStyle ? '.1' : '.15'}, ${cssStyle ? '.22' : clusterStyle ? '.24' : '.27'}, vFishUv.x) * (1.0 - smoothstep(.88, .99, vFishUv.x))`};
        float dorsal = smoothstep(${eelStyle ? '-.04, .16' : '-.2, .45'}, vFishLocal.y);
        vec3 skin = ${cssStyle ? 'mix(uStyleBody, uStyleShade, dorsal)' : clusterStyle ? 'mix(vec3(.105,.155,.145), vec3(.018,.042,.046), dorsal)' : rustStyle ? 'mix(vec3(.48,.64,.76), vec3(.018,.075,.28), dorsal)' : eelStyle ? 'mix(vec3(.68,.43,.075), vec3(.34,.20,.025), dorsal)' : 'mix(vec3(.014,.092,.155), vec3(.003,.018,.062), dorsal)'};
        ${eelStyle ? `
        // Keep the ma-anago silhouette and pale underside, but give this
        // JavaScript species its bright golden identity back.
        float paleBelly = 1.0 - smoothstep(-.24,.08,vFishLocal.y);
        skin = mix(skin, vec3(.88,.72,.40), paleBelly*.66);
        ` : ''}
        ${cssStyle ? `
        // CSS fish uses larger rounded cells and flowing bands instead of
        // Go's dense scale grid and branching circuitry. The pattern is
        // deliberately soft so the small fish remains cute at fight depth.
         float cascadeBand = smoothstep(.45,.78,.5+.5*sin(vFishUv.x*18.0-vFishUv.y*5.0));
         float styleStripe = smoothstep(.34,.70,.5+.5*cos(vFishUv.x*11.0+vFishUv.y*3.0));
         float bubbleMark = smoothstep(.62,.86,.5+.5*sin(vFishUv.x*33.0+vFishUv.y*17.0));
         float cascadeGlow = smoothstep(.68,.95,.5+.5*sin(vFishUv.x*14.0-vFishUv.y*9.0));
         skin = mix(skin,uStyleAccent,(cascadeBand*.19+styleStripe*.16)*uStylePattern);
         skin += uStyleEmission*(cascadeGlow*.045 + bubbleMark*.018)*uStyleGlow;
        ` : ''}
        ${rustStyle ? `
        // Striped-marlin bars cross the flanks, rather than running down the
        // fish. A slight UV warp keeps the bands organic; the flank mask fades
        // them across the dorsal ridge and pale belly.
        float marlinSide = 1.0 - smoothstep(.40,.88,abs(sin(vFishUv.y*6.2831853)));
        float marlinRange = smoothstep(.17,.29,vFishUv.x) * (1.0-smoothstep(.78,.91,vFishUv.x));
        // Striped marlin carry roughly a dozen to sixteen flank bars. Gentle
        // phase warp and per-bar variation keep them pigmented, not barcode-like.
        float marlinBandPhase = vFishUv.x*17.8 + .045*sin(vFishUv.y*6.2831853 + vFishUv.x*5.2);
        float marlinBand = smoothstep(.56,.84,.5+.5*cos(marlinBandPhase*6.2831853));
        float marlinBarStrength = .82 + .12*sin(floor(marlinBandPhase)*2.17 + 1.1);
        float marlinBands = marlinBand * marlinSide * marlinRange * marlinBarStrength;
        skin = mix(skin, vec3(.025,.31,.82), marlinBands*.78);
        // A short Rust-orange flash rides the existing pigment bars during a
        // server-authored surge. Its spatial pulse uses the synchronized body
        // phase, so it never creates a second animation clock or fish copy.
        float rustAccentWave = .5 + .5 * sin(vFishUv.x*18.0 - swimPhase()*1.15);
        float rustMoveAccent = clamp(uRustSurge,0.0,1.0) * marlinBands * (.20 + .16*rustAccentWave);
        skin = mix(skin, vec3(.78,.24,.09), rustMoveAccent);
        ` : ''}
        skin += ${clusterStyle ? 'vec3(.012,.021,.018)' : rustStyle ? 'vec3(.018,.022,.024)' : eelStyle ? 'vec3(.014,.010,.006)' : 'vec3(.003,.012,.028)'} * (1.0-scaleDistance) * scaleMask * ${clusterStyle ? '.3' : rustStyle ? '.7' : eelStyle ? '.32' : '1.0'};
        skin += ${cssStyle ? 'uStyleAccent' : clusterStyle ? 'vec3(.04,.11,.28)' : rustStyle ? 'vec3(.18,.21,.20)' : eelStyle ? 'vec3(.22,.15,.085)' : 'vec3(.01,.055,.105)'} * scaleRim * scaleMask * ${cssStyle ? '.36*uStylePattern' : clusterStyle ? '.1' : rustStyle ? '.16' : eelStyle ? '.10' : '.36'};
        diffuseColor.rgb *= skin * 1.3;
      `);
      shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', `
        #include <emissivemap_fragment>
        float seam = pow(max(0.0, 1.0-abs(vFishLocal.y-.015)*9.0), 3.0);
        totalEmissiveRadiance += ${cssStyle ? 'uStyleEmission*uStyleGlow*.42' : clusterStyle ? 'vec3(.0005,.002,.002)' : rustStyle ? 'vec3(.001,.0006,.0003)' : eelStyle ? 'vec3(.002,.001,.0005)' : 'vec3(.001,.012,.027)'} * scaleRim * scaleMask * uGlow * (1.0-uImmersion*.9);
        totalEmissiveRadiance += ${cssStyle ? 'uStyleAccent*uStyleGlow*.22' : clusterStyle ? 'vec3(.003,.009,.026)' : rustStyle ? 'vec3(.002,.001,.0005)' : eelStyle ? 'vec3(.008,.003,.001)' : 'vec3(.0,.045,.085)'} * seam * scaleMask * uGlow * (1.0-uImmersion*.8);
        totalEmissiveRadiance += ${eelStyle ? 'vec3(1.0,.55,.04)*anagoBurstGlow*anagoGlowPulse*.44*(1.0-uImmersion*.35)' : 'vec3(0.0)'};
      `);
      // Shallow scale micro-relief via the surface derivatives.
      shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', `
        #include <normal_fragment_maps>
        vec3 sx = dFdx(vViewPosition); sx /= max(length(sx), .00001);
        vec3 sy = dFdy(vViewPosition); sy /= max(length(sy), .00001);
        normal = normalize(normal + (sx*dFdx(scaleDistance) + sy*dFdy(scaleDistance)) * scaleMask * ${clusterStyle ? '.045' : rustStyle ? '.09' : eelStyle ? '.06' : '.18'});
      `);
    }
    if (mode === 'light') shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', cssStyle
      ? '#include <color_fragment>\ndiffuseColor.rgb=mix(diffuseColor.rgb,uStyleAccent*1.28,.72); diffuseColor.rgb *= uGlow * (.86 + .14 * sin(swimPhase() * .91 - vFishLocal.x * 7.0)) * (1.0-uImmersion*smoothstep(2.5,4.1,vFishLocal.x)*.94);'
      : rustStyle
        ? '#include <color_fragment>\ndiffuseColor.rgb *= uGlow * (.72 + .28 * sin(swimPhase() * .78 - vFishLocal.x * 6.0)) * (1.0-uImmersion*smoothstep(2.0,3.5,vFishLocal.x)*.88);'
      : eelStyle
        ? '#include <color_fragment>\nfloat jsBurstPulse=smoothstep(.62,.84,uEffort)*(.58+.42*sin(swimPhase()*1.6-vFishLocal.x*2.3)); diffuseColor.rgb *= uGlow * (.78 + .22 * sin(swimPhase() * .72 - vFishLocal.x * 5.0) + jsBurstPulse*1.25) * (1.0-uImmersion*.78);'
      : '#include <color_fragment>\ndiffuseColor.rgb *= uGlow * (.8 + .2 * sin(swimPhase() * .91 - vFishLocal.x * 7.0)) * (1.0-uImmersion*smoothstep(2.5,4.1,vFishLocal.x)*.94);');
  };
  material.customProgramCacheKey = () => 'go-fish-v5-' + mode + (cssStyle ? '-css' : clusterStyle ? '-cluster' : rustStyle ? '-rust' : eelStyle ? '-eel' : '');
  return material;
}

function makeFinGeometry(base, edge, low, surfaceBulge = .065, freeEdgeMotion = 1, bulgeDirection = 1) {
  const root = curve(base), rim = curve(edge);
  const nu = low ? 28 : 52, nv = low ? 9 : 16;
  const positions = [], uvs = [], free = [], indices = [];
  for (let i = 0; i <= nu; i++) {
    const u = i / nu, a = root.getPoint(u), b = rim.getPoint(u);
    for (let j = 0; j <= nv; j++) {
      const v = j / nv, p = a.clone().lerp(b, v);
      p.z += bulgeDirection * Math.sin(Math.PI * v) * Math.sin(Math.PI * u) * surfaceBulge;
      positions.push(p.x, p.y, p.z); uvs.push(u, v); free.push(v * v * freeEdgeMotion);
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

function bodyParameterAtX(shape, x) {
  let low = 0, high = 1;
  for (let i = 0; i < 28; i++) {
    const middle = (low + high) * .5;
    if (shape.profileCurve.getPoint(middle).x < x) low = middle;
    else high = middle;
  }
  return (low + high) * .5;
}

/** A folded billfish fin is a narrow body-hugging ribbon, not a generic fan. */
function makeFoldedMarlinFinGeometry(shape, { xStart, xEnd, side, flankAngle, spread, droop, sweep, tipAt }, low, freeEdgeMotion) {
  const stations = low ? 7 : 13;
  const root = [], freeEdge = [];
  for (let i = 0; i < stations; i++) {
    const u = i / (stations - 1);
    const x = xStart + (xEnd - xStart) * u;
    // Bury the root slightly under the skin. A positive offset made the opaque
    // fin overlap the body and expose a thin, dark z-fighting line on the flank.
    const surface = bodySurfaceAt(shape, bodyParameterAtX(shape, x), flankAngle, -.006);
    const tipEnvelope = u <= tipAt
      ? Math.sin((u / tipAt) * Math.PI * .5)
      : Math.sin(((1 - u) / (1 - tipAt)) * Math.PI * .5);
    root.push(surface.toArray());
    freeEdge.push(surface.clone().add(new THREE.Vector3(
      sweep * tipEnvelope,
      -droop * tipEnvelope,
      side * spread * tipEnvelope,
    )).toArray());
  }
  return makeFinGeometry(root, freeEdge, low, .003, freeEdgeMotion, side);
}

/** A caudal keel should read as a low body ridge, never as an overlaid wire. */
function makeMarlinKeelGeometry(shape, side, low) {
  const alongSegments = low ? 10 : 18;
  const acrossSegments = low ? 4 : 8;
  const positions = [], uvs = [], indices = [];
  const tStart = .82, tEnd = .94;
  const centerAngle = side > 0 ? TAU : Math.PI;
  for (let i = 0; i <= alongSegments; i++) {
    const u = i / alongSegments;
    const t = tStart + (tEnd - tStart) * u;
    const lengthTaper = Math.pow(Math.sin(Math.PI * u), .7);
    for (let j = 0; j <= acrossSegments; j++) {
      const v = j / acrossSegments;
      const angle = centerAngle + (v * 2 - 1) * .085;
      const widthTaper = Math.sin(Math.PI * v);
      const lift = .0015 + .006 * lengthTaper * widthTaper;
      const point = bodySurfaceAt(shape, t, angle, lift);
      positions.push(point.x, point.y, point.z);
      // Match the body's cylindrical UVs so the ridge shares its pigment and
      // keeps the flank pattern continuous across the patch.
      uvs.push(t, angle / TAU);
    }
  }
  for (let i = 0; i < alongSegments; i++) for (let j = 0; j < acrossSegments; j++) {
    const a = i * (acrossSegments + 1) + j;
    const b = a + acrossSegments + 1;
    indices.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('aFin', new THREE.Float32BufferAttribute(new Float32Array(positions.length / 3), 1));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function finMaterial(uniforms, rays, cssStyle = false, clusterStyle = false, rustStyle = false, eelStyle = false) {
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
      uniform float uGlow; uniform float uRays; uniform float uImmersion;${cssStyle ? ' uniform vec3 uStyleShade; uniform vec3 uStyleAccent; uniform vec3 uStyleEmission; uniform float uStyleGlow; uniform float uStylePattern;' : ''}${eelStyle ? ' uniform float uEffort;' : ''} varying vec2 vUv; varying vec3 vNormal; varying vec3 vView;
      void main() {
        float fold=sin(vUv.x*uRays*6.283 + sin(vUv.y*4.0)*.5);
        float rays=pow(max(0.0,fold),22.0);
        float veins=pow(max(0.0,sin(vUv.x*uRays*12.566+vUv.y*16.0)),34.0)*.18;
        float edge=smoothstep(.93,1.0,vUv.y);
        vec3 n=vNormal/max(length(vNormal),.00001);
        vec3 eye=vView/max(length(vView),.00001);
        float fresnel=pow(clamp(1.0-abs(dot(n,eye)),0.0,1.0),2.2);
      float cssBubbles=smoothstep(.62,.92,.5+.5*sin(vUv.x*17.0+vUv.y*8.0));
        float structure=${cssStyle ? 'rays*.24+edge*.78+veins*.12+cssBubbles*.08' : clusterStyle ? 'rays*.34+edge*.72+veins*.18' : rustStyle ? 'rays*.18+edge*.58+veins*.08' : eelStyle ? 'rays*.22+edge*.70+veins*.08' : 'rays*.65+edge*.8+veins'};
        vec3 color=mix(${cssStyle ? 'uStyleShade*.46' : clusterStyle ? 'vec3(.025,.049,.047)' : rustStyle ? 'vec3(.025,.075,.17)' : eelStyle ? 'vec3(.28,.16,.025)' : 'vec3(.006,.055,.14)'},${cssStyle ? 'uStyleAccent*.68' : clusterStyle ? 'vec3(.12,.18,.16)' : rustStyle ? 'vec3(.14,.39,.76)' : eelStyle ? 'vec3(.88,.60,.10)' : 'vec3(.025,.26,.38)'},${cssStyle ? 'fold*.18+cssBubbles*.12+.42' : 'fold*.5+.5'});
        color+=${cssStyle ? 'uStyleEmission*uStyleGlow*.48' : clusterStyle ? 'vec3(.003,.009,.008)' : rustStyle ? 'vec3(.006,.035,.10)' : eelStyle ? 'vec3(.045,.025,.002)' : 'vec3(.06,.7,.98)'}*structure*uGlow*(1.0-uImmersion*.9);
        color+=${cssStyle ? 'uStyleAccent*.16' : clusterStyle ? 'vec3(.055,.085,.078)' : rustStyle ? 'vec3(.035,.13,.30)' : eelStyle ? 'vec3(.24,.15,.025)' : 'vec3(.025,.2,.29)'}*fresnel;
        color+=${eelStyle ? 'vec3(1.0,.46,.015)*smoothstep(.62,.84,uEffort)*(.52+.48*sin(swimPhase()*1.6-vUv.x*2.2))*structure*.32*(1.0-uImmersion*.6)' : 'vec3(0.0)'};
        float alpha=clamp(${cssStyle ? '.34' : clusterStyle ? '.56+rays*.12+edge*.18+fresnel*.04' : rustStyle ? '.57' : eelStyle ? '.20' : '.19'}+${cssStyle ? 'rays*.20*mix(.82,1.0,uStylePattern)+edge*.24+fresnel*.06+cssBubbles*.03' : clusterStyle ? '0.0' : rustStyle ? 'rays*.08+edge*.25+fresnel*.05' : eelStyle ? 'rays*.10+edge*.20+fresnel*.05' : 'rays*.20+edge*.24+fresnel*.06'},0.0,${clusterStyle ? '.92' : rustStyle ? '.94' : eelStyle ? '.68' : '.72'});
        alpha=mix(alpha,${clusterStyle ? '.68+.16*(1.0-vUv.y)+rays*.05' : rustStyle ? '.76+.12*(1.0-vUv.y)+rays*.025' : eelStyle ? '.42+.14*(1.0-vUv.y)+rays*.04' : '.48+.18*(1.0-vUv.y)+rays*.08'},uImmersion);
        alpha*=smoothstep(0.0,.035,vUv.x)*(1.0-smoothstep(.97,1.0,vUv.x));
        gl_FragColor=vec4(color,alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

export function createGoFish({ detail = 'high', phase = 0, waterUniforms, naturalSwim = Boolean(waterUniforms), visualProfile = 'ocean' } = {}) {
  const cssStyle = visualProfile === 'css';
  const clusterStyle = visualProfile === 'cluster';
  const rustStyle = visualProfile === 'rust';
  const eelStyle = visualProfile === 'eel';
  const swimVisualProfile = rustStyle ? RUST_BILLFISH_SWIM_VISUAL_PROFILE : eelStyle ? JS_EEL_SWIM_VISUAL_PROFILE : clusterStyle ? K8S_LEVIATHAN_SWIM_VISUAL_PROFILE : STANDARD_FISH_SWIM_VISUAL_PROFILE;
  const group = new THREE.Group(); group.name = cssStyle ? 'CSS fish' : clusterStyle ? 'K8s Leviathan' : rustStyle ? 'Rustカジキ' : eelStyle ? 'JS Anago' : 'Go魚';
  group.userData.cssFriendly = cssStyle;
  group.userData.rustBillfish = rustStyle;
  group.userData.jsEel = eelStyle;
  const shape = cssStyle ? cssShape : clusterStyle ? clusterShape : rustStyle ? rustShape : eelStyle ? eelShape : goShape;
  const cssRedStateUniform={value:0};
  const habitatUniforms=waterUniforms?{...waterUniforms,uFishCenter:{value:group.position},uFishVisibility:{value:1},...(cssStyle?{uCssRedState:cssRedStateUniform}:{})}:null;
  const catalog = visualProfile === 'catalog' || clusterStyle;
  const finHeightScale = cssStyle ? .82 : clusterStyle ? .82 : rustStyle ? .9 : eelStyle ? .68 : catalog ? .82 : 1;
  const finDepthScale = cssStyle ? .86 : clusterStyle ? .84 : rustStyle ? .86 : eelStyle ? .68 : catalog ? .72 : 1;
  // The ocean model is seen at a closer, more dynamic scale than the catalog
  // card. Keep the tail expressive, but prevent the fork and streamers from
  // becoming longer than the fish's readable silhouette.
  const tailHeightScale = cssStyle ? .94 : clusterStyle ? .96 : rustStyle ? 1.0 : eelStyle ? .62 : catalog ? .78 : .72;
  const tailDepthScale = cssStyle ? .80 : clusterStyle ? .88 : rustStyle ? .9 : eelStyle ? .68 : catalog ? .72 : .82;
  const streamerScale = catalog ? .58 : .72;
  const initialPalette = getCssFishPalette('normal');
  const uniforms = {
    uSwimTime: { value: phase }, uSwimFrequency: { value: 3.5 }, uSwimPower: { value: .48 }, uGlow: { value: 1 },
    uSwimWavelength: { value: 6.6 }, uNaturalSwim: { value: naturalSwim?1:0 }, uTurn:{value:0}, uEffort:{value:0},
    uBodyFlexStart:{value:swimVisualProfile.flexStartX},uBodyFlexLength:{value:swimVisualProfile.flexLength},
    uBodyBendGain:{value:swimVisualProfile.bendGain},uTurnBendGain:{value:swimVisualProfile.turnGain},
    uFinPhaseLag:{value:swimVisualProfile.finPhaseLag},uFinFlutterGain:{value:swimVisualProfile.finFlutterGain},
    uTetherLoad:{value:0}, uImmersion:{value:0}, uStyleBody:{value:new THREE.Color(initialPalette.body)},
    uStyleShade:{value:new THREE.Color(initialPalette.shade)}, uStyleAccent:{value:new THREE.Color(initialPalette.accent)},
    uStyleEmission:{value:new THREE.Color(initialPalette.emission)}, uStyleGlow:{value:initialPalette.glow},
    uStylePattern:{value:initialPalette.pattern},
    ...(rustStyle?{uRustSurge:{value:0}}:{}),
    ...(cssStyle?{uCssRedState:cssRedStateUniform}:{}),
  };
  const low = detail === 'low', geometries = new Set(), materials = new Set();
  function add(geometry, material, name, fin = 0) {
    if (!geometry.attributes.aFin) geometry.setAttribute('aFin', new THREE.Float32BufferAttribute(new Float32Array(geometry.attributes.position.count).fill(fin), 1));
    if (!geometry.attributes.uv) geometry.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(geometry.attributes.position.count * 2), 2));
    const mesh = new THREE.Mesh(geometry, material); mesh.name = name; mesh.frustumCulled = false;
    geometries.add(geometry); materials.add(material); group.add(mesh); return mesh;
  }
  const skin = animateMaterial(new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: clusterStyle ? .82 : rustStyle ? .42 : eelStyle ? .48 : .4, metalness: clusterStyle ? .035 : rustStyle ? .12 : eelStyle ? .035 : .16, clearcoat: clusterStyle ? .08 : rustStyle ? .22 : eelStyle ? .32 : .48, clearcoatRoughness: .3, iridescence: clusterStyle ? .015 : rustStyle ? .025 : eelStyle ? .045 : .15, iridescenceIOR: 1.3, envMapIntensity: .3 }), uniforms, 'body', cssStyle, clusterStyle, rustStyle, eelStyle);
  const body = add(makeBodyGeometry(detail, shape, rustStyle), skin, 'sculpted-body');
  const luminous = animateMaterial(clusterStyle
    ? new THREE.MeshStandardMaterial({ color: 0x9baebc, emissive: 0x071226, emissiveIntensity: .06, roughness: .78, metalness: .025 })
    : rustStyle
      ? new THREE.MeshStandardMaterial({ color: 0x796b5b, emissive: 0x100a04, emissiveIntensity: .025, roughness: .5, metalness: .04 })
      : new THREE.MeshBasicMaterial({ color: eelStyle ? new THREE.Color(1.15, .78, .06) : new THREE.Color(.055, 2.5, 3.4), toneMapped: false }), uniforms, 'light', cssStyle, clusterStyle, rustStyle, eelStyle);
  const subtle = animateMaterial(new THREE.MeshStandardMaterial({ color: clusterStyle ? 0x667b8d : rustStyle ? 0x887b6a : eelStyle ? 0x97724a : 0x43b9cd, emissive: clusterStyle ? 0x091a3a : rustStyle ? 0x080503 : eelStyle ? 0x1e1006 : 0x04758e, emissiveIntensity: clusterStyle ? .08 : rustStyle ? .025 : eelStyle ? .04 : .35, roughness: clusterStyle ? .82 : rustStyle ? .68 : eelStyle ? .72 : .33, metalness: clusterStyle ? .035 : rustStyle ? .06 : eelStyle ? .04 : .65 }), uniforms, 'plain', cssStyle, clusterStyle, rustStyle, eelStyle);
  const dark = animateMaterial(new THREE.MeshPhysicalMaterial({ color: clusterStyle ? 0x090f0e : rustStyle ? 0x11181a : eelStyle ? 0x100d08 : 0x010810, roughness: clusterStyle ? .38 : rustStyle ? .42 : eelStyle ? .55 : .2, metalness: 0, clearcoat: clusterStyle ? .06 : rustStyle ? .08 : eelStyle ? .07 : .45, envMapIntensity: .08 }), uniforms, 'plain', cssStyle, clusterStyle, rustStyle, eelStyle);
  const anagoLateralSpot = eelStyle
    ? animateMaterial(new THREE.MeshStandardMaterial({ color: 0xe0d8c5, emissive: 0x14110b, emissiveIntensity: .12, roughness: .78, metalness: 0 }), uniforms, 'plain', false, false, false, true)
    : null;
  const rustAnatomy = rustStyle
    ? animateMaterial(new THREE.MeshStandardMaterial({ color: 0x62747c, roughness: .92, metalness: .005 }), uniforms, 'plain', false, false, true)
    : subtle;
  // Keep the bill material separate from facial details for a readable
  // blue-gray silhouette under water.
  const billMaterial = rustStyle
    ? animateMaterial(new THREE.MeshPhysicalMaterial({ color: 0x344b69, roughness: .56, metalness: .025, clearcoat: .08, envMapIntensity: .16 }), uniforms, 'plain', false, false, true)
    : null;
  // ConeGeometry's point begins on +Y. Rotating +90 degrees points it along
  // local -X (the fish's nose); the near-round root overlaps the head instead
  // of leaving a detached spike, matching a marlin's long rounded bill.
  if (rustStyle) {
    const bill = new THREE.ConeGeometry(.18, 1.46, low ? 10 : 20, 1, false);
    bill.rotateZ(Math.PI / 2);
    bill.scale(1, .92, 1.0);
    bill.translate(-2.43, .008, 0);
    add(bill, billMaterial, 'marlin-spear-bill');
  }
  const armorMaterial = clusterStyle
    ? animateMaterial(new THREE.MeshPhysicalMaterial({ color: 0x465a68, roughness: .88, metalness: .025, clearcoat: .025, side: THREE.DoubleSide }), uniforms, 'plain', false, true)
    : null;
  function tube(points, radius, mat, name, fin = 0) {
    return add(new THREE.TubeGeometry(curve(points.map(p => p.isVector3 ? p.toArray() : p)), low ? 30 : 64, radius, 5, false), mat, name, fin);
  }
  const bodySurface = (t, angle, extra = 0) => bodySurfaceAt(shape, t, angle, extra);
  const fins = [];
  const finProfile = points => points.map(([x,y,z]) => [x,y*finHeightScale,z*finDepthScale]);
  const tailFinProfile = points => points.map(([x,y,z]) => [x,y*tailHeightScale,z*tailDepthScale]);
  function attachFin(name, geometry, rays = 22, side = 0) {
    // Rust fins use a solid, softly lit surface. The other fish keep their
    // species-specific translucent shader and ray patterns unchanged.
    const material = rustStyle
      ? animateMaterial(new THREE.MeshPhysicalMaterial({
        color: name.includes('dorsal') || name.includes('crescent-tail') ? 0x315778 : 0x5a7888,
        roughness: .5, metalness: .025, clearcoat: .08, clearcoatRoughness: .48,
        side: THREE.DoubleSide,
      }), uniforms, 'fin', false, false, true)
      : finMaterial(uniforms, rays, cssStyle, clusterStyle, rustStyle, eelStyle);
    if (rustStyle) material.userData.fishFinSide = side;
    const mesh = add(geometry, material, name);
    fins.push(mesh);
    return mesh;
  }
  function fin(name, base, edge, rays = 22, profile = finProfile, side = 0, freeEdgeMotion = 1) {
    return attachFin(name, makeFinGeometry(profile(base), profile(edge), low, rustStyle ? .008 : .065, freeEdgeMotion), rays, side);
  }
  function foldedMarlinFin(name, xStart, xEnd, side, flankAngle, options, rays, freeEdgeMotion) {
    const geometry = makeFoldedMarlinFinGeometry(shape, {
      xStart, xEnd, side, flankAngle, ...options,
    }, low, freeEdgeMotion);
    return attachFin(name, geometry, rays, side);
  }
  if (rustStyle) {
    // Striped marlin: the first dorsal is high and long-based, but not a
    // sailfish sail. A distinct small second dorsal and anal fin sit aft.
    fin('marlin-first-dorsal',
      [[-1.28,.28,0],[-1.25,.31,0],[-1.15,.34,0],[-1.02,.37,0],[-.87,.40,0],[-.68,.40,0],[-.43,.37,0],[-.25,.34,0]],
      [[-1.28,.28,0],[-1.25,.53,0],[-1.15,.84,-.01],[-1.02,1.08,-.02],[-.87,1.02,-.02],[-.68,.79,-.015],[-.43,.55,-.01],[-.25,.34,0]], 24);
    fin('marlin-second-dorsal',
      [[.98,.095,0],[1.15,.075,0],[1.34,.045,0]],
      [[.98,.095,0],[1.10,.20,0],[1.22,.18,0],[1.34,.045,0]], 12);
    fin('marlin-anal',
      [[-.18,-.40,0],[.12,-.37,0],[.48,-.24,0]],
      [[-.18,-.40,0],[-.12,-.52,0],[.08,-.56,.01],[.29,-.49,.01],[.48,-.24,0]], 12);
    fin('marlin-second-anal',
      [[.98,-.095,0],[1.15,-.075,0],[1.32,-.045,0]],
      [[.98,-.095,0],[1.10,-.20,0],[1.22,-.17,0],[1.32,-.045,0]], 12);
    for (const sign of [-1, 1]) {
      // Keep the paired caudal keels fused to the body. A narrow surface patch
      // shares the skin shader, avoiding the dark wire edge of a tube overlay.
      add(makeMarlinKeelGeometry(shape, sign, low), skin, `marlin-caudal-keel-${sign}`);
    }
    for (const sign of [-1, 1]) {
      // The pectoral follows the flank from shoulder to a swept-back tip.
      // Root points come from the actual body surface; the folded free edge
      // stays close and receives only a restrained, phase-lagged response.
      foldedMarlinFin(`marlin-pectoral-${sign}`, -.82, -.16, sign,
        sign > 0 ? -.46 : Math.PI + .46,
        { spread: .045, droop: .035, sweep: .14, tipAt: .84 }, 12, .42);
      // The pelvic pair is shorter, more ventral, and less mobile; this keeps
      // the far-side pair from forming a second silhouette under the belly.
      foldedMarlinFin(`marlin-pelvic-${sign}`, .22, .68, sign,
        sign > 0 ? -1.0 : Math.PI + 1.0,
        { spread: .02, droop: .014, sweep: .04, tipAt: .72 }, 10, .2);
    }
    // The caudal fin is one continuous crescent, not two nearly coplanar
    // left/right fins. A single double-sided membrane avoids the bright seam
    // that the overlapping pair produced along the peduncle.
    fin('marlin-crescent-tail',
      [[1.42,.045,0],[1.56,0,0],[1.42,-.045,0]],
      [[2.06,.78,0],[1.88,.40,0],[1.72,0,0],[1.88,-.40,0],[2.06,-.78,0]], 14, tailFinProfile);
  } else if (eelStyle) {
    // Ma-anago has low dorsal and anal folds that run back to the pointed tail.
    fin('eel-dorsal',
      [[-.22,.18,0],[.38,.14,0],[1.02,.085,0],[1.72,.035,0],[2.12,.036,0],[2.42,.019,0]],
      [[-.22,.18,0],[.18,.27,0],[.72,.23,-.01],[1.30,.13,-.01],[1.78,.060,0],[2.12,.038,0],[2.42,.019,0]], 18);
    fin('eel-anal',
      [[-.10,-.18,0],[.46,-.13,0],[1.10,-.075,0],[1.72,-.03,0],[2.12,-.036,0],[2.42,-.019,0]],
      [[-.10,-.18,0],[.22,-.26,0],[.78,-.22,.01],[1.34,-.12,.01],[1.78,-.060,0],[2.12,-.038,0],[2.42,-.019,0]], 18);
    for (const sign of [-1, 1]) {
      fin(`eel-pectoral-${sign}`,
        [[-1.02,-.055,.095*sign],[-.87,-.08,.10*sign],[-.70,-.10,.075*sign]],
        [[-1.02,-.055,.095*sign],[-.89,-.15,.19*sign],[-.66,-.22,.26*sign],[-.57,-.17,.16*sign],[-.70,-.10,.075*sign]], 12);
    }
  } else {
  fin('dorsal-sail',
    cssStyle ? [[-1.00,.38,0],[-.54,.45,0],[-.02,.36,0],[.54,.14,0]] : clusterStyle ? [[-.40,.57,0],[.08,.58,0],[.53,.40,0],[.96,.15,0]] : [[-.85,.47,0],[-.3,.52,0],[.45,.36,0],[1.27,.11,0]],
    cssStyle ? [[-1.00,.38,0],[-.78,.57,0],[-.42,.68,-.02],[-.08,.61,-.02],[.28,.39,-.02],[.54,.14,0]] : clusterStyle ? [[-.40,.57,0],[-.12,.91,0],[.32,1.02,-.02],[.53,.66,-.02],[.76,.36,0],[.96,.15,0]] : [[-.85,.47,0],[-.48,.95,0],[.58,1.51,-.025],[.33,.91,-.02],[.75,.56,0],[1.27,.11,0]],
    cssStyle ? 18 : clusterStyle ? 18 : 22);
  fin('anal-sail',
    cssStyle ? [[-.34,-.43,0],[.16,-.35,0],[.72,-.12,0]] : clusterStyle ? [[.28,-.46,0],[.74,-.32,0],[1.10,-.12,0]] : [[-.12,-.48,0],[.55,-.32,0],[1.35,-.1,0]],
    cssStyle ? [[-.34,-.43,0],[-.08,-.58,.02],[.28,-.60,0],[.55,-.39,0],[.72,-.12,0]] : clusterStyle ? [[.28,-.46,0],[.50,-.72,.02],[.79,-.74,0],[.91,-.43,0],[1.10,-.12,0]] : [[-.12,-.48,0],[.48,-.93,.025],[.94,-1.04,0],[.72,-.51,0],[1.35,-.1,0]],
    cssStyle ? 14 : clusterStyle ? 15 : 16);
  for (const sign of [-1, 1]) {
    fin('pectoral-' + sign,
      cssStyle ? [[-.98,-.07,.22*sign],[-.72,-.12,.22*sign],[-.48,-.18,.18*sign]] : clusterStyle ? [[-.72,-.14,.31*sign],[-.36,-.24,.36*sign],[.00,-.29,.28*sign]] : [[-.86,-.14,.27*sign],[-.68,-.23,.28*sign],[-.49,-.33,.24*sign]],
      cssStyle ? [[-.98,-.07,.22*sign],[-.74,-.20,.39*sign],[-.40,-.34,.48*sign],[-.22,-.31,.34*sign],[-.48,-.18,.18*sign]] : clusterStyle ? [[-.72,-.14,.31*sign],[-.55,-.30,.52*sign],[-.18,-.52,.78*sign],[.28,-.60,.72*sign],[.48,-.43,.42*sign],[.00,-.29,.28*sign]] : [[-.86,-.14,.27*sign],[-.44,-.42,.76*sign],[.1,-.88,1.0*sign],[-.16,-.73,.60*sign],[-.49,-.33,.24*sign]],
      cssStyle ? 13 : clusterStyle ? 15 : 15);
    fin('pelvic-' + sign,
      cssStyle ? [[.16,-.27,.11*sign],[.42,-.21,.10*sign],[.68,-.11,.08*sign]] : clusterStyle ? [[.37,-.31,.20*sign],[.68,-.22,.15*sign],[.92,-.13,.10*sign]] : [[.35,-.35,.15*sign],[.68,-.23,.14*sign],[.91,-.16,.12*sign]],
      cssStyle ? [[.16,-.27,.11*sign],[.39,-.41,.21*sign],[.70,-.43,.23*sign],[.62,-.28,.14*sign],[.68,-.11,.08*sign]] : clusterStyle ? [[.37,-.31,.20*sign],[.48,-.50,.35*sign],[.83,-.48,.29*sign],[1.04,-.30,.17*sign],[.92,-.13,.10*sign]] : [[.35,-.35,.15*sign],[.86,-.72,.35*sign],[1.4,-.78,.43*sign],[1.05,-.42,.22*sign],[.91,-.16,.12*sign]],
      cssStyle ? 11 : clusterStyle ? 12 : 13);
  }
  for (const sign of [-1, 1]) {
    fin('forked-tail-' + sign,
      cssStyle ? [[.84,0,0],[.90,.018*sign,0],[.94,.01*sign,0],[.90,0,0]] : clusterStyle ? [[1.20,0,0],[1.28,.018*sign,0],[1.34,.01*sign,0],[1.28,0,0]] : [[1.7,0,0],[1.83,.035*sign,0],[1.94,.016*sign,0],[1.89,0,0]],
      cssStyle ? [[.86,0,0],[1.13,.14*sign,.008],[1.58,.29*sign,.02],[1.80,.10*sign,.014],[1.46,.025*sign,0],[1.14,.012*sign,0],[.90,0,0]] : clusterStyle
        ? sign > 0
          ? [[1.24,0,0],[1.58,.20,.008],[1.96,.58,.02],[2.16,.76,.015],[2.20,.43,0],[1.92,.12,0],[1.70,.025,0],[1.28,0,0]]
          : [[1.24,0,0],[1.55,-.13,.008],[1.82,-.32,.02],[2.00,-.22,.015],[1.92,-.08,0],[1.64,-.02,0],[1.28,0,0]]
        : [[1.7,0,0],[2.2,.48*sign,.012],[3.22,1.12*sign,.03],[2.8,.45*sign,.018],[2.32,.13*sign,0],[1.89,0,0]],
      cssStyle ? 17 : clusterStyle ? 18 : 22, tailFinProfile);
    if (!cssStyle && !clusterStyle) {
      // Two terminal streamers per tail lobe, not disconnected trailing lines.
      for (let i = 0; i < 2; i++) {
        const streamerPoint = (x,y,z) => [1.9+(x-1.9)*streamerScale,y*streamerScale,z*streamerScale];
        const points = [streamerPoint(3.05-i*.33,(1.01-i*.43)*sign,.025),streamerPoint(3.42-i*.16,(1.17-i*.45)*sign,.04),streamerPoint(3.8-i*.16,(1.12-i*.42)*sign,.08),streamerPoint(4.06-i*.23,(.96-i*.36)*sign,.12)];
        tube(points, .006, subtle, `tail-filament-${sign}-${i}`, .8);
        const tip = new THREE.SphereGeometry(.026, 10, 8); tip.translate(...points.at(-1)); add(tip, luminous, 'filament-light', .8);
      }
    }
  }
  }
  const eyeScale = clusterStyle ? .58 : rustStyle ? .88 : eelStyle ? .9 : cssStyle ? 1.04 : 1;
  for (const sign of [-1, 1]) {
    const eyeAnchor = clusterStyle
      ? bodySurface(.29, sign > 0 ? .20 : Math.PI - .20, .035)
      : rustStyle
        ? new THREE.Vector3(-1.47, .13, .17 * sign)
        : eelStyle
          ? new THREE.Vector3(-1.60, .085, .12 * sign)
        : new THREE.Vector3(-1.455, .112, .196 * sign);
    const { x, y, z } = eyeAnchor;
    const eyeball = new THREE.SphereGeometry(1, 28, 22); eyeball.scale(.153*eyeScale,.157*eyeScale,.088*eyeScale); eyeball.translate(x,y,z);
    add(eyeball, dark, 'black-eye-' + sign);
    const socket = new THREE.TorusGeometry(.148*eyeScale,.015*eyeScale,8,42); socket.translate(x,y,z + .017*sign); add(socket, subtle, 'orbital-rim');
    const iris = new THREE.TorusGeometry(.121*eyeScale,.0065*eyeScale,8,40); iris.translate(x,y,z + .061*sign); add(iris, eelStyle ? subtle : luminous, clusterStyle ? 'stone-iris' : eelStyle ? 'anago-iris' : 'cyan-iris');
    const glint = new THREE.SphereGeometry(.024*eyeScale,10,8); glint.scale(1,.7,.3); glint.translate(x-.033,y+.06,z+.087*sign); add(glint, eelStyle ? anagoLateralSpot : luminous, 'eye-catchlight');
    const gill = [];
    if (clusterStyle) {
      // A short, rear-slanting seam reads as the edge of the head shield,
      // rather than a long black stripe dividing the whole fish in half.
      for (let j = 0; j <= 14; j++) {
        const angle = -.62 + j / 14 * 1.24;
        const t = .43 - Math.sin(angle) * .045 + Math.cos(angle) * .012;
        gill.push(bodySurface(t, sign > 0 ? angle : Math.PI - angle, .012));
      }
      tube(gill,.0045,subtle,`armor-seam-${sign}`);
    } else if (rustStyle) {
      // At this viewing scale the procedural opercular tube reads as a black
      // slash rather than a gill crease, so let the head silhouette carry it.
    } else if (eelStyle) {
      const gillPoints = [];
      for (let j = 0; j <= 10; j++) {
        const t = .29 + j / 10 * .085;
        const angle = -.68 + j / 10 * 1.36;
        gillPoints.push(bodySurface(t, sign > 0 ? angle : Math.PI - angle, .006));
      }
      tube(gillPoints, .0045, dark, `eel-gill-${sign}`);
    } else {
      for (let j = 0; j <= 18; j++) {
        const angle = -.98 + j / 18 * 2.05, t = .27 + Math.cos(angle) * .037;
        gill.push(bodySurface(t, angle + (sign < 0 ? Math.PI : 0), .007));
      }
      tube(gill,.009,dark,'gill-slit');
      tube(gill.map(p => [p.x+.02,p.y,p.z+sign*.004]),.006,subtle,'gill-lip');
    }
    if (clusterStyle) {
      // A thin bite seam gives the broad head a jaw without a contrasting
      // oval cheek plate that reads like a loose prop at close range.
      const seam = [.018,.055,.095,.14,.19].map((t,index) =>
        bodySurface(t, sign > 0 ? -.08 - index * .05 : Math.PI + .08 + index * .05, .016));
      tube(seam,.006,dark,`placoderm-mouth-seam-${sign}`);
    } else if (rustStyle) {
      // A mouth crease should remain readable, but never use the near-black
      // eye material: that made the jaw look like a stray wire in profile.
      tube([[-1.86,-.018,.013*sign],[-1.73,-.055,.062*sign],[-1.54,-.09,.11*sign]], .0045, rustAnatomy, `billfish-mouth-${sign}`);
    } else if (eelStyle) {
      tube([[-1.86,-.012,.013*sign],[-1.76,-.045,.052*sign],[-1.63,-.042,.088*sign]], .006, dark, `anago-mouth-${sign}`);
      tube([[-1.96,.02,.01*sign],[-1.86,.024,.038*sign],[-1.72,.008,.071*sign]], .009, subtle, `anago-upper-jaw-${sign}`);
    } else {
      tube(cssStyle
        ? [[-1.86,-.018,.013*sign],[-1.77,-.062,.075*sign],[-1.64,-.050,.118*sign]]
        : [[-1.86,-.012,.013*sign],[-1.70,-.071,.088*sign],[-1.49,-.13,.165*sign]],.009,dark,cssStyle?'css-mouth-line':'mouth-line');
    }
    if (cssStyle) {
      tube([[-1.84,-.006,.015*sign],[-1.73,.018,.072*sign],[-1.62,.012,.102*sign]],.005,subtle,'css-mouth-lip');
    }
    // Branching luminous conduits follow the *surface* so they remain coherent
    // under rotation and deformation, rather than being a 2D decal.
    if (!cssStyle && !clusterStyle && !rustStyle && !eelStyle) {
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
    } else if (cssStyle) {
      // CSS fish uses a few restrained body marks instead of Go's branching
      // circuitry. They stay subordinate to the body, gill and tail silhouette.
      for (let dotIndex = 0; dotIndex < 4; dotIndex++) {
        const t = .39 + dotIndex * .11;
        const angle = -.42 + (dotIndex % 2) * .56;
        const p = bodySurface(t, sign > 0 ? angle : Math.PI-angle, .018);
        const dot = new THREE.SphereGeometry(.011 + (dotIndex % 2) * .003, low ? 7 : 10, 7);
        dot.scale(.9, .9, .42); dot.translate(p.x, p.y, p.z);
        add(dot, subtle, 'css-style-mark');
      }
    } else if (eelStyle) {
      // A few subdued amber points suggest JavaScript event hand-offs without
      // replacing the anago's natural markings with a circuit-board pattern.
      for (let mark = 0; mark < 4; mark++) {
        const t = .40 + mark * .13;
        const angle = -.34 + (mark % 2) * .42;
        const p = bodySurface(t, sign > 0 ? angle : Math.PI - angle, .009);
        const dot = new THREE.SphereGeometry(.008 + (mark % 2) * .002, low ? 6 : 9, 6);
        dot.scale(1.8, .65, .45); dot.translate(p.x, p.y, p.z);
        add(dot, luminous, 'js-event-node');
      }
      // Ma-anago's pale lateral-line spots are a physical marking, separate
      // from the small amber JavaScript event accents.
      for (let spot = 0; spot < 8; spot++) {
        const t = .39 + spot * .052 + Math.sin(spot * 2.3) * .0035;
        const p = bodySurface(t, sign > 0 ? 0 : Math.PI, .01);
        const radius = spot % 3 === 1 ? .020 : spot % 3 === 2 ? .016 : .018;
        const mark = new THREE.SphereGeometry(radius, 8, 6);
        mark.scale(1.12, .76, .36);
        mark.translate(p.x, p.y, p.z);
        add(mark, anagoLateralSpot!, 'anago-lateral-spot');
      }
    }
  }
  if (clusterStyle) {
    // Keep the skull shield on the crown. When it wraps down the flanks it
    // reads as a detached oval cheek patch from the side camera.
    add(makeSurfaceArmorGeometry(shape, .035, .34, Math.PI / 2, .78, detail), armorMaterial, 'dorsal-head-shield');
  }
  // Merge tiny light meshes sharing a material into one draw, keeping original
  // vertex positions for the exact same GPU swim deformation.
  for (const mat of [luminous, subtle, dark, ...(armorMaterial ? [armorMaterial] : []), ...(anagoLateralSpot ? [anagoLateralSpot] : [])]) {
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
    add(merged,mat,'merged-'+(mat===luminous?'lights':mat===dark?'eyes-and-anatomy':mat===armorMaterial?'dunkleosteus-armor':mat===anagoLateralSpot?'anago-lateral-spots':'veins'));
  }
  if(habitatUniforms)for(const material of materials){
    const part=material.userData.fishPart||(material.isShaderMaterial?'fin':'detail');
    applyFishWater(material,habitatUniforms,part,cssStyle?CSS_FISH_WATER_PROFILE:clusterStyle?K8S_LEVIATHAN_WATER_PROFILE:undefined,material.userData.fishFinSide??0);
  }
  let visualState: CssFishVisualState = 'normal';
  const styleCurrent = {
    body: new THREE.Color(initialPalette.body), shade: new THREE.Color(initialPalette.shade),
    accent: new THREE.Color(initialPalette.accent), emission: new THREE.Color(initialPalette.emission),
    glow: initialPalette.glow, pattern: initialPalette.pattern, redState: cssFishRedStateStrength('normal'),
  };
  const styleTarget = {
    body: styleCurrent.body.clone(), shade: styleCurrent.shade.clone(), accent: styleCurrent.accent.clone(),
    emission: styleCurrent.emission.clone(), glow: styleCurrent.glow, pattern: styleCurrent.pattern, redState: styleCurrent.redState,
  };
  const setVisualState = (next: CssFishVisualState) => {
    if (!cssStyle) return;
    visualState = next;
    const palette = getCssFishPalette(next);
    styleTarget.body.setHex(palette.body); styleTarget.shade.setHex(palette.shade);
    styleTarget.accent.setHex(palette.accent); styleTarget.emission.setHex(palette.emission);
    styleTarget.glow = palette.glow; styleTarget.pattern = palette.pattern;
    styleTarget.redState = cssFishRedStateStrength(next);
  };
  const updateVisualStyle = (delta: number) => {
    if (!cssStyle) return;
    const blend = 1 - Math.exp(-Math.max(.001, delta) * 8);
    styleCurrent.body.lerp(styleTarget.body, blend); styleCurrent.shade.lerp(styleTarget.shade, blend);
    styleCurrent.accent.lerp(styleTarget.accent, blend); styleCurrent.emission.lerp(styleTarget.emission, blend);
    styleCurrent.glow += (styleTarget.glow - styleCurrent.glow) * blend;
    styleCurrent.pattern += (styleTarget.pattern - styleCurrent.pattern) * blend;
    styleCurrent.redState += (styleTarget.redState - styleCurrent.redState) * blend;
    uniforms.uStyleBody.value.copy(styleCurrent.body); uniforms.uStyleShade.value.copy(styleCurrent.shade);
    uniforms.uStyleAccent.value.copy(styleCurrent.accent); uniforms.uStyleEmission.value.copy(styleCurrent.emission);
    uniforms.uStyleGlow.value = styleCurrent.glow; uniforms.uStylePattern.value = styleCurrent.pattern;
    cssRedStateUniform.value = styleCurrent.redState;
    subtle.color.copy(styleCurrent.accent); subtle.emissive.copy(styleCurrent.emission);
  };
  setVisualState(visualState);
  let disposed = false;
  let rustSurgeCurrent = 0;
  return {
    group, body, fins, waterUniforms:habitatUniforms, setVisualState,
    update(time, {power=.48, glow=1, bodyPhase, bodyFrequency, bodyWavelength, turn=0, effort=power, tetherLoad=0, surge=0, visibility=1, styleDelta=.016}={}) {
      updateVisualStyle(styleDelta);
      if(rustStyle){
        const target=clamp(surge,0,1);
        const rate=target>rustSurgeCurrent?18:5.5;
        rustSurgeCurrent+=(target-rustSurgeCurrent)*(1-Math.exp(-Math.max(.001,styleDelta)*rate));
        uniforms.uRustSurge.value=rustSurgeCurrent;
      }
      const synced=Number.isFinite(bodyPhase)&&Number.isFinite(bodyFrequency)&&bodyFrequency>0;
      uniforms.uSwimTime.value=synced?bodyPhase/(bodyFrequency*TAU):time+phase;
      uniforms.uSwimFrequency.value=synced?bodyFrequency*TAU:3.5;
      uniforms.uSwimPower.value=clamp(power,0,1);
      uniforms.uTurn.value=clamp(turn,-1,1);
      uniforms.uEffort.value=clamp(effort,0,1);
      uniforms.uTetherLoad.value=waterUniforms&&Number.isFinite(tetherLoad)?clamp(tetherLoad,0,1):0;
      uniforms.uImmersion.value=waterUniforms?clamp(-group.position.y/.6,0,1):0;
      if(habitatUniforms)habitatUniforms.uFishVisibility.value=clamp(visibility,0,1);
      uniforms.uSwimWavelength.value=waterUniforms&&Number.isFinite(bodyWavelength)?TAU/clamp(bodyWavelength,.5,1.5):6.6;
      uniforms.uGlow.value=glow*(.96+.04*Math.sin((synced?bodyPhase:time*3.5+phase)*.49));
    },
    get stats() { return { meshes:group.children.length, triangles:[...geometries].reduce((n,g)=>n+(g.index?g.index.count:g.attributes.position.count)/3,0), materials:materials.size }; },
    dispose() { if(disposed)return;disposed=true;for(const g of geometries)g.dispose();for(const m of materials)m.dispose();group.clear(); },
  };
}
