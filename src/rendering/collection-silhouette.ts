// @ts-nocheck -- imperative material and shader customization at the vendored Three.js boundary.
import * as THREE from '../../vendor/three.module.js';

const SILHOUETTE_COLOR = 'vec3(0.002, 0.006, 0.009)';
const SILHOUETTE_SHADER_KEY = 'collection-silhouette-v1';

function silhouetteMaterial(material) {
  if (material.userData.collectionSilhouette) return;

  const originalCompile = material.onBeforeCompile;
  const originalCompileSource = originalCompile.toString();
  const originalCacheKey = material.customProgramCacheKey;
  const isShaderMaterial = material.isShaderMaterial;

  material.onBeforeCompile = function (shader, renderer) {
    originalCompile.call(this, shader, renderer);
    shader.uniforms.uCollectionSilhouette = { value: 1 };

    if (isShaderMaterial) {
      if (!shader.fragmentShader.includes('gl_FragColor=vec4(color,alpha);')) {
        throw new Error('Collection silhouette could not find the fin color output.');
      }
      shader.fragmentShader = `uniform float uCollectionSilhouette;\n${shader.fragmentShader}`;
      shader.fragmentShader = shader.fragmentShader.replace(
        'gl_FragColor=vec4(color,alpha);',
        `gl_FragColor=vec4(mix(color, ${SILHOUETTE_COLOR}, uCollectionSilhouette), mix(alpha, 1.0, uCollectionSilhouette));`,
      );
      return;
    }

    if (!shader.fragmentShader.includes('#include <opaque_fragment>')) {
      throw new Error('Collection silhouette could not find the material color output.');
    }
    shader.fragmentShader = `uniform float uCollectionSilhouette;\n${shader.fragmentShader}`;
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <opaque_fragment>',
      `outgoingLight = mix(outgoingLight, ${SILHOUETTE_COLOR}, uCollectionSilhouette);\n\t#include <opaque_fragment>`,
    );
  };
  material.customProgramCacheKey = function () {
    const originalKey = originalCacheKey.call(this);
    return `${originalKey}|${originalCompileSource}|${SILHOUETTE_SHADER_KEY}`;
  };

  // In particular, translucent membrane fins must become part of one solid
  // silhouette instead of showing the original species color through them.
  material.color?.setRGB(0.002, 0.006, 0.009);
  material.emissive?.setRGB(0, 0, 0);
  material.emissiveIntensity = 0;
  material.opacity = 1;
  material.transparent = false;
  material.depthWrite = true;
  material.blending = THREE.NormalBlending;
  material.toneMapped = false;
  material.needsUpdate = true;
  material.userData.collectionSilhouette = true;
}

/** Apply a black, opaque presentation only to this catalog-model instance. */
export function applyCollectionSilhouette(root) {
  root.traverse(object => {
    if (!object.isMesh) return;

    // These are floating UI-like decorations, not part of the whale's body.
    if (object.name === 'cargo-contact-shadow' || object.name.includes('status-halo')) {
      object.visible = false;
      return;
    }

    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) silhouetteMaterial(material);
  });
}
