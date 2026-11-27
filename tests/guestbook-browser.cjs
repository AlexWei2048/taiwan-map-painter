// Run: npm install --no-save playwright && npx playwright install chromium
// Then: node tests/guestbook-browser.cjs
// Uses actual HTML/CSS/JS with a mocked API; never accesses production data.
const { chromium } = require('playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.join(__dirname,'..');
const read = p => fs.readFileSync(path.join(root,p),'utf8');
const source = read('index.html');
const dialog = id => source.match(new RegExp('<dialog id="'+id+'"[\\s\\S]*?<\\/dialog>'))?.[0];
const pageHTML = '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+read('style.css')+'\n'+read('guestbook.css')+'</style></head><body><button id="guestbookOpen" hidden>留言板</button>'+dialog('guestbookDialog')+dialog('guestbookAdminDialog')+'<script>window.GUESTBOOK_CONFIG={enabled:true,url:"https://guestbook-test.invalid"};</script><script src="/guestbook.js"></script></body></html>';
const session='gb1.'+'a'.repeat(64);
const records=[{id:'00000000-0000-4000-8000-000000000001',nickname:'测试访客',category:'feature',title:'希望新增地图功能',body:'测试用留言，请忽略。',created_at:'2026-11-28T00:00:00Z',visibility:'pending',progress:'new',private:0,pinned:0,revision:0,reply:'',admin_note:'',priority:'normal',votes:0}];
const features=['edit','detail','progress-filter','admin-search','attachment','admin-counts','own-updates','admin-session','admin-devices','admin-filter-v2','public-page','report','admin-tools-v8'];
(async()=>{
 const browser=await chromium.launch({headless:true});
 try {
 for(const width of [390,1280]){
 const context=await browser.newContext({viewport:{width,height:850}});
 const page=await context.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 let loginCalls=0;
 await page.route('https://guestbook-fixture.invalid/**',async route=>{
  const u=new URL(route.request().url());
  await route.fulfill({status:200,contentType:u.pathname==='/guestbook.js'?'text/javascript':'text/html',body:u.pathname==='/guestbook.js'?read('guestbook.js'):pageHTML});
 });
 await page.route('https://guestbook-test.invalid/**',async route=>{
  const req=route.request(),action=new URL(req.url()).pathname.split('/').at(-1);
  if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:{'access-control-allow-origin':'https://guestbook-fixture.invalid','access-control-allow-headers':'content-type','access-control-allow-methods':'GET,POST,OPTIONS'}});
  const p=req.postData()?req.postDataJSON():{};
  let body,status=200;
  if(action==='health')body={ok:true,version:2,features};
  else if(action==='guestbook_public_page')body={records:[{...records[0],visibility:undefined,private:undefined,admin_note:undefined,priority:undefined}],total:1};
  else if(action==='guestbook_admin_login'){loginCalls++;body={session,expires_at:Math.floor(Date.now()/1000)+3600};}
  else if(action==='guestbook_admin_list'&&p.p_admin===session)body={counts:{pending:1,todo:1},records,total:1};
  else if(action==='guestbook_admin_counts')body={pending:1,todo:1};
  else if(action==='guestbook_my_updates'||action==='guestbook_votes'||action==='guestbook_mine')body=[];
  else{status=403;body={message:'test denied'}}
  await route.fulfill({status,contentType:'application/json',headers:{'access-control-allow-origin':'https://guestbook-fixture.invalid'},body:JSON.stringify(body)});
 });
 await page.goto('https://guestbook-fixture.invalid/');
 await page.locator('#guestbookOpen').click();
 await page.locator('#guestbookResults').filter({hasText:'共 1 条公开留言'}).waitFor({timeout:5000});
 await page.locator('#guestbookAdminOpen').click();
 await page.locator('#guestbookAdminToken').fill('fixture-admin-key');
 await page.locator('#guestbookAdminAuth button[type=submit]').click();
 await page.locator('#guestbookAdminIndex .guestbook-index-item').waitFor({timeout:5000});
 if(width<700)await page.locator('#guestbookAdminIndex .guestbook-index-item').click();
 const layout=await page.evaluate(()=>{const dlg=document.getElementById('guestbookAdminDialog'),content=document.getElementById('guestbookAdminContent'),counts=document.getElementById('guestbookAdminCounts'),card=document.querySelector('#guestbookAdminList article:not([hidden])');return {dialog:dlg.clientWidth,content:content.clientWidth,counts:counts.clientWidth,card:card?.clientWidth||0,overflow:dlg.scrollWidth-dlg.clientWidth}});
 assert(layout.content>layout.dialog*.75,JSON.stringify(layout));
 assert(layout.counts>layout.dialog*.70,JSON.stringify(layout));
 assert(layout.card>Math.min(250,layout.dialog*.55),JSON.stringify(layout));
 assert(layout.overflow<=3,JSON.stringify(layout));
 await page.locator('#guestbookAdminDialog .guestbook-header button').click();
 await page.reload();
 await page.locator('#guestbookOpen').click();
 await page.locator('#guestbookAdminOpen').click();
 await page.locator('#guestbookAdminIndex .guestbook-index-item').waitFor({timeout:5000});
 assert.equal(loginCalls,1,'Remembered session should not request master credential again');
 assert.deepEqual(errors,[]);
 await context.close();
 console.log('guestbook browser regression passed at '+width+'px');
 }
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
