import { test } from "node:test";
import assert from "node:assert/strict";
import { PostizProvider } from "../server/postiz.ts";
import { Store } from "../server/store.ts";
import { syncProviderAccounts, updateAccountPolicy, policyFor } from "../server/account-policies.ts";
test("workspace account identities cannot collide and reconciliation checks the exact workspace account",async()=>{
  class Fake extends PostizProvider {
    data:any=[{id:"same",name:"Fixture",identifier:"linkedin"}];
    override async request(){return this.data;}
  }
  const a=new Fake({id:"workspace-a",url:"https://example.com",key:"fixture-a"}); const b=new Fake({id:"workspace-b",url:"https://example.com",key:"fixture-b"});
  const first=(await a.accounts())[0],second=(await b.accounts())[0];assert.notEqual(first.id,second.id);assert.equal(a.remoteId(first.id),"same");assert.throws(()=>a.remoteId(second.id));
  const store=new Store(":memory:");
  try {
    syncProviderAccounts(store,[first],"workspace-a");syncProviderAccounts(store,[second],"workspace-b");
    updateAccountPolicy(store,first.id,{disabled:true});syncProviderAccounts(store,[],"workspace-b");
    assert.equal(store.require<any>("accounts",first.id).disabled,false);assert.equal(policyFor(store,first.id).disabled,true);
    assert.equal(store.require<any>("accounts",second.id).disabled,true);
    assert.throws(()=>syncProviderAccounts(store,[{...first,workspaceId:"workspace-b"}],"workspace-b"),/collides/);
    a.data={posts:[{id:"post",content:"Fixture",state:"PUBLISHED",releaseURL:"https://example.com/post",integration:{id:"same"}}]};
    const job:any={accountId:first.id,workspaceId:"workspace-a",remoteId:"post",scheduledAt:new Date().toISOString(),createdAt:new Date().toISOString(),snapshot:{content:"Fixture"}};
    assert.equal((await a.reconcile(job)).status,"published");
    await assert.rejects(b.reconcile(job));
    a.data.posts[0].integration.id="another-account";await assert.rejects(a.reconcile(job));
  }finally{store.close();}
});
