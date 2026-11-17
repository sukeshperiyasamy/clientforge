import { XMLParser } from "fast-xml-parser";
import { HttpError } from "./store.ts";
import type { OpportunitySource } from "./acquisition.ts";
import type { acquisitionServices } from "../shared/acquisition.ts";
type Service = typeof acquisitionServices[number];
// Owner-supplied authorized exports only. No implicit URL fetch, scraping or mailbox access.
export class RssImportSource implements OpportunitySource {
  method = "rss" as const;
  constructor(public id: string, private xml: string, private service: Service) {}
  async collect() {
    if (this.xml.length > 150000 || /<!DOCTYPE|<!ENTITY/i.test(this.xml)) throw new HttpError(400,"RSS must be under 150 KB and contain no DTD or entity declarations.");
    const parser = new XMLParser({ ignoreAttributes:false, processEntities:false, parseTagValue:false });
    const parsed=parser.parse(this.xml);
    const raw=parsed?.rss?.channel?.item ?? parsed?.feed?.entry ?? [];
    const entries=Array.isArray(raw) ? raw : [raw];
    if(entries.length>100) throw new HttpError(400,"Import at most 100 feed entries.");
    const text=(v:unknown):string=>typeof v === "string" ? v.replace(/<[^>]*>/g," ").replace(/\s+/g," ").trim() : "";
    return entries.map((entry:any)=>({title:text(entry.title),description:text(entry.description || entry.summary || entry.content),source:this.id,url:typeof entry.link==="string" ? entry.link : Array.isArray(entry.link) ? entry.link.find((l:any)=>l["@_rel"]==="alternate")?.["@_href"] : entry.link?.["@_href"],service:this.service,country:"",budget:"",deadline:"",skills:[]}));
  }
}
