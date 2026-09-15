import {createHash} from 'node:crypto';
import {parse} from 'csv-parse/sync';
import {DateTime} from 'luxon';
import {parsePhoneNumberFromString,getCountries} from 'libphonenumber-js/max';

export const seedURL = process.env.SEED_URL || 'https://dispatcher-production-72fc.up.railway.app/data/SivIPYk5jesN2MTvMX9aEA/vg-growthengineer-seed.zip';
export const seedSHA = process.env.SEED_SHA || process.env.SEED_SHA256 || '4961a25b151ca13ac56089ca46b94def6074c315445ec193c7bf87060683d35c';
export const hash=b=>createHash('sha256').update(b).digest('hex');
export const manifest=[
 ['kilele-contacts.csv','KILELE','contacts','1970-01-01'],
 ['kilele-contacts-delta-2026-09-01.csv','KILELE','contacts','2026-09-01'],
 ['kilele-campaigns.csv','KILELE','campaigns'],
 ['kilele-events.csv','KILELE','events'],
 ['kilele-send-log.csv','KILELE','batches'],
 ['karoo-contacts.csv','KAROO','contacts','1970-01-01'],
 ['karoo-campaigns.csv','KAROO','campaigns'],
 ['karoo-events.csv','KAROO','events'],
 ['marrakech-contacts.csv','MARRAKECH','contacts','1970-01-01'],
 ['marrakech-campaigns.csv','MARRAKECH','campaigns'],
 ['marrakech-events.csv','MARRAKECH','events'],
].map(([filename,brand,kind,version])=>({filename,brand,kind,version}));
const countries=new Set(getCountries());
const blank=new Set(['','null','none','n/a','\\n','-']);
const clean=v=>v==null||blank.has(String(v).trim().toLowerCase())?null:String(v).trim();
const alias={e_mail:'email',mobile:'phone',pays:'country'};
const header=s=>{const k=s.replace(/^\uFEFF/,'').trim().toLowerCase().replace(/\s+/g,'_');return alias[k]??k;};
const fail=code=>{throw Object.assign(new Error(code),{code});};
function required(s,code){const v=clean(s);if(!v)fail(code);return v;}
export function timestamp(s,zone,{required:must=false,dateOnly=false}={}){
 const v=clean(s); if(!v){if(must)fail('MISSING_DATE');return null;}
 if(/^\d{4}-\d{2}-\d{2}$/.test(v)&&dateOnly){
  const d=DateTime.fromISO(v,{zone});if(!d.isValid)fail('INVALID_DATE');return d.toUTC().toISO();
 }
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/.test(v))fail('INVALID_DATE');
 if(!DateTime.fromISO(v,{setZone:true}).isValid)fail('INVALID_DATE');
 return v; // Preserve microseconds for PostgreSQL; don't round through JS Date.
}
function country(v){v=clean(v);if(!v)return null;const x=({KEN:'KE',KENYA:'KE','254':'KE'})[v.toUpperCase()]??v.toUpperCase();if(!countries.has(x))fail('INVALID_COUNTRY');return x;}
const bool=v=>{v=clean(v)?.toLowerCase();if(['true','yes','y','1','t'].includes(v))return true;if(['false','no','n','0','f'].includes(v))return false;return null;};
function integer(v){if(!/^\d+$/.test(v??''))fail('INVALID_COUNT');const x=Number(v);if(!Number.isSafeInteger(x))fail('INVALID_COUNT');return x;}
function decimal(v){const x=required(v,'INVALID_SPEND').replace(',','.');if(!/^\d+(\.\d{1,2})?$/.test(x)||!Number.isFinite(Number(x)))fail('INVALID_SPEND');return x;}
function phone(v,c){
 v=clean(v);if(!v||/[^\d+\s().-]/.test(v))return null;
 let x=v.replace(/[\s().-]/g,'');if(x.startsWith('00'))x='+'+x.slice(2);
 let p=parsePhoneNumberFromString(x,c??undefined);
 if(!p?.isValid()&&!x.startsWith('+'))p=parsePhoneNumberFromString('+'+x);
 return p?.isValid()?p.number:null;
}
const messages={
 INVALID_CONTROL:'Record contains a NUL character that PostgreSQL cannot store; quarantined as encoded evidence.',
 BAD_WIDTH:'Column count does not match this file header.',REPEATED_HEADER:'Repeated header inside the export.',
 BRAND_MISMATCH:'Row brand does not match the import destination; row quarantined.',
 CONFLICTING_ID:'The same identity has conflicting rows in this export; all versions quarantined.',
 MISSING_ID:'Required external ID is missing.',INVALID_ID:'External ID format is invalid.',
 MISSING_NAME:'Customer name is missing.',INVALID_STATUS:'Status is not recognized.',
 INVALID_COUNTRY:'Country is not recognized.',INVALID_DATE:'Date is invalid or has no explicit timezone.',
 MISSING_DATE:'Required date is missing.',INVALID_CHANNEL:'Channel must be email or sms.',
 INVALID_COUNT:'Count must be a nonnegative integer.',INVALID_SPEND:'Spend is not a valid nonnegative decimal.',
 INVALID_EVENT:'Event type is not supported.',MISSING_CONTACT:'Referenced contact was not accepted in this brand.',
 MISSING_CAMPAIGN:'Referenced campaign is absent in this brand; excluded from campaign metrics.',
 INVALID_PARENT:'Parent campaign is missing, belongs elsewhere, or would create a cycle; link omitted.',
 INVALID_EMAIL:'Email is missing or invalid; email sending disabled for this contact.',
 INVALID_PHONE:'Phone is missing or cannot be validated; SMS sending disabled for this contact.',
 UNKNOWN_CONSENT:'Consent is missing or unrecognized; treated as no marketing consent.',
 UNKNOWN_SIGNUP:'Signup date is missing; excluded from signup trend.',
 UNKNOWN_COUNTRY:'Country is missing; excluded from country-targeted sends.',
 DATE_ONLY:'Signup supplied as a date; interpreted as midnight in the brand timezone.',
 INVALID_BATCH_STATUS:'Historical batch status is not recognized.',
};

export function prepare(buffer,spec,brand,lookup={contacts:new Map(),campaigns:new Map()}){
 let text,encoding='utf-8';try{text=new TextDecoder('utf-8',{fatal:true}).decode(buffer);}catch{encoding='windows-1252';text=new TextDecoder(encoding,{fatal:true}).decode(buffer);}
 const delimiter=spec.brand==='MARRAKECH'?';':',';
 // Strict quoting: a broken quote aborts the file, rather than swallowing later rows.
 const parsed=parse(text,{delimiter,bom:true,relax_column_count:true,skip_empty_lines:false,info:true});
 const head=parsed.shift()?.record.map(header);if(!head||new Set(head).size!==head.length)fail('BAD_HEADER');
 const necessary={contacts:['external_id','full_name','email','phone','country','signup_at','status','consent_marketing','brand_code','deleted_at','suppressed_until'],campaigns:['external_id','campaign_name','channel','target_country','reported_sent','reported_delivered','reported_bounced','reported_opens','reported_clicks','spend','sent_at_utc','parent_campaign_id'],events:['event_id','external_contact_id','campaign_external_id','event_type','channel','occurred_at_utc'],batches:['batch_key','campaign_external_id','queued_at_utc','recipient_count','status']}[spec.kind];
 if(necessary.some(k=>!head.includes(k)))fail('BAD_HEADER');
 const result={rows:[],issues:[],quarantine:[],suppressions:[],total:parsed.length,rejected:0,duplicates:0,warningRows:0,encoding,delimiter};
 const grouped=new Map();const quarantined=new Set();const warned=new Set();
 function issue(item,code,severity='error'){
  result.issues.push({row_number:item.line,code,severity,safe_message:messages[code]??'Invalid record; see the documented import rules.'});
  if(severity==='warning')warned.add(item.line);
  if(!quarantined.has(item.line)){
   const raw_record=item.raw.some(v=>v.includes('\0'))?{encoding:'base64-json-utf8',data:Buffer.from(JSON.stringify(item.raw)).toString('base64')}:item.raw;
   result.quarantine.push({row_number:item.line,raw_record});quarantined.add(item.line);
  }
 }
 for(const {record,info} of parsed){
  const item={line:info.lines,raw:record};
  if(record.some(v=>v.includes('\0'))){issue(item,'INVALID_CONTROL');result.rejected++;continue;}
  if(record.length!==head.length){issue(item,'BAD_WIDTH');result.rejected++;continue;}
  const r=Object.fromEntries(head.map((k,i)=>[k,record[i].trim()]));item.r=r;
  if(header(record[0])===head[0]){issue(item,'REPEATED_HEADER');result.rejected++;continue;}
  if(spec.kind==='contacts'&&r.brand_code.toUpperCase()!==spec.brand){issue(item,'BRAND_MISMATCH');result.rejected++;continue;}
  const key=r.external_id??r.event_id??r.batch_key;
  if(!clean(key)){issue(item,'MISSING_ID');result.rejected++;continue;}
  const items=grouped.get(key)??[];items.push(item);grouped.set(key,items);
 }
 for(const [key,items] of grouped){
  if(new Set(items.map(i=>JSON.stringify(i.r))).size>1){for(const i of items)issue(i,'CONFLICTING_ID');result.rejected+=items.length;continue;}
  const item=items[0],r=item.r,w=[];result.duplicates+=items.length-1;
  try{
   let row;
   if(spec.kind==='contacts'){
    if(!/^CT-\d+$/.test(key))fail('INVALID_ID');
    const c=country(r.country),consent=bool(r.consent_marketing);
    if(!c)w.push('UNKNOWN_COUNTRY');if(consent===null)w.push('UNKNOWN_CONSENT');
    const e=clean(r.email)?.toLowerCase();const email=e&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)&&e.length<=254?e:null;
    const p=phone(r.phone,c);if(!email)w.push('INVALID_EMAIL');if(!p)w.push('INVALID_PHONE');
    const status=({unsubscribe:'unsubscribed'})[r.status.toLowerCase()]??r.status.toLowerCase();
    if(!['active','pending','bounced','unsubscribed'].includes(status))fail('INVALID_STATUS');
    const date=timestamp(r.signup_at,brand.timezone,{dateOnly:true});
    const precision=!date?'unknown':/^\d{4}-\d{2}-\d{2}$/.test(r.signup_at)?'date':'timestamp';
    if(!date)w.push('UNKNOWN_SIGNUP');if(precision==='date')w.push('DATE_ONLY');
    row={external_id:key,full_name:required(r.full_name,'MISSING_NAME'),email,phone:p,country:c,city:clean(r.city),signup_at:date,signup_precision:precision,status,consent_marketing:consent===true,email_valid:!!email,phone_valid:!!p,deleted_at:timestamp(r.deleted_at,brand.timezone,{dateOnly:true}),suppressed_until:timestamp(r.suppressed_until,brand.timezone,{dateOnly:true}),source_version:spec.version};
   }else if(spec.kind==='campaigns'){
    if(!['email','sms'].includes(r.channel))fail('INVALID_CHANNEL');
    row={external_id:key,name:required(r.campaign_name,'MISSING_NAME'),channel:r.channel,target_country:country(r.target_country),spend:decimal(r.spend),sent_at:timestamp(r.sent_at_utc,brand.timezone,{required:true}),parent_external_id:clean(r.parent_campaign_id)};
    for(const k of ['reported_sent','reported_delivered','reported_bounced','reported_opens','reported_clicks'])row[k]=integer(r[k]);
   }else if(spec.kind==='events'){
    if(!['email','sms'].includes(r.channel))fail('INVALID_CHANNEL');
    if(!['bounce','open','click','unsubscribe','complaint','delivered'].includes(r.event_type))fail('INVALID_EVENT');
    const contact=lookup.contacts.get(r.external_contact_id);if(!contact)fail('MISSING_CONTACT');
    const at=timestamp(r.occurred_at_utc,brand.timezone,{required:true});
    // Consent safety does not depend on successful campaign attribution.
    if(['bounce','unsubscribe','complaint'].includes(r.event_type))result.suppressions.push({contact_id:contact.id,channel:r.channel,reason:r.event_type,occurred_at:at});
    const campaign=lookup.campaigns.get(r.campaign_external_id);if(!campaign)fail('MISSING_CAMPAIGN');
    row={source:'seed',external_event_id:key,contact_id:contact.id,campaign_id:campaign.id,event_type:r.event_type,channel:r.channel,occurred_at:at};
   }else{
    const campaign=lookup.campaigns.get(r.campaign_external_id);if(!campaign)fail('MISSING_CAMPAIGN');
    if(!['sent','failed','queued'].includes(r.status))fail('INVALID_BATCH_STATUS');
    row={batch_key:key,campaign_id:campaign.id,queued_at:timestamp(r.queued_at_utc,brand.timezone,{required:true}),recipient_count:integer(r.recipient_count),status:r.status};
   }
   for(const code of w)issue(item,code,'warning');
   result.rows.push({value:row,item});
  }catch(e){if(!messages[e.code])throw e;issue(item,e.code);result.rejected++;}
 }
 if(spec.kind==='campaigns'){
  const map=new Map(result.rows.map(r=>[r.value.external_id,r]));
  for(const x of result.rows){
   const p=x.value.parent_external_id;if(!p)continue;
   const seen=new Set([x.value.external_id]);let next=p,bad=false;
   while(next){if(seen.has(next)||!map.has(next)){bad=true;break;}seen.add(next);next=map.get(next).value.parent_external_id;}
   if(bad){issue(x.item,'INVALID_PARENT','warning');x.value.parent_external_id=null;}
  }
 }
 result.warningRows=warned.size;
 if(result.rows.length+result.rejected+result.duplicates!==result.total)throw Error('ROW_RECONCILIATION_FAILED');
 return result;
}

// Table and column identifiers are internal constants, never CSV input.
async function insert(db,table,rows,conflict=''){
 if(!rows.length)return;const keys=Object.keys(rows[0]);
 for(let i=0;i<rows.length;i+=800){
  const values=[];const batch=rows.slice(i,i+800);
  const tuples=batch.map(row=>'('+keys.map(k=>{values.push(k==='raw_record'?JSON.stringify(row[k]):row[k]);return '$'+values.length;}).join(',')+')');
  await db.query(`INSERT INTO ${table} (${keys.join(',')}) VALUES ${tuples.join(',')} ${conflict}`,values);
 }
}
async function suppress(db,brandId,rows){
 const unique=new Map();
 const time=r=>r.occurred_at?DateTime.fromISO(r.occurred_at).toMillis():-Infinity;
 for(const r of rows){const key=[r.contact_id,r.channel,r.reason].join('|');const old=unique.get(key);if(!old||time(r)>time(old))unique.set(key,r);}
 await insert(db,'public.contact_suppressions',[...unique.values()].map(r=>({brand_id:brandId,...r})),
 'ON CONFLICT (brand_id,contact_id,channel,reason) DO UPDATE SET occurred_at=greatest(contact_suppressions.occurred_at,EXCLUDED.occurred_at)');
}
export async function importOne(db,buffer,spec,brand,log=console.log){
 const digest=hash(buffer);
 const prior=(await db.query('SELECT * FROM public.import_runs WHERE brand_id=$1 AND file_sha256=$2',[brand.id,digest])).rows[0];
 if(prior?.status==='completed'){log(`${spec.filename}: already completed, skipped`);return {skipped:true};}
 const run=(await db.query(`INSERT INTO public.import_runs (brand_id,filename,file_sha256,status) VALUES ($1,$2,$3,'running')
 ON CONFLICT (brand_id,file_sha256) DO UPDATE SET status='running',safe_error=NULL,finished_at=NULL RETURNING id`,[brand.id,spec.filename,digest])).rows[0];
 try{
  await db.query('BEGIN');
  await db.query("SET LOCAL statement_timeout='120s'");
  const lookup={contacts:new Map(),campaigns:new Map()};
  if(['events','batches'].includes(spec.kind)){
   if(spec.kind==='events')for(const r of (await db.query('SELECT id,external_id FROM public.contacts WHERE brand_id=$1',[brand.id])).rows)lookup.contacts.set(r.external_id,r);
   for(const r of (await db.query('SELECT id,external_id FROM public.campaigns WHERE brand_id=$1',[brand.id])).rows)lookup.campaigns.set(r.external_id,r);
  }
  const p=prepare(buffer,spec,brand,lookup);
  const data=p.rows.map(({value})=>{const {parent_external_id,...r}=value;return {brand_id:brand.id,...r};});
  if(spec.kind==='contacts'){
   const keys=Object.keys(data[0]??{}).filter(k=>!['brand_id','external_id'].includes(k));
   await insert(db,'public.contacts',data,`ON CONFLICT (brand_id,external_id) DO UPDATE SET ${keys.map(k=>`${k}=EXCLUDED.${k}`).join(',')},updated_at=now() WHERE contacts.source_version<EXCLUDED.source_version`);
   // Imported channel-less unsubscribe/bounce is retained even if a later delta says active.
   const suppressed=p.rows.filter(x=>['bounced','unsubscribed'].includes(x.value.status));
   if(suppressed.length){
    const ids=new Map((await db.query('SELECT id,external_id FROM public.contacts WHERE brand_id=$1',[brand.id])).rows.map(r=>[r.external_id,r.id]));
    await suppress(db,brand.id,suppressed.flatMap(x=>['email','sms'].map(channel=>({contact_id:ids.get(x.value.external_id),channel,reason:x.value.status==='bounced'?'bounce':'unsubscribe',occurred_at:null}))));
   }
  }else if(spec.kind==='campaigns'){
   await insert(db,'public.campaigns',data,'ON CONFLICT (brand_id,external_id) DO NOTHING');
   for(const x of p.rows)if(x.value.parent_external_id)await db.query(`UPDATE public.campaigns c SET parent_id=p.id FROM public.campaigns p WHERE c.brand_id=$1 AND p.brand_id=$1 AND c.external_id=$2 AND p.external_id=$3`,[brand.id,x.value.external_id,x.value.parent_external_id]);
  }else if(spec.kind==='events'){
   await insert(db,'public.engagement_events',data,'ON CONFLICT (brand_id,source,external_event_id) DO NOTHING');
   await suppress(db,brand.id,p.suppressions);
  }else await insert(db,'public.legacy_send_batches',data,'ON CONFLICT (brand_id,batch_key) DO NOTHING');
  await insert(db,'public.import_issues',p.issues.map(r=>({brand_id:brand.id,import_id:run.id,...r})));
  await insert(db,'vg_private.import_quarantine',p.quarantine.map(r=>({brand_id:brand.id,import_id:run.id,...r})));
  await db.query(`UPDATE public.import_runs SET status='completed',total_rows=$2,accepted_rows=$3,rejected_rows=$4,duplicate_rows=$5,warning_rows=$6,encoding=$7,delimiter=$8,finished_at=now() WHERE id=$1`,[run.id,p.total,p.rows.length,p.rejected,p.duplicates,p.warningRows,p.encoding,p.delimiter]);
  await db.query('COMMIT');
  const summary={file:spec.filename,total:p.total,accepted:p.rows.length,rejected:p.rejected,duplicates:p.duplicates,warnings:p.warningRows};
  log(JSON.stringify(summary));return summary;
 }catch(e){
  await db.query('ROLLBACK').catch(()=>{});
  await db.query("UPDATE public.import_runs SET status='failed',safe_error='Import failed. No changes from this file were committed; rerun the importer.',finished_at=now() WHERE id=$1",[run.id]).catch(()=>{});
  throw e;
 }
}
