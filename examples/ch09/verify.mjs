// Executable contract model, NOT a PostgreSQL/Redis integration test.
// The storage model assumes the unique-index, rollback and visibility semantics
// checked against PostgreSQL 18 docs. It exercises the chapter's failure traces.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
execFileSync(process.execPath,['examples/ch09/sync.mjs','--check'],{stdio:'inherit'});
const results=[];
const test=(name,fn)=>{fn();results.push({name,status:'PASS'});};
class Store {
 constructor(){this.links=new Map;this.ids=new Map;}
 attempt({key,hash,code,alias=false},inject='',initialStatus='active'){
  const old=this.ids.get(key);if(old)return old.hash===hash?[201,old.code]:[409,null];
  // Staged mapping is invisible until BOTH unique checks pass.
  if(this.links.has(code))return [alias?409:503,null];
  if(inject==='abort')return [503,null];
  this.links.set(code,{hash,status:initialStatus,version:1});this.ids.set(key,{hash,code});
  return inject==='lost-ack'?[503,'unknown']:[201,code];
 }
 // Both initial lookups already missed. A competing TX committed before ours.
 staleMissCommit(req){
  const collision=this.links.has(req.code)||this.ids.has(req.key);
  if(!collision)return this.attempt(req);
  // Rollback the staged Link, then read the winner in a NEW statement.
  const winner=this.ids.get(req.key);
  if(winner)return winner.hash===req.hash?[201,winner.code]:[409,null];
  return [req.alias?409:503,null];
 }
}
const a={key:'owner1:key1',hash:'h1',code:'0000g9'};
test('normal create and exact response replay',()=>{const s=new Store;assert.deepEqual(s.attempt(a),[201,a.code]);assert.deepEqual(s.attempt(a),[201,a.code]);assert.equal(s.links.size,1);});
test('both initial misses, different candidates, one committed mapping',()=>{for(const winner of ['a','b']){const s=new Store,b={...a,code:'0000ga'};s.attempt(winner==='a'?a:b);assert.deepEqual(s.staleMissCommit(winner==='a'?b:a),[201,winner==='a'?a.code:b.code]);assert.equal(s.links.size,1);}});
test('same alias + same key recovers despite code conflict first',()=>{const s=new Store,r={...a,code:'sale',alias:true};s.attempt(r);assert.deepEqual(s.staleMissCommit(r),[201,'sale']);});
test('same key changed intent is 409; no orphan mapping',()=>{const s=new Store;s.attempt(a);assert.deepEqual(s.staleMissCommit({...a,hash:'h2',code:'0000gb'}),[409,null]);assert.equal(s.links.size,1);});
test('different owners / keys cannot claim same alias',()=>{const s=new Store;s.attempt({...a,code:'sale',alias:true});assert.deepEqual(s.staleMissCommit({...a,key:'owner2:key1',code:'sale',alias:true}),[409,null]);});
test('confirmed abort changes neither table; retry can succeed',()=>{const s=new Store;assert.equal(s.attempt(a,'abort')[0],503);assert.equal(s.links.size,0);assert.equal(s.ids.size,0);assert.equal(s.attempt(a)[0],201);});
test('commit succeeded, ACK lost, retry recovers original code',()=>{const s=new Store;assert.deepEqual(s.attempt(a,'lost-ack'),[503,'unknown']);assert.deepEqual(s.attempt({...a,code:'another'}),[201,a.code]);assert.equal(s.links.size,1);});
test('random collision does not overwrite; bounded retry then success',()=>{const s=new Store;s.attempt(a);const r={...a,key:'owner2:key2',hash:'h2'};let outcome;for(const code of [a.code,'newone']){outcome=s.attempt({...r,code});if(outcome[0]===201)break;}assert.deepEqual(outcome,[201,'newone']);assert.equal(s.links.get(a.code).hash,'h1');});
test('five generated collisions terminate without writes',()=>{const s=new Store;s.attempt(a);let tries=0;for(;tries<5;tries++)assert.equal(s.attempt({...a,key:'other'})[0],503);assert.equal(tries,5);assert.equal(s.links.size,1);});
test('same original request replays after expiry/revocation',()=>{const s=new Store;s.attempt(a);s.links.get(a.code).status='revoked';assert.deepEqual(s.attempt(a),[201,a.code]);});
function response(snapshot,t,upperNow=t,clockGood=true){
 if(!clockGood||t>=snapshot.deadline)return 503;
 if(!snapshot.row)return 404;
 const r=snapshot.row;
 if(['revoked','blocked'].includes(r.status))return 410;
 if(r.status==='pending')return 200;
 if(r.status!=='active')return 503;
 if(r.expiry!==null&&upperNow+1>=r.expiry)return 410;
 return 302;
}
const fresh={row:{status:'active',expiry:null,version:7},deadline:8};
test('copy at t=7 inherits t=8 deadline; no renewed 302 at t=9',()=>{const local=structuredClone(fresh);assert.equal(response(local,7),302);assert.equal(response(local,9),503);assert.equal(response({...local,deadline:15},9),302);});
test('fresh expired record 410; stale snapshot with no authority 503',()=>{const expired={...fresh,row:{...fresh.row,expiry:5}};assert.equal(response(expired,6),410);assert.equal(response(expired,9),503);});
test('expiry reserves the full one-second response emission budget',()=>{const e={...fresh,row:{...fresh.row,expiry:5}};assert.equal(response(e,3.9,4.1),410);assert.equal(response(e,3,3.2),302);});
test('negative entry vs dependency error; expired negative is not a 404',()=>{assert.equal(response({row:null,deadline:1},.5),404);assert.equal(response({row:null,deadline:1},2),503);});
test('pending review page differs from terminal block',()=>{assert.equal(response({...fresh,row:{...fresh.row,status:'pending'}},1),200);assert.equal(response({...fresh,row:{...fresh.row,status:'blocked'}},1),410);});
test('untrusted clock fails closed',()=>assert.equal(response(fresh,1,1,false),503));
test('combined skew plus send budget stays inside 10 seconds',()=>{for(const producerOffset of [-.5,0,.5])for(const consumerOffset of [-.5,0,.5]){const deadline=producerOffset+8,lastCheckTrue=deadline-consumerOffset-1e-6;assert.ok(lastCheckTrue+1<10);}});
test('version floor rejects stale fill; current value prevents downgrade',()=>{const accept=(incoming,floor,current,t)=>incoming.v>=Math.max(floor,current??0)&&t<incoming.deadline;assert.equal(accept({v:7,deadline:8},8,0,3),false);assert.equal(accept({v:8,deadline:8},7,9,3),false);assert.equal(accept({v:9,deadline:8},8,8,3),true);assert.equal(accept({v:9,deadline:8},8,8,9),false);});
test('trusted high-risk admission commits pending; redirect does not disclose target',()=>{const store=new Store;assert.equal(store.attempt(a,'','pending')[0],201);const row=store.links.get(a.code);assert.equal(row.status,'pending');assert.equal(response({row,deadline:8},1),200);});
test('conditional revoke creates exactly one matching event',()=>{let version=7,status='active',events=[];const update=(expected,failEvent=false)=>{if(expected!==version)return 412;const next=version+1;if(failEvent)return 503;version=next;status='revoked';events.push(next);return 200;};assert.equal(update(7,true),503);assert.equal(status,'active');assert.equal(version,7);assert.equal(update(7),200);assert.equal(update(7),412);assert.deepEqual(events,[8]);});
const N=62**6,n=365e6;
const numbers={namespace:N,bits:Math.log2(N),birthdayHalf:Math.sqrt(2*N*Math.log(2)),occupancy:n/N,expectedAttempts:1/(1-n/N),fiveCollisions:(n/N)**5,normalBoxes:Math.ceil(11600/600),nMinusOneBoxes:Math.ceil(11600/600)+1,survivorBudget:20*600,storageGB:1e6*365*500/1e9,threeCopiesGB:1e6*365*500*3/1e9,egressMBps:11600*500/1e6,localGB:21*1e5*1000/1e9,origin95:11600*.05,origin90:11600*.1,fullRangeSeconds:10000/58,left312Seconds:312/58,errorBudgetSeconds:10000/10800,yearDowntimeMinutes:.0001*365*24*60};
test('capacity and probability recomputed independently',()=>{assert.equal(N,56800235584);assert.equal(numbers.normalBoxes,20);assert.equal(numbers.nMinusOneBoxes,21);assert.ok(19*600<11600&&20*600>=11600);assert.equal(numbers.storageGB,182.5);assert.equal(numbers.threeCopiesGB,547.5);assert.ok(Math.abs(numbers.birthdayHalf-280610)<1);assert.ok(62n**10n<2n**63n&&2n**63n<62n**11n);});
const report={scope:'Executable contract model; no live PostgreSQL, Redis, HTTP cache, or load experiment',results,numbers};fs.writeFileSync('docs/reviews/ch09-contract-results.json',JSON.stringify(report,null,2));console.log(`${results.length} contract/numeric checks PASS`,JSON.stringify(numbers));
