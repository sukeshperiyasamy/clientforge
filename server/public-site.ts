import express from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { Store, HttpError } from "./store.ts";
import { errorHandler } from "./app.ts";
import { leadSchema, type Project } from "../shared/model.ts";
import { notify } from "./connections.ts";
import { now } from "./domain.ts";
export const publicServices = [
  { id:"web", name:"Web development", description:"Business websites, landing pages, React applications, dashboards and API integration.", category:"web" },
  { id:"mobile", name:"Mobile development", description:"React Native and Expo applications, mobile prototypes and API-connected experiences.", category:"mobile" },
  { id:"data", name:"Excel and data analysis", description:"Spreadsheet preparation, cleanup, formulas, automation, dashboards and Python analysis.", category:"data" },
  { id:"design", name:"UI and UX design", description:"Wireframes, prototypes, website interfaces, mobile designs and design systems.", category:"web" },
  { id:"ai", name:"AI video and ComfyUI", description:"AI video workflows, local ComfyUI setup, rendering pipelines and batch generation.", category:"ai" },
  { id:"automation", name:"AI agents and automation", description:"Python scripts, API integration, workflow automation and self-hosted AI solutions.", category:"ai" },
] as const;
const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));
export function createPublicSite(store: Store, origin: string) {
  const base = new URL(origin);
  const app = express(); app.disable("x-powered-by");
  // Only set this for a known reverse proxy; default does not trust forwarded client IPs.
  if(process.env.PUBLIC_TRUST_PROXY) app.set("trust proxy",process.env.PUBLIC_TRUST_PROXY);
  app.use(express.urlencoded({extended:false, limit:"32kb"})); app.use(express.json({limit:"32kb"}));
  app.use((req,res,next) => {
    res.set({"Content-Security-Policy":"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'", "X-Content-Type-Options":"nosniff", "Referrer-Policy":"strict-origin-when-cross-origin"});
    if (req.method === "POST" && req.get("origin") && req.get("origin") !== base.origin) return void res.status(403).send("Cross-origin submission rejected.");
    const tracking:Record<string,string>={};
    for(const key of ["utm_source","utm_medium","utm_campaign","utm_content"]) if(typeof req.query[key]==="string") tracking[key]=String(req.query[key]).slice(0,100);
    if(Object.keys(tracking).length) res.cookie("cf_attribution",Buffer.from(JSON.stringify(tracking)).toString("base64url"),{httpOnly:true,sameSite:"lax",secure:base.protocol==="https:",maxAge:3600000});
    else {
      try {
        const cookie=req.get("cookie")?.split(";").map(v=>v.trim()).find(v=>v.startsWith("cf_attribution="))?.split("=")[1];
        if(cookie && cookie.length<2000) {
          const saved=JSON.parse(Buffer.from(cookie,"base64url").toString("utf8"));
          const combined={...req.query};
          for(const key of ["utm_source","utm_medium","utm_campaign","utm_content"]) if(typeof saved[key]==="string") combined[key]=saved[key].slice(0,100);
          Object.defineProperty(req,"query",{value:combined,configurable:true});
          res.locals.attribution=saved;
        }
      } catch { /* malformed attribution never prevents browsing */ }
    }
    res.locals.attribution=Object.keys(tracking).length ? tracking : res.locals.attribution || {};
    next();
  });
  const limits = new Map<string, {count:number; at:number}>();
  const render = (title: string, content: string, path: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} | ${esc(store.settings().name || "Freelance services")}</title><meta name="description" content="Discuss your development, spreadsheet, design or AI workflow project. Explore verified work and request a quote."><link rel="canonical" href="${esc(new URL(path,base).toString())}"><style>body{font:17px/1.65 system-ui,sans-serif;margin:0;color:#172338;background:#f8fafc}header,main,footer{max-width:1060px;margin:auto;padding:24px}nav{display:flex;flex-wrap:wrap;gap:20px}a{color:#244aad}h1{font-size:clamp(32px,5vw,52px);line-height:1.15}h2{margin-top:32px}section{padding:12px 0}article{border-top:1px solid #d6dfeb;padding:20px 0}label{display:block;margin:12px 0}input,select,textarea,button{font:inherit;box-sizing:border-box;max-width:100%;padding:10px;border:1px solid #9baabd;border-radius:6px}input,select,textarea{display:block;width:100%}button{background:#244aad;color:white;cursor:pointer}form{max-width:680px}footer{font-size:14px}.trap{position:absolute;left:-10000px}</style></head><body><header><nav><a href="/">Home</a><a href="/services">Services</a><a href="/portfolio">Portfolio</a><a href="/contact">Request a quote</a></nav></header><main><h1>${esc(title)}</h1>${content}</main><footer><a href="/privacy">Privacy</a> · Project scope and availability are confirmed before engagement.</footer></body></html>`;
  const projects = () => store.all<Project>("projects").filter(p => p.permission);
  const listProjects = (category?: string) => projects().filter(p => !category || p.service === category).map(p => `<article><h2>${esc(p.title)}</h2><p>${p.demo ? "Demonstration project" : "Portfolio project"}</p><p>${esc(p.problem)}</p><p>${esc(p.solution)}</p><p>${esc(p.results)}</p><a href="/case-studies/${esc(p.id)}">Read case study</a></article>`).join("") || "<p>Project examples will appear here after owner verification and showcase permission.</p>";
  app.get("/", (_req,res) => res.send(render("Practical digital solutions for your business", `<p>${esc(store.settings().bio)}</p><p>Discuss your project requirements, explore the services and review the available portfolio evidence.</p><p><a href="/contact">Request a project estimate</a></p>${publicServices.map(s => `<article><h2><a href="/services/${s.id}">${s.name}</a></h2><p>${s.description}</p></article>`).join("")}`, "/")));
  app.get("/services", (_req,res) => res.send(render("Services", publicServices.map(s => `<article><h2><a href="/services/${s.id}">${s.name}</a></h2><p>${s.description}</p><a href="/contact?service=${s.id}">Discuss your requirements</a></article>`).join(""), "/services")));
  app.get("/services/:id", (req,res) => {
    const s=publicServices.find(s => s.id === req.params.id); if(!s) return void res.status(404).send("Service not found");
    res.send(render(s.name, `<p>${s.description}</p><h2>Start with your business problem</h2><p>Share your current workflow, intended users and desired outcome. Scope and technology are agreed after reviewing your requirements.</p><h2>How we work together</h2><p>Requirements review, an agreed scope, implementation with review points, and handover documentation. Delivery times and pricing depend on the agreed scope.</p><h2>Relevant portfolio examples</h2>${listProjects(s.category)}<h2>Common questions</h2><p><strong>How much will it cost?</strong> Request a quote with your requirements and budget range.</p><p><strong>Can we work across timezones?</strong> Include your timezone so we can agree communication and review times.</p><a href="/contact?service=${s.id}">Request a ${s.name.toLowerCase()} quote</a>`, `/services/${s.id}`));
  });
  app.get("/portfolio", (_req,res) => res.send(render("Verified portfolio", listProjects(), "/portfolio")));
  app.get("/case-studies/:id", (req,res) => {
    const p=projects().find(p=>p.id===req.params.id); if(!p) return void res.status(404).send("Case study unavailable");
    res.send(render(p.title, `${p.demo ? "<p>Demonstration project</p>" : ""}<h2>Problem</h2><p>${esc(p.problem)}</p><h2>Solution</h2><p>${esc(p.solution)}</p><h2>Documented results</h2><p>${esc(p.results)}</p><a href="/contact">Discuss a related project</a>`, `/case-studies/${p.id}`));
  });
  app.get("/contact", (req,res) => res.send(render("Request a quote", `<p>Tell us about your project. This inquiry creates no contract or payment obligation.</p><form method="post" action="/inquiries"><label>Name<input name="name" required maxlength="100" autocomplete="name"></label><label>Email<input name="email" type="email" required maxlength="254" autocomplete="email"></label><label>Company<input name="company" maxlength="200"></label><label>Country<input name="country" maxlength="100"></label><label>Timezone<input name="timezone" placeholder="America/New_York" maxlength="100"></label><label>Service<select name="requestedService">${publicServices.map(s=>`<option value="${s.id}" ${req.query.service===s.id ? "selected" : ""}>${s.name}</option>`).join("")}</select></label><label>Requirements<textarea name="description" rows="6" required minlength="5" maxlength="4000"></textarea></label><label>Budget range<input name="budget" maxlength="100"></label><label>Desired deadline<input name="deadline" type="date"></label><label class="trap" aria-hidden="true">Leave empty<input name="website" tabindex="-1" autocomplete="off"></label>${["utm_source","utm_medium","utm_campaign","utm_content"].map(k=>`<input type="hidden" name="${k}" value="${esc(typeof req.query[k]==="string" ? req.query[k] : "")}">`).join("")}<button>Send project inquiry</button><p>Submitting permits use of these details to respond to your inquiry. <a href="/privacy">Privacy information</a></p></form>`, "/contact")));
  app.post("/inquiries", (req,res) => {
    const at=Date.now(); for(const [key,l] of limits) if(at-l.at>3600000) limits.delete(key);
    const ip=req.ip || req.socket.remoteAddress || "unknown";
    if(!limits.has(ip) && limits.size>=10000) throw new HttpError(429,"Please try later.");
    const limit=limits.get(ip)||{count:0,at}; limits.set(ip,limit);
    if(++limit.count>10) throw new HttpError(429,"Too many inquiries. Try later.");
    const value=z.object({ name:z.string(), email:z.string(), description:z.string(), requestedService:z.enum(["web","mobile","data","design","ai","automation"]), company:z.string().max(200).default(""), country:z.string().max(100).default(""), timezone:z.string().max(100).default(""), budget:z.string().max(100).default(""), deadline:z.string().max(100).default(""), website:z.string().max(200).default(""), utm_source:z.string().max(100).default(""), utm_medium:z.string().max(100).default(""), utm_campaign:z.string().max(100).default(""), utm_content:z.string().max(100).default("") }).parse(req.body);
    if(!value.website) {
      const service=publicServices.find(s=>s.id===value.requestedService)!.category;
      const lead={ ...leadSchema.parse({...value,service,source:value.utm_source || "public_portfolio"}), id:randomUUID(), company:value.company, timezone:value.timezone, requestedService:value.requestedService, deadline:value.deadline, attribution:{ source:value.utm_source, medium:value.utm_medium, campaign:value.utm_campaign, content:value.utm_content }, createdAt:now(),updatedAt:now() };
      store.transaction(()=>{ store.put("leads",lead); store.audit("enquiry.received",lead.id); notify(store,"system","New portfolio inquiry","Review the new lead in Client pipeline.",lead.id); });
    }
    res.status(201).send(render("Thank you", "<p>Your inquiry has been received. We will review your requirements.</p>", "/contact"));
  });
  app.get("/privacy",(_req,res)=>res.send(render("Privacy", "<p>Inquiry details are stored to assess and respond to project requests. They are not published on this website. The owner may use a selected AI drafting service to prepare a response for review. Do not submit passwords or sensitive personal data.</p><p>Campaign parameters supplied in links may be recorded with your inquiry. No advertising trackers are added by this website. Contact the owner using their published business contact details to request access or deletion. Retention and hosting details must be reviewed by the owner before public launch.</p>", "/privacy")));
  app.get("/sitemap.xml",(_req,res)=>res.type("application/xml").send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${["/","/services","/portfolio","/contact","/privacy",...publicServices.map(s=>`/services/${s.id}`),...projects().map(p=>`/case-studies/${p.id}`)].map(path=>`<url><loc>${esc(new URL(path,base).toString())}</loc></url>`).join("")}</urlset>`));
  app.get("/robots.txt",(_req,res)=>res.type("text/plain").send(`User-agent: *\nAllow: /\nSitemap: ${new URL("/sitemap.xml",base)}`));
  app.use((_req,res)=>res.status(404).send("Page not found")); app.use(errorHandler); return app;
}
