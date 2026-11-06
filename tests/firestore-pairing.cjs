'use strict';
const fs = require('node:fs');
const {initializeTestEnvironment,assertSucceeds,assertFails} = require('@firebase/rules-unit-testing');
const {doc,collection,setDoc,updateDoc,getDoc,getDocs,query,where,serverTimestamp,addDoc} = require('firebase/firestore');
(async()=>{
  const owner='TEST_OWNER_012345678901234';
  const viewer='TEST_VIEWER_01234567890123';
  const stranger='TEST_OTHER_01234567890123';
  const code='a'.repeat(24),newCode='b'.repeat(24);
  const env=await initializeTestEnvironment({projectId:'demo-czert',firestore:{rules:fs.readFileSync('web/firestore.rules','utf8')}});
  const o=env.authenticatedContext(owner).firestore();
  const v=env.authenticatedContext(viewer).firestore();
  const x=env.authenticatedContext(stranger).firestore();
  let n=0;const pass=(x)=>{n++;console.log('PASS '+n+' '+x)};
  try {
    await assertSucceeds(setDoc(doc(o,'devices',owner),{owner,secret:code,pairedWith:null,pairedName:null,createdAt:serverTimestamp()}));pass('User creates device with one-time code');
    await assertFails(getDoc(doc(v,'devices',owner)));pass('Other user cannot read device secret');
    await assertSucceeds(setDoc(doc(v,'requests',viewer+'_'+owner),{from:viewer,target:owner,secret:code,fromName:'Admin Test',status:'pending',createdAt:serverTimestamp()}));pass('Admin sends valid pairing request');
    const requests=await assertSucceeds(getDocs(query(collection(o,'requests'),where('target','==',owner))));if(requests.empty)throw Error('No incoming request');pass('Owner receives matching request');
    await assertSucceeds(updateDoc(doc(o,'requests',viewer+'_'+owner),{status:'approved'}));pass('Owner approves request');
    await assertSucceeds(updateDoc(doc(o,'devices',owner),{pairedWith:viewer,pairedName:'Admin Test',secret:null}));pass('Owner links admin and invalidates code');
    const ack=await assertSucceeds(getDoc(doc(v,'requests',viewer+'_'+owner)));if(ack.data().status!=='approved')throw Error('Admin did not receive approval');pass('Admin receives approved state');
    await assertFails(setDoc(doc(x,'streams','not_allowed_stream'),{owner,viewer:stranger,kind:'screen',status:'requested',offer:'v=0\r\n',answer:null,createdAt:serverTimestamp()}));pass('Unpaired viewer is denied streaming');
    const session='test_session_01234567890';
    await assertSucceeds(setDoc(doc(v,'streams',session),{owner,viewer,kind:'camera',status:'requested',offer:'v=0\r\n',answer:null,createdAt:serverTimestamp()}));pass('Paired admin requests media session');
    const streams=await assertSucceeds(getDocs(query(collection(o,'streams'),where('owner','==',owner))));if(streams.empty)throw Error('Owner did not receive media request');pass('Owner sees media request');
    await assertSucceeds(updateDoc(doc(o,'streams',session),{status:'declined'}));pass('Owner can refuse media request');
    await assertSucceeds(updateDoc(doc(o,'devices',owner),{pairedWith:null,pairedName:null,secret:newCode}));pass('Reset revokes pairing and rotates code');
    await assertFails(setDoc(doc(v,'streams','blocked_session_0123456'),{owner,viewer,kind:'screen',status:'requested',offer:'v=0\r\n',answer:null,createdAt:serverTimestamp()}));pass('Reset prevents old admin opening new media session');
    await assertSucceeds(setDoc(doc(v,'requests',viewer+'_'+owner),{from:viewer,target:owner,secret:newCode,fromName:'Admin Test',status:'pending',createdAt:serverTimestamp()}));pass('Admin can send a NEW pairing request after reset');
    console.log('RESULT '+n+'/'+n+' Firestore emulator rule tests PASS');
  } finally {await env.cleanup()}
})().catch(err=>{console.error(err);process.exit(1)});
