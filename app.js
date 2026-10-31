'use strict';
const $=s=>document.getElementById(s),NS='http://www.w3.org/2000/svg',KEY='island-palette-v1';
const simplify=OpenCC.Converter({from:'t',to:'cn'});
const mainlandTerms=value=>String(value??'').replaceAll('平地原住民族','平地少数民族').replaceAll('山地原住民族','山地少数民族').replaceAll('原住民族','少数民族').replaceAll('平地原住民','平地少数民族').replaceAll('山地原住民','山地少数民族').replaceAll('原住民','少数民族').replaceAll('立委','立法机构民代').replaceAll('115年','2026年');
const partyMatch=name=>PARTY_PRESETS.find(p=>[p.name,...p.aliases].includes(simplify(name)));
const DEFAULT_PARTY_IDS=['blue','green','aqua','npp','tsp','pfp','np','topep','gpt','tsu','lpt','sdp','jrp','red','gray'];
const presetPalette=()=>DEFAULT_PARTY_IDS.map(id=>{const {name,color}=PARTY_PRESETS.find(p=>p.id===id);return{id,name,color}});
function upgradeDefaultPalette(palette){const used=new Set(),ordered=[];for(const id of DEFAULT_PARTY_IDS){const p=palette.find(x=>x.id===id||partyMatch(x.name)?.id===id);if(p){used.add(p);ordered.push(p)}else{const preset=PARTY_PRESETS.find(x=>x.id===id);ordered.push({id,name:preset.name,color:preset.color})}}return ordered.concat(palette.filter(p=>!used.has(p)))}
function pruneUnusedAutoPredictionPalette(project){const linked=new Set();for(const level of LEVELS){for(const id of Object.values(project.fills[level]||{}))linked.add(id);for(const record of Object.values(project.elections[level]||{}))for(const row of record.rows||[])linked.add(row.partyId)}for(const fills of Object.values(project.legislativeTownFills||{}))for(const id of Object.values(fills))linked.add(id);const presetIds=new Set(PARTY_PRESETS.map(p=>p.id));project.palette=project.palette.filter(p=>linked.has(p.id)||!p.id.startsWith('prediction-')&&(!presetIds.has(p.id)||DEFAULT_PARTY_IDS.includes(p.id)));if(!project.palette.some(p=>p.id===project.selected))project.selected=project.palette[0].id;project.legend.hidden=project.legend.hidden.filter(id=>project.palette.some(p=>p.id===id));return project}
const COUNTY_ORDER=['台北市','新北市','桃园市','台中市','台南市','高雄市','基隆市','宜兰县','新竹县','新竹市','苗栗县','彰化县','南投县','云林县','嘉义县','嘉义市','屏东县','花莲县','台东县','澎湖县','金门县','连江县'];
const LEVELS=['towns','counties','council','legislative','villages'];
const levelLabel=level=>({villages:'村里',towns:'乡镇市区',counties:'县市',council:'议员选区',legislative:'立法机构民代选区'})[level];
const defaults=()=>({version:1,title:'',legendTitle:'图例',county:'',villageTown:'',districtLeaders:false,level:'counties',workspaceMode:'prediction',electorate:{council:'regional',legislative:'regional'},predictionOffice:'mayor',predictionDisplay:'composition',predictionScale:'district',councilViewScope:'all',localPredictions:{},localPredictionDisplay:'',localDisplayCandidate:'',localTown:'',predictions:{},labels:true,borderColor:'#80978d',borderWidth:0.6,countyBorderColor:'#385d4b',countyBorderWidth:1.5,townBorderColor:'#b6c4ba',townBorderWidth:0.4,showTownBoundaries:true,selected:'blue',palette:presetPalette(),settingsRevision:2,paletteRevision:3,fills:{towns:{},counties:{},council:{},legislative:{},villages:{}},legislativeTownFills:{party:{},plains:{},mountain:{}},fillMode:'prediction',gradient:{groupBy:'candidate',metric:'share',min:0,max:null,marginManual:false},legend:{show:true,onlyUsed:false,fontSize:12,caption:'',hidden:[]},exportSettings:{winnerTable:true,note:'',councilScope:'all'},elections:{towns:{},counties:{},council:{},legislative:{},villages:{}}});
let state=defaults(),data=null,undo=[],redo=[],view=null,baseView=null,erase=false,drag=null,moved=false,toastTimer,persistTimer;
const clone=x=>JSON.parse(JSON.stringify(x));
function cleanProject(s){
 if(!s||s.version!==1||!Array.isArray(s.palette)||s.palette.length<1||s.palette.length>64||!s.fills)throw Error('文件不是有效的地图方案');
 const out=defaults(),ids=new Set();out.palette=s.palette.map(p=>{if(typeof p.id!=='string'||!p.id||p.id.length>80||ids.has(p.id)||!/^#[\da-f]{6}$/i.test(p.color))throw Error('颜色信息不正确');ids.add(p.id);return{id:p.id,name:simplify(String(p.name||'未命名')).slice(0,40),color:p.color,...(Object.hasOwn(p,'logo')?{logo:cleanLogo(p.logo)}:{})}});
 for(const level of LEVELS){out.fills[level]={};for(const [k,v]of Object.entries(s.fills[level]||{})){if(/^\d{5,11}(?:-\d{2})?$/.test(k)&&ids.has(v))out.fills[level][k]=v}}
 for(const identity of ['party','plains','mountain'])for(const [k,v]of Object.entries(s.legislativeTownFills?.[identity]||{}))if(/^\d{8}$/.test(k)&&ids.has(v))out.legislativeTownFills[identity][k]=v;
 out.title=simplify(String(s.title||'')).slice(0,80);out.legendTitle=simplify(String(s.legendTitle||'图例')).slice(0,40);out.county=simplify(String(s.county||''));out.level=LEVELS.includes(s.level)?s.level:'towns';out.labels=s.labels!==false;out.selected=ids.has(s.selected)?s.selected:out.palette[0].id;if(s.settingsRevision!==2){for(const p of out.palette){const preset=partyMatch(p.name)||PARTY_PRESETS.find(x=>x.id===p.id&&['blue','green','aqua','gray','red'].includes(x.id));if(preset){p.name=preset.name;p.color=preset.color}}for(const p of presetPalette())if(!out.palette.some(x=>partyMatch(x.name)?.id===p.id))out.palette.push(p);out.labels=true;}out.settingsRevision=2;if(![2,3].includes(Number(s.paletteRevision)))out.palette=upgradeDefaultPalette(out.palette);out.paletteRevision=Number(s.paletteRevision)===3?3:2;out.borderColor=/^#[\da-f]{6}$/i.test(s.borderColor)?s.borderColor:'#80978d';out.borderWidth=Number.isFinite(s.borderWidth)?Math.max(0,Math.min(3,s.borderWidth)):0.6;out.countyBorderColor=/^#[\da-f]{6}$/i.test(s.countyBorderColor)?s.countyBorderColor:'#385d4b';out.countyBorderWidth=Number.isFinite(s.countyBorderWidth)?Math.max(0,Math.min(5,s.countyBorderWidth)):1.5;out.townBorderColor=/^#[\da-f]{6}$/i.test(s.townBorderColor)?s.townBorderColor:'#b6c4ba';out.townBorderWidth=Number.isFinite(s.townBorderWidth)?Math.max(0,Math.min(3,s.townBorderWidth)):0.4;out.showTownBoundaries=s.showTownBoundaries!==false;out.villageTown=String(s.villageTown||'').slice(0,11);out.districtLeaders=s.districtLeaders===true;const cleaned=sanitizeElectionState(out,s);if(cleaned.paletteRevision!==3){pruneUnusedAutoPredictionPalette(cleaned);cleaned.paletteRevision=3}return cleaned;
}
try{const s=localStorage.getItem(KEY);if(s)state=cleanProject(JSON.parse(s))}catch(e){console.warn('浏览器保存的方案未载入',e.message)}
function persist(){clearTimeout(persistTimer);persistTimer=setTimeout(()=>{try{localStorage.setItem(KEY,JSON.stringify(state));const when=new Date().toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'});$('saved').textContent='● 已保存 '+when;$('saved').title='只保存在本机（'+when+'），请定期下载备份';}catch(e){$('saved').textContent='自动保存失败，请下载方案';$('saved').title='浏览器存储可能不足';}},140)}
window.addEventListener('pagehide',()=>{clearTimeout(persistTimer);try{localStorage.setItem(KEY,JSON.stringify(state))}catch(e){/* browser storage unavailable */}});
function toast(s){$('toast').textContent=s;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),2600)}
function pushHistory(){undo.push(clone(state));if(undo.length>100)undo.shift();redo=[];updateHistory()}
function updateHistory(){$('undo').disabled=!undo.length;$('redo').disabled=!redo.length}
function restore(direction){const from=direction==='undo'?undo:redo,to=direction==='undo'?redo:undo;if(!from.length)return;to.push(clone(state));state=from.pop();erase=false;syncInputs();render();persist();toast(direction==='undo'?'已撤销':'已重做')}
const paletteById=id=>state.palette.find(p=>p.id===id);
function allLayerItems(level=state.level){return [...(data[level]||[]),...(['council','legislative'].includes(level)?data[level+'Indigenous']||[]:[])]}
function activeElectorate(){return state.electorate?.[state.level]||'regional'}
const ELECTORATE_ORDER=['regional','plains','mountain'],LEGISLATIVE_FREE_ORDER=['regional','party','plains','mountain'];
const electorateName=id=>({regional:'区域',party:'不分区政党',plains:'平地少数民族',mountain:'山地少数民族'})[id]||id;
const featureElectorate=f=>f.electorate||'regional';
let exportPanelFilter='';
function legislativeFourPanelsActive(){return state.level==='legislative'&&state.workspaceMode==='free'&&state.fillMode==='solid'}
function identityPanelsActive(){return ['council','legislative'].includes(state.level)&&!(typeof localPredictionActive==='function'&&localPredictionActive()&&!!state.county)}
function legislativeTownItems(identity){return(data?.towns||[]).filter(f=>!state.county||f.county===state.county).map(f=>({...f,id:identity+':'+f.id,sourceId:f.id,electorate:identity,legislativeTown:true}))}
function activeLayerItems(){if(legislativeFourPanelsActive())return[...allLayerItems().filter(f=>featureElectorate(f)==='regional'),...LEGISLATIVE_FREE_ORDER.slice(1).flatMap(legislativeTownItems)];if(identityPanelsActive())return allLayerItems().filter(f=>state.level!=='council'||councilVisibleIdentity()==='all'||featureElectorate(f)===councilVisibleIdentity());return['council','legislative'].includes(state.level)?allLayerItems().filter(f=>featureElectorate(f)===activeElectorate()):data[state.level]}
const currentItems=()=>typeof localPredictionActive==='function'&&localPredictionActive()?localPredictionItems():activeLayerItems().flatMap(f=>f.statewide&&state.county?[f.byCounty[state.county]].filter(Boolean):(!state.county||f.county===state.county)?[f]:[]).filter(f=>state.level!=='villages'||!state.villageTown||f.townId===state.villageTown);
function activeBorderKey(){return ['council','legislative'].includes(state.level)&&activeElectorate()!=='regional'?state.level+(activeElectorate()==='plains'?'Plains':'Mountain'):state.level}
function borderKeyForElectorate(id){return state.level+(id==='regional'?'':id==='plains'?'Plains':'Mountain')}
function syncElectorateControls(){$('electorateControls').hidden=true;$('electorate').value=activeElectorate();$('electorateNote').textContent=legislativeFourPanelsActive()?'区域、不分区政党、平地少数民族与山地少数民族四类在同一张图中显示。':'区域、平地少数民族与山地少数民族选区在同一张图中并列显示。'}

function featureFillId(f){return f.legislativeTown?state.legislativeTownFills[featureElectorate(f)]?.[f.sourceId]:state.fills[state.level][f.id]}
const fillColor=f=>{if(state.fillMode==='prediction'&&typeof predictionFill==='function')return predictionFill(f);if(state.fillMode!=='gradient')return paletteById(featureFillId(f))?.color||'#edf1e9';const r=regionResult(f);if(r.status==='tie')return'#aebdb4';if(r.status!=='winner')return'#edf1e9';const p=paletteById(r.leader.partyId),d=gradientDomain();return p?ElectionCore.shade(p.color,r.value,d.min,d.max):'#edf1e9'};
function counts(){if(state.fillMode==='prediction'&&typeof predictionPartyCounts==='function')return predictionPartyCounts();const c={};currentItems().forEach(f=>{const r=state.fillMode==='gradient'?regionResult(f):null,id=r?.status==='winner'?r.leader.partyId:state.fillMode==='solid'?featureFillId(f):null;if(id)c[id]=(c[id]||0)+1});return c}
function syncCountyChoices(){
 const el=$('county');if(!el||!data?.counties)return;
 const township=state.workspaceMode==='prediction'&&state.fillMode==='prediction'&&state.predictionOffice==='township';
 const supported=township&&typeof candidateDatabase!=='undefined'&&candidateDatabase?.districts?new Set(candidateDatabase.districts.filter(d=>d.type==='township').map(d=>d.county)):null;
 const allowed=data.counties.map(f=>f.name).filter(name=>!supported||supported.has(name));
 const expected=['',...COUNTY_ORDER.filter(name=>allowed.includes(name))];
 const actual=[...el.options].map(option=>option.value);
 if(actual.length!==expected.length||actual.some((value,i)=>value!==expected[i])){
  el.replaceChildren(new Option('全台 · 含离岛',''),...expected.slice(1).map(name=>new Option(name,name)));
 }
 if(state.county&&supported&&!supported.has(state.county))state.county='';
}
function syncInputs(){syncCountyChoices();$('county').value=state.county;syncBorderControls();$('showLabels').checked=state.labels;$('mapTitle').value=state.title;$('legendTitle').value=state.legendTitle;if($('exportWinnerTable'))$('exportWinnerTable').checked=state.exportSettings.winnerTable;if($('exportNote'))$('exportNote').value=state.exportSettings.note;if($('councilExportScope'))$('councilExportScope').value=state.exportSettings.councilScope;if($('councilExportScopeBox'))$('councilExportScopeBox').hidden=state.level!=='council';$('townLevel').classList.toggle('active',state.level==='towns');$('countyLevel').classList.toggle('active',state.level==='counties');$('townLevel').setAttribute('aria-pressed',state.level==='towns');$('countyLevel').setAttribute('aria-pressed',state.level==='counties');for(const [id,level]of [['councilLevel','council'],['legislativeLevel','legislative'],['villageLevel','villages']]){$(id).classList.toggle('active',state.level===level);$(id).setAttribute('aria-pressed',state.level===level)}syncVillageControls();syncElectorateControls();syncElectionControls();updateHistory()}
function setBrush(id){state.selected=id;erase=false;renderPalette();renderLegend();updateBrush();persist()}
function updateBrush(){if(state.fillMode==='prediction'){$('brushName').textContent='2026 用户预测 · 点击选区选择预测当选者';return}if($('inspectElection')?.checked){$('brushName').textContent='查询 2026 资料 · 点击地图选择选区';return}if(state.fillMode==='gradient'){$('brushName').textContent=erase?'橡皮擦 · 点击区域清除投票数据':'点击区域，录入或编辑投票数据';$('eraser').classList.toggle('active',erase);$('eraser').setAttribute('aria-pressed',erase);return;}const p=paletteById(state.selected);$('brushName').textContent=erase?'橡皮擦 · 点击区域恢复未填色':`${p?.name||'画笔'} · 点击区域填色`;$('eraser').classList.toggle('active',erase);$('eraser').setAttribute('aria-pressed',erase)}
function renderPalette(){const root=$('palette');root.replaceChildren();const c=counts();state.palette.forEach((p,index)=>{const row=document.createElement('div');row.dataset.party=p.id;row.className='palette-row'+(!erase&&state.selected===p.id?' selected':'');const sw=document.createElement('button');sw.className='swatch';sw.style.background=p.color;sw.setAttribute('aria-label',`选择${p.name}画笔`);sw.setAttribute('aria-pressed',!erase&&state.selected===p.id);sw.onclick=()=>setBrush(p.id);const input=document.createElement('input');input.className='palette-name';input.value=p.name;input.maxLength=40;input.setAttribute('aria-label',`修改${p.name}图例名称`);input.onfocus=()=>{input.dataset.before=input.value;delete input.dataset.history};input.oninput=()=>{if(!input.dataset.history){pushHistory();input.dataset.history='1'}p.name=simplify(input.value)||'未命名';renderLegend();updateBrush();persist()};input.onchange=()=>{const name=simplify(input.value.trim())||'未命名';if(p.name!==name){pushHistory();p.name=name;persist();renderLegend();renderList();updateBrush()}};const count=document.createElement('span');count.className='palette-count';count.textContent=c[p.id]||'0';const edit=document.createElement('label');edit.className='color-edit';edit.title='修改颜色';const color=document.createElement('input');color.type='color';color.value=p.color;color.setAttribute('aria-label',`修改${p.name}颜色`);color.onchange=()=>{if(p.color!==color.value){pushHistory();p.color=color.value;recolor();renderPalette();renderLegend();renderList();persist()}};edit.append(color);const del=document.createElement('button');del.className='remove-color';del.textContent='×';del.title='删除类别（可撤销）';del.setAttribute('aria-label',`删除${p.name}类别`);del.onclick=()=>{if(LEVELS.some(level=>Object.values(state.elections[level]).some(r=>r.rows.some(row=>row.partyId===p.id)))||(typeof predictionPaletteInUse==='function'&&predictionPaletteInUse(p)))return toast('此类别已用于投票数据，可在图例编辑中隐藏；删除前请先修改关联数据');if(state.palette.length===1)return toast('至少保留一个颜色类别');pushHistory();state.palette=state.palette.filter(x=>x.id!==p.id);for(const level of LEVELS)for(const k in state.fills[level])if(state.fills[level][k]===p.id)delete state.fills[level][k];if(state.selected===p.id)state.selected=state.palette[0].id;renderPalette();recolor();renderLegend();renderList();updateProgress();updateBrush();persist()};const logo=logoFor(p);if(logo){const img=document.createElement('img');img.className='party-logo';img.src=logo;img.alt=p.name+'党徽';row.append(img)}row.append(sw,input,count,edit);const order=document.createElement('div');order.className='party-order';for(const [direction,label]of [[-1,'上移'],[1,'下移']]){const b=document.createElement('button');b.className='move-party';b.type='button';b.textContent=direction<0?'↑':'↓';b.dataset.direction=direction;b.title=label+p.name;b.setAttribute('aria-label',label+'画笔：'+p.name);b.disabled=index+direction<0||index+direction>=state.palette.length;b.onclick=()=>moveParty(p.id,direction);order.append(b)}row.append(order,del);root.append(row)});updateBrush()}
let legendLayoutKey='';
function renderLegend(){const spec=sceneSpec();drawLegend($('legend'),spec,true);const reserve=legendBox(spec),key=[spec.width,spec.height,reserve.height,state.county,state.level,state.legend.show].join('/');if(data&&view&&key!==legendLayoutKey){legendLayoutKey=key;if(!identityPanelsActive()){const t=geometryLayout(currentItems(),state.labels);$('regions').setAttribute('transform',transformOf(t));$('borders').setAttribute('transform',transformOf(t));$('districtBorders').setAttribute('transform',transformOf(t));$('townBorders').setAttribute('transform',transformOf(t));fit();renderMapFurniture()}}}

function updateProgress(){syncCountyChoices();const items=currentItems();$('scopeTitle').textContent=(state.level==='villages'&&state.villageTown?(data.towns.find(f=>f.id===state.villageTown)?.name||''):state.county||'全台')+levelLabel(state.level)+(state.fillMode==='prediction'?' · 用户预测':'');if(state.fillMode==='prediction')$('scopeTitle').textContent=(state.county||'全台')+' · 2026 '+({mayor:'县市长',council:'议员',township:'乡镇市区长'})[state.predictionOffice]+'预测';$('progress').textContent='';$('regionCount').textContent=items.length;$('islandNote').textContent='离岛采用移位示意，非实际相对位置';syncElectionControls()}
function renderList(){const root=$('regionList');root.replaceChildren();const q=simplify($('search').value.trim()),items=currentItems().filter(f=>(f.county+(f.town||'')+f.name).includes(q));if(!items.length){root.innerHTML='<p class="empty-search">没有找到匹配的区域</p>';return}items.slice(0,300).forEach(f=>{const b=document.createElement('button');b.className='region-item';const dot=document.createElement('span');dot.className='region-dot';dot.style.background=fillColor(f);const t=document.createElement('span');t.textContent=f.name;const sub=document.createElement('small');sub.textContent=state.level!=='counties'?f.county+(f.town?' · '+f.town:''):'';b.append(dot,t,sub);b.title=`点击为${f.county}${f.name}填色`;b.onclick=()=>paint(f);root.append(b)});if(items.length>300){const more=document.createElement('p');more.className='data-help';more.textContent='显示前 300 个结果，请筛选县市、乡镇或输入名称查找。';root.append(more)}}
function svgEl(tag,attrs){const el=document.createElementNS(NS,tag);for(const [k,v]of Object.entries(attrs||{}))el.setAttribute(k,v);return el}
// Shared party-logo renderer for live SVG, exported maps and winner tables.
// A local clipPath gives every emblem the same circular silhouette and size.
let circularPartyLogoSequence=0;
function appendCircularPartyLogo(group,href,x,y,size,attributes={}){
 if(!href)return null;
 const id='party-logo-circle-'+(++circularPartyLogoSequence);
 const defs=svgEl('defs'),clip=svgEl('clipPath',{id,clipPathUnits:'userSpaceOnUse'});
 clip.append(svgEl('circle',{cx:x+size/2,cy:y+size/2,r:size/2}));
 defs.append(clip);
 const logo=svgEl('image',{href,x,y,width:size,height:size,preserveAspectRatio:'xMidYMid slice',
  'clip-path':'url(#'+id+')',...attributes});
 group.append(defs,logo);
 return logo;
}
function bounds(items){return [Math.min(...items.map(x=>x.box[0])),Math.min(...items.map(x=>x.box[1])),Math.max(...items.map(x=>x.box[2])),Math.max(...items.map(x=>x.box[3]))]}
const isNationwide=()=>!state.county&&['towns','council','legislative'].includes(state.level)&&state.labels;
function councilVisibleIdentity(){return exportPanelFilter||(state.level==='council'&&state.workspaceMode==='prediction'&&state.fillMode==='prediction'?state.councilViewScope:'all')}
function panelIdentities(){const order=legislativeFourPanelsActive()?LEGISLATIVE_FREE_ORDER:ELECTORATE_ORDER,selected=state.level==='council'?councilVisibleIdentity():'all';return selected&&selected!=='all'?[selected]:order}
function furnitureFooterHeight(){return Math.max(126,state.legend.show?legendMetrics(legendReserveEntries()).height+48:0)}
function sceneSpec(){const panels=identityPanelsActive()?panelIdentities().length:0,base=panels===1?(state.county?{width:1200,height:900,pad:140,font:15}:{width:1800,height:2400,pad:250,font:10}):panels===4?(state.county?{width:2800,height:1500,pad:130,font:12}:{width:3200,height:2300,pad:180,font:11}):identityPanelsActive()?(state.county?{width:2400,height:1050,pad:120,font:13}:{width:3000,height:2100,pad:180,font:12}):isNationwide()?{width:1800,height:2400,pad:250,font:10}:{width:1200,height:900,pad:140,font:state.level==='counties'?11:15};const n=data&&state.level==='villages'?currentItems().length:0;const mapHeight=Math.max(base.height,n&&n<=120?n*8+220:0);return{...base,height:mapHeight+furnitureFooterHeight()}}
function contentArea(spec){return{left:45,right:spec.width-115,top:145,bottom:spec.height-furnitureFooterHeight()-28}}
function fittedView(){const s=sceneSpec();return{x:0,y:0,w:s.width,h:s.height}}
function applyView(){if(view){$('map').setAttribute('viewBox',`${view.x} ${view.y} ${view.w} ${view.h}`);if(state.level==='villages'){cancelAnimationFrame(villageLabelFrame);villageLabelFrame=requestAnimationFrame(renderLabels)}}}
function fit(){view=fittedView();baseView={...view};applyView();renderLabels()}
function geometryLayout(items,labels=true){if(!items.length)items=data.counties.filter(f=>!state.county||f.name===state.county);const spec=sceneSpec(),area=contentArea(spec),b=bounds(items);const visibleOutlines=state.level==='villages'&&state.villageTown?data.towns.filter(f=>f.id===state.villageTown):state.level!=='counties'?data.counties.filter(f=>!state.county||f.name===state.county):[];for(const outline of visibleOutlines){b[0]=Math.min(b[0],outline.box[0]);b[1]=Math.min(b[1],outline.box[1]);b[2]=Math.max(b[2],outline.box[2]);b[3]=Math.max(b[3],outline.box[3])}for(const q of activeInsetDefinitions()){b[0]=Math.min(b[0],q.box[0]);b[1]=Math.min(b[1],q.box[1]);b[2]=Math.max(b[2],q.box[2]);b[3]=Math.max(b[3],q.box[3])}const gutter=labels?(isNationwide()?250:state.level==='villages'?95:state.level==='counties'?100:140):20,left=area.left+gutter,right=area.right-gutter,w=right-left,h=area.bottom-area.top,scale=Math.min(w/Math.max(.0001,b[2]-b[0]),h/Math.max(.0001,b[3]-b[1]));return{scale,tx:(left+right)/2-(b[0]+b[2])/2*scale,ty:(area.top+area.bottom)/2-(b[1]+b[3])/2*scale,labelLeft:left-22,labelRight:right+22,area}}
function identityPanelLayouts(){
 if(!identityPanelsActive()||!data)return[];
 const identities=panelIdentities(),spec=sceneSpec(),area=contentArea(spec),gap=26,left=area.left+8,right=area.right-8,top=area.top+52,bottom=area.bottom-12,columns=identities.length===4?2:identities.length,rows=Math.ceil(identities.length/columns),panelWidth=(right-left-gap*(columns-1))/columns,panelHeight=(bottom-top-gap*(rows-1))/rows;
 const geography=data.counties.filter(f=>!state.county||f.name===state.county),b=bounds(geography);for(const q of activeInsetDefinitions()){b[0]=Math.min(b[0],q.box[0]);b[1]=Math.min(b[1],q.box[1]);b[2]=Math.max(b[2],q.box[2]);b[3]=Math.max(b[3],q.box[3])}
 const mapPad=state.county?45:70,scale=Math.min((panelWidth-mapPad*2)/Math.max(.0001,b[2]-b[0]),(panelHeight-mapPad)/Math.max(.0001,b[3]-b[1]));
 return identities.map((identity,index)=>{const column=index%columns,row=Math.floor(index/columns),x=left+column*(panelWidth+gap),y=top+row*(panelHeight+gap),panelArea={left:x,right:x+panelWidth,top:y,bottom:y+panelHeight};return{identity,label:electorateName(identity),townLevel:legislativeFourPanelsActive()&&identity!=='regional',items:currentItems().filter(f=>featureElectorate(f)===identity),area:panelArea,t:{scale,tx:(panelArea.left+panelArea.right)/2-(b[0]+b[2])/2*scale,ty:(panelArea.top+panelArea.bottom+mapPad)/2-(b[1]+b[3])/2*scale,labelLeft:panelArea.left+8,labelRight:panelArea.right-8,area:panelArea}}})
}
function identityPanelFor(f){return identityPanelLayouts().find(p=>p.identity===featureElectorate(f))}
function transformOf(t){return `translate(${t.tx} ${t.ty}) scale(${t.scale})`}
const labelCanvas=document.createElement('canvas').getContext('2d'),labelPaths=new WeakMap();
function regionContains(f,x,y,t){let path=labelPaths.get(f);if(!path){path=new Path2D(f.d);labelPaths.set(f,path)}return labelCanvas.isPointInPath(path,(x-t.tx)/t.scale,(y-t.ty)/t.scale,'evenodd')}
function labelLayout(items,t,font=15){
 const placed=[],outside=[],result=[],spec=sceneSpec(),reserve=legendBox(spec),area=t.area||contentArea(spec),forcedOutside=new Set(['台北市','基隆市','新竹市','嘉义市']),insetLabels={'连江县':[80,130],'金门县':[65,210],'澎湖县':[65,555]},leftLabelEdge=t.labelLeft;
 for(const f of [...items].sort((a,b)=>(a.box[2]-a.box[0])*(a.box[3]-a.box[1])-(b.box[2]-b.box[0])*(b.box[3]-b.box[1]))){
 const anchor=f.labelAnchor||f.center,ax=anchor[0]*t.scale+t.tx,ay=anchor[1]*t.scale+t.ty,box=[f.box[0]*t.scale+t.tx,f.box[1]*t.scale+t.ty,f.box[2]*t.scale+t.tx,f.box[3]*t.scale+t.ty];
 const candidates=[{x:ax,y:ay}];for(let iy=1;iy<=11;iy++)for(let ix=1;ix<=11;ix++)candidates.push({x:box[0]+(box[2]-box[0])*ix/12,y:box[1]+(box[3]-box[1])*iy/12});candidates.sort((a,b)=>Math.hypot(a.x-ax,a.y-ay)-Math.hypot(b.x-ax,b.y-ay));
 const insidePoint=candidates.find(q=>regionContains(f,q.x,q.y,t))||{x:ax,y:ay};let chosen=null;
 if(state.level==='counties'&&!state.county&&insetLabels[f.name]){const q=insetLabels[f.name];result.push({f,x:q[0]*t.scale+t.tx,y:q[1]*t.scale+t.ty,ax,ay,out:false,font,inset:true});continue;}
 const forceOut=state.level==='counties'&&forcedOutside.has(f.name);
 const w=shownLabel(f).length*font*1.04+4,h=font*1.5+3;
 if(!forceOut&&box[2]-box[0]>=w&&box[3]-box[1]>=h){
 for(const q of candidates){const r=[q.x-w/2,q.y-h/2,q.x+w/2,q.y+h/2];if(r[0]<area.left||r[2]>area.right||r[1]<area.top||r[3]>area.bottom||(r[2]>reserve.x-10&&r[3]>reserve.y-12)||placed.some(p=>r[0]<p[2]&&r[2]>p[0]&&r[1]<p[3]&&r[3]>p[1]))continue;let fits=true;for(const dx of [-.5,-.25,0,.25,.5]){for(const dy of [-.5,0,.5])if(!regionContains(f,q.x+w*dx,q.y+h*dy,t)){fits=false;break}if(!fits)break}if(fits){chosen={...q,box:r,font};break}}
 }
 if(chosen){placed.push(chosen.box);result.push({f,x:chosen.x,y:chosen.y,ax:insidePoint.x,ay:insidePoint.y,out:false,font:chosen.font})}else outside.push({f,ax,ay,font,side:forceOut?(['新竹市','嘉义市'].includes(f.name)?'left':'right'):null});
 }
 const sorted=[...outside].sort((a,b)=>a.ax-b.ax),gap=Math.max(font*1.65,state.level==='villages'?14:25),top=area.top+font,bottom=area.bottom-font,capacity=Math.floor((bottom-top)/gap)+1,columns=identityPanelsActive()?1:isNationwide()?2:1,sideCapacity=capacity*columns;let middle=sorted.filter(q=>q.ax<(area.left+area.right)/2).length;const rightCapacity=Math.max(1,Math.floor((bottom-top)/gap)+1)*columns;middle=Math.max(sorted.length-rightCapacity,Math.min(sideCapacity,middle));
 const sides=state.level==='counties'?[['left',sorted.filter(q=>q.side==='left'||(!q.side&&q.ax<(area.left+area.right)/2))],['right',sorted.filter(q=>q.side==='right'||(!q.side&&q.ax>=(area.left+area.right)/2))]]:[['left',sorted.slice(0,middle)],['right',sorted.slice(middle)]];
 for(const [side,list]of sides){const endY=side==='right'?bottom:bottom,cap=Math.max(1,Math.floor((endY-top)/gap)+1);list.sort((a,b)=>a.ay-b.ay);const cols=Math.max(1,Math.ceil(list.length/cap)),chunkSize=Math.ceil(list.length/cols);for(let col=0;col<cols;col++){const chunk=list.slice(col*chunkSize,(col+1)*chunkSize);for(let i=0;i<chunk.length;i++)chunk[i].y=Math.max(i?chunk[i-1].y+gap:top,chunk[i].ay);if(chunk.length&&chunk.at(-1).y>endY){chunk.at(-1).y=endY;for(let i=chunk.length-2;i>=0;i--)chunk[i].y=Math.min(chunk[i].y,chunk[i+1].y-gap)}for(const q of chunk){q.x=side==='left'?leftLabelEdge-col*120:t.labelRight+col*120;q.elbow=side==='left'?q.x+18:q.x-18;q.side=side;q.out=true;result.push(q)}}}return result;
}

function drawLabels(group,items,t,font=15,interactive=false){
 // Nationwide township maps always label the 22 counties/cities, even when zoomed in.
 // Keep town geometry and color fills intact; only replace the text layer.
 const nationwideTownLabels=state.level==='towns'&&!state.county;
 const labelItems=nationwideTownLabels?(data?.counties||[]):items;
 if(nationwideTownLabels){font=19;interactive=false}
 group.replaceChildren();for(const q of labelLayout(labelItems.filter(f=>shownLabel(f)),t,font)){
 const target=svgEl('g',{'class':'map-label'});group.append(target);
 if(!nationwideTownLabels&&q.out&&(!['council','legislative'].includes(state.level)||state.districtLeaders)){const end=q.side==='left'?q.x+9:q.x-9,elbow=q.elbow;target.append(svgEl('path',{d:`M${q.ax},${q.ay}L${elbow},${q.y}L${end},${q.y}`,fill:'none',stroke:'#92a49b','stroke-width':.55,opacity:isNationwide()?.18:.65,'vector-effect':'non-scaling-stroke'}));target.append(svgEl('circle',{cx:q.ax,cy:q.ay,'data-leader-region':q.f.id,r:2,fill:'#6d8879',opacity:isNationwide()?.35:1}))}
 const text=svgEl('text',{x:q.x,y:q.y,'font-size':q.font,'data-label':q.f.id,'data-placement':q.inset?'inset':q.out?'outside':'inside','text-anchor':q.out?(q.side==='left'?'end':'start'):'middle','dominant-baseline':'middle',fill:'#2c493b',stroke:'#ffffffed','stroke-width':4,'paint-order':'stroke','stroke-linejoin':'round'});text.style.strokeWidth=state.level==='counties'?2:2.4;text.style.textAnchor=q.out?(q.side==='left'?'end':'start'):'middle';text.textContent=shownLabel(q.f);if(interactive){text.style.pointerEvents='auto';text.style.cursor='pointer';text.onclick=()=>paint(q.f)}target.append(text);
 }
}
function drawIdentityPanelLabels(group,interactive=false,exportAll=false){group.replaceChildren();const condensed=!state.county&&!exportAll&&view&&view.w>=sceneSpec().width*.72;for(const panel of identityPanelLayouts()){const layer=svgEl('g',{'data-electorate-labels':panel.identity});group.append(layer);const items=condensed?data.counties.map(f=>({...f,number:''})):panel.items;if(items.length)drawLabels(layer,items,panel.t,condensed?17:sceneSpec().font,interactive&&!condensed)}}
function renderLabels(){const group=$('labels');group.replaceChildren();if(!state.labels||!view)return;if(identityPanelsActive())return drawIdentityPanelLabels(group,true,false);if(state.level==='villages')drawVillageLabels(group,currentItems(),geometryLayout(currentItems(),true),view,true);else drawLabels(group,currentItems(),geometryLayout(currentItems(),true),sceneSpec().font,true)}
function insetDefinitions(){return[
 {name:'马祖',county:'连江县',box:[20,20,140,140],label:[80,30]},
 {name:'金门',county:'金门县',d:'M20,160H110V190H140V220H20Z',label:[65,169],box:[20,160,140,220]},
 {name:'乌坵',town:'乌坵乡',box:[110,160,140,190],label:[125,183]},
 {name:'澎湖',county:'澎湖县',box:[20,435,110,565],label:[65,445]}
 ]}
function activeInsetDefinitions(){const town=state.level==='villages'&&state.villageTown?data.towns.find(f=>f.id===state.villageTown):null,county=state.county||town?.county||'';return insetDefinitions().filter(q=>{if(town?.name==='乌坵乡')return q.town==='乌坵乡';if(town&&q.town==='乌坵乡')return false;return !county||q.county===county||data.towns.some(f=>f.name===q.town&&f.county===county)})}
function appendInsetFrames(group,t,spec,prefix=''){for(const q of activeInsetDefinitions()){const b=q.box,g=svgEl('g',{'data-inset':prefix+q.name});const p=q.d?svgEl('path',{d:q.d,transform:transformOf(t),fill:'none',stroke:'#a3b5a8','stroke-width':.75,'vector-effect':'non-scaling-stroke'}):svgEl('rect',{x:b[0]*t.scale+t.tx,y:b[1]*t.scale+t.ty,width:(b[2]-b[0])*t.scale,height:(b[3]-b[1])*t.scale,rx:3,fill:'none',stroke:'#a3b5a8','stroke-width':.75,'vector-effect':'non-scaling-stroke'});g.append(p);if(q.label&&q.name!=='乌坵'&&(state.level!=='counties'||q.town)){const name=svgEl('text',{x:q.label[0]*t.scale+t.tx,y:q.label[1]*t.scale+t.ty,'text-anchor':'middle','font-size':spec.font,fill:'#758c7c',stroke:'#fff','stroke-width':3,'paint-order':'stroke'});name.textContent=q.name;g.append(name)}group.append(g)}}
function drawInsetFrames(group,t,spec){group.replaceChildren();if(identityPanelsActive()){for(const panel of identityPanelLayouts()){const {area}=panel;group.append(svgEl('rect',{x:area.left,y:area.top-52,width:area.right-area.left,height:area.bottom-area.top+52,rx:16,fill:'#fbfdfb',stroke:'#d7e2d9','stroke-width':1.4}));const title=svgEl('text',{x:(area.left+area.right)/2,y:area.top-18,'text-anchor':'middle','font-size':30,'font-weight':600,fill:'#294a3a'});title.textContent=panel.label;group.append(title);const note=svgEl('text',{x:(area.left+area.right)/2,y:area.top+13,'text-anchor':'middle','font-size':16,fill:'#74877a'});note.textContent=panel.items.length?panel.items.length+(panel.townLevel?' 个乡镇市区':' 个选区'):'当前范围没有此类选区';group.append(note);appendInsetFrames(group,panel.t,spec,panel.identity+'-')}return}appendInsetFrames(group,t,spec)}
function drawMapFurniture(group,t,spec){group.replaceChildren();const wide=isNationwide(),area=contentArea(spec),cx=spec.width-75,cy=85,unit=wide?1.3:1,footerTop=spec.height-furnitureFooterHeight();
 const north=svgEl('g',{'data-decoration':'north-arrow',transform:`translate(${cx},${cy}) scale(${unit})`});north.append(svgEl('path',{d:'M0,8L-10,42L0,34L10,42Z',fill:'#365d49'}));north.append(svgEl('path',{d:'M0,8L0,34L10,42Z',fill:'#fff',stroke:'#365d49','stroke-width':.8}));const n=svgEl('text',{x:0,y:0,'font-size':13,'font-weight':600,'text-anchor':'middle',fill:'#365d49'});n.textContent='N';north.append(n);group.append(north);
 const pixelsPerKm=t.scale*10000/6371.0088,target=Math.min(wide?220:140,area.right-area.left-120),km=[.01,.02,.05,.1,.2,.5,1,2,5,10,20,50,100,200].reduce((a,b)=>Math.abs(b*pixelsPerKm-target)<Math.abs(a*pixelsPerKm-target)?b:a),length=km*pixelsPerKm,x=area.left+20,y=footerTop+15,font=wide?15:10,bar=svgEl('g',{'data-decoration':'scale-bar','data-distance-km':km,'data-length':length});
 bar.append(svgEl('rect',{x:x-12,y:y-24,width:length+70,height:52,rx:6,fill:'#ffffffed'}));for(let i=0;i<2;i++)bar.append(svgEl('rect',{x:x+i*length/2,y,width:length/2,height:6,fill:i?'#fff':'#365d49',stroke:'#365d49','stroke-width':.8}));for(let i=0;i<3;i++){const text=svgEl('text',{x:x+i*length/2,y:y-7,'font-size':font,'text-anchor':'middle',fill:'#466253'});text.textContent=Number(((km<1?km*1000:km)*i/2).toFixed(2))+(i===2?(km<1?' m':' km'):'');bar.append(text)}group.append(bar);
}
function renderMapFurniture(){const spec=sceneSpec(),t=identityPanelsActive()?identityPanelLayouts()[0]?.t:geometryLayout(currentItems(),state.labels);if(!t)return;drawInsetFrames($('insetFrames'),t,spec);drawMapFurniture($('mapFurniture'),t,spec)}

function regionPath(f){const identity=identityPanelsActive()?' · '+electorateName(featureElectorate(f)):'';const p=svgEl('path',{d:f.d,fill:fillColor(f),stroke:'#80978d','stroke-width':.55,'vector-effect':'non-scaling-stroke','fill-rule':'evenodd','data-region':f.id,'data-electorate':featureElectorate(f),tabindex:0,role:'button','aria-label':`${f.county}${f.name===f.county?'':f.name}${identity}，${regionDetail(f)}`});const title=svgEl('title');title.textContent=f.county+(f.name===f.county?'':f.name)+identity;p.append(title);p.addEventListener('click',()=>{if(!moved)paint(f)});p.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();paint(f)}};p.onpointermove=e=>{if(drag)return;const tip=$('tooltip'),r=$('canvas').getBoundingClientRect();tip.replaceChildren();const label=document.createElement('span');label.textContent=f.name;const sub=document.createElement('small');sub.textContent=f.county+(f.town?' · '+f.town:'')+identity+' · '+regionDetail(f);tip.append(label,sub);tip.hidden=false;tip.style.left=Math.min(e.clientX-r.left+15,r.width-165)+'px';tip.style.top=Math.max(45,e.clientY-r.top-48)+'px'};p.onpointerleave=()=>$('tooltip').hidden=true;return p}
function render(){
 if(!data)return;ensureMapDetails();$('canvas').classList.toggle('nationwide-mode',isNationwide());$('canvas').classList.toggle('county-mode',state.level==='counties');
 const regionGroup=$('regions'),borderGroup=$('borders'),districtGroup=$('districtBorders'),townGroup=$('townBorders');regionGroup.replaceChildren();borderGroup.replaceChildren();districtGroup.replaceChildren();for(const group of [regionGroup,borderGroup,districtGroup,townGroup])group.removeAttribute('transform');
 const countyOutlines=data.counties.filter(f=>(!state.county||f.name===state.county)&&!(state.level==='villages'&&state.villageTown));
 if(identityPanelsActive()){
  renderTownBorders();for(const panel of identityPanelLayouts()){const transform=transformOf(panel.t),regions=svgEl('g',{'data-electorate':panel.identity,transform}),districts=svgEl('g',{'data-electorate':panel.identity,transform}),counties=svgEl('g',{'data-electorate':panel.identity,transform});for(const f of panel.items)regions.append(regionPath(f));if(!panel.townLevel)for(const edge of (data.districtBorders[borderKeyForElectorate(panel.identity)]||[]).filter(f=>!state.county||f.county===state.county))districts.append(svgEl('path',{d:edge.d,fill:'none','vector-effect':'non-scaling-stroke','data-district-county':edge.county}));for(const f of countyOutlines)counties.append(svgEl('path',{d:f.d,fill:'none',stroke:state.countyBorderColor,'stroke-width':state.countyBorderWidth,'vector-effect':'non-scaling-stroke','data-county':f.id,'pointer-events':'none'}));regionGroup.append(regions);districtGroup.append(districts);borderGroup.append(counties)}
 }else{
  const transform=transformOf(geometryLayout(currentItems(),state.labels));for(const group of [regionGroup,borderGroup,districtGroup,townGroup])group.setAttribute('transform',transform);renderTownBorders();if(['council','legislative'].includes(state.level))for(const edge of (data.districtBorders[activeBorderKey()]||[]).filter(f=>!state.county||f.county===state.county))districtGroup.append(svgEl('path',{d:edge.d,fill:'none','vector-effect':'non-scaling-stroke','data-district-county':edge.county}));for(const f of currentItems())regionGroup.append(regionPath(f));if(state.level!=='counties')for(const f of countyOutlines)borderGroup.append(svgEl('path',{d:f.d,fill:'none',stroke:state.countyBorderColor,'stroke-width':state.countyBorderWidth,'vector-effect':'non-scaling-stroke','data-county':f.id,'pointer-events':'none'}))
 }
 fit();renderPalette();renderLegend();renderList();updateProgress();updateHistory();applyBorders();renderMapFurniture();if(typeof renderPredictionDecorations==='function')renderPredictionDecorations()
}
function recolor(){if(state.fillMode==='prediction'){render();return}if(state.fillMode==='gradient'){for(const p of $('regions').querySelectorAll('path')){const f=currentItems().find(f=>f.id===p.dataset.region);if(!f)continue;p.setAttribute('fill',fillColor(f));p.setAttribute('aria-label',f.county+(f.name===f.county?'':f.name)+'，'+regionDetail(f));}return;}for(const p of $('regions').querySelectorAll('path')){const f=currentItems().find(x=>x.id===p.dataset.region);if(!f)continue;const pal=paletteById(featureFillId(f));p.setAttribute('fill',pal?.color||'#edf1e9');p.setAttribute('aria-label',f.county+(f.name===f.county?'':f.name)+'，'+(pal?.name||'未填色'))}}
function paint(f){if(state.fillMode==='prediction'&&typeof openPredictionRegion==='function'){openPredictionRegion(f);return}if(typeof inspectCandidateRegion==='function'&&inspectCandidateRegion(f))return;if(state.fillMode==='gradient'){if(erase){pushHistory();delete state.elections[state.level][f.id];afterElectionEdit();return;}openVoteEditor(f);return;}const id=erase?undefined:state.selected,store=f.legislativeTown?state.legislativeTownFills[featureElectorate(f)]:state.fills[state.level],key=f.legislativeTown?f.sourceId:f.id;if(store[key]===id)return;pushHistory();if(id)store[key]=id;else delete store[key];recolor();renderPalette();renderLegend();renderList();updateProgress();persist()}
function zoom(factor,anchor){if(!view)return;const next=view.w*factor;if(next<baseView.w/16||next>baseView.w*2)return;const a=anchor||[.5,.5];view={x:view.x+view.w*a[0]*(1-factor),y:view.y+view.h*a[1]*(1-factor),w:next,h:view.h*factor};applyView()}
$('county').onchange=()=>{state.county=$('county').value;state.villageTown='';syncVillageControls();render();persist()};for(const [id,level]of [['townLevel','towns'],['countyLevel','counties'],['councilLevel','council'],['legislativeLevel','legislative'],['villageLevel','villages']])$(id).onclick=()=>{if(state.level===level)return;state.level=level;if(typeof predictionLevelChanged==='function')predictionLevelChanged(level);syncInputs();render();persist();toast('各地图图层的填色和数据分别保存')};$('showLabels').onchange=()=>{state.labels=$('showLabels').checked;render();persist()};$('search').oninput=renderList;for(const [id,key]of [['mapTitle','title'],['legendTitle','legendTitle']]){let editing=false;$(id).onfocus=()=>editing=false;$(id).oninput=()=>{if(!editing){pushHistory();editing=true}state[key]=simplify($(id).value);if(key==='legendTitle')renderLegend();persist()};}$('eraser').onclick=()=>{erase=!erase;renderPalette();updateBrush()};$('undo').onclick=()=>restore('undo');$('redo').onclick=()=>restore('redo');$('zoomIn').onclick=()=>zoom(.8);$('zoomOut').onclick=()=>zoom(1.25);$('fit').onclick=fit;
$('map').addEventListener('wheel',e=>{if(!view)return;e.preventDefault();const p=new DOMPoint(e.clientX,e.clientY).matrixTransform($('map').getScreenCTM().inverse());zoom(e.deltaY>0?1.1:1/1.1,[(p.x-view.x)/view.w,(p.y-view.y)/view.h])},{passive:false});
$('map').addEventListener('pointerdown',e=>{if(e.button!==0)return;moved=false;drag={x:e.clientX,y:e.clientY,v:{...view},pointer:e.pointerId,matrix:$('map').getScreenCTM()?.inverse()}});
window.addEventListener('pointermove',e=>{if(!drag||!drag.matrix)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(Math.hypot(dx,dy)>5){moved=true;$('tooltip').hidden=true;const p1=new DOMPoint(drag.x,drag.y).matrixTransform(drag.matrix),p2=new DOMPoint(e.clientX,e.clientY).matrixTransform(drag.matrix);view={...drag.v,x:drag.v.x-(p2.x-p1.x),y:drag.v.y-(p2.y-p1.y)};applyView()}});window.addEventListener('pointerup',()=>drag=null);window.addEventListener('pointercancel',()=>{drag=null;moved=true});
window.addEventListener('keydown',e=>{if(/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName))return;if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();restore(e.shiftKey?'redo':'undo')}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'){e.preventDefault();restore('redo')}});
function clearCurrentMapData(){
 const items=currentItems(),deletes=[],queued=new Set(),touchedLocal=new Set();
 const queue=(store,key,token)=>{if(store&&key!==undefined&&key!==null&&Object.hasOwn(store,key)&&!queued.has(token)){queued.add(token);deletes.push([store,key])}};
 if(state.workspaceMode==='prediction'&&state.fillMode==='prediction'){
  if(typeof localPredictionActive==='function'&&localPredictionActive()){
   const targets=items.length?items:(typeof localDistrictItems==='function'?localDistrictItems():[]);
   for(const f of targets){
    const districtId=f.parentDistrictId,townId=f.townId;
    if(!districtId||!townId)continue;
    queue(state.localPredictions?.[districtId],townId,'local:'+districtId+':'+townId);
    touchedLocal.add(districtId);
   }
  }else{
   for(const f of items){
    const district=typeof predictionDistrictFor==='function'?predictionDistrictFor(f):null;
    if(district?.id)queue(state.predictions,district.id,'prediction:'+district.id);
   }
  }
 }else{
  const level=state.level,fills=state.fills?.[level],votes=state.elections?.[level];
  for(const f of items){
   if(f.legislativeTown)queue(state.legislativeTownFills?.[featureElectorate(f)],f.sourceId,'town-fill:'+featureElectorate(f)+':'+f.sourceId);
   else queue(fills,f.id,'fill:'+level+':'+f.id);
   queue(votes,f.id,'vote:'+level+':'+f.id);
  }
 }
 if(!deletes.length)return 0;
 pushHistory();
 for(const [store,key] of deletes)delete store[key];
 for(const id of touchedLocal)if(state.localPredictions[id]&&!Object.keys(state.localPredictions[id]).length)delete state.localPredictions[id];
 pruneUnusedAutoPredictionPalette(state);
 electionResultCache.clear();
 return deletes.length;
}
function currentResetScopeLabel(){
 const office=state.workspaceMode==='prediction'?({mayor:'县市长',council:'议员',township:'乡镇市区长'})[state.predictionOffice]||'2026预测':'自由填色';
 const layer=typeof localPredictionActive==='function'&&localPredictionActive()?'乡镇市区':levelLabel(state.level);
 let identity='';
 if(state.level==='council'){
  const visible=typeof localPredictionActive==='function'&&localPredictionActive()&&state.county?'all':typeof councilVisibleIdentity==='function'?councilVisibleIdentity():'all';
  if(visible!=='all')identity=({regional:'区域选区',plains:'平地少数民族选区',mountain:'山地少数民族选区'})[visible]||'';
 }
 if(state.level==='legislative'&&!(typeof legislativeFourPanelsActive==='function'&&legislativeFourPanelsActive())){
  const visible=activeElectorate();
  if(visible!=='regional')identity=({party:'不分区政党',plains:'平地少数民族选区',mountain:'山地少数民族选区'})[visible]||'';
 }
 return[state.county||'全台',office,layer,identity].filter(Boolean).join(' · ');
}
let resetScope='';
function requestResetConfirmation(scope){
 resetScope=scope;
 const all=scope==='all';
 $('confirmResetTitle').textContent=all?'恢复地图初始状态？':'清空当前界面地图数据？';
 $('confirmResetMessage').textContent=all
  ?'将清除本机保存的全部预测、乡镇预测、手动填色、投票记录、自定义政党与党徽、图例调整及地图显示设置，并恢复默认视图。此操作不可撤销。网站内置候选人名单、2022历史选举结果和地图底图不会被删除。'
  :'将清除「'+currentResetScopeLabel()+'」当前可见范围内的预测记录，或当前图层的填色与投票数据。其他县市、选举类别、选区类型及未显示图层的数据会保留；此操作可通过撤销恢复。';
 $('confirmReset').textContent=all?'确认恢复初始状态':'确认清空当前范围';
 $('resetChoiceDialog').close();
 $('confirmDialog').showModal();
}
$('reset').onclick=()=>$('resetChoiceDialog').showModal();
$('cancelResetChoice').onclick=()=>$('resetChoiceDialog').close();
$('chooseCurrentReset').onclick=()=>requestResetConfirmation('current');
$('chooseAllReset').onclick=()=>requestResetConfirmation('all');
$('cancelReset').onclick=()=>{$('confirmDialog').close();resetScope=''};
$('confirmReset').onclick=()=>{
 const scope=resetScope;resetScope='';$('confirmDialog').close();
 if(scope==='all'){
  state=defaults();undo.length=0;redo.length=0;view=null;baseView=null;erase=false;electionResultCache.clear();
  if(typeof customLogo!=='undefined'){customLogo='';$('customPartyLogo').value='';renderCustomLogo();$('customPartyForm').hidden=true;$('customPartyError').textContent=''}
  syncInputs();render();persist();toast('已恢复地图初始状态；内置候选人与历史资料保留');return;
 }
 if(scope!=='current')return;
 const removed=clearCurrentMapData();
 if(!removed){toast('当前界面没有可清空的数据');return}
 erase=false;syncInputs();render();persist();toast('已清空当前界面数据，共移除 '+removed+' 项；可点击撤销恢复')
};
function download(blob,name){const a=document.createElement('a'),url=URL.createObjectURL(blob);a.href=url;a.download=name;a.style.display='none';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000)}
const filename=()=>((state.title||((state.county||'全台')+'地图填色')).replace(/[\\/:*?"<>|]/g,'_').slice(0,80));
$('saveProject').onclick=()=>{download(new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),filename()+'.json');toast('方案已保存，可在其他设备打开')};$('loadProject').onclick=()=>$('projectFile').click();$('projectFile').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>10000000)throw Error('方案文件过大');const next=cleanProject(JSON.parse(await file.text()));if(next.county&&!data.counties.some(f=>f.name===next.county))throw Error('方案中的县市未找到');pushHistory();state=next;erase=false;syncInputs();render();persist();toast('已打开地图方案')}catch(err){toast(err.message||'无法读取方案')}finally{e.target.value=''}};
function exportPredictionWinnerRows(){
 if(!state.exportSettings.winnerTable||state.fillMode!=='prediction'||typeof predictionUsesVoteDisplay==='function'&&predictionUsesVoteDisplay()||typeof predictionDistricts!=='function'||typeof directoryCandidates!=='function'||typeof predictionSummary!=='function')return[];
 const rows=[];for(const d of predictionDistricts()){if(exportPanelFilter&&state.level==='council'&&DistrictCore.identity(d)!==exportPanelFilter)continue;const summary=predictionSummary(d);if(summary.status!=='complete')continue;const record=state.predictions[d.id];if(!record?.winners?.length)continue;const winnerIds=new Set(record.winners),district=state.county?(d.county===d.name?d.county:shortDirectoryName(d)):(d.county===d.name?d.county:d.county+' · '+shortDirectoryName(d));for(const c of directoryCandidates(d))if(winnerIds.has(c.id)){const party=predictionParty(c.party);rows.push({district,number:c.number||'待补',name:candidateDisplayName(c),gender:c.gender||'待补',party:c.party,color:party.color,logo:logoFor(party),incumbent:c.incumbent===true?'现任':''})}}
 return rows
}
function exportTextWidth(value){let n=0;for(const c of Array.from(String(value||'')))n+=/[\u0000-\u00ff]/.test(c)?.55:1;return n}
function truncateExportText(value,max){const text=String(value||'');if(exportTextWidth(text)<=max)return text;let out='',width=0;for(const c of Array.from(text)){const step=/[\u0000-\u00ff]/.test(c)?.55:1;if(width+step>max-1)break;out+=c;width+=step}return out+'…'}
function wrapExportText(value,max=82){const lines=[];for(const paragraph of String(value||'').split(/\r?\n/)){if(!paragraph){lines.push('');continue}let line='',width=0;for(const token of paragraph.match(/[A-Za-z0-9]+(?:[’'-][A-Za-z0-9]+)*|[\s\S]/gu)||[]){for(const part of exportTextWidth(token)>max?Array.from(token):[token]){const step=exportTextWidth(part);if(line&&width+step>max){lines.push(line);line='';width=0}line+=part;width+=step}}if(line)lines.push(line)}return lines}
function appendExportNote(root,lines,y){if(!lines.length)return 0;const height=26+lines.length*19;root.append(svgEl('rect',{x:40,y,width:1120,height,rx:10,fill:'#f3f7f3',stroke:'#e0e8e1','stroke-width':1}));const label=svgEl('text',{x:60,y:y+21,'font-size':11,'font-weight':600,fill:'#557064'});label.textContent='说明';root.append(label);lines.forEach((line,index)=>{const text=svgEl('text',{x:102,y:y+21+index*19,'font-size':11.5,fill:'#60766b'});text.textContent=line;root.append(text)});return height}
function exportPredictionTableLayout(rows){
 const columns=rows.length<=28?1:rows.length<=90?2:rows.length<=260?3:4,font=columns===1?12.5:11.5,lineHeight=font*1.45,rowHeight=34,gap=20;
 const width=Math.max(1120,columns*570+gap*(columns-1)+40),blockWidth=(width-40-gap*(columns-1))/columns,chunk=Math.ceil(rows.length/columns),headers=['选区','号次','姓名','性别','政党','是否现任'];
 const longest=key=>Math.max(0,...rows.map(row=>exportTextWidth(row?.[key])));
 const fixed=[52,47,65],flexWidth=blockWidth-fixed.reduce((n,v)=>n+v,0),desired=[Math.max(120,Math.min(215,longest('district')*font+24)),Math.max(110,Math.min(185,longest('name')*font+24)),Math.max(170,Math.min(260,longest('party')*font+52))],sum=desired.reduce((n,v)=>n+v,0);
 const widths=[flexWidth*desired[0]/sum,fixed[0],flexWidth*desired[1]/sum,fixed[1],flexWidth*desired[2]/sum,fixed[2]];
 const blocks=Array.from({length:columns},(_,column)=>rows.slice(column*chunk,(column+1)*chunk).map(row=>{
  const values=[row?.district,row?.number,row?.name,row?.gender,row?.party,row?.incumbent];
  const cells=values.map((value,i)=>wrapExportText(value,Math.max(1,(widths[i]-(i===4?55:16))/font)));
  const height=Math.max(rowHeight,Math.max(...cells.map(lines=>lines.length))*lineHeight+18);
  return{row,cells,height};
 })),bodyHeight=Math.max(rowHeight,...blocks.map(block=>rowHeight+block.reduce((n,r)=>n+r.height,0))),height=bodyHeight+79;
 return{columns,rowHeight,font,lineHeight,gap,width,blockWidth,widths,chunk,headers,blocks,height};
}
function appendExportPredictionTable(root,rows,y){
 if(!rows.length)return 0;const layout=exportPredictionTableLayout(rows),card=svgEl('g',{'data-export-winner-table':'true'});root.append(card);card.append(svgEl('rect',{x:40,y,width:layout.width,height:layout.height,rx:14,fill:'#fff',stroke:'#dce5df','stroke-width':1.2}));const heading=svgEl('text',{x:60,y:y+31,'font-size':19,'font-weight':600,fill:'#294a3a'});heading.textContent='预测当选候选人';card.append(heading);const summary=svgEl('text',{x:layout.width+20,y:y+30,'font-size':11,fill:'#718376','text-anchor':'end'});summary.textContent=`已预测 ${new Set(rows.map(r=>r.district)).size} 个选区 · ${rows.length} 人`;card.append(summary);card.append(svgEl('line',{x1:60,y1:y+46,x2:layout.width+20,y2:y+46,stroke:'#e5ece6'}));
 const bodyY=y+59,{widths}=layout;for(let column=0;column<layout.columns;column++){const block=layout.blocks[column];if(!block.length)continue;const x=60+column*(layout.blockWidth+layout.gap),xs=[x],blockHeight=layout.rowHeight+block.reduce((n,r)=>n+r.height,0);for(const w of widths)xs.push(xs.at(-1)+w);card.append(svgEl('rect',{x,y:bodyY,width:layout.blockWidth,height:blockHeight,rx:7,fill:'#fff',stroke:'#dfe8e1','stroke-width':1}));card.append(svgEl('path',{d:`M${x},${bodyY+7}Q${x},${bodyY} ${x+7},${bodyY}H${x+layout.blockWidth-7}Q${x+layout.blockWidth},${bodyY} ${x+layout.blockWidth},${bodyY+7}V${bodyY+layout.rowHeight}H${x}Z`,fill:'#edf5f0'}));
  layout.headers.forEach((label,i)=>{const text=svgEl('text',{x:xs[i]+widths[i]/2,y:bodyY+layout.rowHeight/2+layout.font*.35,'font-size':layout.font,'font-weight':600,fill:'#466253','text-anchor':'middle'});text.textContent=label;card.append(text)});
  let rowY=bodyY+layout.rowHeight;for(const [index,{row,cells,height}]of block.entries()){const group=svgEl('g',{'data-export-winner-row':'true'});card.append(group);if(index%2)group.append(svgEl('rect',{x:x+.5,y:rowY,width:layout.blockWidth-1,height,fill:'#f8fbf9'}));group.append(svgEl('line',{x1:x,y1:rowY,x2:x+layout.blockWidth,y2:rowY,stroke:'#e7eee9','stroke-width':.7}));
   cells.forEach((lines,i)=>{const tx=xs[i]+widths[i]/2+(i===4?12:0),text=svgEl('text',{x:tx,y:rowY+height/2-(lines.length-1)*layout.lineHeight/2+layout.font*.35,'font-size':layout.font,fill:i===2?'#294a3a':'#536d5f','font-weight':i===2?600:400,'text-anchor':'middle'});for(const [lineIndex,line]of lines.entries()){const span=svgEl('tspan',{x:tx,dy:lineIndex?layout.lineHeight:0});span.textContent=line;text.append(span)}group.append(text)});
   group.append(svgEl('rect',{x:xs[4]+9,y:rowY+height/2-7,width:3,height:14,rx:1.5,fill:row.color}));if(row.logo)appendCircularPartyLogo(group,row.logo,xs[4]+15,rowY+height/2-8,16,{'data-export-party-logo':'true'});rowY+=height
  }
  for(let i=1;i<widths.length;i++)card.append(svgEl('line',{x1:xs[i],y1:bodyY,x2:xs[i],y2:bodyY+blockHeight,stroke:'#e7eee9','stroke-width':.7}))
 }
 return layout.height
}
function exportSvg(){
 const spec=sceneSpec(),winnerRows=exportPredictionWinnerRows(),tableLayout=winnerRows.length?exportPredictionTableLayout(winnerRows):null,exportWidth=tableLayout?tableLayout.width+80:1200,contentWidth=exportWidth-80,contentHeight=Math.round(contentWidth*spec.height/spec.width),annotationLines=String(state.exportSettings.note||'').trim()?wrapExportText(state.exportSettings.note.trim()):[],noteHeight=annotationLines.length?26+annotationLines.length*19:0,mapY=annotationLines.length?88+noteHeight:78,tableY=mapY+contentHeight+40,height=winnerRows.length?tableY+tableLayout.height+32:mapY+contentHeight+72,root=svgEl('svg',{xmlns:NS,width:exportWidth,height,viewBox:`0 0 ${exportWidth} ${height}`});root.append(svgEl('rect',{width:exportWidth,height,fill:'#ffffff'}));const style=svgEl('style');style.textContent='path{stroke-linejoin:round}text{font-family:"Microsoft YaHei","PingFang SC",Arial,sans-serif}';root.append(style);
 const title=svgEl('text',{x:60,y:54,fill:'#294a3a','font-size':26,'font-weight':500});title.textContent=state.title||(state.fillMode==='prediction'?'2026 '+directoryOfficeName[state.predictionOffice]+'预测地图':$('scopeTitle').textContent);root.append(title);
 if(annotationLines.length)appendExportNote(root,annotationLines,72);const map=svgEl('svg',{x:40,y:mapY,width:contentWidth,height:contentHeight,viewBox:`0 0 ${spec.width} ${spec.height}`,preserveAspectRatio:'xMidYMid meet'});for(const id of ['predictionPatterns','insetFrames','regions','townBorders','districtBorders','borders','labels','mapFurniture','legend']){if(id==='labels'&&!state.labels)continue;if(!$(id))continue;const g=$(id).cloneNode(true);g.removeAttribute('id');if(id==='labels'&&identityPanelsActive())drawIdentityPanelLabels(g,false,true);else if(id==='labels'&&state.level!=='villages')drawLabels(g,currentItems(),geometryLayout(currentItems(),true),sceneSpec().font,false);else if(id==='labels'&&state.level==='villages')drawVillageLabels(g,currentItems(),geometryLayout(currentItems(),true),fittedView(),false);map.append(g)}root.append(map);if(winnerRows.length)appendExportPredictionTable(root,winnerRows,tableY);
 return new XMLSerializer().serializeToString(root)
}
function preparedExportSvg(){const oldFilter=exportPanelFilter,oldLegend=state.legend.show,oldCouncilView=state.councilViewScope;state.councilViewScope='all';exportPanelFilter=state.level==='council'&&state.exportSettings.councilScope!=='all'?state.exportSettings.councilScope:'';state.legend.show=true;render();try{return exportSvg()}finally{exportPanelFilter=oldFilter;state.legend.show=oldLegend;state.councilViewScope=oldCouncilView;render()}}
function exportFilename(){const suffix=state.level==='council'&&state.exportSettings.councilScope!=='all'?'_'+electorateName(state.exportSettings.councilScope):'';return filename()+suffix}
$('exportWinnerTable').onchange=()=>{state.exportSettings.winnerTable=$('exportWinnerTable').checked;persist()};$('exportNote').oninput=()=>{state.exportSettings.note=simplify($('exportNote').value).trim().slice(0,500);persist()};$('councilExportScope').onchange=()=>{state.exportSettings.councilScope=$('councilExportScope').value;persist()};$('exportSvg').onclick=async()=>{try{await ensureExportMapReady();download(new Blob([preparedExportSvg()],{type:'image/svg+xml;charset=utf-8'}),exportFilename()+'.svg');toast('SVG 矢量图已导出，包含比例尺、指北针和对应图例')}catch(e){toast(e.message||'SVG 导出失败')}};$('exportPng').onclick=async()=>{const b=$('exportPng');b.disabled=true;const old=b.textContent;b.textContent='正在导出…';let url;try{await ensureExportMapReady();const source=preparedExportSvg(),doc=new DOMParser().parseFromString(source,'image/svg+xml'),height=Number(doc.documentElement.getAttribute('height')),width=Number(doc.documentElement.getAttribute('width'));if(!width||!height)throw Error('图片尺寸无效');const scale=Math.min(3,Math.floor(16000/Math.max(width,height)),Math.floor(Math.sqrt(55000000/(width*height))));if(scale<1)throw Error('图片过大，请取消当选名单表格，或使用 SVG 矢量图完整导出');url=URL.createObjectURL(new Blob([source],{type:'image/svg+xml;charset=utf-8'}));const img=new Image();img.src=url;await new Promise((ok,no)=>{img.onload=ok;img.onerror=no});const c=document.createElement('canvas');c.width=width*scale;c.height=height*scale;const ctx=c.getContext('2d');if(!ctx)throw Error('设备无法创建图片画布，请改用 SVG');ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(img,0,0,c.width,c.height);const blob=await new Promise(ok=>c.toBlob(ok,'image/png'));if(!blob)throw Error('图片生成失败，请改用 SVG');download(blob,exportFilename()+'.png');toast(scale===3?'已导出 3 倍清晰度 PNG 图片':'大图已自动调整为 '+scale+' 倍清晰度 PNG')}catch(e){toast(e.message||'导出失败，请尝试导出 SVG 矢量图')}finally{if(url)URL.revokeObjectURL(url);b.disabled=false;b.textContent=old}};
// Load only the map layers the current user actually opens.
const detailRequests=Object.create(null);
function loadMapDetail(name,url,apply){
 if(detailRequests[name])return detailRequests[name];
 detailRequests[name]=fetch(url).then(r=>{if(!r.ok)throw Error('地图资料下载失败：'+name);return r.json()}).then(value=>{apply(value);render();return true}).catch(e=>{delete detailRequests[name];toast(e.message||'地图数据载入失败，请刷新页面');return false});
 return detailRequests[name];
}
function ensureMapDetails(){
 if(!data)return;
 const layer=state.level;
 if(layer==='council'&&!data.council.length)loadMapDetail('议员选区','assets/map-council.json?v=20261031-split-v25',part=>{if(!Array.isArray(part.council)||part.council.length!==161||!Array.isArray(part.councilIndigenous)||part.councilIndigenous.length!==60)throw Error('议员选区数据不完整');data.council=part.council;data.councilIndigenous=part.councilIndigenous;});
 if(layer==='legislative'&&!data.legislative.length)loadMapDetail('立法机构民代选区','assets/map-legislative.json?v=20261031-split-v25',part=>{if(!Array.isArray(part.legislative)||part.legislative.length!==73||!Array.isArray(part.legislativeIndigenous))throw Error('立法机构民代数据不完整');data.legislative=part.legislative;data.legislativeIndigenous=part.legislativeIndigenous;for(const f of data.legislative)if(data.legislative.filter(x=>x.county===f.county).length===1)f.name=f.county;});
 if(['council','legislative'].includes(layer)&&!Object.keys(data.districtBorders).length)loadMapDetail('选区边界','assets/map-district-borders.json?v=20261031-split-v25',part=>{if(!part.council||!part.legislative)throw Error('选区边界数据不完整');data.districtBorders=part;});
 if(['council','legislative','villages'].includes(layer)&&!data.townBorders.all.length)loadMapDetail('乡镇边界','assets/map-town-borders.json?v=20261031-split-v25',part=>{if(!Array.isArray(part)||part.length!==22)throw Error('乡镇边界数据不完整');data.townBorders={all:part};});
 if(layer==='villages'&&!data.villages.length&&!detailRequests.villages){
  detailRequests.villages=Promise.all([1,2,3,4,5].map(n=>fetch('assets/map-villages-'+n+'.json?v=20261031-split-v25').then(r=>{if(!r.ok)throw Error('村里地图资料下载失败');return r.json()}))).then(parts=>{const rows=parts.flat();if(rows.length!==data.villageMetadata.count)throw Error('村里边界数据不完整');data.villages=rows;render();return true}).catch(e=>{delete detailRequests.villages;toast(e.message||'村里地图载入失败');return false});
 }
}
// Export never uses an incomplete lazy-loaded layer or a blank initial map.
async function ensureExportMapReady(){
 if(!data)await mapPromise;
 if(!data)throw Error('地图尚未载入完成，请稍后重试');
 if(typeof localPredictionActive==='function'&&localPredictionActive()&&state.predictionOffice==='council'){
  if(!await ensureTownPredictionAreas())throw Error('议员乡镇地图资料未能载入');
 }
 ensureMapDetails();
 const required=state.level==='council'?['议员选区','选区边界','乡镇边界']:state.level==='legislative'?['立法机构民代选区','选区边界','乡镇边界']:state.level==='villages'?['villages','乡镇边界']:[];
 const finished=await Promise.all(required.map(n=>detailRequests[n]||Promise.resolve(true)));
 if(finished.some(ok=>ok!==true))throw Error('地图边界资料载入失败，请重试或刷新页面');
 if(state.level==='council'&&(data.council.length!==161||data.councilIndigenous.length!==60))throw Error('议员选区资料尚未完整载入');
 if(state.level==='legislative'&&(data.legislative.length!==73||data.legislativeIndigenous.length!==2))throw Error('立法机构民代选区资料尚未完整载入');
 if(state.level==='villages'&&data.villages.length!==data.villageMetadata.count)throw Error('村里地图资料尚未完整载入');
 if(['council','legislative','villages'].includes(state.level)&&data.townBorders.all.length!==22)throw Error('乡镇边界资料尚未完整载入');
 if(['council','legislative'].includes(state.level)&&!Object.keys(data.districtBorders).length)throw Error('选区边界资料尚未完整载入');
 if(!currentItems().length)throw Error('当前地图没有可导出的地理区域');
}
const mapPromise=$('embeddedMap')?new Promise(resolve=>{const ready=()=>resolve(JSON.parse($('embeddedMap').textContent));if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ready,{once:true});else ready()}):fetch('assets/map-base.json?v=20261031-split-v25').then(r=>{if(!r.ok)throw Error('地图未找到');return r.json()});
mapPromise.then(d=>{data=d;for(const f of d.legislative)if(d.legislative.filter(x=>x.county===f.county).length===1)f.name=f.county;for(const f of [...d.counties].sort((a,b)=>COUNTY_ORDER.indexOf(a.name)-COUNTY_ORDER.indexOf(b.name))){const o=document.createElement('option');o.value=f.name;o.textContent=f.name;$('county').append(o)}if(state.county&&!d.counties.some(f=>f.name===state.county))state.county='';syncInputs();render()}).catch(e=>{$('loadError').hidden=false;$('progress').textContent='地图载入失败';console.error(e)});

for(const p of PARTY_PRESETS){const o=document.createElement('option');o.value=p.id;o.textContent=p.name;$('partyPreset').append(o)}
$('partyPreset').onchange=()=>{const preset=PARTY_PRESETS.find(p=>p.id===$('partyPreset').value);if(!preset)return;const found=state.palette.find(p=>partyMatch(p.name)?.id===preset.id);if(found){setBrush(found.id);toast('已选择'+preset.name)}else{pushHistory();const id='party-'+preset.id;state.palette.push({id,name:preset.name,color:preset.color});setBrush(id);renderLegend();persist();toast('已添加'+preset.name)}$('partyPreset').value=''};
$('applyStandard').onclick=()=>{pushHistory();for(const p of state.palette){const preset=partyMatch(p.name);if(preset){p.name=preset.name;p.color=preset.color}}renderPalette();recolor();renderLegend();renderList();persist();toast('已按指定模板应用政党标准配色')};

const borderControls=[['boundaryColor','borderColor'],['boundaryHex','borderColor'],['boundaryWidth','borderWidth'],['countyBoundaryColor','countyBorderColor'],['countyBoundaryHex','countyBorderColor'],['countyBoundaryWidth','countyBorderWidth'],['townBoundaryColor','townBorderColor'],['townBoundaryHex','townBorderColor'],['townBoundaryWidth','townBorderWidth']];
function syncBorderControls(){
 $('primaryBoundaryLabel').textContent=levelLabel(state.level)+'边界';
 $('countyBoundarySettings').hidden=state.level==='counties';$('townBoundarySettings').hidden=!['legislative','council','villages'].includes(state.level);$('showTownBoundaries').checked=state.showTownBoundaries;
 for(const [id,key]of borderControls)$(id).value=id.endsWith('Hex')?state[key].toUpperCase():state[key];
 $('boundaryWidthValue').value=Number(state.borderWidth).toFixed(1)+' px';
 $('countyBoundaryWidthValue').value=Number(state.countyBorderWidth).toFixed(1)+' px';$('townBoundaryWidthValue').value=Number(state.townBorderWidth).toFixed(1)+' px';
}
function applyBorders(){
 for(const [selector,color,width]of [['#regions path',['council','legislative'].includes(state.level)?'none':state.borderColor,state.borderWidth],['#districtBorders path',state.borderColor,state.borderWidth],['#borders path',state.countyBorderColor,state.countyBorderWidth],['#townBorders path',state.townBorderColor,state.townBorderWidth]])
 for(const p of document.querySelectorAll(selector)){p.setAttribute('stroke',color);p.setAttribute('stroke-width',width);p.style.stroke=color;p.style.strokeWidth=width;}
 $('townBorders').style.display=state.showTownBoundaries?'':'none';syncBorderControls();
}
for(const [id,key]of borderControls){let edited=false;$(id).addEventListener('focus',()=>edited=false);$(id).addEventListener('pointerdown',()=>edited=false);$(id).addEventListener('input',()=>{const value=$(id).value;if(id.endsWith('Hex')&&!/^#[\da-f]{6}$/i.test(value))return;if(!edited){pushHistory();edited=true}state[key]=id.endsWith('Width')?Number(value):value;applyBorders();persist()});$(id).addEventListener('change',()=>syncBorderControls())}

function toggleCustomParty(open){if(state.palette.length>=64)return toast('最多可添加64个类别');const form=$('customPartyForm');form.hidden=typeof open==='boolean'?!open:!form.hidden;$('customPartyError').textContent='';if(!form.hidden)$('customPartyName').focus()}
$('showCustomParty').onclick=()=>toggleCustomParty();$('cancelCustomParty').onclick=()=>toggleCustomParty(false);
$('customPartyColor').oninput=()=>$('customPartyHex').value=$('customPartyColor').value.toUpperCase();
$('customPartyHex').oninput=()=>{if(/^#[\da-f]{6}$/i.test($('customPartyHex').value))$('customPartyColor').value=$('customPartyHex').value};
$('customPartyForm').onsubmit=e=>{e.preventDefault();const name=simplify($('customPartyName').value.trim()),color=$('customPartyHex').value.trim();if(!name){$('customPartyError').textContent='请填写政党名称';return}if(!/^#[\da-f]{6}$/i.test(color)){$('customPartyError').textContent='请填写有效的六位颜色色码';return}const existing=state.palette.find(p=>p.name===name);if(existing){$('customPartyError').textContent='这个名称已在图例中，请使用不同名称';return}if(state.palette.length>=64){$('customPartyError').textContent='最多可添加64个类别';return}pushHistory();const id='custom-'+(crypto.randomUUID?.()||Date.now().toString());state.palette.push({id,name,color,...(customLogo?{logo:customLogo}:{})});customLogo='';$('customPartyLogo').value='';renderCustomLogo();setBrush(id);renderLegend();renderList();persist();$('customPartyName').value='';toggleCustomParty(false);toast('已添加并选中：'+name)};

// Election data and editable legend controls.
function sanitizeElectionState(out,s){
 out.fillMode=['gradient','prediction'].includes(s.fillMode)?s.fillMode:'solid';
 out.electorate=Object.fromEntries(['council','legislative'].map(k=>[k,['regional','plains','mountain'].includes(s.electorate?.[k])?s.electorate[k]:'regional']));
 out.predictionRegion=/^(mayor|council|township):[0-9:]{5,30}$/.test(s.predictionRegion||'')?s.predictionRegion:'';
 out.workspaceMode=s.workspaceMode==='prediction'||s.fillMode==='prediction'?'prediction':'free';
 out.predictionOffice=['mayor','council','township'].includes(s.predictionOffice)?s.predictionOffice:'mayor';out.predictionDisplay=['composition','seats','leader','share','votes','partyShare','partyVotes','winnerShare','winnerVotes','candidateShare','candidateVotes','topVote','partyTop','candidateVote'].includes(s.predictionDisplay)?s.predictionDisplay:'composition';out.predictionScale=s.predictionScale==='town'?'town':'district';out.councilViewScope=['all','regional','plains','mountain'].includes(s.councilViewScope)?s.councilViewScope:'all';out.localPredictions=typeof TownPredictionCore!=='undefined'?TownPredictionCore.sanitizeAll(s.localPredictions):{};out.localPredictionDisplay=['composition','leader','share','votes','partyShare','partyVotes','candidateShare','candidateVotes','topVote','partyTop','candidateVote'].includes(s.localPredictionDisplay||s.predictionDisplay)?s.localPredictionDisplay||s.predictionDisplay:'';out.localDisplayCandidate=String(s.localDisplayCandidate||'').slice(0,80);out.localTown=/^\d{8}$/.test(s.localTown||'')?s.localTown:'';out.predictions={};
 for(const [id,r]of Object.entries(s.predictions||{})){if(!/^(mayor|council|township):[0-9:]{5,30}$/.test(id))continue;const winners=[...new Set(r.winners||[])].filter(x=>typeof x==='string'&&x.length<80).slice(0,100),estimates={};for(const [cid,e]of Object.entries(r.estimates||{})){if(cid.length>80)continue;const votes=PredictionCore.number(e.votes),share=PredictionCore.number(e.share,true);if(votes!==null||share!==null)estimates[cid]={votes,share}}out.predictions[id]={winners,estimates,note:String(r.note||'').slice(0,300),method:r.method==='ranking'?'ranking':'manual',updatedAt:String(r.updatedAt||'').slice(0,40)}}

 out.gradient={groupBy:s.gradient?.groupBy==='party'?'party':'candidate',metric:s.gradient?.metric==='votes'?'votes':'share',min:0,max:null,marginManual:s.gradient?.marginManual===true};
 const min=Number(s.gradient?.min);if(Number.isFinite(min)&&min>=0)out.gradient.min=min;
 if(s.gradient?.max!==null&&s.gradient?.max!==undefined&&s.gradient?.max!==''){const max=Number(s.gradient.max);if(Number.isFinite(max)&&max>out.gradient.min&&(out.gradient.metric==='votes'||out.fillMode==='prediction'&&['votes','partyVotes','winnerVotes','candidateVotes'].includes(out.predictionDisplay)||max<=100))out.gradient.max=max;else out.gradient.min=0;}
 if(out.gradient.metric==='share'&&out.gradient.min>=100)out.gradient.min=0;
 out.legend={show:s.legend?.show!==false,onlyUsed:s.legend?.onlyUsed!==false,fontSize:Math.max(9,Math.min(22,Number(s.legend?.fontSize)||12)),caption:String(s.legend?.caption||'').slice(0,80),hidden:Array.isArray(s.legend?.hidden)?s.legend.hidden.filter(id=>out.palette.some(p=>p.id===id)):[]};
 out.exportSettings={winnerTable:s.exportSettings?.winnerTable!==false,note:simplify(String(s.exportSettings?.note||'')).trim().slice(0,500),councilScope:['all','regional','plains','mountain'].includes(s.exportSettings?.councilScope)?s.exportSettings.councilScope:'all'};
 out.elections=Object.fromEntries(LEVELS.map(level=>[level,{}]));
 for(const level of LEVELS)for(const [id,record]of Object.entries(s.elections?.[level]||{})){
  if(!/^[0-9]{5,11}(?:-[0-9]{2})?$/.test(id))continue;
  const r=ElectionCore.validate(record);for(const row of r.rows)if(!out.palette.some(p=>p.id===row.partyId))throw Error('投票数据引用了不存在的颜色类别');
  if(r.rows.length)out.elections[level][id]={totalVotes:r.totalVotes,rows:r.rows};
 }
 return out;
}
const electionResultCache=new Map();
function regionResult(f){const record=state.elections[state.level][f.id],key=[state.level,f.id,state.gradient.groupBy,state.gradient.metric].join('/'),old=electionResultCache.get(key);if(old&&old.record===record)return old.result;const result=ElectionCore.summarize(record,state.gradient.groupBy,state.gradient.metric);electionResultCache.set(key,{record,result});return result}
function gradientDomain(){const min=Number(state.gradient.min)||0,auto=state.gradient.metric==='share'?100:Math.max(1,...currentItems().map(f=>{const r=regionResult(f);return r.status==='winner'?r.value:0}));return{min,max:state.gradient.max===null?Math.max(min+1,auto):state.gradient.max}}
function metricText(n){if(state.fillMode==='prediction')return predictionMarginMode()?String(Number(n.toFixed(2))):predictionIsVotes()?Math.round(n).toLocaleString('zh-CN')+' 票':Number(n.toFixed(2))+'%';return state.gradient.metric==='share'?Number(n.toFixed(2))+'%':Math.round(n).toLocaleString('zh-CN')+' 票'}
function regionDetail(f){
 if(state.fillMode==='prediction'&&typeof predictionRegionDetail==='function')return predictionRegionDetail(f);
 if(state.fillMode!=='gradient')return paletteById(featureFillId(f))?.name||'未填色';
 const r=regionResult(f);if(r.status!=='winner')return r.message;
 const p=paletteById(r.leader.partyId);return(state.gradient.groupBy==='party'?p?.name:r.leader.name+' · '+p?.name)+' · '+metricText(r.value);
}
function shownLabel(f){if(f.name==='乌坵'||f.name==='乌坵乡')return'';const identity=identityPanelsActive()?featureElectorate(f):activeElectorate();if(['council','legislative'].includes(state.level)&&identity!=='regional')return state.county?f.name:f.county==='\u5168\u56fd'?f.name:f.county+f.name.replace(/^第/, '第');if(state.level==='legislative'&&data.legislative.filter(x=>x.county===f.county).length===1)return f.county;return !state.county&&['council','legislative'].includes(state.level)?f.county+f.number:f.name}
function legendReserveEntries(){return legendEntries()}
function legendVisiblePalette(){const palette=[...state.palette];if(state.fillMode==='prediction'&&typeof predictionPartyNamesInUse==='function')for(const name of predictionPartyNamesInUse()){const party=predictionParty(name);if(!palette.some(p=>p.id===party.id))palette.push(party)}return palette.filter(p=>!state.legend.hidden.includes(p.id))}
function legendEntries(){if(state.fillMode==='prediction'&&typeof predictionCandidateLegendEntries==='function'){const entries=predictionCandidateLegendEntries();if(entries)return entries}const c=counts();return legendVisiblePalette().filter(p=>c[p.id])}
function legendTotalSeats(){
 const office=state.fillMode==='prediction'?state.predictionOffice:state.level==='council'?'council':state.level==='legislative'?'legislative':null;
 if(!office)return null;
 const districts=office==='legislative'?(typeof DISTRICT_DETAILS!=='undefined'?DISTRICT_DETAILS.legislative||[]:[]):state.fillMode==='prediction'?(typeof candidateDatabase!=='undefined'&&candidateDatabase?.districts?candidateDatabase.districts.filter(d=>d.type===office):[]):(typeof DISTRICT_DETAILS!=='undefined'?DISTRICT_DETAILS.council||[]:[]);
 const selected=office==='council'&&state.level==='council'?councilVisibleIdentity():'all';
 const relevant=districts.filter(d=>(!state.county||d.county===state.county)&&(selected==='all'||(d.electorate==='plainsIndigenous'?'plains':d.electorate==='mountainIndigenous'?'mountain':'regional')===selected));
 if(!districts.length)return null;
 // Legislative indigenous seats are nationwide seats, not repeated for each county.
 return relevant.reduce((sum,d)=>sum+(Number(d.seats)||((office==='mayor'||office==='township')?1:0)),0);
}
function legendMetrics(entries=legendEntries()){
 const wide=isNationwide(),font=state.legend.fontSize*(wide?1.4:1),width=wide?350:280,labelX=Math.max(63,44+font*1.6),limit=Math.max(4,Math.floor((width-labelX-18)/font)),gradient=state.fillMode==='gradient'||state.fillMode==='prediction'&&predictionUsesGradient();
 const rows=entries.map(p=>{const predictionLabel=Object.hasOwn(p,'legendSuffix')?p.name+p.legendSuffix:p.name+'（'+(counts()[p.id]||0)+(typeof predictionLegendCountUnit==='function'?predictionLegendCountUnit():predictionUsesVoteDisplay()?'区':'席')+'）',chars=Array.from(state.fillMode==='prediction'?predictionLabel:p.name),lines=[];for(let i=0;i<chars.length;i+=limit)lines.push(chars.slice(i,i+limit).join(''));return{p,lines,height:Math.max(font*1.85,lines.length*font*1.4+10)+(gradient?font*3.4:0)}});
 const title=Array.from(state.legendTitle||'图例'),titleLimit=Math.max(4,Math.floor((width-36)/(font+1))),titleLines=[];for(let i=0;i<title.length;i+=titleLimit)titleLines.push(title.slice(i,i+titleLimit).join(''));
 // Prediction legends show only the count of currently displayed electoral areas.
 // Keep the candidates, party emblems and color-bin labels, but omit explanatory prose.
 const captionText=state.fillMode==='prediction'
  ?'总共'+new Set(currentItems().map(f=>f.townId||f.sourceId||f.id)).size+(state.predictionOffice==='mayor'&&typeof mayorLegendUnit==='function'?mayorLegendUnit():'个选区')
  :state.legend.caption||'';
 const caption=Array.from(captionText),captionLines=[],captionLimit=Math.max(5,Math.floor((width-36)/(font*.8)));for(let i=0;i<caption.length;i+=captionLimit)captionLines.push(caption.slice(i,i+captionLimit).join(''));
 const headerHeight=Math.max(48,titleLines.length*(font+1)*1.3+22)+captionLines.length*font*1.25;
 const statuses=gradient?currentItems().map(f=>state.fillMode==='prediction'?(typeof predictionMapResult==='function'?predictionMapResult(f):{status:typeof predictionDisplayResult==='function'&&predictionDisplayResult(predictionDistrictFor(f))?'winner':'missing'}):regionResult(f)):[],tie=statuses.some(r=>r.status==='tie'),missing=statuses.some(r=>!['winner','tie'].includes(r.status)),showGradientHint=gradient&&state.fillMode!=='prediction',footerHeight=(tie?font*1.7:0)+(missing?font*1.7:0)+(showGradientHint?font*1.4:0);
 return{font,width,labelX,rows,titleLines,captionLines,headerHeight,gradient,tie,missing,showGradientHint,footerHeight,height:headerHeight+rows.reduce((n,r)=>n+r.height,0)+footerHeight};
}
function legendBox(spec){if(!state.legend.show)return{x:spec.width,y:spec.height,width:0,height:0};const m=legendMetrics(legendReserveEntries());return{x:spec.width-m.width-30,y:spec.height-furnitureFooterHeight()-6,...m}}
function drawLegend(group,spec,interactive=false){
 group.replaceChildren();if(!state.legend.show)return;
 const m=legendMetrics(),box=legendBox(spec),x=box.x,y=box.y,domain=m.gradient?(state.fillMode==='prediction'?predictionDomain():gradientDomain()):{min:0,max:100};
 group.append(svgEl('rect',{x,y,width:m.width,height:m.height,rx:12,fill:'#fff',stroke:'#dce5df','stroke-width':1}));
 const heading=svgEl('text',{x:x+18,y:y+27,'font-size':m.font+1,'font-weight':600,fill:'#294a3a'});m.titleLines.forEach((line,i)=>{const t=svgEl('tspan',{x:x+18,dy:i?(m.font+1)*1.3:0});t.textContent=line;heading.append(t)});group.append(heading);
 let cy=y+27+(m.titleLines.length-1)*(m.font+1)*1.3+m.font*1.5;
 for(const line of m.captionLines){const t=svgEl('text',{x:x+18,y:cy,'font-size':m.font*.8,fill:'#728477'});t.textContent=line;group.append(t);cy+=m.font*1.25;}
 group.append(svgEl('line',{x1:x+18,y1:y+m.headerHeight-10,x2:x+m.width-18,y2:y+m.headerHeight-10,stroke:'#e5ece6'}));
 let rowY=y+m.headerHeight;
 for(const row of m.rows){const g=svgEl('g',{'data-legend-party':row.p.id});g.append(svgEl('rect',{x:x+18,y:rowY+4,width:m.font,height:m.font,rx:3,fill:row.p.color}));
  const emblem=logoFor(row.p);if(emblem)appendCircularPartyLogo(g,emblem,x+36,rowY,m.font*1.6,{'data-party-logo':row.p.id});const txt=svgEl('text',{x:x+m.labelX,y:rowY+m.font+2,'font-size':m.font,fill:'#466253'});row.lines.forEach((line,i)=>{const t=svgEl('tspan',{x:x+m.labelX,dy:i?m.font*1.4:0});t.textContent=line;txt.append(t)});g.append(txt);
  if(m.gradient){
  const gy=rowY+row.lines.length*m.font*1.4+7,barHeight=m.font*1.4,barWidth=m.width-36;
  if(state.fillMode==='prediction'&&predictionMarginMode()){
   // Match the actual fixed-band colors used by the map, instead of a 0-100% gradient.
   const samples=[0,3,8,13,18,23,27,30],labels=ElectionCore.marginBandLabels;
   for(let i=0;i<samples.length;i++){
    const x0=x+18+barWidth*i/samples.length,w=barWidth/samples.length;
    g.append(svgEl('rect',{x:x0,y:gy,width:w,height:barHeight,
     fill:ElectionCore.marginShade(row.p.color,samples[i]),stroke:'#ffffff','stroke-width':.5,
     'data-margin-band':labels[i],'data-margin-party':row.p.id}));
    const text=svgEl('text',{x:x0+w/2,y:gy+m.font*2.55,'font-size':m.font*.64,fill:'#597467','text-anchor':'middle'});
    text.textContent=labels[i];g.append(text);
   }
  }else{
   const id='gradient-'+row.p.id.replace(/[^a-z0-9_-]/gi,'_'),defs=svgEl('defs'),grad=svgEl('linearGradient',{id,x1:'0%',x2:'100%',y1:'0%',y2:'0%'});
   // Sample the exact nonlinear map color scale instead of linearly blending its endpoints.
   for(let step=0;step<=10;step++){
    const fraction=step/10,value=domain.min+(domain.max-domain.min)*fraction;
    grad.append(svgEl('stop',{offset:(fraction*100)+'%','stop-color':ElectionCore.shade(row.p.color,value,domain.min,domain.max)}));
   }
   defs.append(grad);
   g.append(defs,svgEl('rect',{x:x+18,y:gy,width:barWidth,height:barHeight,rx:4,fill:`url(#${id})`,'data-gradient-bar':row.p.id}));
   const voteMetric=state.fillMode==='prediction'?predictionIsVotes():state.gradient.metric==='votes';
   const stops=voteMetric?[0,.5,1]:[0,.25,.5,.75,1];
   for(const fraction of stops){
    const value=domain.min+(domain.max-domain.min)*fraction,tx=x+18+barWidth*fraction;
    if(fraction>0&&fraction<1)g.append(svgEl('line',{x1:tx,x2:tx,y1:gy+1,y2:gy+barHeight-1,stroke:'#526355','stroke-width':1,opacity:.33}));
    const label=svgEl('text',{x:tx,y:gy+m.font*2.55,'font-size':m.font*.72,fill:'#597467','text-anchor':fraction===0?'start':fraction===1?'end':'middle'});
    label.textContent=metricText(value);g.append(label);
   }
  }}
  if(interactive&&state.fillMode==='solid'){g.setAttribute('role','button');g.setAttribute('tabindex','0');g.setAttribute('aria-label','选择'+row.p.name+'画笔');g.style.cursor='pointer';g.onclick=()=>setBrush(row.p.id);g.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setBrush(row.p.id)}}}group.append(g);rowY+=row.height;
 }
 if(m.gradient){for(const [show,color,label]of [[m.tie,'#aebdb4','并列最高'],[m.missing,'#edf1e9','缺少可用数据']]){if(!show)continue;group.append(svgEl('rect',{x:x+18,y:rowY+2,width:m.font*.8,height:m.font*.8,rx:2,fill:color,stroke:'#b5c3b8','stroke-width':.5}));const t=svgEl('text',{x:x+35,y:rowY+m.font*.8,'font-size':m.font*.8,fill:'#718376'});t.textContent=label;group.append(t);rowY+=m.font*1.7}if(m.showGradientHint){const t=svgEl('text',{x:x+18,y:rowY+m.font*.75,'font-size':m.font*.72,fill:'#8a9a8e'});t.textContent='浅色 → 深色：数值由低到高';group.append(t)}}
}
function syncElectionControls(){
 $('solidMode').classList.toggle('active',state.fillMode==='solid');$('gradientMode').classList.toggle('active',state.fillMode==='gradient');$('solidMode').setAttribute('aria-pressed',state.fillMode==='solid');$('gradientMode').setAttribute('aria-pressed',state.fillMode==='gradient');$('gradientControls').hidden=state.fillMode!=='gradient';if(typeof syncPredictionControls==='function')syncPredictionControls();syncElectorateControls();
 $('gradientGroup').value=state.gradient.groupBy;$('gradientMetric').value=state.gradient.metric;$('gradientMin').value=state.gradient.min;$('gradientMax').value=state.gradient.max===null?(state.gradient.metric==='share'?100:''):state.gradient.max;$('gradientUnit').textContent=state.gradient.metric==='share'?'%':'票';
 $('mapVersionNote').textContent='';$('mapVersionNote').hidden=true;
 if(state.level==='villages')$('mapVersionNote').textContent='7,731 个村里图形 · taiwan-atlas 1.0.2 快照，非实时行政区划；放大或筛选乡镇查看名称。';syncVillageControls();$('electionScopeNote').hidden=true;
 if(!data)return;const select=$('dataRegion'),previous=select.value;select.replaceChildren();for(const f of currentItems()){const o=document.createElement('option');o.value=f.id;o.textContent=f.county+(f.name===f.county?'':' · '+(f.town||'')+f.name);select.append(o)}if(currentItems().some(f=>f.id===previous))select.value=previous;
 const usable=currentItems().filter(f=>regionResult(f).status==='winner').length;$('dataCoverage').textContent=state.fillMode==='gradient'?`当前视图 ${usable} / ${currentItems().length} 个区域有可用渐变数据`:'';
}
let editRegionId='',editRegionLevel='',voteDraft=[];
function draftRecord(){
 const sum=PredictionCore.tallyVotes(voteDraft.map(row=>row.votes));
 $('validVoteTotal').value=sum.total===null?'—':String(sum.total);
 $('voteTotalStatus').textContent=sum.total===null?'仅填写得票率时无法计算有效票总数':sum.complete?'全部已录入候选人票数合计':'已填写票数合计，尚未填齐全部候选人';
 return{totalVotes:sum.total,rows:voteDraft.map(r=>({name:r.name,partyId:r.partyId,votes:r.votes,share:r.share}))}
}
function previewVoteDraft(){try{const record=draftRecord(),valid=ElectionCore.validate(record),result=ElectionCore.summarize(record,state.gradient.groupBy,state.gradient.metric);$('voteError').textContent=result.status==='invalid'?result.message:'';$('votePreview').textContent=result.status==='winner'?'已录入最高票：'+(state.gradient.groupBy==='party'?paletteById(result.leader.partyId)?.name:result.leader.name)+' · '+metricText(result.value):result.message;if(valid.derivedTotal)$('votePreview').textContent+='；得票率按已录入得票合计计算';}catch(e){$('voteError').textContent=e.message;$('votePreview').textContent=''}}
function renderVoteRows(){const body=$('voteRows');body.replaceChildren();voteDraft.forEach((r,i)=>{const tr=document.createElement('tr');for(const key of ['name','partyId','votes','share']){const td=document.createElement('td'),input=key==='partyId'?document.createElement('select'):document.createElement('input');if(key==='partyId'){for(const p of state.palette){const o=document.createElement('option');o.value=p.id;o.textContent=p.name;input.append(o)}}else{input.type=['votes','share'].includes(key)?'number':'text';if(key==='name')input.maxLength=80;if(['votes','share'].includes(key)){input.min='0';input.step=key==='votes'?'1':'0.01';if(key==='share')input.max='100';input.inputMode=key==='votes'?'numeric':'decimal';input.onfocus=()=>{if(input.value==='0')input.select()}}}input.value=r[key]??(['votes','share'].includes(key)?'0':'');input.setAttribute('aria-label',`第${i+1}条${{name:'候选人',partyId:'政党',votes:'得票数',share:'得票率'}[key]}`);input.oninput=()=>{r[key]=input.value;previewVoteDraft()};td.append(input);tr.append(td)}const td=document.createElement('td'),remove=document.createElement('button');remove.type='button';remove.textContent='删除';remove.setAttribute('aria-label',`删除第${i+1}条数据`);remove.onclick=()=>{voteDraft.splice(i,1);renderVoteRows();previewVoteDraft()};td.append(remove);tr.append(td);body.append(tr)});}
function openVoteEditor(f){
 editRegionId=f.id;editRegionLevel=state.level;$('dataRegion').value=f.id;const record=state.elections[state.level][f.id];voteDraft=clone(record?.rows||[{name:'',partyId:state.selected,votes:null,share:null}]);$('voteDialogTitle').textContent=f.county+(f.name===f.county?'':' · '+(f.town||'')+f.name);$('voteError').textContent='';renderVoteRows();previewVoteDraft();if(typeof syncCandidateRosterButton==='function')syncCandidateRosterButton(f);$('voteDialog').showModal();
}
function afterElectionEdit(){recolor();renderPalette();renderLegend();renderList();updateProgress();updateBrush();persist()}
$('editVoteData').onclick=()=>{const f=currentItems().find(f=>f.id===$('dataRegion').value)||currentItems()[0];if(f)openVoteEditor(f)};
$('addVoteRow').onclick=()=>{voteDraft.push({name:'',partyId:state.selected,votes:null,share:null});renderVoteRows();previewVoteDraft()};
$('cancelVoteEdit').onclick=()=>$('voteDialog').close();
$('saveVoteEdit').onclick=()=>{try{const valid=ElectionCore.validate(draftRecord()),record={totalVotes:valid.totalVotes,rows:valid.rows},r=ElectionCore.summarize(record,state.gradient.groupBy,state.gradient.metric);if(r.status==='invalid')throw Error(r.message);pushHistory();if(valid.rows.length)state.elections[editRegionLevel][editRegionId]=record;else delete state.elections[editRegionLevel][editRegionId];$('voteDialog').close();afterElectionEdit();toast('区域数据已保存')}catch(e){$('voteError').textContent=e.message}};
$('clearVoteEdit').onclick=()=>{voteDraft=[];renderVoteRows();previewVoteDraft()};
for(const [id,mode]of [['solidMode','solid'],['gradientMode','gradient']])$(id).onclick=()=>{if(state.fillMode===mode)return;pushHistory();state.fillMode=mode;syncElectionControls();render();persist()};
for(const [id,key]of [['gradientGroup','groupBy'],['gradientMetric','metric']])$(id).onchange=()=>{pushHistory();state.gradient[key]=$(id).value;if(key==='metric'){state.gradient.min=0;state.gradient.max=state.gradient.metric==='share'?100:null;}syncElectionControls();render();persist()};
$('applyGradientRange').onclick=()=>{try{const min=ElectionCore.number($('gradientMin').value,state.gradient.metric==='share')??0;let max=$('gradientMax').value.trim()===''?(state.gradient.metric==='share'?100:null):Number($('gradientMax').value);if(!Number.isFinite(min)||min<0||(max!==null&&(!Number.isFinite(max)||max<=min))||(state.gradient.metric==='share'&&(min>=100||max>100)))throw Error('请填写有效范围：上限大于下限，得票率在 0%—100% 之间');pushHistory();state.gradient.min=min;state.gradient.max=max;$('gradientRangeError').textContent='';render();persist()}catch(e){$('gradientRangeError').textContent=e.message}};
function csvCell(v){v=String(v??'');if(/^[=+@\t\r-]/.test(v))v="'"+v;return'"'+v.replace(/"/g,'""')+'"'}
function exportVoteCSV(template=false){const rows=[['选区代码','县市','选区','候选人','政党','得票数','得票率(%)','有效票总数']];for(const f of currentItems()){const r=state.elections[state.level][f.id];if(template||!r?.rows.length){rows.push([f.id,f.county,(f.town||'')+f.name,'','','','',''])}else for(const row of r.rows)rows.push([f.id,f.county,(f.town||'')+f.name,row.name,paletteById(row.partyId)?.name||'',row.votes,row.share,r.totalVotes]);}download(new Blob(['\uFEFF'+rows.map(r=>r.map(csvCell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}),levelLabel(state.level)+(template?'数据模板':'投票数据')+'.csv')}
$('downloadVoteTemplate').onclick=()=>exportVoteCSV(true);$('exportVoteData').onclick=()=>exportVoteCSV(false);$('importVoteData').onclick=()=>$('voteCsvFile').click();
let pendingVoteImport=null;
function normalizePlace(s){return simplify(String(s||'')).replace(/臺/g,'台').replace(/选举区/g,'选区').replace(/\s/g,'').replace(/第0+(\d)/g,'第$1')}
function prepareVoteImport(text){
 const raw=ElectionCore.csv(text);if(raw.length<2)throw Error('CSV 至少需要表头和一条数据');if(raw.length>50001)throw Error('一次最多导入 50000 条记录');
 const headers=raw[0].map(s=>normalizePlace(s).replace(/[()（）%]/g,'')),col=(...names)=>headers.findIndex(h=>names.includes(h)),cols={id:col('选区代码','区域代码','id','code'),county:col('县市','county'),region:col('选区','区域','乡镇市区','region'),name:col('候选人','候选人姓名','name'),party:col('政党','党派','party'),votes:col('得票数','票数','votes'),share:col('得票率','share'),total:col('有效票总数','有效票','total')};
 if(cols.id<0&&cols.region<0)throw Error('CSV 需要“选区代码”或“选区”列');if(cols.party<0)throw Error('CSV 需要“政党”列');if(cols.votes<0&&cols.share<0)throw Error('CSV 需要“得票数”或“得票率”列');
 const palette=clone(state.palette),records={},errors=[];let imported=0;
 for(let i=1;i<raw.length;i++){const row=raw[i],get=k=>cols[k]<0?'':(row[cols[k]]||'').trim();if(!get('votes')&&!get('share')&&!get('name')&&!get('party'))continue;try{if(!get('votes')&&!get('share'))throw Error('请填写得票数或得票率');let matches=allLayerItems().filter(f=>get('id')?f.id===get('id'):normalizePlace(f.name)===normalizePlace(get('region'))||normalizePlace(f.county+f.name)===normalizePlace(get('region'))||normalizePlace((f.town||'')+f.name)===normalizePlace(get('region'))||normalizePlace(f.county+(f.town||'')+f.name)===normalizePlace(get('region')));if(get('county'))matches=matches.filter(f=>f.statewide||normalizePlace(f.county)===normalizePlace(get('county')));if(matches.length!==1)throw Error(matches.length?'同名区域需要填写县市或选区代码':'未找到对应区域，请下载当前图层的模板');const f=matches[0],party=simplify(get('party'));if(!party)throw Error('政党不能为空');if(party.length>40)throw Error('政党名称不能超过40个字符');const matchedPreset=partyMatch(party);let p=palette.find(p=>normalizePlace(p.name)===normalizePlace(party)||(matchedPreset&&(p.id===matchedPreset.id||partyMatch(p.name)?.id===matchedPreset.id)));if(!p){if(palette.length>=64)throw Error('政党/颜色类别超过64个');const preset=partyMatch(party);p={id:'import-'+palette.length+'-'+Date.now().toString(36),name:party,color:preset?.color||'#607d8b'};palette.push(p)}const record=records[f.id]||(records[f.id]={totalVotes:null,rows:[]}),total=ElectionCore.number(get('total'));if(total!==null){if(record.totalVotes!==null&&record.totalVotes!==total)throw Error('同一区域的有效票总数不一致');record.totalVotes=total;}record.rows.push({name:get('name'),partyId:p.id,votes:ElectionCore.number(get('votes')),share:ElectionCore.number(get('share'),true)});imported++;}catch(e){errors.push(`第 ${i+1} 行：${e.message}`)}}
 for(const [id,r]of Object.entries(records)){try{ElectionCore.validate(r);const result=ElectionCore.summarize(r,state.gradient.groupBy,state.gradient.metric);if(result.status==='invalid')throw Error(result.message)}catch(e){errors.push(`${allLayerItems().find(f=>f.id===id)?.name}：${e.message}`)}}
 if(!imported&&!errors.length)throw Error('没有可导入的数值，请先填写模板');return{palette,records,errors,imported,level:state.level};
}
$('voteCsvFile').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>10000000)throw Error('CSV 不能超过10MB');pendingVoteImport=prepareVoteImport(await file.text());const p=pendingVoteImport;$('importSummary').textContent=`${p.imported} 条记录，${Object.keys(p.records).length} 个区域。导入会替换这些区域的全部数据，其他区域保留。`;$('importErrors').textContent=p.errors.slice(0,20).join('\n');$('confirmVoteImport').disabled=!!p.errors.length;$('voteImportDialog').showModal();}catch(err){toast(err.message)}finally{e.target.value=''}};
$('cancelVoteImport').onclick=()=>{pendingVoteImport=null;$('voteImportDialog').close()};$('confirmVoteImport').onclick=()=>{const p=pendingVoteImport;if(!p||p.errors.length)return;pushHistory();state.palette=p.palette;Object.assign(state.elections[p.level],p.records);state.fillMode='gradient';$('voteImportDialog').close();pendingVoteImport=null;syncInputs();render();persist();toast('数据已导入，得票着色地图已更新')};
let legendDraft=[];
function renderLegendEditor(){const list=$('legendEditRows');list.replaceChildren();legendDraft.forEach(p=>{const row=document.createElement('div');row.className='legend-edit-row';const show=document.createElement('input');show.type='checkbox';show.checked=!p.hidden;show.setAttribute('aria-label','显示'+p.name+'图例');show.onchange=()=>p.hidden=!show.checked;const color=document.createElement('input');color.type='color';color.value=p.color;color.setAttribute('aria-label','图例颜色 '+p.name);color.oninput=()=>p.color=color.value;const name=document.createElement('input');name.value=p.name;name.maxLength=40;name.setAttribute('aria-label','图例名称 '+p.name);name.oninput=()=>p.name=name.value;row.append(show,color,name);const logoBox=document.createElement('div');logoBox.className='legend-logo-edit';const emblem=logoFor(p);if(emblem){const img=document.createElement('img');img.src=emblem;img.alt=p.name+'党徽';logoBox.append(img)}const upload=document.createElement('label');upload.className='logo-upload-label';upload.textContent=emblem?'更换党徽':'上传党徽';const file=document.createElement('input');file.type='file';file.accept='image/png,image/jpeg,image/webp,image/svg+xml';file.setAttribute('aria-label','上传'+p.name+'党徽');file.onchange=async()=>{try{p.logo=await readLogo(file.files[0]);renderLegendEditor()}catch(e){toast(e.message)}};upload.append(file);const remove=document.createElement('button');remove.textContent='移除';remove.type='button';remove.disabled=!emblem;remove.setAttribute('aria-label','移除'+p.name+'党徽');remove.onclick=()=>{p.logo='';renderLegendEditor()};logoBox.append(upload,remove);row.append(logoBox);list.append(row)})}
$('editLegend').onclick=()=>{legendDraft=state.palette.map(p=>({...p,hidden:state.legend.hidden.includes(p.id)}));$('legendDisplay').checked=state.legend.show;$('legendFont').value=state.legend.fontSize;$('legendCaption').value=state.legend.caption;$('legendDialogTitle').value=state.legendTitle;renderLegendEditor();$('legendDialog').showModal()};
$('cancelLegendEdit').onclick=()=>$('legendDialog').close();$('saveLegendEdit').onclick=()=>{if(legendDraft.some(p=>!p.name.trim()))return toast('图例名称不能为空');if(new Set(legendDraft.map(p=>normalizePlace(p.name))).size!==legendDraft.length)return toast('图例名称不能重复');pushHistory();state.palette=legendDraft.map(({hidden,...p})=>({...p,name:simplify(p.name.trim())}));state.legend={show:$('legendDisplay').checked,onlyUsed:true,fontSize:Math.max(9,Math.min(22,Number($('legendFont').value)||12)),caption:simplify($('legendCaption').value).slice(0,80),hidden:legendDraft.filter(p=>p.hidden).map(p=>p.id)};state.legendTitle=simplify($('legendDialogTitle').value)||'图例';$('legendDialog').close();syncInputs();render();persist();toast('图例已更新，导出图片将使用相同图例')};

// Village detail level and locally embedded party emblems.
let villageLabelFrame=0,customLogo='';
function cleanLogo(value){if(value==='')return'';if(typeof value!=='string'||value.length>180000||!/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(value))throw Error('党徽必须是内置的 PNG、JPG 或 WebP 图片');return value}
function logoFor(p){if(Object.hasOwn(p,'logo'))return p.logo;const id=PARTY_PRESETS.find(x=>x.id===p.id||'party-'+x.id===p.id)?.id||partyMatch(p.name)?.id;return typeof PARTY_LOGOS!=='undefined'?PARTY_LOGOS[id]||'':''}
async function readLogo(file){if(!file)throw Error('请选择图片');if(file.size>2*1024*1024)throw Error('党徽图片不能超过 2 MB');if(!['image/png','image/jpeg','image/webp','image/svg+xml'].includes(file.type))throw Error('请选择 PNG、JPG、WebP 或 SVG 图片');const url=URL.createObjectURL(file);try{const image=new Image();await new Promise((ok,no)=>{image.onload=ok;image.onerror=()=>no(Error('图片无法读取，请换一张图片'));image.src=url});if(image.naturalWidth>4096||image.naturalHeight>4096||!image.naturalWidth)throw Error('图片尺寸须在 4096 × 4096 以内');const c=document.createElement('canvas');c.width=c.height=128;
 const ctx=c.getContext('2d');if(!ctx)throw Error('浏览器不支持党徽裁剪');
 const scale=Math.max(128/image.naturalWidth,128/image.naturalHeight);
 ctx.clearRect(0,0,128,128);
 ctx.beginPath();ctx.arc(64,64,64,0,Math.PI*2);ctx.closePath();ctx.clip();
 ctx.drawImage(image,(128-image.naturalWidth*scale)/2,(128-image.naturalHeight*scale)/2,image.naturalWidth*scale,image.naturalHeight*scale);
 return cleanLogo(c.toDataURL('image/png'))}catch(e){throw Error(e.message||'无法转换党徽图片')}finally{URL.revokeObjectURL(url)}}
function renderCustomLogo(){$('customLogoPreview').hidden=!customLogo;$('customLogoImage').src=customLogo||''}
$('customPartyLogo').onchange=async e=>{try{customLogo=await readLogo(e.target.files[0]);$('customPartyError').textContent='';renderCustomLogo()}catch(err){e.target.value='';$('customPartyError').textContent=err.message}};
$('removeCustomLogo').onclick=()=>{customLogo='';$('customPartyLogo').value='';renderCustomLogo()};
function syncVillageControls(){if(!data)return;$('villageTownControls').hidden=state.level!=='villages';$('districtLeaderControls').hidden=!['council','legislative'].includes(state.level);$('districtLeaders').checked=state.districtLeaders;const select=$('villageTown');select.replaceChildren();const all=document.createElement('option');all.value='';all.textContent='全部乡镇市区';select.append(all);for(const f of data.towns.filter(f=>!state.county||f.county===state.county)){const o=document.createElement('option');o.value=f.id;o.textContent=(state.county?'':f.county+' · ')+f.name;select.append(o)}if(![...select.options].some(o=>o.value===state.villageTown))state.villageTown='';select.value=state.villageTown}
$('villageTown').onchange=()=>{state.villageTown=$('villageTown').value;render();persist()};
$('districtLeaders').onchange=()=>{state.districtLeaders=$('districtLeaders').checked;renderLabels();persist()};
function drawVillageLabels(group,items,t,v,interactive=false){group.replaceChildren();if(items.length<=120){drawLabels(group,items,t,8,interactive);return}const pixelWidth=Math.max(500,$('map').getBoundingClientRect().width),font=interactive?Math.max(1,v.w/pixelWidth*11):9,occupied=[],reserve=legendBox(sceneSpec()),area=contentArea(sceneSpec());const visible=items.filter(f=>{const b=f.box.map((n,i)=>n*t.scale+(i%2?t.ty:t.tx));return b[2]>v.x&&b[0]<v.x+v.w&&b[3]>v.y&&b[1]<v.y+v.h&&b[2]-b[0]>f.name.length*font&&b[3]-b[1]>font*1.5}).sort((a,b)=>(b.box[2]-b.box[0])*(b.box[3]-b.box[1])-(a.box[2]-a.box[0])*(a.box[3]-a.box[1]));for(const f of visible){if(occupied.length>=350)break;const x=f.center[0]*t.scale+t.tx,y=f.center[1]*t.scale+t.ty,w=f.name.length*font,h=font*1.45,r=[x-w/2,y-h/2,x+w/2,y+h/2];if(r[0]<area.left||r[2]>area.right||r[1]<area.top||r[3]>area.bottom||x>reserve.x-10&&y>reserve.y-10||occupied.some(b=>r[0]<b[2]&&r[2]>b[0]&&r[1]<b[3]&&r[3]>b[1])||![-.5,0,.5].every(dx=>[-.5,0,.5].every(dy=>regionContains(f,x+w*dx,y+h*dy,t))))continue;occupied.push(r);const text=svgEl('text',{x,y,'font-size':font,'data-label':f.id,'data-placement':'inside','text-anchor':'middle','dominant-baseline':'middle',fill:'#2c493b',stroke:'#fff','stroke-width':font*.22,'paint-order':'stroke'});text.style.strokeWidth=font*.22;text.textContent=f.name;if(interactive){text.style.pointerEvents='auto';text.style.cursor='pointer';text.onclick=()=>paint(f)}group.append(text)}}

function moveParty(id,direction){const index=state.palette.findIndex(p=>p.id===id),next=index+direction;if(index<0||next<0||next>=state.palette.length)return;pushHistory();const scroll=$('palette').scrollTop;[state.palette[index],state.palette[next]]=[state.palette[next],state.palette[index]];renderPalette();renderLegend();persist();$('palette').scrollTop=scroll;[...$('palette').children].find(row=>row.dataset.party===id)?.querySelector('.party-drag-handle')?.focus({preventScroll:true})}

function renderTownBorders(){const group=$('townBorders');group.replaceChildren();if(!['legislative','council','villages'].includes(state.level))return;const town=state.level==='villages'&&state.villageTown?data.towns.find(f=>f.id===state.villageTown):null;if(town){group.append(svgEl('path',{d:town.d,fill:'none','vector-effect':'non-scaling-stroke','data-town':town.id}));return}const mesh=data.townBorders.all.filter(f=>!state.county||f.county===state.county);if(identityPanelsActive()){for(const panel of identityPanelLayouts()){const layer=svgEl('g',{'data-electorate':panel.identity,transform:transformOf(panel.t)});for(const edge of mesh)layer.append(svgEl('path',{d:edge.d,fill:'none','vector-effect':'non-scaling-stroke','data-town-county':edge.county}));group.append(layer)}return}for(const edge of mesh)group.append(svgEl('path',{d:edge.d,fill:'none','vector-effect':'non-scaling-stroke','data-town-county':edge.county}))}
$('showTownBoundaries').onchange=()=>{pushHistory();state.showTownBoundaries=$('showTownBoundaries').checked;applyBorders();persist()};

$('electorate').onchange=()=>{pushHistory();state.electorate[state.level]=$('electorate').value;syncInputs();render();persist()};
