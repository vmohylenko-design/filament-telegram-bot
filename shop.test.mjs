import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateOrder} from './sheets.mjs';
import {createServer} from './server.mjs';
const rows=[{id:'a',name:'PLA',price:905,stock:1,incoming:18}];
const order={customer:'Test User',phone:'+380991234567',address:'Вінниця 1',delivery:'Нова пошта',items:[{id:'a',qty:1,price:905}]};
test('checkout validates live stock and server prices, excluding incoming goods',()=>{
 assert.equal(validateOrder(order,rows).total,905);
 for(const items of [[{id:'a',qty:2,price:905}],[{id:'a',qty:1,price:1}],[{id:'a',qty:-1,price:905}],[{id:'a',qty:1,price:905},{id:'a',qty:1,price:905}]])assert.throws(()=>validateOrder({...order,items},rows));
 assert.throws(()=>validateOrder({...order,phone:'bad'},rows));
});
test('shop opens from Telegram keyboard; order endpoint is not public',async()=>{
 const s=createServer({TELEGRAM_WEBHOOK_SECRET:'test'});await new Promise(r=>s.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+s.address().port;
 try{assert.match(await (await fetch(url+'/shop')).text(),/Куди відправити/);
 assert.equal((await fetch(url+'/api/orders',{method:'POST',body:'{}'})).status,404);
 const response=await fetch(url+'/telegram/webhook',{method:'POST',headers:{'X-Telegram-Bot-Api-Secret-Token':'test'},body:JSON.stringify({update_id:99,message:{chat:{id:1,type:'private'},text:'/start'}})});
 assert.equal((await response.json()).reply_markup.keyboard[0][0].web_app.url,'https://filament-vinnytsia-telegram.onrender.com/shop');
 }finally{await new Promise(r=>s.close(r))}
});
