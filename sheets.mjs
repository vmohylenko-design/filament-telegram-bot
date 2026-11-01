import {readFile} from 'node:fs/promises';
import {createSign} from 'node:crypto';
export async function readCatalog(){
 let key;try{key=JSON.parse(await readFile('/etc/secrets/google-service-account.json','utf8'))}catch{throw Error('GOOGLE_KEY_MISSING_OR_INVALID')}
 if(!key.private_key||!key.client_email)throw Error('GOOGLE_KEY_INCOMPLETE');
 const enc=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
 const now=Math.floor(Date.now()/1000);
 const unsigned=enc({alg:'RS256',typ:'JWT'})+'.'+enc({iss:key.client_email,scope:'https://www.googleapis.com/auth/spreadsheets.readonly',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600});
 const sign=createSign('RSA-SHA256');sign.update(unsigned);const jwt=unsigned+'.'+sign.sign(key.private_key,'base64url');
 const tokenRes=await fetch('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:jwt}),signal:AbortSignal.timeout(10000)});
 if(!tokenRes.ok)throw Error('GOOGLE_AUTH_'+tokenRes.status);
 const token=await tokenRes.json();
 const id=process.env.GOOGLE_SPREADSHEET_ID;if(!id)throw Error('SHEET_ID_MISSING');
 const result=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}/values/${encodeURIComponent("'Прайс'!A1:C500")}?valueRenderOption=UNFORMATTED_VALUE`,{headers:{Authorization:'Bearer '+token.access_token},signal:AbortSignal.timeout(10000)});
 if(!result.ok)throw Error('GOOGLE_SHEETS_'+result.status);
 const data=await result.json();
 if(data.values?.[0]?.[0]!=='Филамент / цвет / упаковка')throw Error('CATALOG_HEADER_CHANGED');
 return (data.values||[]).slice(1).filter(r=>typeof r[0]==='string'&&r[0].trim()).map(r=>({name:r[0],price:typeof r[1]==='number'?r[1]:null,stock:typeof r[2]==='number'?r[2]:null}));
}
export function catalogReply(items,query){
 const words=query.toLowerCase().replace(/[^\p{L}\p{N}+]+/gu,' ').trim().split(/\s+/).filter(Boolean);
 const found=items.filter(x=>x.stock>0&&words.every(w=>x.name.toLowerCase().includes(w)));
 if(!found.length)return 'За цим запитом доступних позицій не знайдено. Спробуйте назву англійською або код кольору, наприклад: PLA Matte або 10101.';
 const lines=found.slice(0,15).map(x=>`${x.name.replace(/\n/g,' · ')}\n${x.price===null?'Ціна уточнюється':x.price+' грн/кг'} · Доступно: ${x.stock} шт.`);
 let text=lines.join('\n\n');if(text.length>3700)text=text.slice(0,text.lastIndexOf('\n\n',3700));
 return text+`\n\nЗнайдено: ${found.length}. Для точнішого пошуку введіть матеріал або код кольору.\nОформлення замовлень ще налаштовується.`;
}
