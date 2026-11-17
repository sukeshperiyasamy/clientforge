import { join } from "node:path";
import { Store } from "./store.ts";
import { config } from "./config.ts";
import { createPublicSite } from "./public-site.ts";
const port=Number(process.env.PUBLIC_PORT || 3001);
const store=new Store(join(config.dataDir,"clientforge.sqlite"));
const server=createPublicSite(store,process.env.PUBLIC_ORIGIN || `http://localhost:${port}`).listen(port,process.env.PUBLIC_BIND || "127.0.0.1",()=>console.log(`ClientForge public portfolio on port ${port}; private administration routes are absent.`));
function shutdown(){ server.close(()=>{store.close();process.exit(0);}); }
process.on("SIGINT",shutdown);process.on("SIGTERM",shutdown);
