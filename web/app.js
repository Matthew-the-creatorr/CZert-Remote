/* CZert Remote v3.0.4 — Firebase pairing and media diagnostics separated. */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getAuth, signInAnonymously } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { getFirestore, doc, collection, query, where, setDoc, getDoc, updateDoc, addDoc, onSnapshot, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import {firebaseConfig} from './firebase-config.js';
const $ = id=>document.getElementById(id), show=(id,flag=true)=>$(id).classList.toggle('hidden',!flag), say=(id,msg)=>{$(id).textContent=String(msg)};
const store=localStorage, native=window.CZertNative||null, rtcConfig={iceServers:[{urls:'stun:stun.l.google.com:19302'}]};
let auth,db,uid='',role=store.getItem('cz_role')||'', pairSecret='',pendingPair=null,deviceData=null,targetId=store.getItem('cz_admin_target')||'',activeSession=null,activePc=null,activeStream=null,viewerSession=null,viewerPc=null;
let unsubs=[],viewerUnsubs=[],activeUnsubs=[],pairWatch=()=>{},sessionWatch=()=>{},receivedCandidates=new Set(),nativeCandidateBuffer=[];
const settingsPerm=(kind)=>store.getItem('cz_allow_'+kind)!=='false';
const errText=e=>{let s=String(e?.code||e?.message||e||'Neznáma chyba');if(/permission-denied|insufficient permissions/i.test(s))return 'Firestore zamietol prístup. Skontroluj platnosť kódu, predchádzajúcu žiadosť a publikované pravidlá Firebase.';if(/api-key-not-valid|invalid-api-key/.test(s))return 'Firebase odmieta API kľúč. Vo Google Cloud skontroluj pri tomto kľúči Website restrictions: musia obsahovať obe adresy https://prismatic-ganache-e69adc.netlify.app aj https://prismatic-ganache-e69adc.netlify.app/* . Over aj Identity Toolkit API.';if(/operation-not-allowed/.test(s))return 'Vo Firebase Authentication musí byť zapnuté anonymné prihlásenie.';if(/unavailable/.test(s))return 'Firebase je nedostupný. Skontroluj pripojenie.';return s};
const warn=e=>{console.error('[CZert]',e);say('banner','Chyba: '+errText(e));};
// A rejected optional media listener must NEVER make a successful pairing look disconnected.
function pairingError(e){
  console.error('[CZert / pairing]',e);
  say('banner','⚠️ Firebase Auth funguje, ale Firestore párovanie odmietlo operáciu: '+errText(e));
  if(role==='user'){say('pairCode','Firestore odmietol prístup');say('userStatus',errText(e));}
  else if(role==='admin')say('adminStatus',errText(e));
}
function mediaError(e){
  console.warn('[CZert / streams]',e);
  say('mediaBackendStatus', /permission-denied|insufficient permissions/i.test(String(e?.code||e?.message||e))
    ? '⚠️ Párovanie funguje. Živé prenosy zatiaľ blokujú pravidlá Firestore: v konzole Firebase publikuj web/firestore.rules z v3.0.3.'
    : '⚠️ Živý prenos zatiaľ nie je dostupný: '+errText(e));
}

function randomHex(n=12){const b=crypto.getRandomValues(new Uint8Array(n));return [...b].map(v=>v.toString(16).padStart(2,'0')).join('')}
const codeFor=(id,secret)=>id+'.'+secret;
function parseCode(raw){const x=raw.trim().split('.');if(x.length!==2||!/^[-\w]{20,}$/.test(x[0])||!/^[a-f0-9]{24}$/.test(x[1]))throw Error('Nesprávny formát kódu. Skopíruj celý kód vrátane bodky.');return {id:x[0],secret:x[1]}}
function cleanUnsubs(list){for(const fn of list.splice(0))try{fn()}catch{}}
function roleUI(){show('setup',!role);show('user',role==='user');show('admin',role==='admin');show('userSettings',role==='user');say('subtitle',role==='user'?'Používateľ — diagnostika a viditeľné zdieľanie':role==='admin'?'Administrátor — schválené pripojenia':'Zabezpečené párovanie zariadení');say('profileInfo','Režim: '+(role||'nezvolený')+' • Meno: '+(store.getItem('cz_name')||'—'));for(const k of ['camera','mic','screen'])$('allow'+k[0].toUpperCase()+k.slice(1)).checked=settingsPerm(k)}
function choose(r){const name=$('name').value.trim();if(!name){alert('Zadaj názov zariadenia.');return;}role=r;store.setItem('cz_role',r);store.setItem('cz_name',name);roleUI();if(uid){if(r==='user')startUser().catch(pairingError);else startAdmin().catch(pairingError)}}
function whenReady(f){if(!uid)throw Error('Firebase ešte nie je prihlásený.');return f()}
async function boot(){
  try{
    const a=initializeApp(firebaseConfig);auth=getAuth(a);db=getFirestore(a);
    const credential=await signInAnonymously(auth);
    uid=credential?.user?.uid||'';
    if(!uid)throw Error('Firebase nepridelil ID zariadenia.');
    say('banner','● FIREBASE AUTH PRIPOJENÝ • '+uid.slice(0,9));
  }catch(e){
    console.error('[CZert / authentication]',e);
    say('banner','❌ Firebase Authentication: '+errText(e));
    if(role==='user'){say('pairCode','Prihlásenie sa nepodarilo');say('userStatus',errText(e));}
    if(role==='admin')say('adminStatus',errText(e));
    return;
  }
  roleUI();
  try{
    if(role==='user')await startUser();
    else if(role==='admin')await startAdmin();
  }catch(e){pairingError(e)}
}
function renderDevice(d){deviceData=d;const paired=!!d?.pairedWith;if(paired){say('pairCode','Kód už bol použitý');say('settingsCode','Kód už bol použitý');say('pairedLabel','Pripojený administrátor: '+(d.pairedName||d.pairedWith.slice(0,8)));show('userPaired');show('newCode',false);say('userStatus','● Párovanie schválené');say('pairBadge','SPÁROVANÉ')}else{const k=d?.secret?codeFor(uid,d.secret):'Kód chýba';say('pairCode',k);say('settingsCode',k);show('userPaired',false);show('newCode',true);say('pairBadge','ČAKÁM NA KÓD');if(d?.secret)pairSecret=d.secret;}}
async function startUser(){whenReady(()=>{});say('userStatus','Načítavam zariadenie…');cleanUnsubs(unsubs);const ref=doc(db,'devices',uid);const s=await getDoc(ref);if(!s.exists()){pairSecret=randomHex();await setDoc(ref,{owner:uid,secret:pairSecret,pairedWith:null,pairedName:null,createdAt:serverTimestamp()})}else{pairSecret=s.data().secret||'';renderDevice(s.data())}
unsubs.push(onSnapshot(ref,s=>{if(!s.exists())return;renderDevice(s.data())},warn));
unsubs.push(onSnapshot(query(collection(db,'requests'),where('target','==',uid)),snap=>{const req=snap.docs.find(x=>x.data().status==='pending'&&x.data().secret===pairSecret&&!deviceData?.pairedWith);pendingPair=req||null;show('incoming',!!req);if(req)say('incomingText','Zariadenie '+(req.data().fromName||req.data().from.slice(0,8))+' chce párovanie. Povoľ iba známe zariadenie.')},warn));
try{
  unsubs.push(onSnapshot(query(collection(db,'streams'),where('owner','==',uid)),snap=>{
    say('mediaBackendStatus','📡 Živé relácie: pripojené k Firestore. Každý prenos potrebuje tvoje potvrdenie.');
    const req=snap.docs.find(x=>x.data().status==='requested'&&x.data().viewer===deviceData?.pairedWith);
    if(!req||activeSession){show('shareRequest',false);return;}
    const kind=req.data().kind;
    if(!settingsPerm(kind)){updateDoc(req.ref,{status:'declined'}).catch(mediaError);return;}
    pendingSession=req;show('shareRequest');
    say('shareRequestText','Administrátor žiada: '+({camera:'📷 kameru',mic:'🎙 mikrofón',screen:'📱 celú obrazovku'}[kind]||kind)+'. Reláciu spustíš len vlastným potvrdením.');
  },mediaError));
}catch(e){mediaError(e)}
await renderSpecs();say('userStatus',deviceData?.pairedWith?'Spárované.':'Čakám na žiadosť…')}
async function newCode(){try{whenReady(()=>{});if(deviceData?.pairedWith)throw Error('Najprv resetuj existujúce párovanie.');const secret=randomHex();await updateDoc(doc(db,'devices',uid),{secret});pairSecret=secret;pendingPair=null;show('incoming',false);say('userStatus','Nový kód je pripravený.')}catch(e){warn(e)}}
async function decidePair(approved){try{if(!pendingPair)return;const req=pendingPair,rs=await getDoc(req.ref),ds=await getDoc(doc(db,'devices',uid));if(!rs.exists()||rs.data().status!=='pending'||rs.data().secret!==ds.data()?.secret||ds.data()?.pairedWith)throw Error('Žiadosť nie je aktuálna.');if(approved){await updateDoc(req.ref,{status:'approved'});await updateDoc(doc(db,'devices',uid),{pairedWith:rs.data().from,pairedName:rs.data().fromName,secret:null});say('userStatus','Párovanie bolo schválené.')}else{await updateDoc(req.ref,{status:'rejected'});say('userStatus','Žiadosť bola odmietnutá.')}pendingPair=null;show('incoming',false)}catch(e){warn(e)}}
async function resetPair(){if(!confirm('Odpojiť aktuálne spárované zariadenie, zastaviť zdieľanie a vytvoriť nový kód?'))return;try{await stopUserShare();const secret=randomHex();await updateDoc(doc(db,'devices',uid),{pairedWith:null,pairedName:null,secret});pairSecret=secret;pendingPair=null;show('incoming',false);say('userStatus','Párovanie bolo zrušené. Nový kód je pripravený.')}catch(e){warn(e)}}
async function startAdmin(){
  say('adminStatus','Pripravené na párovanie.');
  if(targetId)say('adminStatus','Predošlý cieľ je uložený, ale jeho aktuálne spárovanie nemožno bez potvrdenia overiť. Zadaj nový kód.');
}
function markAdminPaired(id){targetId=id;store.setItem('cz_admin_target',id);say('adminLabel','Zariadenie: '+id.slice(0,12));show('adminPaired')}
function watchPairResponse(ref,id,expectedSecret){
  pairWatch();
  pairWatch=onSnapshot(ref,s=>{
    if(!s.exists())return;
    const data=s.data();
    if(data.from!==uid||data.target!==id){say('adminStatus','Nesúlad údajov žiadosti.');return;}
    if(data.status==='approved'){
      // Only a fresh approval observed for the submitted code unlocks this UI.
      if(data.secret===expectedSecret){
        say('adminStatus','✅ Spárované – schválené na druhom zariadení!');markAdminPaired(id);
      }else say('adminStatus','Predošlé schválenie patrí inému kódu. Resetuj párovanie a použi nový kód.');
    }else if(data.status==='rejected'){say('adminStatus','Žiadosť bola odmietnutá.');show('adminPaired',false)}
    else say('adminStatus','Čaká sa na potvrdenie na používateľskom telefóne…');
  },e=>{console.error('[CZert / request listener]',e);say('adminStatus','Nedá sa sledovať stav žiadosti: '+errText(e))});
}
async function connect(){
  let id='',secret='',ref;
  try{
    whenReady(()=>{});
    ({id,secret}=parseCode($('targetCode').value));
    if(id===uid)throw Error('Nemôžeš pripojiť zariadenie samo k sebe.');
    show('adminPaired',false);
    targetId=id;
    say('adminStatus','Odosielam žiadosť…');
    ref=doc(db,'requests',uid+'_'+id);
    const data={from:uid,target:id,secret,fromName:store.getItem('cz_name')||'Administrátor',status:'pending',createdAt:serverTimestamp()};
    try{
      await setDoc(ref,data);
    }catch(writeError){
      // A second click on an already-pending request was wrongly treated as a
      // new write. Firestore deliberately denies overwriting an active request.
      if(/permission-denied|insufficient permissions/i.test(String(writeError?.code||writeError))){
        let prior=null;
        try{const snapshot=await getDoc(ref);if(snapshot.exists())prior=snapshot.data();}catch(readError){
          console.warn('[CZert / existing request lookup]',readError);
        }
        if(prior?.from===uid&&prior?.target===id){
          if(prior.status==='pending'&&prior.secret===secret){
            say('adminStatus','Táto žiadosť už čaká. Obnovujem sledovanie jej potvrdenia…');
            watchPairResponse(ref,id,secret);
            return;
          }
          if(prior.status==='pending')throw Error('Existuje staršia čakajúca žiadosť s iným kódom. Na používateľskom zariadení ju treba zamietnuť alebo vo Firebase publikovať aktualizované pravidlá, ktoré dovolia nový platný kód.');
          if(prior.status==='approved'||prior.status==='rejected')throw Error('Predchádzajúca žiadosť už bola '+(prior.status==='approved'?'schválená':'odmietnutá')+'. Na opätovné párovanie použi nový kód po resete a aktuálne pravidlá Firestore.');
        }
        throw Error('Firebase odmietol vytvorenie žiadosti. Over, že na používateľskom telefóne je zobrazený NOVÝ kód a zariadenie nie je spárované; ak to nepomôže, server ešte nemá aktuálne pravidlá Firestore.');
      }
      throw writeError;
    }
    watchPairResponse(ref,id,secret);
  }catch(e){
    console.error('[CZert / connect request]',e);
    const message=errText(e);
    say('adminStatus',message);
    say('banner','Žiadosť nebola odoslaná: '+message);
  }
}
function stopTracks(){if(activeStream){activeStream.getTracks().forEach(t=>t.stop());activeStream=null;}if(activePc){activePc.close();activePc=null;}}
let pendingSession=null;
async function rejectShare(){if(!pendingSession)return;const r=pendingSession;pendingSession=null;show('shareRequest',false);try{await updateDoc(r.ref,{status:'declined'})}catch(e){warn(e)}}
function pcWithIce(sessionId,side){const pc=new RTCPeerConnection(rtcConfig);pc.onicecandidate=e=>{if(e.candidate)addDoc(collection(db,'streams',sessionId,side+'Candidates'),e.candidate.toJSON()).catch(warn)};return pc}
function watchIce(sessionId,other,handle,out){const sub=onSnapshot(collection(db,'streams',sessionId,other+'Candidates'),s=>{for(const c of s.docChanges()){if(c.type==='added'&&!receivedCandidates.has(c.doc.id)){receivedCandidates.add(c.doc.id);handle(c.doc.data())}}},warn);out.push(sub)}
// ICE can arrive before setRemoteDescription(answer). Queue it instead of losing it.
let viewerPendingIce=[], viewerIceReceived=0, viewerIceApplied=0, viewerLocalIce=0;
async function applyViewerIce(candidate){
  const pc=viewerPc;
  if(!pc)return;
  try{
    await pc.addIceCandidate(new RTCIceCandidate(candidate));
    if(viewerPc===pc)viewerIceApplied++;
  }catch(e){console.warn('[CZert / viewer ICE candidate]',e)}
}
function queueViewerIce(candidate){
  if(!viewerPc)return;
  viewerIceReceived++;
  if(!viewerPc.remoteDescription){
    if(viewerPendingIce.length<200)viewerPendingIce.push(candidate);
    else console.warn('[CZert / ICE] Too many pending candidates');
    return;
  }
  void applyViewerIce(candidate);
}
async function flushViewerIce(){
  const pending=viewerPendingIce.splice(0);
  for(const candidate of pending)await applyViewerIce(candidate);
}
async function acceptShare(){if(!pendingSession||activeSession)return;const snap=pendingSession;pendingSession=null;show('shareRequest',false);const kind=snap.data().kind;if(!settingsPerm(kind)){await updateDoc(snap.ref,{status:'declined'});return;}if(kind==='screen'&&!native){say('userStatus','Celú obrazovku Androidu dokáže zdieľať iba APK, nie mobilný web.');await updateDoc(snap.ref,{status:'declined'});return;}
activeSession=snap.id;show('sharing');say('sharingInfo','Spúšťam '+kind+' po tvojom schválení…');receivedCandidates.clear();try{if(kind==='screen'){window.czNativeAnswer=async(sid,answer)=>{if(sid!==activeSession)return;try{await updateDoc(snap.ref,{answer,status:'streaming'});say('sharingInfo','🔴 Zdieľa sa obrazovka. Zastavíš ju tu alebo v oznámení Androidu.')}catch(e){warn(e)}};window.czNativeIce=c=>{if(activeSession)addDoc(collection(db,'streams',activeSession,'ownerCandidates'),JSON.parse(c)).catch(warn)};window.czNativeStopped=()=>{stopUserShare().catch(warn)};window.czNativeError=(sid,msg)=>{if(sid===activeSession){say('sharingInfo',msg);stopUserShare().catch(warn)}};watchIce(snap.id,'viewer',data=>native.addIce(snap.id,JSON.stringify(data)),activeUnsubs);native.beginScreen(snap.id,snap.data().offer);say('sharingInfo','Potvrď systémové povolenie zdieľania obrazovky na Androide.');}
else{activeStream=await navigator.mediaDevices.getUserMedia(kind==='camera'?{video:true,audio:false}:{audio:true,video:false});activePc=pcWithIce(snap.id,'owner');activePc.onconnectionstatechange=()=>{if(activePc&&['failed','closed','disconnected'].includes(activePc.connectionState))say('sharingInfo','Spojenie sa prerušilo. Môžeš ho zastaviť.')};for(const track of activeStream.getTracks())activePc.addTrack(track,activeStream);await activePc.setRemoteDescription({type:'offer',sdp:snap.data().offer});watchIce(snap.id,'viewer',c=>activePc?.addIceCandidate(new RTCIceCandidate(c)).catch(warn),activeUnsubs);const ans=await activePc.createAnswer();await activePc.setLocalDescription(ans);await updateDoc(snap.ref,{answer:ans.sdp,status:'streaming'});if(kind==='camera'){$('localVideo').srcObject=activeStream;show('localVideo')}say('sharingInfo','🔴 '+(kind==='camera'?'Kamera':'Mikrofón')+' sa práve prenáša. Zastav ju kedykoľvek.');}
sessionWatch();sessionWatch=onSnapshot(snap.ref,s=>{if(!s.exists()||s.data().status==='stopped')stopUserShare(false).catch(warn)},warn)}catch(e){warn(e);await stopUserShare(true)}}
async function stopUserShare(update=true){const id=activeSession;if(!id)return;activeSession=null;cleanUnsubs(activeUnsubs);sessionWatch();sessionWatch=()=>{};stopTracks();$('localVideo').srcObject=null;show('localVideo',false);show('sharing',false);if(native)native.stopScreen();if(update)try{await updateDoc(doc(db,'streams',id),{status:'stopped'})}catch(e){warn(e)}}
async function startView(kind){try{whenReady(()=>{});if(!targetId)throw Error('Najprv spáruj zariadenie.');await stopViewer();const sid=doc(collection(db,'streams')).id;viewerPc=pcWithIce(sid,'viewer');viewerPendingIce=[];viewerIceReceived=0;viewerIceApplied=0;viewerLocalIce=0;receivedCandidates.clear();const pending=[];viewerPc.onicecandidate=e=>{if(e.candidate){viewerLocalIce++;if(viewerSession===sid)addDoc(collection(db,'streams',sid,'viewerCandidates'),e.candidate.toJSON()).catch(warn);else pending.push(e.candidate.toJSON())}};viewerPc.addTransceiver(kind==='mic'?'audio':'video',{direction:'recvonly'});viewerPc.ontrack=e=>{if(!viewerPc)return;const media=e.streams[0]||new MediaStream([e.track]);const el=kind==='mic'?'remoteAudio':'remoteVideo';$(el).srcObject=media;show(el);$(el).play().catch(()=>{say('mediaInfo','Prenos prijatý. Ak sa nespustil automaticky, stlač Play vo videu alebo zvuku.')})};viewerPc.onconnectionstatechange=()=>{if(!viewerPc)return;const st=viewerPc.connectionState;if(st==='connected')say('mediaInfo','🟢 ŽIVÝ PRENOS — '+kind);else if(st==='failed')say('mediaInfo','WebRTC ICE spojenie zlyhalo. Lokálne ICE: '+viewerLocalIce+', prijaté ICE: '+viewerIceReceived+', použité ICE: '+viewerIceApplied+'. '+(viewerIceReceived===0?'Druhé zariadenie neposlalo kandidátov alebo ich zablokovalo Firebase.':'Pri rôznych sieťach môže byť potrebný TURN server.'))};let offer=await viewerPc.createOffer();await viewerPc.setLocalDescription(offer);
// ICE may start before session document exists. Queue candidates until the parent exists.
await setDoc(doc(db,'streams',sid),{owner:targetId,viewer:uid,kind,status:'requested',offer:viewerPc.localDescription.sdp,answer:null,createdAt:serverTimestamp()});viewerSession=sid;for(const c of pending)await addDoc(collection(db,'streams',sid,'viewerCandidates'),c);
say('mediaInfo','Čakám na schválenie '+kind+' na používateľskom telefóne…');
viewerUnsubs.push(onSnapshot(doc(db,'streams',sid),async s=>{if(!s.exists())return;const d=s.data();if(d.status==='declined'){say('mediaInfo','Používateľ zdieľanie odmietol.');await stopViewer(false)}else if(d.status==='stopped'){say('mediaInfo','Používateľ ukončil prenos.');await stopViewer(false)}else if(d.status==='streaming'&&d.answer&&viewerPc&&!viewerPc.currentRemoteDescription){try{await viewerPc.setRemoteDescription({type:'answer',sdp:d.answer});await flushViewerIce();say('mediaInfo','Pripájam živý prenos…')}catch(e){warn(e)}}},e=>{warn(e);stopViewer(false).catch(warn)}));watchIce(sid,'owner',queueViewerIce,viewerUnsubs)
}catch(e){warn(e);say('mediaInfo',errText(e));await stopViewer(false)}}
async function stopViewer(update=true){const sid=viewerSession;viewerSession=null;cleanUnsubs(viewerUnsubs);if(viewerPc){viewerPc.close();viewerPc=null;}viewerPendingIce=[];for(const id of ['remoteVideo','remoteAudio']){$(id).pause();$(id).srcObject=null;show(id,false)}if(sid&&update)try{await updateDoc(doc(db,'streams',sid),{status:'stopped'})}catch(e){warn(e)}}
function resetAdmin(){stopViewer().catch(warn);targetId='';store.removeItem('cz_admin_target');show('adminPaired',false);$('targetCode').value='';say('adminStatus','Zadaj nový párovací kód. Na Používateľovi môže byť potrebné vykonať Reset párovania.');pairWatch();pairWatch=()=>{}}
async function renderSpecs(){const out=$('deviceSpecs');out.replaceChildren();const values=[];let nat={};try{if(native)nat=JSON.parse(native.getSpecs())}catch(e){console.warn(e)};
const put=(a,b)=>values.push([a,b==null?'Nedostupné':String(b)]),fmt=n=>Number.isFinite(n)?n.toFixed(1):'—';
const webRAM=navigator.deviceMemory||null;put('Platforma',nat.device||navigator.userAgentData?.platform||navigator.platform||'Web');put('Android verzia',nat.androidVersion||'Len APK');put('CPU jadrá',nat.cpuCores||navigator.hardwareConcurrency||'—');put('RAM celkovo',nat.ramTotalMB?fmt(nat.ramTotalMB/1024)+' GB':webRAM?webRAM+' GB (približne)':'Nedostupné');put('CPU teplota','Nedostupné bez systémového senzora');put('Rozlíšenie',screen.width+' × '+screen.height);put('DPI',nat.densityDpi||Math.round(devicePixelRatio*160));put('Pripojenie',navigator.onLine?'Online':'Offline');put('Jazyk',navigator.language);
for(const [a,b] of values){const tile=document.createElement('div');tile.className='datum';const title=document.createElement('b');title.textContent=a;const val=document.createElement('span');val.textContent=b;tile.append(title,val);out.append(tile)}
say('platformBadge',nat.device?'ANDROID APK':'WEB');if(nat.ramTotalMB&&nat.ramAvailMB!=null){const used=nat.ramTotalMB-nat.ramAvailMB;const pct=100*used/nat.ramTotalMB;say('ramMain',fmt(pct)+' %');say('ramSub',fmt(used/1024)+' / '+fmt(nat.ramTotalMB/1024)+' GB');$('ramFill').style.width=pct.toFixed(1)+'%'}else{say('ramMain',webRAM?webRAM+' GB':'—');say('ramSub','Web nezobrazuje skutočné využitie RAM.');$('ramFill').style.width='0%'}
let batPct=nat.batteryPct,charging=nat.charging,bt=nat.batteryTempC;if(batPct==null&&navigator.getBattery)try{const b=await navigator.getBattery();batPct=Math.round(b.level*100);charging=b.charging}catch{}say('batteryMain',batPct==null?'—':batPct+' %');say('batterySub',(charging==null?'':charging?'Nabíja sa • ':'Nenabíja sa • ')+(bt==null?'':fmt(bt)+' °C'));$('batteryFill').style.width=(batPct||0)+'%';
const sen=$('sensorTiles');sen.replaceChildren();const vals=nat.sensors||{};const format=n=>typeof n==='number'?n.toFixed(2):'Nedostupné';for(const [name,value] of [['Akcelerometer X',format(vals.ax)],['Akcelerometer Y',format(vals.ay)],['Gyroskop X',format(vals.gx)],['Gyroskop Y',format(vals.gy)],['Svetlo (lux)',format(vals.lux)],['Tlak (hPa)',format(vals.pressure)]]){const d=document.createElement('div');d.className='datum';const b=document.createElement('b');b.textContent=name;const v=document.createElement('span');v.textContent=value;d.append(b,v);sen.append(d)};
if(nat.storageTotalMB){const used=nat.storageTotalMB-nat.storageFreeMB;pctStorage(used/nat.storageTotalMB*100);say('storageInfo',fmt(used/1024)+' GB z '+fmt(nat.storageTotalMB/1024)+' GB')}else if(navigator.storage?.estimate){try{const e=await navigator.storage.estimate();say('storageInfo',fmt((e.usage||0)/1048576)+' MB použitých prehliadačom');pctStorage(0)}catch{}}else say('storageInfo','Úložisko nie je dostupné');}
function pctStorage(n){$('storageFill').style.width=Math.min(100,Math.max(0,n)).toFixed(1)+'%'}
for(const k of ['camera','mic','screen'])$('allow'+k[0].toUpperCase()+k.slice(1)).onchange=e=>{store.setItem('cz_allow_'+k,String(e.target.checked))};
$('chooseUser').onclick=()=>choose('user');$('chooseAdmin').onclick=()=>choose('admin');$('settingsBtn').onclick=()=>show('settings',true);$('closeSettings').onclick=()=>show('settings',false);
$('clearProfile').onclick=()=>{if(!confirm('Zmeniť režim? Neprebieha automatické zrušenie párovania.'))return;stopUserShare();stopViewer();store.removeItem('cz_role');store.removeItem('cz_name');location.reload()};
$('resetPair').onclick=resetPair;$('resetPairQuick').onclick=resetPair;$('refresh').onclick=renderSpecs;$('newCode').onclick=newCode;$('approve').onclick=()=>decidePair(true);$('reject').onclick=()=>decidePair(false);$('connect').onclick=connect;$('shareApprove').onclick=acceptShare;$('shareReject').onclick=rejectShare;$('stopShare').onclick=()=>stopUserShare();$('stopView').onclick=()=>stopViewer();$('resetAdmin').onclick=resetAdmin;
document.querySelectorAll('[data-kind]').forEach(b=>b.onclick=()=>startView(b.dataset.kind));
window.addEventListener('pagehide',()=>{stopTracks();viewerPc?.close();native?.stopScreen()});
window.CZERT_WEB_VERSION='3.0.3';roleUI();boot();setInterval(()=>{if(role==='user'&&document.visibilityState==='visible')renderSpecs().catch(console.error)},2500);
