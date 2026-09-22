export const waterShader = `
precision highp float;
varying vec2 vUv;
uniform float uTime;
uniform mat4 uCamera;
uniform mat4 uProjectionInverse;
uniform vec4 uRipples[6];
uniform vec2 uResolution;

float hash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float noise(vec2 p) {
  vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
}
float heightAt(vec2 p) {
  float h=0.0;
  float freq=0.42, amp=0.13, angle=0.3;
  for(int i=0;i<7;i++) {
    vec2 d=vec2(cos(angle),sin(angle));
    h+=sin(dot(p,d)*freq+uTime*(0.42+float(i)*0.14))*amp;
    freq*=1.83; amp*=0.48; angle+=2.17;
  }
  for(int i=0;i<6;i++) {
    float age=uTime-uRipples[i].z;
    if(age>0.0 && age<8.0) {
      float d=length(p-uRipples[i].xy), r=d-age*1.25;
      h+=sin(r*11.0)*exp(-r*r*1.6)*exp(-age*0.55)*0.08*uRipples[i].w;
    }
  }
  return h;
}
vec3 sky(vec3 d) {
  float elevation=max(d.y,0.0);
  vec3 horizon=vec3(0.36,0.46,0.49);
  vec3 zenith=vec3(0.04,0.09,0.16);
  vec3 c=mix(horizon,zenith,pow(clamp(elevation*2.6,0.0,1.0),0.55));
  vec3 sun=normalize(vec3(-0.42,0.065,-1.0));
  float alignment=max(dot(d,sun),0.0);
  c+=vec3(0.28,0.15,0.075)*pow(alignment,25.0);
  c+=vec3(1.0,0.71,0.40)*pow(alignment,17000.0)*0.85;
  vec2 cp=d.xz/(max(d.y,0.02)+0.16);
  float cloud=noise(cp*vec2(1.6,8.0)+vec2(uTime*0.002,0.0));
  cloud=clamp((cloud-0.5)*1.8,0.0,0.3)*smoothstep(0.0,0.16,elevation);
  return c+vec3(0.045,0.05,0.05)*cloud;
}
void main(){
  vec4 local=uProjectionInverse*vec4(vUv*2.0-1.0,1.0,1.0);
  vec3 rd=normalize((uCamera*vec4(normalize(local.xyz/local.w),0.0)).xyz);
  vec3 ro=uCamera[3].xyz;
  vec3 color=sky(rd);
  if(rd.y < -0.0004) {
    float t=-ro.y/rd.y;
    for(int i=0;i<4;i++) t=(heightAt((ro+rd*t).xz)-ro.y)/rd.y;
    vec3 p=ro+rd*t;
    float eps=0.035+min(t,180.0)*0.001;
    float hx=heightAt(p.xz+vec2(eps,0))-heightAt(p.xz-vec2(eps,0));
    float hz=heightAt(p.xz+vec2(0,eps))-heightAt(p.xz-vec2(0,eps));
    vec3 n=normalize(vec3(-hx,eps*2.0,-hz));
    float fine=(noise(p.xz*4.5+uTime*0.07)-0.5)*0.035;
    n=normalize(n+vec3(fine,0.0,fine*0.8));
    n=normalize(mix(n,vec3(0.0,1.0,0.0),smoothstep(90.0,450.0,t)));
    vec3 reflected=reflect(rd,n);
    float fresnel=0.035+0.965*pow(1.0-max(dot(-rd,n),0.0),4.5);
    vec3 water=vec3(0.014,0.071,0.094)+vec3(0.012,0.03,0.032)*(n.y*0.5+0.5);
    color=mix(water,sky(reflected),fresnel*0.88);
    vec3 sun=normalize(vec3(-0.42,0.065,-1.0));
    float glint=pow(max(dot(reflected,sun),0.0),260.0);
    color+=vec3(0.82,0.67,0.44)*glint*0.66;
    float broad=pow(max(dot(reflected,sun),0.0),18.0);
    color+=vec3(0.017,0.023,0.023)*broad;
    for(int i=0;i<6;i++) {
      float age=uTime-uRipples[i].z;
      if(age>0.0 && age<6.0) {
        float d=length(p.xz-uRipples[i].xy);
        float ring=exp(-pow((d-age*1.25)*13.0,2.0));
        color+=vec3(0.3,0.48,0.48)*ring*exp(-age*0.9)*uRipples[i].w;
      }
    }
    float haze=1.0-exp(-t*0.006);
    color=mix(color,sky(vec3(rd.x,0.0,rd.z)),haze*0.97);
  }
  float vignette=1.0-smoothstep(0.3,0.95,length((vUv-0.5)*vec2(0.75,1.0)))*0.18;
  color*=vignette;
  color+=(hash(gl_FragCoord.xy)-0.5)*0.0018;
  gl_FragColor=vec4(color,1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
