// Deterministic contract traces; does NOT exercise a real distributed store.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(dir, '../..');
const checks = [];
function check(name, fn) { const value=fn(); checks.push({name,passed:true,...(value===undefined?{}:{value})}); }

// Model the single PostgreSQL commit/unique-key boundary, not its implementation.
class AuthorShard {
  keys=new Map(); posts=new Map(); outbox=new Map();
  commit(author,key,hash,id,{fail=false,lost=false}={}) {
    const old=this.keys.get(`${author}/${key}`);
    if(old) return old.hash===hash?old.response:409;
    if(fail) return 503; // all staged writes rolled back
    const response={status:201,id};
    this.keys.set(`${author}/${key}`,{hash,response});
    this.posts.set(id,{author,status:'live'});this.outbox.set(`e${id}`,{id,published:false});
    return lost?503:response;
  }
}
check('normal publish commits Post, receipt and Outbox',()=>{
 const db=new AuthorShard();assert.equal(db.commit(1,'k','h',1).status,201);
 assert.equal(db.keys.size+db.posts.size+db.outbox.size,3);
});
check('rollback exposes no post or event',()=>{
 const db=new AuthorShard();assert.equal(db.commit(1,'k','h',1,{fail:true}),503);
 assert.equal(db.keys.size+db.posts.size+db.outbox.size,0);
});
check('two initial misses converge on the committed unique-key winner',()=>{
 const db=new AuthorShard();assert.equal(db.keys.get('1/k'),undefined);
 const winner=db.commit(1,'k','h',1);assert.deepEqual(db.commit(1,'k','h',2),winner);
 assert.equal(db.posts.size,1);assert.equal(db.outbox.size,1);
});
check('same key with different body is 409',()=>{
 const db=new AuthorShard();db.commit(1,'k','h',1);assert.equal(db.commit(1,'k','other',2),409);
});
check('lost commit response recovered by same key without duplicate post',()=>{
 const db=new AuthorShard();assert.equal(db.commit(1,'k','h',1,{lost:true}),503);
 assert.equal(db.commit(1,'k','h',2).id,1);assert.equal(db.posts.size,1);
});
check('Relay crash after broker ack duplicates event identity',()=>{
 const sends=[];const event={event_id:'e1'};let published=false;
 sends.push(event.event_id); // crash before local mark
 if(!published) {sends.push(event.event_id);published=true;}
 assert.deepEqual(sends,['e1','e1']);
});
check('partial durable fan-out replay preserves unique rows and original time',()=>{
 const inbox=new Map();let cp=0;
 const put=id=>{if(!inbox.has(id)) inbox.set(id,{post:9,time:1000});};
 put(1);put(2); // crash before cp; snapshot [1,2,3] remains stable
 for(const id of [1,2,3].slice(cp)) put(id);cp=3;
 assert.equal(inbox.size,3);assert.equal(cp,3);assert.equal(inbox.get(1).time,1000);
});
check('checkpoint-first counterexample permanently omits a recipient',()=>{
 const writes=new Set([1]);let cp=3; // incorrect: crash before writing 2,3
 for(const id of [1,2,3].slice(cp)) writes.add(id);
 assert.equal(writes.has(2),false);
});
check('concurrent checkpoint CAS cannot advance from an unexpected page',()=>{
 let cp=0;const cas=(expected,next)=>{if(cp!==expected)return false;cp=next;return true;};
 assert.equal(cas(0,500),true);assert.equal(cas(0,500),false);assert.equal(cp,500);
});

class Cache {
  now=0;epoch=1;generation=0;value=null;
  grant(){return {epoch:this.epoch,g:this.generation,deadline:this.now+2};}
  install(token,value){
    if(token.epoch!==this.epoch||token.g!==this.generation||this.now>token.deadline)return false;
    this.value={value,expiry:this.now+25};return true;
  }
  invalidate(){this.generation++;this.value=null;}
  get(){return this.value&&this.now<this.value.expiry?this.value.value:null;}
}
check('invalidation rejects old grant instead of resurrecting deleted body',()=>{
 const c=new Cache();const t=c.grant();c.invalidate();assert.equal(c.install(t,'live'),false);
 assert.equal(c.install(c.grant(),'deleted'),true);assert.equal(c.get(),'deleted');
});
check('client timeout alone would permit queued stale SET; cache deadline rejects it',()=>{
 const c=new Cache();const t=c.grant();c.now=3;assert.equal(c.install(t,'live'),false);
});
check('lost invalidation is bounded by install deadline + fixed TTL + response',()=>{
 const c=new Cache();const t=c.grant();c.now=2;assert.equal(c.install(t,'live'),true);
 c.now=26;assert.equal(c.get(),'live');assert.equal(c.value.expiry,27);
 c.now=27;assert.equal(c.get(),null);assert.equal(2+25+2,29);
});
check('cache restart epoch prevents token ABA',()=>{
 const c=new Cache();const t=c.grant();c.epoch++;c.generation=0;assert.equal(c.install(t,'live'),false);
});
function cursorStatus(c,ctx) {
 if(!c.signed||c.viewer!==ctx.viewer)return 400;
 if(c.version!==ctx.version)return 409;
 if(c.snapshot!==null && (!ctx.snapshots.has(c.snapshot)||c.expires<=ctx.now))return 410;
 if(!ctx.complete)return 503;
 return 200;
}
const cursor={signed:true,viewer:7,version:4,snapshot:'s1',expires:100};
const ctx={viewer:7,version:4,snapshots:new Set(['s1']),now:1,complete:true};
check('cursor binds viewer, follow version and fixed snapshot expiry',()=>{
 assert.equal(cursorStatus(cursor,ctx),200);
 assert.equal(cursorStatus(cursor,{...ctx,viewer:8}),400);
 assert.equal(cursorStatus(cursor,{...ctx,version:5}),409);
 assert.equal(cursorStatus(cursor,{...ctx,now:101}),410);
});
check('incomplete heavy view cannot silently omit celebrity nine',()=>{
 assert.equal(cursorStatus(cursor,{...ctx,complete:false}),503);
});
check('a frozen incomplete set does not recover pre-snapshot late fan-out',()=>{
 const snapshot=new Set([1,2]);const completeThroughCut=new Set([1,2,3]);
 assert.equal(snapshot.has(3),false);assert.equal(completeThroughCut.has(3),true);
});
check('mode cutover needs backfill plus tail catchup before generation switch',()=>{
 const posts=[1,2];const log=new Set(posts);posts.push(3); // committed during backfill
 assert.equal(log.has(3),false);for(const post of posts)log.add(post);
 assert.deepEqual([...log],[1,2,3]);
});
check('capacity recomputation uses unrounded decimal rates and post-weighted mean',()=>{
 const posts=10_000_000*0.1;const fanout=posts*200/86400;const reads=10_000_000*20/86400;
 const peak=reads*5;const capacity=30_000;const normal=peak*20*0.01+58*20;
 assert.equal(posts,1_000_000);assert.ok(normal<4000);
 assert.equal(0.5+25_000/10_000+1+1,5);
 const userMean=(10+1000)/2;const weighted=(100*10+1*1000)/101;
 assert.notEqual(userMean,weighted);
 return {postsPerDay:posts,postQps:posts/86400,peakReads:peak,fanoutQps:fanout,
   peakFanout:fanout*5,pushUtilization:fanout*5/capacity,
   netDrainRowsPerSec:capacity-fanout*5,backlog60kSeconds:60000/(capacity-fanout*5),
   millionFollowerSeconds:0.5+1_000_000/10_000,
   exclusiveTierMillionSeconds:0.5+1_000_000/30_000,
   purePullAverageProbes:reads*200,celebrity8PeakProbes:peak*8,
   pointerGB:2_000_000*1000*64/1e9,bodyCopiesTB:1_000_000*1000*365*3/1e12,
   normalBodyReads:normal,cacheOutageBodyReads:peak*20,
   max20BodyPages:4000/20,max50BodyPages:4000/50,
   errorBudgetSeconds:200_000/(peak-200)};
});

const build=fs.mkdtempSync(path.join(os.tmpdir(),'ch11-java-'));
let java;
try {
 const compile=spawnSync('javac',['--release','17','-d',build,path.join(dir,'FeedPage.java'),path.join(dir,'FeedPageTest.java')],{encoding:'utf8'});
 assert.equal(compile.status,0,compile.stderr);
 java=spawnSync('java',['-cp',build,'FeedPageTest'],{encoding:'utf8'});
 assert.equal(java.status,0,java.stdout+java.stderr);
 fs.writeFileSync(path.join(root,'docs/reviews/ch11-java-results.txt'),java.stdout);
} finally { fs.rmSync(build,{recursive:true,force:true}); }
const version=spawnSync('java',['-version'],{encoding:'utf8'});
const result={passed:true,model:'GPT-6.1-Sol Max author verification',checks,
 javaChecks:Number(java.stdout.match(/JAVA_CHECKS=(\d+)/)[1]),javaVersion:version.stderr.trim(),
 compileTarget:17,limits:'Deterministic contract models and executable Java page core; no real PostgreSQL/Kafka/cache concurrency or load test.'};
fs.writeFileSync(path.join(root,'docs/reviews/ch11-contract-results.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({passed:true,contractChecks:checks.length,javaChecks:result.javaChecks}));
