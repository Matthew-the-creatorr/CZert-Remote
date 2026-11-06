const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
(async()=>{
  const code=fs.readFileSync('web/app.js','utf8');
  const start=code.indexOf('let viewerPendingIce=');
  const end=code.indexOf('async function acceptShare()',start);
  assert(start>=0&&end>start,'ICE queue helpers absent');
  const fragment=code.slice(start,end);
  const pc={remoteDescription:null,accepted:[],async addIceCandidate(candidate){
    if(!this.remoteDescription)throw Error('remote description missing');
    this.accepted.push(candidate);
  }};
  const ctx=vm.createContext({console,RTCIceCandidate:class{constructor(x){this.candidate=x.candidate;}}});
  vm.runInContext('let viewerPc=null;'+fragment+'\nglobalThis.testApi={setPc:x=>viewerPc=x,enqueue:queueViewerIce,flush:flushViewerIce,getStats:()=>[viewerPendingIce.length,viewerIceReceived,viewerIceApplied]};',ctx);
  const api=ctx.testApi;api.setPc(pc);
  api.enqueue({candidate:'candidate-before-answer'});
  assert.deepEqual(Array.from(api.getStats()),[1,1,0],'early ICE not queued');
  pc.remoteDescription={type:'answer'};
  await api.flush();
  assert.deepEqual(pc.accepted.map(x=>x.candidate),['candidate-before-answer'],'queued ICE not flushed');
  api.enqueue({candidate:'candidate-after-answer'});
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(pc.accepted.map(x=>x.candidate),['candidate-before-answer','candidate-after-answer']);
  assert.deepEqual(Array.from(api.getStats()),[0,2,2]);
  const bundled=fs.readFileSync('app/src/main/assets/index.html','utf8');
  assert(bundled.includes(fragment.trim()),'Bundled APK JS differs from tested ICE logic');
  console.log('PASS: Early ICE buffered, flushed after SDP; late ICE accepted; APK script matches.');
})().catch(err=>{console.error(err);process.exit(1)});
