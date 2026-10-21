import assert from 'node:assert/strict';
import test from 'node:test';
import {liveLogQuery,parseLiveLogIntent,liveLogCommands,liveLogMatches,redactLiveLog,discoverWebLogContainer,WEB_LOG_DISCOVERY} from '../dist/linux/live-log-query.js';

test('Persian/English requests resolve to explicit sources and literal filters; uncertainty asks instead of guessing',()=>{
 assert.deepEqual(parseLiveLogIntent('لاگ زنده nginx').query,{source:'file',file:'/var/log/nginx/access.log',webFallback:true});
 assert.deepEqual(parseLiveLogIntent('لاگ سرویس my-api@blue شامل «connection refused»').query,{source:'journal',unit:'my-api@blue',text:'connection refused'});
 assert.equal(parseLiveLogIntent('لاگ IP ۱۹۲.۰.۲.۱۰').query.ip,'192.0.2.10');
 assert.equal(parseLiveLogIntent('live logs service docker errors').query.errorsOnly,true);
 assert.deepEqual(parseLiveLogIntent('لاگ کانتینر main-nginx شامل «qa-request»').query,{source:'docker',container:'main-nginx',text:'qa-request'});
 assert.deepEqual(parseLiveLogIntent('لاگ شامل «nginx error»').query,{source:'journal',text:'nginx error'});
 assert.equal(parseLiveLogIntent('لاگ کرنل').query.kernel,true);
 assert.equal(parseLiveLogIntent('لاگ nginx و docker').query,undefined);
 assert.ok(parseLiveLogIntent('لاگ حادثه نامشخص').clarification);
 assert.equal(parseLiveLogIntent('پورت 80 را باز کن'),null);
 assert.ok(parseLiveLogIntent('لاگ nginx; reboot').clarification);
 assert.ok(parseLiveLogIntent('لاگ 192.0.2.10 و 192.0.2.11').clarification);
});
test('automatic web source requires real unique compatible container evidence and never exports labels/env',()=>{
 const q={source:'file',file:'/var/log/nginx/access.log',webFallback:true},entry={ID:'123456abcdef',Image:'nginx:1.27-alpine',Ports:'0.0.0.0:80->80/tcp'};
 assert.equal(discoverWebLogContainer(JSON.stringify(entry),q),entry.ID);
 assert.throws(()=>discoverWebLogContainer(JSON.stringify({...entry,Image:'postgres:16'}),q));
 assert.throws(()=>discoverWebLogContainer([entry,{...entry,ID:'abcdef123456'}].map(JSON.stringify).join('\n'),q));
 assert.throws(()=>discoverWebLogContainer(JSON.stringify({...entry,ID:'$(id)'}),q));
 assert.throws(()=>discoverWebLogContainer(Array.from({length:101},()=>JSON.stringify(entry)).join('\n'),q));
 assert.throws(()=>discoverWebLogContainer(JSON.stringify(entry)+'\n{partial',q));
 assert.ok(!WEB_LOG_DISCOVERY.includes('{{json .}}'));assert.ok(!WEB_LOG_DISCOVERY.includes('Labels'));
});
test('schema and compiler reject shell injection, arbitrary files and inconsistent or unknown parameters',()=>{
 for(const q of [{source:'journal',unit:'nginx;id'},{source:'file',file:'/etc/shadow'},{source:'file',file:'/var/log/../etc/shadow'},{source:'journal',file:'/var/log/auth.log'},{source:'journal',command:'id'},{source:'journal',ip:'999.1.2.3'},{source:'journal',errorsOnly:'yes'}])assert.throws(()=>liveLogQuery(q));
 const q={source:'journal',unit:'api@blue',text:"$(touch /tmp/no); ' | id"};
 const c=liveLogCommands(q);assert.ok(!c.follow.includes(q.text));assert.ok(c.follow.includes("--unit='api@blue.service'"));assert.ok(c.follow.startsWith('timeout 1800 '));
 assert.ok(liveLogCommands({source:'file',file:'/var/log/auth.log'}).probe.includes('readlink -f'));
 assert.ok(liveLogCommands({source:'docker',container:'main-nginx'}).follow.includes("--tail 50 'main-nginx'"));
 assert.throws(()=>liveLogCommands({source:'docker',container:'$(id)'}));
 assert.throws(()=>liveLogCommands({source:'docker',container:'main-nginx',unit:'ssh'}));
});
test('literal IP/text matching excludes near IPs and regex interpretation, severity is source-specific',()=>{
 const q={source:'journal',ip:'192.0.2.1'};
 assert.equal(liveLogMatches(q,'from 192.0.2.1 port 80',null),true);
 assert.equal(liveLogMatches(q,'192.0.2.1:443 requested',null),true);
 assert.equal(liveLogMatches(q,'192.0.2.10 requested',null),false);
 assert.equal(liveLogMatches(q,'1192.0.2.1 requested',null),false);
 assert.equal(liveLogMatches({source:'journal',ip:'2001:db8::1'},'from [2001:0db8:0:0:0:0:0:1]:443',null),true);
 assert.equal(liveLogMatches({source:'journal',ip:'2001:db8::1'},'from [2001:db8::1:2]:443',null),false);
 assert.equal(liveLogMatches({source:'journal',text:'a.*b'},'a123b',null),false);
 assert.equal(liveLogMatches({source:'journal',errorsOnly:true},'routine message',6),false);
 assert.equal(liveLogMatches({source:'file',file:'/var/log/nginx/access.log',errorsOnly:true},'GET / 500',null),true);
});
test('secrets, credentials, cookies, control sequences and oversized messages are removed before delivery',()=>{
 const secret='fixture-sensitive-value';
 for(const line of [`password=${secret}`,`password="${secret} more"`,`Authorization: Bearer ${secret}`,`Cookie: a=${secret}; b=${secret}`,`https://user:${secret}@example.test/`,`token=${secret}`])assert.ok(!redactLiveLog(line).includes(secret));
 assert.equal(redactLiveLog('\x1b[31mhello\x00\u202ehide'),'hellohide');
 assert.ok(redactLiveLog('a'.repeat(20000)).length<=4096);
});
