const $=selector=>document.querySelector(selector);
const controllerId=new URLSearchParams(location.search).get('controller');
const isPhone=Boolean(controllerId);
let ocean,socket,roomId,online=false,retries=0,retryTimer,closing=false,renderFailed=false,displayConnected=true;
let state={phase:'idle',revision:0,strength:.65,aim:0,castAt:0,retrieveAt:0};
let chargeAt=null,chargeFrame,aim=0,toastTimer,feedbackTimer;
let audioContext,seaGain,soundEnabled=false;
let reelHeld=false,reelTimer,lastVibration=0;
let hasGo=false;try{hasGo=localStorage.getItem('gijutu.collection.go')==='caught';}catch{}
const failureHints={missed:['合わせが、少し遅かった。','ウキが沈んだら、Spaceかボタンで合わせよう。'],line:['糸が、切れた。','赤くなる前に巻く手を止めよう。'],slack:['針が、外れた。','糸が緩みきる前に、少し巻こう。'],distance:['沖へ、逃げられた。','魚が落ち着く間に、少しずつ巻こう。']};
const clamp=(value,lo,hi)=>Math.max(lo,Math.min(hi,value));

function toast(text){$('#toast').textContent=text;$('#toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),3500);}
function feedback(text,detail='',fade=0){clearTimeout(feedbackTimer);$('.cast-feedback').classList.remove('is-faded');$('#cast-status').textContent=text;$('#cast-detail').textContent=detail;if(fade)feedbackTimer=setTimeout(()=>$('.cast-feedback').classList.add('is-faded'),fade);}
function setConnected(value){
  online=value;
  $('#cast-button').disabled=!value||renderFailed||['casting','retrieving'].includes(state.phase);
  $('#phone-cast').disabled=!value||!displayConnected||['casting','retrieving'].includes(state.phase);
  $('#fight-button').disabled=!value||renderFailed;
  $('#catch-again').disabled=!value;$('#escape-again').disabled=!value;
  if(!value){stopReel();$('#connection-status').hidden=true;$('#phone-connection').textContent='海との接続が切れています';$('#pairing-status').textContent='海との接続を確認しています';cancelCharge();}
}
function updateCollection(){
  $('#collection-count').textContent=hasGo?'COLLECTION · 01':'COLLECTION · 00';
  $('#collection-title').textContent=hasGo?'Go魚':'まだ、出会っていない。';
  $('#collection-description').innerHTML=hasGo?'一匹が複数に分かれ、同時に引く。<br>Goの並行処理を、群れの抵抗として体験する魚。':'この海にいるものの名前は、<br>釣り上げたときにわかります。';
  $('#collection-symbol').innerHTML=hasGo?'<span class="caught-collection">Go</span>':'<span>?</span>';
  $('#collection-view').hidden=!hasGo;
}
function vibrate(pattern){if(isPhone&&typeof navigator.vibrate==='function')navigator.vibrate(pattern);}
function applyState(message){
  const previous=state.phase,oldMode=state.mode;state=message.state;
  displayConnected=message.displays>0;
  ocean?.setState(state,message.serverNow);setConnected(true);
  $('#connection-status').hidden=message.controllers===0;
  $('#pairing-status').textContent=message.controllers?'釣り竿がつながりました':'接続を待っています';
  $('#phone-connection').textContent=message.displays?'海につながっています':'海の画面が閉じています';
  if(state.phase!=='fighting')stopReel();
  if(state.catches>0&&!hasGo){hasGo=true;try{localStorage.setItem('gijutu.collection.go','caught');}catch{}updateCollection();}
  const labels={idle:'ここで投げてみる',casting:'投げています',waiting:'巻き戻す',retrieving:'戻しています',biting:'合わせる',fighting:'押して巻く',caught:'もう一度、海へ',escaped:'もう一度、投げる'};
  $('#cast-button-label').textContent=labels[state.phase];
  $('#cast-button').setAttribute('aria-label',state.phase==='waiting'?'ルアーを巻き戻す':'押してためて、離して投げる');
  $('#phone-cast').textContent=state.phase==='idle'?'タッチで投げる':state.phase==='fighting'?(reelHeld?'巻いている — 離すと緩む':'押して巻く / 離して緩める'):labels[state.phase];
  const fighting=state.phase==='fighting',biting=state.phase==='biting';
  $('#fight-ui').hidden=!(fighting||biting);$('#catch-ui').hidden=state.phase!=='caught';$('#escape-ui').hidden=state.phase!=='escaped';
  $('#phone-tension').hidden=!fighting;$('#phone').dataset.fight=String(fighting||biting);
  $('#fight-button').textContent=biting?'合わせる':reelHeld?'巻いている — 離すと緩む':'押して巻く';
  $('#fight-guide').textContent=biting?'SPACE / スマホを小さく引く':'R 長押しで巻く / 離すと緩む';
  const tension=Math.round((state.tension||0)*100);
  const color=tension>80?'#ef9c80':tension<12?'#a9bfcb':'#a6e4e7';
  document.documentElement.style.setProperty('--tension-color',color);
  for(const fill of [$('#tension-fill'),$('#phone-tension-fill')])fill.style.width=tension+'%';
  document.querySelectorAll('[role=meter]').forEach(meter=>{meter.setAttribute('aria-valuenow',String(tension));meter.setAttribute('aria-valuetext',tension+'%');});
  const cue=biting?'いま、合わせる':tension>80?'糸が切れる。緩めて':tension<14?'糸が緩い。少し巻いて':state.mode==='warning'?'魚が、力をためている':state.mode==='split'?'引きが、急に重くなった':state.mode==='surge'?'強い引き。いったん緩める':'いま、巻ける';
  $('#fight-cue').textContent=cue;$('#phone-fight-cue').textContent=cue;
  $('#fight-distance').textContent=state.distance<6?'もうすぐ、手前へ':state.distance<14?'近づいてきた':'まだ、沖にいる';
  $('#fight-ui').dataset.tension=String(tension);$('#fight-ui').dataset.mode=state.mode||'rest';
  if(previous!==state.phase){
    cancelCharge();
    if(['biting','fighting','caught','escaped'].includes(state.phase)){
      if(document.body.classList.contains('scenery-only'))showScenery(false);
      document.querySelectorAll('dialog[open]').forEach(dialog=>dialog.close());
    }
    const titles={idle:'海に向けて、<br>ひと振り。',casting:'そのまま、<br>海を見て。',waiting:'静かに、<br>アタリを待つ。',retrieving:'もう一度、<br>好きな場所へ。',biting:'いま、<br>合わせる！',fighting:'巻く、<br>緩める。',caught:'釣れた！<br>Go魚',escaped:'また、<br>挑もう。'};
    $('#phone-title').innerHTML=titles[state.phase];
    const hints={idle:'スマホをしっかり持ってください。',casting:'ルアーが飛んでいます。',waiting:'ウキが沈んだら、小さく引くかボタンをタッチ。',retrieving:'ルアーを巻き戻しています。',biting:'小さく引く、または下のボタンをタッチ。',fighting:'押して巻く。赤くなる前に離す。',caught:'一匹が群れになる、並行処理の魚。',escaped:'もう一度、海に投げてみよう。'};
    $('#phone-hint').textContent=hints[state.phase];
    if(state.phase==='idle')feedback('');
    if(state.phase==='casting'){feedback('');playEffect('cast');}
    if(state.phase==='waiting')feedback('アタリを、待つ。','ウキが沈んだら合わせる',2200);
    if(state.phase==='biting'){playEffect('land');vibrate([90,60,90]);}
    if(state.phase==='fighting'){feedback('');vibrate(80);}
    if(state.phase==='caught'){feedback('');playEffect('land');vibrate([90,90,180]);}
    if(state.phase==='escaped'){
      const [title,hint]=failureHints[state.reason]||failureHints.distance;
      $('#escape-title').textContent=title;$('#escape-hint').textContent=hint;$('#phone-hint').textContent=hint;vibrate([160,80,60]);
    }
  }
  if(fighting&&(oldMode!==state.mode&&state.mode==='split'))vibrate([70,40,70,40,100]);
  if(fighting&&tension>82&&Date.now()-lastVibration>900){vibrate(45);lastVibration=Date.now();}
  document.body.dataset.phase=state.phase;
}
async function getRoom(){
  if(isPhone)return controllerId;
  const stored=sessionStorage.getItem('gijutu.ocean-room');if(stored)return stored;
  const response=await fetch('./api/ocean-sessions',{method:'POST'});
  if(!response.ok)throw Error('room');
  const {id}=await response.json();sessionStorage.setItem('gijutu.ocean-room',id);return id;
}
async function connect(){
  try{
    roomId=await getRoom();
    if(!/^sea_[a-f0-9]{32}$/.test(roomId))throw Error('link');
    const url=new URL('./ocean-ws',location.href);url.protocol=location.protocol==='https:'?'wss:':'ws:';url.searchParams.set('room',roomId);url.searchParams.set('role',isPhone?'controller':'display');
    socket=new WebSocket(url);let opened=false;
    socket.addEventListener('open',()=>{opened=true;retries=0;setConnected(true);});
    socket.addEventListener('message',event=>{try{const message=JSON.parse(event.data);if(message.type==='ocean')applyState(message);}catch{toast('海の状態を読み込めませんでした。');}});
    socket.addEventListener('close',()=>{
      setConnected(false);if(closing)return;
      if(!opened&&!isPhone)sessionStorage.removeItem('gijutu.ocean-room');
      if(retries++<4)retryTimer=setTimeout(connect,1000+retries*500);
      else toast(isPhone?'接続できません。海の画面から新しいURLを開いてください。':'海に接続できません。ページを再読み込みしてください。');
    });
    socket.addEventListener('error',()=>setConnected(false));
    if(!isPhone){
      const phoneUrl=new URL('./',location.href);phoneUrl.searchParams.set('controller',roomId);
      $('#controller-url').value=phoneUrl.href;$('#controller-link').href=phoneUrl.href;
    }
  }catch{setConnected(false);toast('海に接続できません。サーバーの起動を確認してください。');}
}
function send(action){if(!online||socket?.readyState!==WebSocket.OPEN){toast('海との接続を確認してください。');return false;}socket.send(JSON.stringify(action));return true;}
function cast(strength=.65,direction=aim){if(state.phase!=='idle'||renderFailed||(isPhone&&!displayConnected))return;send({action:'cast',strength:clamp(strength,.2,1),aim:clamp(direction,-1,1)});}
function cancelCharge(){chargeAt=null;cancelAnimationFrame(chargeFrame);document.body.classList.remove('is-charging');ocean?.setCharge(0);$('#charge-fill').style.width='0%';}
function startCharge(){
  if(!online||state.phase!=='idle'||chargeAt!==null)return;
  chargeAt=performance.now();document.body.classList.add('is-charging');
  function update(){if(chargeAt===null)return;const power=clamp((performance.now()-chargeAt)/1100,.2,1);$('#charge-fill').style.width=`${power*100}%`;ocean?.setCharge(power,aim);const point=ocean?.aimScreen(aim,power);if(point){$('#cast-reticle').style.left=`${point.x}px`;$('#cast-reticle').style.top=`${point.y}px`;}chargeFrame=requestAnimationFrame(update);}
  update();
}
function releaseCharge(){if(chargeAt===null)return;const power=clamp((performance.now()-chargeAt)/1100,.45,1);cancelCharge();cast(power);}
function startReel(){
  if(reelHeld||state.phase!=='fighting'||!online||(isPhone&&!displayConnected))return;
  reelHeld=true;send({action:'reel',held:true});
  reelTimer=setInterval(()=>{if(online&&state.phase==='fighting')send({action:'reel',held:true});else stopReel();},120);
  $('#fight-button').classList.add('is-held');$('#phone-cast').classList.add('is-held');
}
function stopReel(){
  if(reelHeld&&socket?.readyState===WebSocket.OPEN)socket.send(JSON.stringify({action:'reel',held:false}));
  reelHeld=false;clearInterval(reelTimer);$('#fight-button').classList.remove('is-held');$('#phone-cast').classList.remove('is-held');
}
function activate(){
  if(state.phase==='biting')send({action:'hook'});
  else if(state.phase==='waiting')send({action:'retrieve'});
  else if(['caught','escaped'].includes(state.phase))send({action:'reset'});
  else if(state.phase==='fighting'){if(reelHeld)stopReel();else startReel();}
  else cast();
}
for(const button of [$('#cast-button'),$('#phone-cast'),$('#fight-button')]){
  button.addEventListener('pointerdown',event=>{
    if(event.button!==0)return;event.preventDefault();button.setPointerCapture(event.pointerId);
    if(state.phase==='fighting')startReel();
    else if(state.phase==='idle')startCharge();else activate();
  });
  button.addEventListener('pointerup',()=>{releaseCharge();stopReel();});
  button.addEventListener('pointercancel',()=>{cancelCharge();stopReel();});
  button.addEventListener('lostpointercapture',stopReel);
  button.addEventListener('click',event=>{if(event.detail===0)activate();});
}
for(const button of [$('#catch-again'),$('#escape-again')])button.addEventListener('click',()=>send({action:'reset'}));
document.addEventListener('pointermove',event=>{if(event.target.closest('button,dialog'))return;aim=clamp((event.clientX/innerWidth-.5)*1.7,-1,1);});
document.addEventListener('keydown',event=>{
  if(event.code==='Escape'&&document.body.classList.contains('scenery-only'))showScenery(false);
  if($('dialog[open]')||document.activeElement?.matches('a,input,textarea'))return;
  if(event.code==='KeyR'&&state.phase==='fighting'){event.preventDefault();startReel();return;}
  if(event.code!=='Space'||isPhone)return;
  // Keep native keyboard activation for unrelated menu buttons.
  if(document.activeElement?.matches('button')&&!document.activeElement.matches('#cast-button,#fight-button'))return;
  event.preventDefault();if(event.repeat)return;
  if(state.phase==='fighting')startReel();else if(state.phase==='idle')startCharge();else activate();
});
document.addEventListener('keyup',event=>{if(event.code==='Space'){releaseCharge();stopReel();}if(event.code==='KeyR')stopReel();});
window.addEventListener('blur',()=>{cancelCharge();stopReel();});
updateCollection();

document.querySelectorAll('[data-dialog]').forEach(button=>button.addEventListener('click',()=>{$(`#${button.dataset.dialog}-dialog`).showModal();cancelCharge();}));
document.querySelectorAll('dialog').forEach(dialog=>{
  dialog.querySelector('.close-dialog').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('click',event=>{const r=dialog.getBoundingClientRect();if(event.target===dialog&&(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom))dialog.close();});
});
$('#connect-button').addEventListener('click',()=>{
  const loopback=['localhost','127.0.0.1','[::1]'].includes(location.hostname);
  $('#pairing-note').textContent=loopback?'今はこのPCだけで開けるローカル表示です。別タブで操作を試せます。実際のスマホには、両端末から開けるHTTPSのURLが必要です。':'このURLをスマホで開いて、釣り竿を有効にしてください。';
  $('#controller-link').textContent=loopback?'別タブでコントローラーを試す ↗':'コントローラーを開く ↗';
  $('#connect-dialog').showModal();
});
$('#copy-link').addEventListener('click',async()=>{try{await navigator.clipboard.writeText($('#controller-url').value);$('#copy-link').textContent='コピー済み';setTimeout(()=>$('#copy-link').textContent='コピー',1800);}catch{$('#controller-url').select();toast('URLを選択しました。コピーして開いてください。');}});
function showScenery(hide){document.body.classList.toggle('scenery-only',hide);$('#restore-ui').hidden=!hide;$('.masthead').inert=hide;$('.shore-controls').inert=hide;$('#view-toggle').setAttribute('aria-pressed',String(hide));if(hide)$('#restore-ui').focus();else $('#view-toggle').focus();}
$('#view-toggle').addEventListener('click',()=>showScenery(true));$('#restore-ui').addEventListener('click',()=>showScenery(false));

// Audio starts only from the explicit sound button; no media or mic access.
function makeNoise(duration){const buffer=audioContext.createBuffer(1,audioContext.sampleRate*duration,audioContext.sampleRate);const data=buffer.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;return buffer;}
async function enableSound(){
  if(!audioContext){
    audioContext=new (window.AudioContext||window.webkitAudioContext)();seaGain=audioContext.createGain();seaGain.gain.value=0;seaGain.connect(audioContext.destination);
    const noise=audioContext.createBufferSource();noise.buffer=makeNoise(5);noise.loop=true;
    const filter=audioContext.createBiquadFilter();filter.type='lowpass';filter.frequency.value=600;
    const lfo=audioContext.createOscillator();lfo.frequency.value=.14;const mod=audioContext.createGain();mod.gain.value=.008;lfo.connect(mod);mod.connect(seaGain.gain);lfo.start();noise.connect(filter);filter.connect(seaGain);noise.start();
  }
  await audioContext.resume();soundEnabled=!soundEnabled;seaGain.gain.setTargetAtTime(soundEnabled?.035:0,audioContext.currentTime,.4);
  // Suspending also silences the modulation while muted.
  if(!soundEnabled)setTimeout(()=>{if(!soundEnabled)void audioContext.suspend();},500);
  $('#sound-toggle').setAttribute('aria-pressed',String(soundEnabled));$('#sound-toggle').setAttribute('aria-label',soundEnabled?'音をオフにする':'音をオンにする');$('#sound-wave').setAttribute('d',soundEnabled?'M17 8q5 4 0 8m3-11q7 7 0 14':'m17 9 5 6m0-6-5 6');
}
function playEffect(kind){
  if(!soundEnabled||!audioContext)return;const t=audioContext.currentTime;
  const source=audioContext.createBufferSource();source.buffer=makeNoise(kind==='cast'?.45:.6);
  const filter=audioContext.createBiquadFilter();filter.type='bandpass';filter.frequency.value=kind==='cast'?1300:650;filter.Q.value=.5;
  const gain=audioContext.createGain();gain.gain.setValueAtTime(.001,t);gain.gain.exponentialRampToValueAtTime(kind==='cast'?.06:.12,t+.03);gain.gain.exponentialRampToValueAtTime(.001,t+.4);
  source.connect(filter);filter.connect(gain);gain.connect(audioContext.destination);source.start();source.onended=()=>{source.disconnect();filter.disconnect();gain.disconnect();};
}
$('#sound-toggle').addEventListener('click',()=>enableSound().catch(()=>toast('この環境では音を再生できません。')));
document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelCharge();stopReel();void audioContext?.suspend();}else if(soundEnabled)void audioContext?.resume();});

let sensorsOn=false,sensorTimer,samples=0,peak=0,peakAt=0,lastGesture=0,gravity={x:0,y:0,z:0},warmup=0;
function motion(event){
  if(document.hidden)return;
  const linear=event.acceleration;
  const hasLinear=linear&&[linear.x,linear.y,linear.z].every(Number.isFinite);
  const raw=hasLinear?linear:event.accelerationIncludingGravity;if(!raw||![raw.x,raw.y,raw.z].every(Number.isFinite))return;
  samples++;if(samples===1){clearTimeout(sensorTimer);$('#sensor-status').textContent='釣り竿が使えます。小さく振って、海へ。';$('#sensor-button').textContent='釣り竿は有効です';}
  let {x,y,z}=raw;
  if(!hasLinear){gravity={x:gravity.x*.85+x*.15,y:gravity.y*.85+y*.15,z:gravity.z*.85+z*.15};x-=gravity.x;y-=gravity.y;z-=gravity.z;}
  if(warmup++<15)return;
  const force=Math.hypot(x,y,z),now=performance.now();
  if(!['idle','biting'].includes(state.phase)||!online||now-lastGesture<700){peak=0;return;}
  if(force>10&&peak===0){peak=force;peakAt=now;}
  if(peak){peak=Math.max(force,peak);if(now-peakAt>650){peak=0;return;}if(force<4&&now-peakAt>60){if(state.phase==='biting')send({action:'hook'});else cast(clamp(peak/28,.45,1),0);lastGesture=now;peak=0;}}
}
$('#sensor-button').addEventListener('click',async()=>{
  if(sensorsOn){toast('釣り竿は有効です。小さく振ってください。');return;}
  try{
    if(!window.isSecureContext||!window.DeviceMotionEvent){$('#sensor-status').textContent='センサーが使えない環境です。下のボタンで投げられます。';return;}
    if(typeof DeviceMotionEvent.requestPermission==='function'){const result=await DeviceMotionEvent.requestPermission();if(result!=='granted'){$('#sensor-status').textContent='センサーは許可されていません。タッチ操作で遊べます。';return;}}
    window.addEventListener('devicemotion',motion);sensorsOn=true;$('#sensor-button').textContent='釣り竿を確認しています';
    sensorTimer=setTimeout(()=>{if(samples===0){$('#sensor-status').textContent='センサーの動きを取得できません。タッチで投げられます。';$('#sensor-button').textContent='センサーの応答待ち';}else $('#sensor-button').textContent='釣り竿は有効です';},2500);
  }catch{$('#sensor-status').textContent='センサーを開始できません。タッチで投げられます。';}
});

if(isPhone){$('#sea').hidden=true;$('#phone').hidden=false;document.title='釣り竿 — 技術釣り';}
else{
  try{
    const {createOcean}=await import('./ocean-scene.js');
    ocean=createOcean($('#ocean'),{onLand(){if(['casting','waiting'].includes(state.phase))feedback('着水','アタリを待つ',1900);playEffect('land');},onRenderError(){showRenderError();}});
  }catch(error){console.error('Ocean rendering unavailable',error);showRenderError();}
}
function showRenderError(){renderFailed=true;$('#render-notice').hidden=false;$('#render-notice').textContent='海の描画を開始できませんでした。WebGLが使えるブラウザで開き直してください。';$('#cast-button').disabled=true;}
setConnected(false);await connect();
window.oceanPreview={get state(){return {...state};},get diagnostics(){return {online,isPhone,scene:ocean?.diagnostics};}};
window.addEventListener('pagehide',()=>{closing=true;stopReel();clearTimeout(retryTimer);clearTimeout(sensorTimer);socket?.close();ocean?.dispose();});
window.addEventListener('pageshow',event=>{if(event.persisted)location.reload();});
if('serviceWorker' in navigator)navigator.serviceWorker.register('./service-worker.js').catch(error=>console.warn('Offline cache unavailable',error));
