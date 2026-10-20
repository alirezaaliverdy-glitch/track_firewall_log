import test from 'node:test';
import assert from 'node:assert/strict';
import {securityDisplayText} from '../../src/features/security/securityPresentation.ts';
test('account activity titles and summaries are Persian, without changing forensic English',()=>{
 for(const title of ['Account: sensitive privileged command','Account: user or administrator changed','Account: configuration changed']){assert.match(securityDisplayText(title,'fa-IR'),/[\u0600-\u06ff]/);assert.equal(securityDisplayText(title,'en'),title);}
 assert.match(securityDisplayText('Possible port scan from 192.0.2.1','fa'),/اسکن.*192\.0\.2\.1/);
 assert.match(securityDisplayText('Sensitive port 22 allowed','fa'),/22/);
 assert.match(securityDisplayText('Account: sensitive privileged command (1 matching events in 15 minutes)','fa'),/۱۵|15/);
});
