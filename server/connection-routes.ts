import { Router,type RequestHandler } from 'express';
import { z } from 'zod';
import { join } from 'node:path';
import { createReadStream,existsSync } from 'node:fs';
import { Vault,type OwnerAuth } from './security.ts';
import type { Store } from './store.ts';
import { HttpError } from './store.ts';
import { Connections } from './connections.ts';
import { getConnector,type Notification } from '../shared/connectors.ts';
import { config } from './config.ts';
import { browserRoot } from './browser/manager.ts';
export function connectionRoutes(store:Store,auth:OwnerAuth) {
  const router=Router();let service:Connections|undefined;
  const connections=()=>service??=(new Connections(store,new Vault(store,join(config.dataDir,'security'))));
  router.get('/connections',async(_req,res)=>{const s=connections();res.json({connectors:s.views(),browser:await s.browser.status(),notifications:store.all<Notification>('notifications').slice(0,100),origin:'http://localhost:3000'});});
  router.post('/connections/:id/connect',async(req,res)=>{const owner=auth.require(req);res.json(await connections().connect(req.params.id,owner.id,`http://${req.get('host')}`));});
  router.post('/connections/:id/open',async(req,res)=>{const c=getConnector(req.params.id);if(!c)throw new HttpError(404,'Connector not found.');res.json(await connections().browser.open(c.url));});
  router.post('/connections/:id/test',async(req,res)=>res.json(await connections().check(req.params.id)));
  router.post('/connections/:id/disconnect',async(req,res)=>{z.object({confirm:z.literal(true)}).parse(req.body);res.json(await connections().disconnect(req.params.id));});
  router.post('/connections/buffer/key',async(req,res)=>{const {key}=z.object({key:z.string().trim().min(10).max(4096)}).parse(req.body);res.json(await connections().setBufferKey(key));});
  router.post('/browser/open',async(_req,res)=>res.json(await connections().browser.launch()));
  router.post('/browser/close',async(req,res)=>{z.object({confirm:z.literal(true)}).parse(req.body);res.json(await connections().browser.request('/close',{}));});
  router.post('/browser/takeover',async(_req,res)=>res.json(await connections().browser.request('/takeover',{})));
  router.post('/browser/tabs/:id/focus',async(req,res)=>{const id=z.string().uuid().parse(req.params.id);res.json(await connections().browser.request(`/tabs/${id}/focus`,{}));});
  router.post('/browser/tabs/:id/close',async(req,res)=>{z.object({confirm:z.literal(true)}).parse(req.body);const id=z.string().uuid().parse(req.params.id);res.json(await connections().browser.request(`/tabs/${id}/close`,{}));});
  router.post('/browser/tabs/:id/screenshot',async(req,res)=>{z.object({confirm:z.literal(true)}).parse(req.body);const id=z.string().uuid().parse(req.params.id);res.json(await connections().browser.request(`/tabs/${id}/screenshot`,{}));});
  router.get('/browser/screenshots/:file',(req,res)=>{const file=z.string().regex(/^[a-f\d-]{36}\.png$/).parse(req.params.file);const path=join(browserRoot,'screenshots',file);if(!existsSync(path))throw new HttpError(404,'Screenshot not found.');res.type('png');createReadStream(path).pipe(res);});
  router.post('/notifications/:id/read',(req,res)=>{const n=store.require<Notification>('notifications',req.params.id);store.put('notifications',{...n,read:true});res.json({ok:true});});
  const callback:RequestHandler=async(req,res)=>{
    res.set({'Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'",'Referrer-Policy':'no-referrer'});
    try{const id=String(req.params.id);const binding=req.get('cookie')?.split(';').map(v=>v.trim()).find(v=>v.startsWith(`fg_oauth_${id}=`))?.split('=')[1]||'';const input=z.object({state:z.string().min(20).max(200),code:z.string().min(1).max(4096)}).parse(req.query);await connections().callback(id,binding,input.state,input.code);res.clearCookie(`fg_oauth_${id}`,{path:`/auth/${id}/callback`});res.redirect('/connections');}
    catch{res.status(400).type('html').send('<!doctype html><title>Connection needs attention</title><h1>Connection needs attention</h1><p>The authorization was cancelled, expired, or could not be verified. Return to your dashboard, sign in on the same hostname, and reconnect. Authentication challenges must be completed manually.</p><a href="/connections">Return to Connections</a>');}
  };
  const start:RequestHandler=(req,res)=>{try{const id=z.enum(['github','youtube']).parse(req.params.id);const ticket=z.string().min(20).max(200).parse(req.query.ticket);const result=connections().startOAuth(id,ticket);res.cookie(`fg_oauth_${id}`,result.binding,{httpOnly:true,sameSite:'lax',path:`/auth/${id}/callback`,maxAge:10*60000});res.set('Referrer-Policy','no-referrer');res.redirect(result.url);}catch{res.status(400).send('Connection link expired. Start again from your authenticated dashboard.');}};
  return {router,callback,start,service:connections};
}
