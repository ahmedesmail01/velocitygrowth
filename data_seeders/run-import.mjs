import fs from 'node:fs/promises';
import {Client} from 'pg';
import AdmZip from 'adm-zip';
import {seedURL,seedSHA,hash,manifest,importOne} from './import-core.mjs';

async function main(){
 if(!process.env.DATABASE_URL)throw Object.assign(new Error(),{code:'MISSING_DATABASE_URL'});
 const url=new URL(process.env.DATABASE_URL);
 const ref='assoltaoxnkcfaujibma';
 if(!(url.hostname===`db.${ref}.supabase.co`||
   (url.hostname.endsWith('.pooler.supabase.com')&&decodeURIComponent(url.username)===`postgres.${ref}`)))throw Object.assign(new Error(),{code:'WRONG_PROJECT'});
 if(url.port==='6543')throw Object.assign(new Error(),{code:'USE_SESSION_POOLER_PORT_5432'});
 // Explicit SSL config must not be overridden by connection-string sslmode.
 for(const k of ['sslmode','sslcert','sslkey','sslrootcert'])url.searchParams.delete(k);
 const ca=process.env.PGSSLROOTCERT?await fs.readFile(process.env.PGSSLROOTCERT,'utf8'):undefined;
 const client=new Client({connectionString:url.toString(),ssl:{rejectUnauthorized:true,...(ca?{ca}:{})},connectionTimeoutMillis:20000});
 console.log('Downloading and verifying the supplied seed archive...');
 let bytes;
 if(process.env.SEED_ZIP)bytes=await fs.readFile(process.env.SEED_ZIP);
 else{
  const res=await fetch(seedURL,{signal:AbortSignal.timeout(120000)});
  if(!res.ok)throw Object.assign(new Error(),{code:'SEED_DOWNLOAD_FAILED'});
  bytes=Buffer.from(await res.arrayBuffer());
 }
 if(hash(bytes)!==seedSHA)throw Object.assign(new Error(),{code:'SEED_CHECKSUM_MISMATCH'});
 const zip=new AdmZip(bytes);
 for(const spec of manifest)if(!zip.getEntry(spec.filename))throw Object.assign(new Error(),{code:'MISSING_SEED_FILE'});
 await client.connect();let locked=false;
 try{
  const lock=(await client.query('SELECT pg_try_advisory_lock(88421102) AS ok')).rows[0].ok;
  if(!lock)throw Object.assign(new Error(),{code:'ANOTHER_IMPORT_IS_RUNNING'});locked=true;
  const ready=(await client.query("SELECT to_regclass('public.contacts') AS contacts,to_regclass('vg_private.approved_accounts') AS accounts")).rows[0];
  if(!ready.contacts||!ready.accounts)throw Object.assign(new Error(),{code:'RUN_STEP_01_FIRST'});
  console.log('Applying the step-02 support migration...');
  await client.query(await fs.readFile(new URL('./02_import_support.sql',import.meta.url),'utf8'));
  const brands=new Map((await client.query('SELECT id,code,timezone FROM public.brands')).rows.map(b=>[b.code,b]));
  for(const spec of manifest){
   if(!brands.has(spec.brand))throw Object.assign(new Error(),{code:'MISSING_BRAND'});
   console.log(`Processing ${spec.filename}...`);
   await importOne(client,zip.readFile(spec.filename),spec,brands.get(spec.brand));
  }
  console.log('IMPORT COMPLETE. All 11 files are recorded. Run verify.sql in Supabase to inspect totals and issues.');
 }finally{
  if(locked)await client.query('SELECT pg_advisory_unlock(88421102)').catch(()=>{});
  await client.end();
 }
}
main().catch(e=>{
 // Do not log database error objects: they may contain connection details or data.
 const code=String(e.code??'UNEXPECTED_ERROR').replace(/[^A-Z0-9_]/gi,'').slice(0,80);
 console.error(`Import stopped (${code}). See README troubleshooting. Rerunning resumes completed files safely.`);
 process.exitCode=1;
});
