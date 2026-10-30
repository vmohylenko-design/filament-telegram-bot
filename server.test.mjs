import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from './server.mjs';
test('webhook requires its own secret and never accesses the private panel',async()=>{
 const server=createServer({TELEGRAM_WEBHOOK_SECRET:'test-secret'},()=>{throw Error('External access forbidden')});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base='http://127.0.0.1:'+server.address().port;
 const post=(body,secret='test-secret')=>fetch(base+'/telegram/webhook',{method:'POST',headers:{'X-Telegram-Bot-Api-Secret-Token':secret},body});
 try{
 assert.equal((await fetch(base+'/health')).status,200);
 assert.equal((await post('{}','wrong')).status,403);
 assert.equal((await post('invalid')).status,400);
 const response=await post(JSON.stringify({update_id:1,message:{chat:{id:123,type:'private'},text:'/start'}}));
 const data=await response.json();assert.equal(data.method,'sendMessage');assert.equal(data.chat_id,123);
 assert.equal((await post('x'.repeat(66000))).status,413);
 }finally{await new Promise(r=>server.close(r))}
});
