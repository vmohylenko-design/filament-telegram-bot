import http from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { pathToFileURL } from 'node:url';

function matches(a,b){if(typeof a!=='string'||typeof b!=='string')return false;const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y)}
export function createServer(config=process.env,forward=fetch){
 const ready=Boolean(config.TELEGRAM_WEBHOOK_SECRET);
 return http.createServer(async(req,res)=>{
  const reply=(status,data)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(data))};
  if(req.method==='GET'&&req.url==='/health')return reply(ready?200:503,{ready});
  if(req.method!=='POST'||req.url!=='/telegram/webhook')return reply(404,{error:'Not found'});
  if(!ready)return reply(503,{error:'Not configured'});
  if(!matches(req.headers['x-telegram-bot-api-secret-token'],config.TELEGRAM_WEBHOOK_SECRET))return reply(403,{error:'Forbidden'});
  try{
   const chunks=[];let size=0;
   for await(const chunk of req){size+=chunk.length;if(size>65536)return reply(413,{error:'Too large'});chunks.push(chunk)}
   const body=Buffer.concat(chunks).toString('utf8');let update;
   try{update=JSON.parse(body)}catch{return reply(400,{error:'Invalid JSON'})}
   if(!Number.isSafeInteger(update?.update_id)||update.update_id<0)return reply(400,{error:'Invalid update'});
   const chat=update.message?.chat;
   if(!chat||chat.type!=='private')return reply(200,{ok:true});
   return reply(200,{method:'sendMessage',chat_id:chat.id,text:'Вітаємо у Філамент Вінниця! Бот проходить налаштування. Прийом замовлень і актуальний склад ще не підключені. Оплату через цей чат поки не здійснюйте.'});
  }catch{return reply(503,{error:'Processing unavailable'})}
 });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const port=Number(process.env.PORT||10000);const server=createServer();server.listen(port,'0.0.0.0');process.on('SIGTERM',()=>{server.close();setTimeout(()=>process.exit(0),25000).unref()})}
