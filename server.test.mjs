import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from './server.mjs';
test('authenticated webhook forwarding and retry behavior',async()=>{
 const config={SITE_URL:'https://filament-vinnytsia-workspace.vmohylenko.chatgpt.site',SITE_SERVICE_TOKEN:'test-service-secret',BOT_BRIDGE_KEY:'test-bridge-key',TELEGRAM_WEBHOOK_SECRET:'test-webhook-secret'};
 let fail=false,calls=0;
 const server=createServer(config,async(url,request)=>{calls++;assert.equal(url.pathname,'/api/botbridge');assert.equal(request.headers['X-Bot-Bridge-Key'],config.BOT_BRIDGE_KEY);assert.equal(JSON.parse(request.body).update_id,1);return new Response('',{status:fail?503:200})});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 const post=(body,secret=config.TELEGRAM_WEBHOOK_SECRET)=>fetch(base+'/telegram/webhook',{method:'POST',headers:{'X-Telegram-Bot-Api-Secret-Token':secret},body});
 try{
  assert.equal((await fetch(base+'/health')).status,200);
  assert.equal((await post('{"update_id":1}','wrong')).status,403);assert.equal(calls,0);
  assert.equal((await post('invalid')).status,400);
  assert.equal((await post('{"update_id":1}')).status,200);
  fail=true;assert.equal((await post('{"update_id":1}')).status,503);
  assert.equal((await post('x'.repeat(66000))).status,413);
 }finally{await new Promise(resolve=>server.close(resolve))}
});
