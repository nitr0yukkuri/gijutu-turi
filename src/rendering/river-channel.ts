const smoothstep=(low:number,high:number,value:number):number=>{
  const t=Math.max(0,Math.min(1,(value-low)/(high-low)));
  return t*t*(3-2*t);
};

// Keep the visible river corridor and the water's depth/flow shading aligned.
export function riverCenterAt(z:number):number {
  return -28*smoothstep(42,185,-z)+Math.sin(z*.024)*2.5;
}

export function riverHalfWidthAt(z:number):number {
  return 20+Math.sin(z*.02+.7)*2.1+Math.sin(z*.11-.4)*.55;
}

export function riverBankHeightAt(side:number,distance:number,z:number):number {
  return .06+smoothstep(0,4.5,distance)*(.8+.3*Math.sin(z*.08))
    +smoothstep(3,19,distance)*(side>0?3.8:2.1)
    +smoothstep(15,70,distance)*(2.4+Math.sin(z*.035+side)*1.3);
}

export const riverChannelGLSL=`
float riverCenterline(float z) {
  return -28.0*smoothstep(42.0,185.0,-z)+sin(z*0.024)*2.5;
}
float riverHalfWidth(float z) {
  return 20.0+sin(z*0.02+0.7)*2.1+sin(z*0.11-0.4)*0.55;
}
`;
