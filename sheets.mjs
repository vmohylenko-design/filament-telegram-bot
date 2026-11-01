import {readFile} from 'node:fs/promises';
import {createSign,createHash} from 'node:crypto';
async function googleToken(){
 let key;try{key=JSON.parse(await readFile('/etc/secrets/google-service-account.json','utf8'))}catch{throw Error('GOOGLE_KEY_MISSING_OR_INVALID')}
 if(!key.private_key||!key.client_email)throw Error('GOOGLE_KEY_INCOMPLETE');
 const enc=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
 const now=Math.floor(Date.now()/1000);
 const unsigned=enc({alg:'RS256',typ:'JWT'})+'.'+enc({iss:key.client_email,scope:'https://www.googleapis.com/auth/spreadsheets',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600});
 const sign=createSign('RSA-SHA256');sign.update(unsigned);const jwt=unsigned+'.'+sign.sign(key.private_key,'base64url');
 const tokenRes=await fetch('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:jwt}),signal:AbortSignal.timeout(10000)});
 if(!tokenRes.ok)throw Error('GOOGLE_AUTH_'+tokenRes.status);
 const token=await tokenRes.json();
 return token.access_token;
}
export async function sheetsRequest(path,method='GET',body){
 const id=process.env.GOOGLE_SPREADSHEET_ID;if(!id)throw Error('SHEET_ID_MISSING');
 const token=await googleToken();
 const r=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}${path}`,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000)});
 if(!r.ok)throw Error('GOOGLE_SHEETS_'+r.status);return r.json();
}
export async function readCatalog(){
 const data=await sheetsRequest('/values:batchGet?ranges='+encodeURIComponent("'Прайс'!A1:C500")+'&ranges='+encodeURIComponent("'Склад Винница'!B1:O500")+'&valueRenderOption=UNFORMATTED_VALUE');
 const [prices,warehouse]=data.valueRanges.map(x=>x.values||[]);
 if(prices[0]?.[0]!=='Филамент / цвет / упаковка'||warehouse[0]?.[0]!=='Филамент / цвет / упаковка'||warehouse[0]?.[13]!=='Доступно, шт.')throw Error('CATALOG_HEADER_CHANGED');
 const qty=x=>Number.isFinite(x)?Math.max(0,Math.floor(x)):0;
 const stock=new Map(warehouse.slice(1).map(r=>[r[0],{stock:qty(r[13]),incoming:qty(r[11])+qty(r[12])}]));
 return prices.slice(1).filter(r=>typeof r[0]==='string'&&r[0].trim()).map(r=>({id:createHash('sha256').update(r[0]).digest('hex').slice(0,16),name:r[0],price:Number.isFinite(r[1])&&r[1]>0?r[1]:null,...(stock.get(r[0])||{stock:0,incoming:0})}));
}
const orderTab='Замовлення Telegram';
export async function ensureOrders(){
 const meta=await sheetsRequest('?fields=sheets.properties');
 if(!meta.sheets.some(s=>s.properties.title===orderTab)){
  await sheetsRequest(':batchUpdate','POST',{requests:[{addSheet:{properties:{title:orderTab,gridProperties:{rowCount:10000,columnCount:12,frozenRowCount:1}}}}]});
  await sheetsRequest('/values/'+encodeURIComponent("'"+orderTab+"'!A1:L1")+'?valueInputOption=RAW','PUT',{values:[['ID','Дата UTC','Telegram ID','Username','Одержувач','Телефон','Доставка','Місто / відділення','Товари','Сума, грн','Статус','Коментар']]});
 }
}
export function validateOrder(order,rows){
 if(!order||!Array.isArray(order.items)||!order.items.length||order.items.length>25)throw Error('Перевірте кошик (до 25 різних позицій).');
 for(const [k,max] of [['customer',100],['phone',30],['address',250]])if(typeof order[k]!=='string'||order[k].trim().length<3||order[k].length>max)throw Error('Перевірте дані одержувача.');
 if(!/^\+?[\d ()-]{9,25}$/.test(order.phone))throw Error('Перевірте номер телефону.');
 if(!['Нова пошта','Укрпошта','Самовивіз'].includes(order.delivery))throw Error('Виберіть доставку.');
 const seen=new Set();let total=0;
 const items=order.items.map(x=>{const p=rows.find(p=>p.id===x.id);if(seen.has(x.id)||!p||!Number.isInteger(x.qty)||x.qty<1||x.qty>p.stock||p.price===null)throw Error('Наявність змінилась. Відкрийте магазин і перевірте кошик.');seen.add(x.id);if(x.price!==p.price)throw Error('Ціна змінилась. Відкрийте магазин і перевірте кошик.');total+=p.price*x.qty;return {...p,qty:x.qty}});
 return {items,total:Math.round(total*100)/100};
}
let queue=Promise.resolve();
export function saveOrder(order,update){
 const work=queue.then(async()=>{
  const id='TG-'+update.update_id;
  const old=await sheetsRequest('/values/'+encodeURIComponent("'"+orderTab+"'!A2:A10000"));
  if(old.values?.some(r=>r[0]===id))return {id,duplicate:true};
  if((old.values?.length||0)>9900)throw Error('ORDER_STORAGE_FULL');
  const {items,total}=validateOrder(order,await readCatalog());
  await sheetsRequest('/values/'+encodeURIComponent("'"+orderTab+"'!A:L")+':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS','POST',{values:[[id,new Date().toISOString(),String(update.message.chat.id),update.message.from?.username||'',order.customer.trim(),order.phone.trim(),order.delivery,order.address.trim(),items.map(x=>x.name.replace(/\n/g,' ')+' × '+x.qty+' = '+x.price*x.qty+' грн').join('\n'),total,'Нове — очікує підтвердження',String(order.note||'').slice(0,500)]]});
  return {id,total};
 });queue=work.catch(()=>{});return work;
}
export function catalogReply(items,query){
 const words=query.toLowerCase().replace(/[^\p{L}\p{N}+]+/gu,' ').trim().split(/\s+/).filter(Boolean);
 const found=items.filter(x=>x.stock>0&&words.every(w=>x.name.toLowerCase().includes(w)));
 if(!found.length)return 'За цим запитом доступних позицій не знайдено. Спробуйте назву англійською або код кольору, наприклад: PLA Matte або 10101.';
 const lines=found.slice(0,15).map(x=>`${x.name.replace(/\n/g,' · ')}\n${x.price===null?'Ціна уточнюється':x.price+' грн/кг'} · Доступно: ${x.stock} шт.`);
 let text=lines.join('\n\n');if(text.length>3700)text=text.slice(0,text.lastIndexOf('\n\n',3700));
 return text+`\n\nЗнайдено: ${found.length}. Для точнішого пошуку введіть матеріал або код кольору.\nОформлення замовлень ще налаштовується.`;
}
