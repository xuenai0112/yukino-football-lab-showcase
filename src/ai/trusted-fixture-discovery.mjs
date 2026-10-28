import { reviewedTeamProfile, reviewedFormNames } from './provider-identity.mjs';
import { englishTeam } from './evidence-packet.mjs';
import { hash } from '../domain.mjs';

const slug=s=>String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const matchURL=raw=>{try{const u=new URL(raw);if(u.protocol!=='https:'||u.username||u.password||u.port||!['fotmob.com','www.fotmob.com'].includes(u.hostname)||!/^\/(?:[a-z]{2}(?:-[a-z]{2}|-\d{3})?\/)?matches\/[^/]+\/[^/]+\/?$/i.test(u.pathname))return null;u.hash='';u.search='';return u.href;}catch{return null;}};

// Approved numeric team IDs discover URLs; only the shared downstream validator
// may turn a newly fetched single-match page into identity evidence.
export async function discoverTrustedFixture({fixture,sourceReader,knownUrls=[],clock=Date.now,timeoutMs=45000}={}){
 const started=clock(),deadline=started+Math.min(Math.max(timeoutMs,1),45000),cutoff=Date.parse(fixture?.kickoff);
 const audit={version:1,model_calls:0,max_hubs:2,max_matches:3,reads:[],status:'not_found'},pages=[],hubPages=[];
 if(!Number.isFinite(cutoff)||cutoff<=clock()){audit.status='kickoff_passed';return{pages,audit,hubPages};}
 const profiles=[fixture.home,fixture.away].map(reviewedTeamProfile).filter(Boolean),seen=new Set(knownUrls.map(u=>matchURL(u)||u));
 const names=n=>[...new Set([englishTeam(n),...reviewedFormNames(n)].map(slug).filter(Boolean))];
 const home=names(fixture.home),away=names(fixture.away);
 const read=async(url,kind)=>{
  const remaining=Math.min(deadline-clock(),cutoff-clock());if(remaining<=0)throw Error('DISCOVERY_DEADLINE');
  const controller=new AbortController();let timer;
  try{
   const p=await Promise.race([Promise.resolve().then(()=>sourceReader(url,{signal:controller.signal})),new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('DISCOVERY_DEADLINE'));},remaining);})]);
   const valid=p?.ok&&p.url===url&&typeof p.text==='string'&&p.content_sha256===hash(p.text)&&Number.isFinite(Date.parse(p.observed_at))&&Date.parse(p.observed_at)<cutoff&&Date.parse(p.observed_at)<=clock()+1000&&clock()<cutoff&&clock()<=deadline;
   audit.reads.push({url,kind,state:valid?'observed':'rejected',content_sha256:valid?p.content_sha256:null});return valid?p:null;
  }catch(e){audit.reads.push({url,kind,state:'failed',reason:String(e.message).slice(0,180)});return null;}finally{clearTimeout(timer);controller.abort();}
 };
 const links=[];
 for(const profile of profiles.slice(0,2)){
  if(clock()>=Math.min(deadline,cutoff))break;
  const p=await read(profile.url,'team_schedule');if(!p)continue;hubPages.push(p);
  // A redirected foreign publisher cannot supply discovery links.
  if(p.final_url){try{if(!['fotmob.com','www.fotmob.com'].includes(new URL(p.final_url).hostname))continue;}catch{continue;}}
  for(const raw of p.match_links||[]){const url=matchURL(raw);if(!url||seen.has(url))continue;const parts=new URL(url).pathname.split('/'),pair=parts[parts.indexOf('matches')+1];
   if(home.some(h=>away.some(a=>pair===h+'-vs-'+a||pair===a+'-vs-'+h))){seen.add(url);links.push(url);}
  }
  if(links.length)break;
 }
 for(const url of links.slice(0,3)){if(clock()>=Math.min(deadline,cutoff))break;const p=await read(url,'match');if(p)pages.push(p);}
 audit.status=clock()>=cutoff?'kickoff_passed':clock()>=deadline?'time_limit':pages.length?'candidates_observed':profiles.length?'not_found':'mapping_review_required';
 return{pages,audit,hubPages};
}

