import express from 'express';
import { readFileSync,writeFileSync,existsSync,unlinkSync,mkdirSync,createReadStream } from 'node:fs';
import { join } from 'node:path';
import { randomBytes,timingSafeEqual } from 'node:crypto';
import { ProjectBrowser,readBrowserConfig,browserRoot } from './manager.ts';
import { protectDirectory } from '../security.ts';
protectDirectory(browserRoot);mkdirSync(join(browserRoot,'runtime'),{recursive:true});
const lock=join(browserRoot,'runtime','broker.lock');
if(existsSync(lock)){
  let owner:number;try{owner=JSON.parse(readFileSync(lock,'utf8')).pid;}catch{throw new Error('Invalid browser ownership lock. Inspect it manually; no browser profile lock was deleted.');}
  let alive=true;try{process.kill(owner,0);}catch(e){if((e as NodeJS.ErrnoException).code==='ESRCH')alive=false;}
  if(alive)throw new Error('A browser broker already owns this project profile.');
  unlinkSync(lock); // Only our stale broker lock; Chromium locks are never removed.
}
writeFileSync(lock,JSON.stringify({pid:process.pid,createdAt:new Date().toISOString()}),{flag:'wx',mode:0o600});
const keyFile=join(browserRoot,'.control-key');
if(!existsSync(keyFile))writeFileSync(keyFile,randomBytes(32).toString('hex'),{flag:'wx',mode:0o600});
const key=readFileSync(keyFile,'utf8').trim();const cfg=readBrowserConfig();const manager=new ProjectBrowser(browserRoot,cfg);
const app=express();app.disable('x-powered-by');
app.use((req,res,next)=>{if(!['127.0.0.1','localhost'].includes(req.hostname)||req.get('origin'))return res.sendStatus(403);const candidate=Buffer.from(req.get('authorization')?.replace(/^Bearer /,'')||'');const expected=Buffer.from(key);if(candidate.length!==expected.length||!timingSafeEqual(candidate,expected))return res.sendStatus(401);next();});
app.use(express.json({limit:'8kb'}));
app.get('/status',async(_req,res)=>res.json(await manager.tabs()));
app.post('/launch',async(_req,res)=>{await manager.launch();res.json(await manager.tabs());});
app.post('/open',async(req,res)=>res.json(await manager.open(String(req.body.url))));
app.post('/close',async(_req,res)=>{await manager.close();res.json({ok:true});});
app.post('/takeover',(_req,res)=>{manager.takeover=true;manager.log('manual.takeover');res.json({takeover:true});});
app.post('/tabs/:id/focus',async(req,res)=>{await manager.focus(req.params.id);res.json({ok:true});});
app.post('/tabs/:id/close',async(req,res)=>{await manager.closeTab(req.params.id);res.json({ok:true});});
app.post('/tabs/:id/screenshot',async(req,res)=>res.json(await manager.capture(req.params.id)));
app.get('/screenshots/:file',(req,res)=>{const path=manager.screenshotPath(req.params.file);if(!path)return res.sendStatus(404);res.type('png');createReadStream(path).pipe(res);});
app.post('/signals/:id',async(req,res)=>res.json(await manager.signals(req.params.id)));
app.use((error:unknown,_req:express.Request,res:express.Response,_next:express.NextFunction)=>{res.status(400).json({error:error instanceof Error?error.message:'Browser action failed'});});
const server=app.listen(cfg.brokerPort,'127.0.0.1',()=>console.log(`FreelanceGrowth browser broker ready on loopback:${cfg.brokerPort}`));
async function shutdown(){await manager.close();server.close();try{const record=JSON.parse(readFileSync(lock,'utf8'));if(record.pid===process.pid)unlinkSync(lock);}catch{}process.exit(0);}
process.on('SIGINT',()=>void shutdown());process.on('SIGTERM',()=>void shutdown());
