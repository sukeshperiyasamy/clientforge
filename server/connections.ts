import { randomBytes,createHash } from 'node:crypto';
import { z } from 'zod';
import { connectors,getConnector,type ConnectionRecord,type ConnectionView,type Notification,type ConnectionStatus } from '../shared/connectors.ts';
import type { Store } from './store.ts';
import { HttpError } from './store.ts';
import { Vault } from './security.ts';
import { BrowserClient } from './browser/client.ts';
import { PostizProvider } from './postiz.ts';
import { now } from './domain.ts';
import type { Job } from '../shared/model.ts';
export type Tokens={accessToken:string;refreshToken?:string;expiresAt?:number;scope?:string};
type Flow={id:string;connectorId:string;sessionId:string;expiresAt:number;redirectUri:string;bindingHash:string};
const hash=(v:string)=>createHash('sha256').update(v).digest('hex');
class CheckError extends Error {constructor(public status:ConnectionStatus,message:string){super(message);}}
export function notify(store:Store,type:Notification['type'],title:string,detail:string,entityId='') {
  const previous=store.all<Notification>('notifications').find(n=>n.entityId===entityId&&n.title===title&&!n.read);
  if(previous)return;
  store.put<Notification>('notifications',{id:randomBytes(16).toString('hex'),type,title,detail,entityId,createdAt:now(),read:false});
}
export class Connections {
  constructor(public store:Store,public vault:Vault,public browser=new BrowserClient(),public postiz=new PostizProvider(),public request:typeof fetch=fetch){}
  record(id:string):ConnectionRecord {
    const c=getConnector(id);if(!c)throw new HttpError(404,'Connector not found.');
    return this.store.get<ConnectionRecord>('connections',id)||{id,status:c.adapter==='manual'?'Manual Only':'Not Connected',authMethod:c.auth,lastAuth:null,lastCheck:null,lastPublished:null,accountName:null,lastError:null,nextAction:c.nextAction,mode:c.adapter==='manual'?'manual':'approval',disabled:false,remoteIds:[],checkedVia:null};
  }
  views():ConnectionView[]{return connectors.map(c=>({ ...c,configured:c.requiredEnv.every(key=>Boolean(process.env[key]))&&(c.adapter!=='buffer'||Boolean(this.vault.get('tokens:buffer'))),connection:this.record(c.id)}));}
  save(record:ConnectionRecord){return this.store.put('connections',record);}
  async connect(id:string,sessionId:string,origin:string) {
    const c=getConnector(id);if(!c)throw new HttpError(404,'Connector not found.');
    const current=this.record(id);this.save({...current,disabled:false,status:'Login Required',lastError:null,nextAction:c.nextAction});
    if(c.adapter==='github'||c.adapter==='youtube') {
      if(!c.requiredEnv.every(key=>Boolean(process.env[key]))) {await this.browser.open(c.url);return {manual:true,nextAction:c.nextAction};}
      const state=randomBytes(32).toString('base64url');const verifier=randomBytes(32).toString('base64url');const binding=randomBytes(32).toString('base64url');const ticket=randomBytes(32).toString('base64url');const redirectUri=`${origin}/auth/${id}/callback`;
      const flow:Flow={id:hash(state),connectorId:id,sessionId,expiresAt:Date.now()+10*60000,redirectUri,bindingHash:hash(binding)};
      this.store.put('oauth_flows',flow);
      const url=new URL(c.adapter==='github'?'https://github.com/login/oauth/authorize':'https://accounts.google.com/o/oauth2/v2/auth');
      url.searchParams.set('client_id',process.env[c.adapter==='github'?'GITHUB_CLIENT_ID':'GOOGLE_CLIENT_ID']!);url.searchParams.set('redirect_uri',redirectUri);url.searchParams.set('state',state);url.searchParams.set('response_type','code');url.searchParams.set('code_challenge',hashBase64(verifier));url.searchParams.set('code_challenge_method','S256');
      if(c.adapter==='github')url.searchParams.set('scope','');else{url.searchParams.set('scope','https://www.googleapis.com/auth/youtube.readonly');url.searchParams.set('access_type','offline');url.searchParams.set('prompt','consent');}
      this.vault.set(`flow:${flow.id}`,{verifier,binding,url:url.toString()});
      this.store.put('oauth_starts',{id:hash(ticket),flowId:flow.id});
      await this.browser.open(`${origin}/auth/${id}/start?ticket=${encodeURIComponent(ticket)}`);this.store.audit('connection.oauth_started',id);return {manual:false,nextAction:'Finish the official consent flow in the project browser. No account is marked Connected until its identity API succeeds.'};
    }
    if(c.adapter==='postiz'&&process.env.POSTIZ_API_KEY) {
      const provider=c.providerIds[0];
      if(provider==='mastodon'||provider==='telegram'){await this.browser.open('http://localhost:4007');return {manual:true,nextAction:c.nextAction};}
      const data=z.object({url:z.url()}).parse(await this.postiz.request(`/social/${encodeURIComponent(provider)}`));
      await this.browser.open(data.url);return {manual:false,nextAction:'Authorize the account in Postiz, then click Test Connection here.'};
    }
    await this.browser.open(c.url);return {manual:true,nextAction:c.nextAction};
  }
  startOAuth(id:string,ticket:string){const start=this.store.get<{flowId:string}>('oauth_starts',hash(ticket));if(!start)throw new HttpError(400,'Connection link expired.');const flow=this.store.get<Flow>('oauth_flows',start.flowId);if(!flow||flow.connectorId!==id||flow.expiresAt<Date.now())throw new HttpError(400,'Connection link expired.');const secret=this.vault.get<{binding:string;url:string}>(`flow:${flow.id}`);if(!secret)throw new HttpError(400,'Connection state unavailable.');this.store.remove('oauth_starts',hash(ticket));return {binding:secret.binding,url:secret.url};}
  async callback(id:string,binding:string,state:string,code:string) {
    const flow=this.store.get<Flow>('oauth_flows',hash(state));
    const owner=flow?this.store.get<{expires:number}>('owner_sessions',flow.sessionId):undefined;
    if(!flow||flow.connectorId!==id||flow.bindingHash!==hash(binding)||flow.expiresAt<Date.now()||!owner||owner.expires<Date.now()||this.record(id).disabled)throw new HttpError(400,'OAuth state is invalid, expired or belongs to another browser. Reconnect from the dashboard.');
    const verifier=this.vault.get<{verifier:string}>(`flow:${flow.id}`)?.verifier;
    this.store.remove('oauth_flows',flow.id);this.vault.remove(`flow:${flow.id}`);
    if(!verifier)throw new HttpError(400,'OAuth verifier unavailable. Start a new connection.');
    const body=new URLSearchParams({grant_type:'authorization_code',code,redirect_uri:flow.redirectUri,code_verifier:verifier,client_id:process.env[id==='github'?'GITHUB_CLIENT_ID':'GOOGLE_CLIENT_ID']!,client_secret:process.env[id==='github'?'GITHUB_CLIENT_SECRET':'GOOGLE_CLIENT_SECRET']!});
    const endpoint=id==='github'?'https://github.com/login/oauth/access_token':'https://oauth2.googleapis.com/token';
    const data=await this.tokenRequest(endpoint,body);
    const previous=this.vault.get<Tokens>(`tokens:${id}`);this.vault.set(`tokens:${id}`,{...data,refreshToken:data.refreshToken||previous?.refreshToken});
    return this.check(id);
  }
  async tokenRequest(endpoint:string,body:URLSearchParams):Promise<Tokens>{
    const response=await this.request(endpoint,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',Accept:'application/json'},body,redirect:'error',signal:AbortSignal.timeout(20000)});
    const raw=await response.json() as any;
    if(!response.ok||raw.error||typeof raw.access_token!=='string')throw new CheckError('Expired','OAuth authorization or refresh failed. Reconnect using the official flow.');
    return {accessToken:raw.access_token,refreshToken:typeof raw.refresh_token==='string'?raw.refresh_token:undefined,expiresAt:typeof raw.expires_in==='number'?Date.now()+raw.expires_in*1000:undefined,scope:raw.scope};
  }
  async tokens(id:string){let tokens=this.vault.get<Tokens>(`tokens:${id}`);if(!tokens)throw new CheckError('Login Required','No authorized API token is stored. Connect your account first.');
    if(tokens.expiresAt&&tokens.expiresAt<Date.now()+60000){if(!tokens.refreshToken)throw new CheckError('Expired','The API token expired. Reconnect your account.');
      const body=new URLSearchParams({grant_type:'refresh_token',refresh_token:tokens.refreshToken,client_id:process.env[id==='github'?'GITHUB_CLIENT_ID':'GOOGLE_CLIENT_ID']||'',client_secret:process.env[id==='github'?'GITHUB_CLIENT_SECRET':'GOOGLE_CLIENT_SECRET']||''});
      const refreshed=await this.tokenRequest(id==='github'?'https://github.com/login/oauth/access_token':'https://oauth2.googleapis.com/token',body);tokens={...refreshed,refreshToken:refreshed.refreshToken||tokens.refreshToken};this.vault.set(`tokens:${id}`,tokens);
    }return tokens;
  }
  async authenticatedJson(url:string,token:string){const response=await this.request(url,{headers:{Authorization:`Bearer ${token}`,Accept:'application/json','User-Agent':'FreelanceGrowth-local'},redirect:'error',signal:AbortSignal.timeout(20000)});if(response.status===401)throw new CheckError('Expired','The API rejected the stored authorization. Reconnect your account.');if(response.status===403)throw new CheckError('Verification Required','The provider denied access. Check consent scopes, app verification and account eligibility.');if(!response.ok)throw new CheckError('Error',`Connection check returned HTTP ${response.status}. No publication was attempted.`);return response.json();}
  async check(id:string):Promise<ConnectionRecord>{
    const c=getConnector(id);if(!c)throw new HttpError(404,'Connector not found.');const current=this.record(id);
    if(current.disabled)return this.save({...current,lastCheck:now(),status:'Not Connected',nextAction:'This connection is locally disabled. Reconnect to authorize it again.'});
    try {
      let accountName:string;let remoteIds:string[]=[];let via:string;
      if(c.adapter==='github') {const t=await this.tokens(id);const user=z.object({id:z.number(),login:z.string()}).parse(await this.authenticatedJson('https://api.github.com/user',t.accessToken));accountName=user.login;via='GitHub GET /user (read-only)';}
      else if(c.adapter==='youtube'){const t=await this.tokens(id);const data=z.object({items:z.array(z.object({id:z.string(),snippet:z.object({title:z.string()})}))}).parse(await this.authenticatedJson('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true',t.accessToken));if(!data.items.length)throw new CheckError('Verification Required','Google authorization succeeded, but no YouTube channel was returned. Create/select a channel and reconnect.');accountName=data.items[0].snippet.title;remoteIds=data.items.map(c=>c.id);via='YouTube channels.list mine=true (read-only)';}
      else if(c.adapter==='buffer') {const t=await this.tokens(id);const response=await this.request('https://api.buffer.com',{method:'POST',headers:{Authorization:`Bearer ${t.accessToken}`,'Content-Type':'application/json'},body:JSON.stringify({query:'query GetOrganizations { account { organizations { id } } }'}),redirect:'error',signal:AbortSignal.timeout(20000)});if(response.status===401)throw new CheckError('Expired','Buffer rejected the API key. Reconnect with a current key.');const raw=await response.json() as any;if(!response.ok||raw.errors?.length)throw new CheckError('Verification Required','Buffer denied the account query. Check API access and the key.');const data=z.object({data:z.object({account:z.object({organizations:z.array(z.object({id:z.string()})).min(1)})})}).parse(raw);remoteIds=data.data.account.organizations.map(o=>o.id);accountName=`Buffer workspace (${remoteIds.length} organization${remoteIds.length===1?'':'s'})`;via='Buffer authenticated account/organizations GraphQL query';}
      else if(c.adapter==='postiz') {const accounts=await this.postiz.accounts();const matching=accounts.filter(a=>c.providerIds.includes(a.platform)&&!a.disabled);if(!matching.length)throw new CheckError('Login Required','No enabled matching channel was returned by the authenticated Postiz API. Connect the channel in Postiz first.');for(const account of matching)this.store.put('accounts',account);remoteIds=matching.map(a=>a.id);accountName=matching.map(a=>a.name).join(', ');via='Authenticated Postiz integrations API; enabled channel membership (website session unverified)';}
      else {
        const signal=await this.browser.request<{signal:string}>(`/signals/${id}`,{}).catch(()=>({signal:'not_open'}));
        const status:ConnectionStatus=signal.signal==='verification_required'?'Verification Required':signal.signal==='login_required'?'Login Required':'Manual Only';
        return this.save({...current,status,lastCheck:now(),lastError:null,checkedVia:'Local browser authentication-screen signals only; no credentials read',nextAction:status==='Verification Required'?'Finish CAPTCHA, email verification or 2FA yourself in the project browser.':status==='Login Required'?'Sign in manually in the project browser.':'There is no implemented permitted identity verifier for this connector. Browser login is not claimed as verified. Continue manually.'});
      }
      const updated=this.save({...current,status:'Connected',lastAuth:now(),lastCheck:now(),accountName,remoteIds,checkedVia:via,lastError:null,nextAction:c.limitations});this.store.audit('connection.verified',id,via);return updated;
    }catch(e){const status=e instanceof CheckError?e.status:c.adapter==='postiz'&&!process.env.POSTIZ_API_KEY?'API Not Available':'Error';const detail=e instanceof CheckError?e.message:'Connection check failed. Check local credentials, network access and provider setup. No account was marked Connected.';const updated=this.save({...current,status,lastCheck:now(),lastError:detail,nextAction:c.nextAction});notify(this.store,'auth',`${c.name}: ${status}`,detail,id);this.store.audit('connection.check_failed',id,status);return updated;}
  }
  async setBufferKey(key:string){this.vault.set('tokens:buffer',{accessToken:key});const current=this.record('buffer');this.save({...current,disabled:false});return this.check('buffer');}
  async disconnect(id:string){const c=getConnector(id);if(!c)throw new HttpError(404,'Connector not found.');const current=this.record(id);const tokens=this.vault.get<Tokens>(`tokens:${id}`);let revocation='Local authorization removed. Sign out of the website yourself; browser sessions were not erased.';
    if(tokens&&(id==='github'||id==='youtube')){try{const r=id==='youtube'?await this.request('https://oauth2.googleapis.com/revoke',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({token:tokens.refreshToken||tokens.accessToken}),signal:AbortSignal.timeout(15000)}):await this.request(`https://api.github.com/applications/${encodeURIComponent(process.env.GITHUB_CLIENT_ID||'')}/token`,{method:'DELETE',headers:{Authorization:`Basic ${Buffer.from(`${process.env.GITHUB_CLIENT_ID}:${process.env.GITHUB_CLIENT_SECRET}`).toString('base64')}`,'Content-Type':'application/json',Accept:'application/vnd.github+json'},body:JSON.stringify({access_token:tokens.accessToken}),signal:AbortSignal.timeout(15000)});revocation=r.ok?'Provider authorization revoked; local token removed. Browser login is separate.':'Local token removed. Remote revocation could not be confirmed; revoke access in provider settings.';}catch{revocation='Local token removed. Remote revocation could not be confirmed; revoke access in provider settings.';}}
    this.vault.remove(`tokens:${id}`);
    this.store.transaction(()=>{for(const accountId of current.remoteIds){if(c.adapter==='postiz'){const account=this.store.get<{id:string}>('accounts',accountId);if(account)this.store.put('accounts',{...account,disabled:true});for(const job of this.store.all<Job>('jobs').filter(j=>j.accountId===accountId&&j.status==='scheduled'))this.store.put('jobs',{...job,status:'cancelled',error:'Connection disconnected locally.'});}}this.save({...current,status:'Not Connected',disabled:true,accountName:null,remoteIds:[],nextAction:c.adapter==='postiz'?'Local access disabled and pending local jobs cancelled. Manage token revocation and already-submitted posts in Postiz. Browser sign-in is unchanged.':revocation});this.store.audit('connection.disconnected',id);});return {ok:true,message:revocation};
  }
}
function hashBase64(v:string){return createHash('sha256').update(v).digest('base64url');}
