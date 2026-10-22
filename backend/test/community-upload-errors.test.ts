import test from 'node:test';
import assert from 'node:assert/strict';
import {communityUploadFailure} from '../src/services/community-collaboration.service.js';
import {communityErrorMessage,communityRequestError,retryableCommunityUpload} from '../../src/features/community/communityErrors.js';
test('multipart truncation, file size, storage/schema failure are distinguished without leaking upload/DB data',()=>{
 const secret='sensitive-attachment-content';
 assert.deepEqual(communityUploadFailure({code:'FST_REQ_FILE_TOO_LARGE',message:secret}),{status:413,code:'COMMUNITY_FILE_SIZE'});
 assert.deepEqual(communityUploadFailure({code:'FST_INVALID_MULTIPART_CONTENT_TYPE',message:secret}),{status:400,code:'COMMUNITY_UPLOAD_INCOMPLETE'});
 assert.deepEqual(communityUploadFailure({code:'P2021',message:secret}),{status:503,code:'COMMUNITY_STORAGE_UNAVAILABLE'});
 assert.deepEqual(communityUploadFailure({message:'COMMUNITY_FILE_TYPE',statusCode:415}),{status:415,code:'COMMUNITY_FILE_TYPE'});
 assert.ok(!JSON.stringify(communityUploadFailure({code:'P2004',message:secret})).includes(secret));
});
test('only an identified online upload may retry transient gateway/network failure, never permission, quota or offline',()=>{
 for(const status of [0,502,504])assert.equal(retryableCommunityUpload(status,true),true);
 for(const status of [200,400,401,403,409,413,415,429,500,503])assert.equal(retryableCommunityUpload(status,true),false);
 assert.equal(retryableCommunityUpload(502,false),false);assert.equal(retryableCommunityUpload(0,true,false),false);
});
test('client handles structured/offline/proxy failures and safe reference, not raw server or attachment data',()=>{
 const t=(fa:string,_en:string)=>fa,secret='sensitive-db-message';
 assert.equal(communityRequestError(503,{error:{code:'OFFLINE_READ_ONLY',message:secret}}).code,'OFFLINE_READ_ONLY');
 const e=communityRequestError(500,{error:'COMMUNITY_FILE_STORE_FAILED',detail:secret,requestId:'req-123'});
 const message=communityErrorMessage(e,t);assert.ok(message.includes('ذخیره'));assert.ok(message.includes('req-123'));assert.ok(!message.includes(secret));
 assert.ok(communityErrorMessage({code:'COMMUNITY_NETWORK_FAILED'},t).includes('ارتباط'));
 assert.ok(communityErrorMessage({code:'COMMUNITY_INVALID_RESPONSE'},t).includes('تأیید نشده'));
 assert.equal(communityRequestError(502,{error:secret,requestId:'<script>'}).requestId,undefined);
});
