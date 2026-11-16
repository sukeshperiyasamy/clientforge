import { spawn } from 'node:child_process';
import { existsSync,readFileSync,openSync,closeSync,mkdirSync } from 'node:fs';
import { join,resolve } from 'node:path';
import { browserRoot,readBrowserConfig } from './manager.ts';
import { protectDirectory } from '../security.ts';
export class BrowserClient {
  private starting?:Promise<void>;
  async request<T=any>(path:string,body?:unknown):Promise<T>{const file=join(browserRoot,'.control-key');if(!existsSync(file))throw new Error('Project browser broker is not running.');const r=await fetch(`http://127.0.0.1:${readBrowserConfig().brokerPort}${path}`,{method:body===undefined?'GET':'POST',headers:{Authorization:`Bearer ${readFileSync(file,'utf8').trim()}`,...(body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(path==='/launch'?60000:40000)});if(!r.ok){const data=await r.json().catch(()=>({}));throw new Error(data.error||`Browser broker returned ${r.status}`);}return r.json() as Promise<T>;}
  async ensure(){try{await this.request('/status');return;}catch{}
    if(this.starting)return this.starting;
    this.starting=(async()=>{protectDirectory(browserRoot);mkdirSync(join(browserRoot,'logs'),{recursive:true});const log=openSync(join(browserRoot,'logs','broker.log'),'a',0o600);const child=spawn(process.execPath,['--import','tsx',resolve('server/browser/broker.ts')],{cwd:process.cwd(),env:{...process.env,POSTIZ_API_KEY:'',GITHUB_CLIENT_SECRET:'',GOOGLE_CLIENT_SECRET:''},detached:true,windowsHide:true,stdio:['ignore',log,log]});child.unref();closeSync(log);let spawnError=false;child.on('error',()=>{spawnError=true;});for(let n=0;n<35;n++){await new Promise(r=>setTimeout(r,300));if(spawnError)throw new Error('Could not start the project browser broker.');try{await this.request('/status');return;}catch{}}throw new Error('Browser broker did not start. Inspect the protected local broker log.');})();
    try{await this.starting;}finally{this.starting=undefined;}
  }
  async launch(){await this.ensure();return this.request('/launch',{});}
  async open(url:string){await this.ensure();return this.request('/open',{url});}
  async status(){try{return await this.request('/status');}catch{return {running:false,profileName:'FreelanceGrowth',homepage:readBrowserConfig().homepage,profilePath:join(browserRoot,'profile'),tabs:[],takeover:true};}}
}
