'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createMembershipVerifier}=require('../membership');
function fixture(){
 let time=0,calls=0,fail=false,status={is_activated:true,is_frozen:false,is_resigned:false,is_exited:false,is_unjoin:false};
 const verifier=createMembershipVerifier({appId:'app',appSecret:'test-only',tenantKey:'company',now:()=>time,fetchImpl:async url=>{
  calls++;if(fail)throw Error('offline');return {ok:true,json:async()=>url.includes('/auth/')?{code:0,tenant_access_token:'test',expire:7200}:{code:0,data:{user:{open_id:'ou_member',status}}}};
 }});
 return {verifier,profile:{openId:'ou_member',tenantKey:'company'},calls:()=>calls,tick:()=>{time+=61000;},fail:()=>{fail=true;},set:s=>{status={...status,...s};}};
}
test('only exact company organization identity is accepted; missing configuration fails closed',async()=>{
 const f=fixture();for(const tenantKey of [null,'','external'])assert.equal(await f.verifier.verify({...f.profile,tenantKey}),false);
 assert.equal(f.calls(),0);assert.equal(await createMembershipVerifier({}).verify(f.profile),false);
 assert.equal(await f.verifier.verify(f.profile),true);
});
test('membership rechecks within 60 seconds and rejects resigned, frozen, exited and unjoined users',async()=>{
 for(const key of ['is_resigned','is_frozen','is_exited','is_unjoin','is_activated']){
  const f=fixture();assert.equal(await f.verifier.verify(f.profile),true);
  f.set({[key]:key!=='is_activated'});f.tick();assert.equal(await f.verifier.verify(f.profile),false);
 }
});
test('network errors and missing status fields never retain stale membership access',async()=>{
 const f=fixture();await f.verifier.verify(f.profile);f.fail();f.tick();await assert.rejects(f.verifier.verify(f.profile),{status:503});
 const g=fixture();g.set({is_frozen:undefined});await assert.rejects(g.verifier.verify(g.profile),{status:503});
});
