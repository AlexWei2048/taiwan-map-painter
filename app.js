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
const defaults=()=>({version:1,title:'',legendTitle:'图例',county:'',villageTown:'',districtLeaders:false,level:'counties',workspaceMode:'prediction',electorate:{council:'regional',legislative:'regional'},predictionOffice:'mayor',predictionDisplay:'composition',predictionCandidateScope:'topVote',predictionVoteMetric:'share',predictionScale:'district',councilViewScope:'all',localPredictions:{},localPredictionDisplay:'',localDisplayCandidate:'',localTown:'',predictions:{},labels:true,borderColor:'#80978d',borderWidth:0.6,countyBorderColor:'#385d4b',countyBorderWidth:1.5,townBorderColor:'#b6c4ba',townBorderWidth:0.4,showTownBoundaries:true,selected:'blue',palette:presetPalette(),settingsRevision:2,paletteRevision:3,fills:{towns:{},counties:{},council:{},legislative:{},villages:{}},legislativeTownFills:{party:{},plains:{},mountain:{}},fillMode:'prediction',gradient:{groupBy:'candidate',metric:'share',min:0,max:null,marginManual:false},legend:{show:true,onlyUsed:false,fontSize:12,caption:'',hidden:[]},exportSettings:{winnerTable:true,note:'',councilScope:'all',layout:'complete'},elections:{towns:{},counties:{},council:{},legislative:{},villages:{}}});
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
function projectStateForSave(){return state}
function persist(){clearTimeout(persistTimer);persistTimer=setTimeout(()=>{try{localStorage.setItem(KEY,JSON.stringify(projectStateForSave()));const when=new Date().toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'});$('saved').textContent='● 已保存 '+when;$('saved').title='只保存在本机（'+when+'），请定期下载备份';}catch(e){$('saved').textContent='自动保存失败，请下载方案';$('saved').title='浏览器存储可能不足';}},140)}
window.addEventListener('pagehide',()=>{clearTimeout(persistTimer);try{localStorage.setItem(KEY,JSON.stringify(projectStateForSave()))}catch(e){/* browser storage unavailable */}});
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
// The mayoral town-boundary layer is a county election map with township
// boundaries overlaid; it is not the separate town-by-town forecast scale.
function mayorTownBoundaryOverlay(){
 return state.workspaceMode==='prediction'&&state.fillMode==='prediction'&&
  state.predictionOffice==='mayor'&&state.level==='towns'&&state.predictionScale==='overlay'&&!state.county;
}
function activeLayerItems(){if(mayorTownBoundaryOverlay())return data.counties;if(legislativeFourPanelsActive())return[...allLayerItems().filter(f=>featureElectorate(f)==='regional'),...LEGISLATIVE_FREE_ORDER.slice(1).flatMap(legislativeTownItems)];if(identityPanelsActive())return allLayerItems().filter(f=>state.level!=='council'||councilVisibleIdentity()==='all'||featureElectorate(f)===councilVisibleIdentity());return['council','legislative'].includes(state.level)?allLayerItems().filter(f=>featureElectorate(f)===activeElectorate()):data[state.level]}
const currentItems=()=>typeof localPredictionActive==='function'&&localPredictionActive()?localPredictionItems():activeLayerItems().flatMap(f=>f.statewide&&state.county?[f.byCounty[state.county]].filter(Boolean):(!state.county||f.county===state.county)?[f]:[]).filter(f=>state.level!=='villages'||!state.villageTown||f.townId===state.villageTown);
function activeBorderKey(){return ['council','legislative'].includes(state.level)&&activeElectorate()!=='regional'?state.level+(activeElectorate()==='plains'?'Plains':'Mountain'):state.level}
function borderKeyForElectorate(id){return state.level+(id==='regional'?'':id==='plains'?'Plains':'Mountain')}
function syncElectorateControls(){$('electorateControls').hidden=true;$('electorate').value=activeElectorate();$('electorateNote').textContent=legislativeFourPanelsActive()?'区域、不分区政党、平地少数民族与山地少数民族四类在同一张图中显示。':'区域、平地少数民族与山地少数民族选区在同一张图中并列显示。'}

function featureFillId(f){return f.legislativeTown?state.legislativeTownFills[featureElectorate(f)]?.[f.sourceId]:state.fills[state.level][f.id]}
let fillColor=f=>{if(state.fillMode==='prediction'&&typeof predictionFill==='function')return predictionFill(f);if(state.fillMode!=='gradient')return paletteById(featureFillId(f))?.color||'#edf1e9';const r=regionResult(f);if(r.status==='tie')return'#aebdb4';if(r.status!=='winner')return'#edf1e9';const p=paletteById(r.leader.partyId),d=gradientDomain();return p?ElectionCore.shade(p.color,r.value,d.min,d.max):'#edf1e9'};
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
const isNationwide=()=>!state.county&&!mayorTownBoundaryOverlay()&&['towns','council','legislative'].includes(state.level)&&state.labels;
function councilVisibleIdentity(){return exportPanelFilter||(state.level==='council'&&state.workspaceMode==='prediction'&&state.fillMode==='prediction'?state.councilViewScope:'all')}
function panelIdentities(){const order=legislativeFourPanelsActive()?LEGISLATIVE_FREE_ORDER:ELECTORATE_ORDER,selected=state.level==='council'?councilVisibleIdentity():'all';return selected&&selected!=='all'?[selected]:order}
function furnitureFooterHeight(){return Math.max(126,state.legend.show?legendMetrics(legendReserveEntries()).height+48:0)}
function sceneSpec(){const panels=identityPanelsActive()?panelIdentities().length:0,base=panels===1?(state.county?{width:1200,height:900,pad:140,font:15}:{width:1800,height:2400,pad:250,font:10}):panels===4?(state.county?{width:2800,height:1500,pad:130,font:26}:{width:3200,height:2300,pad:180,font:28}):identityPanelsActive()?(state.county?{width:2400,height:1050,pad:120,font:26}:{width:3000,height:2100,pad:180,font:28}):isNationwide()?{width:1800,height:2400,pad:250,font:10}:{width:1200,height:900,pad:140,font:15};const n=data&&state.level==='villages'?currentItems().length:0;const townCount=directTownNameLabels()&&data?.towns?data.towns.reduce((count,f)=>count+(f.county===state.county),0):0;const calloutRoom=townCount>=35?180:townCount>=27?125:directTownNameLabels()?60:0;const mapHeight=Math.max(base.height+calloutRoom,n&&n<=120?n*8+220:0);return{...base,height:mapHeight+furnitureFooterHeight()}}
function contentArea(spec){return{left:45,right:spec.width-115,top:145,bottom:spec.height-furnitureFooterHeight()-28}}
function fittedView(){const s=sceneSpec();return{x:0,y:0,w:s.width,h:s.height}}
// Keep geometry movement cheap; expensive collision/leader layout runs only
// after navigation settles. Ordinary county/town labels move with the SVG.
let viewFrame=0,navigationLabelTimer=0;
function flushView(){
 if(viewFrame){cancelAnimationFrame(viewFrame);viewFrame=0}
 if(view)$('map').setAttribute('viewBox',`${view.x} ${view.y} ${view.w} ${view.h}`);
}
function scheduleNavigationLabels(){
 clearTimeout(navigationLabelTimer);
 navigationLabelTimer=setTimeout(()=>{navigationLabelTimer=0;renderLabels()},160);
}
function applyView(){
 if(!view)return;
 if(!viewFrame)viewFrame=requestAnimationFrame(()=>{viewFrame=0;flushView()});
 if(state.labels&&state.level==='villages')scheduleNavigationLabels();
}
function fit(){view=fittedView();baseView={...view};flushView();renderLabels()}

function geometryLayout(items,labels=true){if(!items.length)items=data.counties.filter(f=>!state.county||f.name===state.county);const spec=sceneSpec(),area=contentArea(spec),b=bounds(items);const visibleOutlines=state.level==='villages'&&state.villageTown?data.towns.filter(f=>f.id===state.villageTown):state.level!=='counties'?data.counties.filter(f=>!state.county||f.name===state.county):[];for(const outline of visibleOutlines){b[0]=Math.min(b[0],outline.box[0]);b[1]=Math.min(b[1],outline.box[1]);b[2]=Math.max(b[2],outline.box[2]);b[3]=Math.max(b[3],outline.box[3])}for(const q of activeInsetDefinitions()){b[0]=Math.min(b[0],q.box[0]);b[1]=Math.min(b[1],q.box[1]);b[2]=Math.max(b[2],q.box[2]);b[3]=Math.max(b[3],q.box[3])}const gutter=labels?(isNationwide()?250:state.level==='villages'?95:directTownNameLabels()?(mayorTownBoundaryOverlay()?90:116):state.level==='counties'||mayorTownBoundaryOverlay()?100:140):20,left=area.left+gutter,right=area.right-gutter,w=right-left,h=area.bottom-area.top,scale=Math.min(w/Math.max(.0001,b[2]-b[0]),h/Math.max(.0001,b[3]-b[1]));return{scale,tx:(left+right)/2-(b[0]+b[2])/2*scale,ty:(area.top+area.bottom)/2-(b[1]+b[3])/2*scale,labelLeft:left-22,labelRight:right+22,area}}
function identityPanelLayouts(){
 if(!identityPanelsActive()||!data)return[];
 const identities=panelIdentities(),spec=sceneSpec(),area=contentArea(spec),gap=26,left=area.left+8,right=area.right-8,top=area.top+52,bottom=area.bottom-12,columns=identities.length===4?2:identities.length,rows=Math.ceil(identities.length/columns),panelWidth=(right-left-gap*(columns-1))/columns,panelHeight=(bottom-top-gap*(rows-1))/rows;
 const geography=data.counties.filter(f=>!state.county||f.name===state.county),b=bounds(geography);for(const q of activeInsetDefinitions()){b[0]=Math.min(b[0],q.box[0]);b[1]=Math.min(b[1],q.box[1]);b[2]=Math.max(b[2],q.box[2]);b[3]=Math.max(b[3],q.box[3])}
 const mapPad=state.county?90:110,scale=Math.min((panelWidth-mapPad*2)/Math.max(.0001,b[2]-b[0]),(panelHeight-mapPad)/Math.max(.0001,b[3]-b[1]));
 return identities.map((identity,index)=>{const column=index%columns,row=Math.floor(index/columns),x=left+column*(panelWidth+gap),y=top+row*(panelHeight+gap),panelArea={left:x,right:x+panelWidth,top:y,bottom:y+panelHeight};return{identity,label:electorateName(identity),townLevel:legislativeFourPanelsActive()&&identity!=='regional',items:currentItems().filter(f=>featureElectorate(f)===identity),area:panelArea,t:{scale,tx:(panelArea.left+panelArea.right)/2-(b[0]+b[2])/2*scale,ty:(panelArea.top+panelArea.bottom+mapPad)/2-(b[1]+b[3])/2*scale,labelLeft:panelArea.left+8,labelRight:panelArea.right-8,area:panelArea}}})
}
function identityPanelFor(f){return identityPanelLayouts().find(p=>p.identity===featureElectorate(f))}
function transformOf(t){return `translate(${t.tx} ${t.ty}) scale(${t.scale})`}
const labelCanvas=document.createElement('canvas').getContext('2d'),labelPaths=new WeakMap();
function regionContains(f,x,y,t){let path=labelPaths.get(f);if(!path){path=new Path2D(f.d);labelPaths.set(f,path)}return labelCanvas.isPointInPath(path,(x-t.tx)/t.scale,(y-t.ty)/t.scale,'evenodd')}

function leaderFrames(t,pad=6){if(!t||!Number.isFinite(t.scale))return[];
 return activeInsetDefinitions().map(q=>[q.box[0]*t.scale+t.tx-pad,q.box[1]*t.scale+t.ty-pad,
 q.box[2]*t.scale+t.tx+pad,q.box[3]*t.scale+t.ty+pad]);}
function leaderIn(x,y,b){return x>=b[0]&&x<=b[2]&&y>=b[1]&&y<=b[3]}
function leaderOverlap(a,b){return a[0]<b[2]&&a[2]>b[0]&&a[1]<b[3]&&a[3]>b[1]}
function leaderCross(x,y,xx,yy,b){
 if(leaderIn(x,y,b)&&leaderIn(xx,yy,b))return false;
 let lo=0,hi=1;const dx=xx-x,dy=yy-y;
 for(const [p,q] of [[-dx,x-b[0]],[dx,b[2]-x],[-dy,y-b[1]],[dy,b[3]-y]]){
  if(!p){if(q<0)return false}else{const z=q/p;if(p<0){if(z>hi)return false;lo=Math.max(lo,z)}else{if(z<lo)return false;hi=Math.min(hi,z)}}
 }
 return lo<=hi;
}

/* A shared orthogonal callout router. Reject intersecting and overlapping
 * leader strokes, including parallel strokes on the same perimeter rail.
 * It checks existing name rectangles too: a line must never point through
 * someone else's name. The same geometry is used by county and town maps. */
function mapLeaderSegments(points){
 return points.slice(1).map((end,i)=>[points[i],end]);
}
function mapLeaderSegmentConflict(a,b,pad=1.0){
 const [[x1,y1],[x2,y2]]=a,[[u1,v1],[u2,v2]]=b;
 const ah=Math.abs(y1-y2)<.01,bh=Math.abs(v1-v2)<.01;
 const between=(v,p,q)=>v>=Math.min(p,q)-pad&&v<=Math.max(p,q)+pad;
 const overlap=(p,q,u,v)=>Math.min(Math.max(p,q),Math.max(u,v))>=Math.max(Math.min(p,q),Math.min(u,v))-pad;
 if(ah&&bh)return Math.abs(y1-v1)<pad&&overlap(x1,x2,u1,u2);
 if(!ah&&!bh)return Math.abs(x1-u1)<pad&&overlap(y1,y2,v1,v2);
 const h=ah?a:b,vert=ah?b:a;
 return between(vert[0][0],h[0][0],h[1][0])&&between(h[0][1],vert[0][1],vert[1][1]);
}
function mapLeaderRectIsClear(rect,leaders){
 const box=[rect[0]-.75,rect[1]-.75,rect[2]+.75,rect[3]+.75];
 return leaders.every(points=>mapLeaderSegments(points).every(([a,b])=>
  !leaderIn(a[0],a[1],box)&&!leaderIn(b[0],b[1],box)&&
  !leaderCross(a[0],a[1],b[0],b[1],box)));
}
function mapLeaderClear(points,leaders,occupied,frames=[],strokeGap=1){
 const segments=mapLeaderSegments(points);
 for(const segment of segments){
  if(Math.hypot(segment[1][0]-segment[0][0],segment[1][1]-segment[0][1])<.01)continue;
  for(const rect of occupied){
   const padded=[rect[0]-.75,rect[1]-.75,rect[2]+.75,rect[3]+.75];
   if(leaderIn(segment[0][0],segment[0][1],padded)||
    leaderIn(segment[1][0],segment[1][1],padded)||
    leaderCross(segment[0][0],segment[0][1],segment[1][0],segment[1][1],padded))return false;
  }
  for(const frame of frames)
   if(leaderCross(segment[0][0],segment[0][1],segment[1][0],segment[1][1],frame))return false;
  for(const previous of leaders)for(const other of mapLeaderSegments(previous))
   if(mapLeaderSegmentConflict(segment,other,strokeGap))return false;
 }
 return true;
}
function mapOrthogonalLeader(anchor,side,x,y,width,coast,leaders,occupied,area,frames=[],strokeGap=1){
 const sign=side==='left'?-1:1,end=x-sign*(width/2+6);
 // Leave the visual-centre dot fixed. A short optional vertical stub allows
 // nearby callouts to use independent lanes rather than sharing a stem.
 const departures=[0,-5,5,-10,10,-16,16,-24,24,-36,36,-50,50,-70,70];
 for(const delta of departures){
  const yy=anchor.y+delta;
  if(yy<area.top+3||yy>area.bottom-3)continue;
  for(let n=0;n<24;n++){
   const rail=coast+sign*(8+n*(strokeGap>1?4.6:3.4));
   if(sign*(end-rail)<5||rail<area.left+2||rail>area.right-2)continue;
   const points=delta?[[anchor.x,anchor.y],[anchor.x,yy],[rail,yy],[rail,y],[end,y]]:
    [[anchor.x,anchor.y],[rail,anchor.y],[rail,y],[end,y]];
   if(!mapLeaderClear(points,leaders,occupied,frames,strokeGap))continue;
   return{leaderPath:'M'+anchor.x+','+anchor.y+
    (delta?'V'+yy:'')+'H'+rail+'V'+y+'H'+end,leaderPoints:points};
  }
 }
 // Escape through a short orthogonal elbow if every direct perimeter
 // lane is occupied by existing names or other leaders.
 for(const distance of [12,24,-12,-24]){
  const elbow=anchor.x+sign*distance;
  if(elbow<area.left+3||elbow>area.right-3)continue;
  for(const delta of [-12,12,-26,26,-45,45]){
   const yy=anchor.y+delta;
   if(yy<area.top+3||yy>area.bottom-3)continue;
   for(let n=0;n<8;n++){
    const rail=coast+sign*(8+n*(strokeGap>1?4.6:3.4));
    if(sign*(end-rail)<5||rail<area.left+3||rail>area.right-3)continue;
    const points=[[anchor.x,anchor.y],[elbow,anchor.y],[elbow,yy],
     [rail,yy],[rail,y],[end,y]];
    if(!mapLeaderClear(points,leaders,occupied,frames,strokeGap))continue;
    return{leaderPath:'M'+anchor.x+','+anchor.y+'H'+elbow+'V'+yy+
     'H'+rail+'V'+y+'H'+end,leaderPoints:points};
   }
  }
 }
 return null;
}

// Deterministic orthogonal grid escape for names that cannot use a short
// coast rail. Previously drawn labels/lines are solid obstacles, so there
// is no ambiguous crossing and the original interior anchor never moves.
function mapGridLeaderRoute(anchor,side,x,y,width,leaders,occupied,area,frames=[],strokeGap=1){
 const sign=side==='left'?-1:1,end=x-sign*(width/2+6);
 for(const step of [5,3]){
  const left=area.left+2,top=area.top+2;
  const cols=Math.floor((area.right-left-2)/step)+1;
  const rows=Math.floor((area.bottom-top-2)/step)+1;
  if(cols<2||rows<2)continue;
  const total=cols*rows,block=new Uint8Array(total);
  const px=col=>left+col*step,py=row=>top+row*step;
  const mark=(r,pad)=>{
   const xa=Math.max(0,Math.ceil((r[0]-pad-left)/step));
   const xb=Math.min(cols-1,Math.floor((r[2]+pad-left)/step));
   const ya=Math.max(0,Math.ceil((r[1]-pad-top)/step));
   const yb=Math.min(rows-1,Math.floor((r[3]+pad-top)/step));
   for(let j=ya;j<=yb;j++)for(let i=xa;i<=xb;i++)block[j*cols+i]=1;
  };
  for(const rect of occupied)mark(rect,2);
  for(const rect of frames)if(!leaderIn(anchor.x,anchor.y,rect))mark(rect,3);
  for(const points of leaders)for(const [p,q] of mapLeaderSegments(points))
   mark([Math.min(p[0],q[0]),Math.min(p[1],q[1]),
    Math.max(p[0],q[0]),Math.max(p[1],q[1])],Math.max(3,strokeGap+1));
  const sx=Math.round((anchor.x-left)/step),sy=Math.round((anchor.y-top)/step);
  const ex=Math.round((end-left)/step),ey=Math.round((y-top)/step);
  if(sx<0||sx>=cols||ex<0||ex>=cols||sy<0||sy>=rows||ey<0||ey>=rows)continue;
  const start=sy*cols+sx,goal=ey*cols+ex;
  if(block[start]||block[goal])continue;
  const prev=new Int32Array(total);prev.fill(-1);
  const queue=new Int32Array(total),rank=new Uint8Array(total);
  let head=0,tail=1;queue[0]=start;prev[start]=start;rank[start]=0;
  while(head<tail&&prev[goal]===-1){
   const id=queue[head++],cx=id%cols,cy=Math.floor(id/cols);
   const horizontal=ex>=cx?1:-1,vertical=ey>=cy?cols:-cols;
   // Prefer paths that run sideways to the correct map perimeter.
   for(const delta of [horizontal,vertical,-vertical,-horizontal]){
    const nx=delta===1?cx+1:delta===-1?cx-1:cx;
    const ny=Math.abs(delta)===cols?cy+(delta>0?1:-1):cy;
    if(nx<0||nx>=cols||ny<0||ny>=rows)continue;
    const next=id+delta;
    if(prev[next]!==-1||block[next])continue;
    prev[next]=id;queue[tail++]=next;
    if(next===goal)break;
   }
  }
  if(prev[goal]===-1)continue;
  const chain=[];
  for(let id=goal;id!==start;id=prev[id])chain.push([px(id%cols),py(Math.floor(id/cols))]);
  chain.push([px(sx),py(sy)]);chain.reverse();
  const points=[[anchor.x,anchor.y],[chain[0][0],anchor.y],...chain,
   [chain.at(-1)[0],y],[end,y]];
  let reduced=[];
  for(const point of points){
   if(reduced.length&&Math.hypot(point[0]-reduced.at(-1)[0],point[1]-reduced.at(-1)[1])<.01)continue;
   const n=reduced.length;
   if(n>1&&((Math.abs(reduced[n-2][0]-reduced[n-1][0])<.01&&
      Math.abs(reduced[n-1][0]-point[0])<.01)||
     (Math.abs(reduced[n-2][1]-reduced[n-1][1])<.01&&
      Math.abs(reduced[n-1][1]-point[1])<.01)))reduced.pop();
   reduced.push(point);
  }
  if(reduced.length<2||!mapLeaderClear(reduced,leaders,occupied,frames,strokeGap))continue;
  // Grid search can introduce many short zigzags. Shortcut them using the
  // same collision checks, preserving orthogonality and the exact anchor.
  const clean=[reduced[0]];
  for(let i=0;i<reduced.length-1;){
   let jump=null;
   for(let j=reduced.length-1;j>i&&!jump;j--){
    const a=reduced[i],b=reduced[j];
    const candidates=a[0]===b[0]||a[1]===b[1]?[[a,b]]:
     [[a,[b[0],a[1]],b],[a,[a[0],b[1]],b]];
    for(const route of candidates)if(mapLeaderClear(route,leaders,occupied,frames,strokeGap)){
     jump={j,route};break;
    }
   }
   if(!jump){clean.push(reduced[++i]);continue}
   clean.push(...jump.route.slice(1));i=jump.j;
  }
  reduced=[];
  for(const p of clean){
   const n=reduced.length;
   if(n&&Math.hypot(p[0]-reduced[n-1][0],p[1]-reduced[n-1][1])<.01)continue;
   if(n>1&&((Math.abs(reduced[n-2][0]-reduced[n-1][0])<.01&&Math.abs(reduced[n-1][0]-p[0])<.01)||
    (Math.abs(reduced[n-2][1]-reduced[n-1][1])<.01&&Math.abs(reduced[n-1][1]-p[1])<.01)))reduced.pop();
   reduced.push(p);
  }
  // Prefer another label slot over a winding route across the map.
  if(reduced.length>8)continue;
  let leaderPath='M'+anchor.x+','+anchor.y;
  for(let k=1;k<reduced.length;k++){
   const [a,b]=[reduced[k-1],reduced[k]];
   if(Math.abs(a[0]-b[0])<.01)leaderPath+='V'+b[1];
   else if(Math.abs(a[1]-b[1])<.01)leaderPath+='H'+b[0];
   else{leaderPath='';break}
  }
  if(leaderPath)return{leaderPath,leaderPoints:reduced};
 }
 return null;
}

function shortLeader(q,t,occupied,reserve){
 const frames=leaderFrames(t),island=frames.find(b=>leaderIn(q.ax,q.ay,b));
 const area=t.area||contentArea(sceneSpec()),font=q.font,width=Array.from(shownLabel(q.f)).length*font*1.04+8;
 const preferred=q.side==='left'?-1:1,legendReserved=reserve?.width?[reserve.x-5,reserve.y-5,reserve.x+reserve.width+5,reserve.y+reserve.height+5]:null;let best;
 for(const sign of [preferred,-preferred])
 for(const gap of [Math.max(37,font*2.8),Math.max(58,font*4),95,145])
 for(const y of [q.ay,q.y,q.ay+font*1.7,q.ay-font*1.7,q.ay+font*3,q.ay-font*3]){
  const x=q.ax+sign*gap,end=x+(sign<0?6:-6),r=sign<0?[x-width,y-font,x,y+font]:[x,y-font,x+width,y+font];
  if(r[0]<area.left||r[2]>area.right||r[1]<area.top||r[3]>area.bottom)continue;
  if(occupied.some(b=>leaderOverlap(r,b))||legendReserved&&leaderOverlap(r,legendReserved))continue;
  if(island&&(r[0]<island[0]||r[2]>island[2]||r[1]<island[1]||r[3]>island[3]))continue;
  if(!island&&frames.some(b=>leaderOverlap(r,b)))continue;
  if(frames.some(b=>leaderCross(q.ax,q.ay,end,y,b)))continue;
  const score=Math.hypot(end-q.ax,y-q.ay)+(sign===preferred?0:35);
  if(!best||score<best.score)best={x,y,side:sign<0?'left':'right',rect:r,score,leader:'M'+q.ax+','+q.ay+'L'+end+','+y};
 }
 if(!best){
  let sign=preferred;
  if(island&&((sign<0&&q.ax-island[0]<12)||(sign>0&&island[2]-q.ax<12)))sign=-sign;
  const available=island?Math.max(0,(sign<0?q.ax-island[0]:island[2]-q.ax)-8):font*1.5;
  const space=island?Math.min(font,available):available;
  const x=q.ax+sign*space,y=q.ay,end=q.ax+sign*Math.max(0,space-1);
  best={x,y,side:sign<0?'left':'right',rect:sign<0?[x-width,y-font,x,y+font]:[x,y-font,x+width,y+font],leader:'M'+q.ax+','+q.ay+'L'+end+','+y};
 }
 occupied.push(best.rect);Object.assign(q,{x:best.x,y:best.y,side:best.side,leader:best.leader});return q;
}

let mapNumberRows=[],exportNumberRows=null;
function mapNumberGroup(f){
 const identity=['council','legislative'].includes(state.level)?featureElectorate(f):'regional';
 const type=identity&&identity!=='regional'?' · '+({plains:'平地原住民',mountain:'山地原住民'}[identity]||identity):'';
 return (f.county||'全台')+type;
}
function mapNumberRecord(f,number){
 const record={number:String(number),id:String(f.id),name:f.name,town:f.town||'',group:mapNumberGroup(f)};
 const dest=exportNumberRows===null?mapNumberRows:exportNumberRows;
 if(!dest.some(r=>r.id===record.id&&r.group===record.group))dest.push(record);
}
function mapNumberSorted(rows){return [...rows].sort((a,b)=>Number(a.number)-Number(b.number)||a.name.localeCompare(b.name,'zh'))}
function mapNumberDisplayName(row,rows){
 if(rows.filter(other=>other.name===row.name).length<=1)return row.name;
 return [row.group,row.town,row.name].filter(Boolean).join(' · ');
}
function renderMapNumberTable(){
 const panel=$('mapNumberKey'),layout=$('mapWithKey'),body=$('mapNumberKeyRows');
 if(!panel||!layout||!body)return;
 const rows=state.labels?mapNumberSorted(mapNumberRows):[];
 panel.hidden=!rows.length;layout.classList.toggle('has-number-key',!!rows.length);body.replaceChildren();
 $('mapNumberKeyCount').textContent=rows.length+'项';
 for(const row of rows){
  const tr=document.createElement('tr'),code=document.createElement('th'),name=document.createElement('td');
  code.scope='row';code.className='number-key-number';code.textContent=row.number;
  name.textContent=mapNumberDisplayName(row,rows);
  tr.append(code,name);body.append(tr);
 }
}

function mapLabelCandidatePoints(f,t){
 const points=[f.center,f.labelAnchor].filter(Boolean).map(p=>({x:p[0]*t.scale+t.tx,y:p[1]*t.scale+t.ty}));
 const b=f.box;for(const i of [5,6,4,7,3,8,2,9])for(const j of [5,6,4,7,3,8,2,9])
  points.push({x:(b[0]+(b[2]-b[0])*i/12)*t.scale+t.tx,y:(b[1]+(b[3]-b[1])*j/12)*t.scale+t.ty});
 return points;
}
function mapLabelFit(f,t,width,height,used,area,reserve){
 const b=f.box;
 if((b[2]-b[0])*t.scale<width||(b[3]-b[1])*t.scale<height)return null;
 for(const p of mapLabelCandidatePoints(f,t)){
  const r=[p.x-width/2,p.y-height/2,p.x+width/2,p.y+height/2];
  if(r[0]<area.left||r[2]>area.right||r[1]<area.top||r[3]>area.bottom)continue;
  if(reserve&&leaderOverlap(r,[reserve.x,reserve.y,reserve.x+reserve.width,reserve.y+reserve.height]))continue;
  if(used.some(other=>leaderOverlap(r,other)))continue;
  if(![-.45,0,.45].every(dx=>[-.45,0,.45].every(dy=>regionContains(f,p.x+dx*width,p.y+dy*height,t))))continue;
  return{x:p.x,y:p.y,rect:r};
 }
 return null;
}
function mapLabelAnchor(f,t){
 for(const p of mapLabelCandidatePoints(f,t)){
  if(regionContains(f,p.x,p.y,t))return{x:p.x,y:p.y};
 }
 return null;
}
function insetDefinitionForFeature(f){
 const definitions=insetDefinitions();
 return definitions.find(q=>q.town&&(q.town===f.name||q.town===f.town))||
  definitions.find(q=>q.county===f.name)||
  definitions.find(q=>q.county===f.county)||null;
}
function isInsetIslandFeature(f){return !!insetDefinitionForFeature(f)}
function mapInsetLabelFit(f,t,width,height,used,area,reserve){
 const definition=insetDefinitionForFeature(f);if(!definition)return null;
 const insetTitle=f.name===definition.county||f.name===definition.town;
 const xMap=insetTitle?definition.label[0]:(f.box[0]+f.box[2])/2;
 const featureBottom=f.box[3]*t.scale+t.ty;
 const x0=xMap*t.scale+t.tx;
 const y0=featureBottom+height/2+2;
 const minX=area.left+width/2,maxX=area.right-width/2;
 const clampX=x=>Math.max(minX,Math.min(maxX,x));
 const fallback={x:clampX(x0),y:y0,rect:[clampX(x0)-width/2,y0-height/2,clampX(x0)+width/2,y0+height/2]};
 for(const dy of [0,height*.8,height*1.6])
 for(const dx of [0,-width*.3,width*.3,-width*.6,width*.6]){
  const x=clampX(x0+dx),y=y0+dy,r=[x-width/2,y-height/2,x+width/2,y+height/2];
  if(r[0]<area.left||r[2]>area.right||r[1]<area.top||r[3]>sceneSpec().height-8)continue;
  if(reserve&&leaderOverlap(r,[reserve.x,reserve.y,reserve.x+reserve.width,reserve.y+reserve.height]))continue;
  if(used.some(other=>leaderOverlap(r,other)))continue;
  return{x,y,rect:r};
 }
 return fallback;
}
function districtMapNumber(f){
 if(!['council','legislative'].includes(state.level)||f.parentDistrictId||f.legislativeTown)return '';
 const value=String(f.number??'').trim();
 const direct=value.match(/^(?:第\s*)?(\d+)(?:\s*(?:选|選)(?:举|舉)?(?:区|區)?)?$/);
 if(direct)return String(Number(direct[1]));
 const embedded=String(f.name||'').match(/第\s*(\d+)\s*(?:选|選)(?:举|舉)?(?:区|區)?/);
 return embedded?String(Number(embedded[1])):'';
}
// The detail-map renderer can adapt names; main-map numbers keep one font size.
function mapAdaptiveLabel(f,t,text,font,used,area,reserve){
 for(const ratio of [1]){
  const size=Math.max(7,font*ratio);
  const width=Array.from(text).length*size*.95+9,height=size*1.65+5;
  const pos=mapLabelFit(f,t,width,height,used,area,reserve);
  if(pos)return{...pos,font:size};
 }
 return null;
}
function mapOutsideLabelFit(f,t,text,font,used,area,reserve,items){
 const anchor=mapLabelAnchor(f,t);if(!anchor)return null;
 const width=Array.from(text).length*font+12,height=font*1.5+6;
 const boxes=items.map(item=>[item.box[0]*t.scale+t.tx,item.box[1]*t.scale+t.ty,item.box[2]*t.scale+t.tx,item.box[3]*t.scale+t.ty]);
 for(const distance of [24,38,56,78,105,140,185,240])for(const [dx,dy]of [[-1,0],[1,0],[-1,-.5],[1,-.5],[-1,.5],[1,.5],[0,-1],[0,1]]){
  const x=anchor.x+dx*distance,y=anchor.y+dy*distance,rect=[x-width/2,y-height/2,x+width/2,y+height/2];
  if(rect[0]<area.left||rect[2]>area.right||rect[1]<area.top||rect[3]>area.bottom)continue;
  if(reserve&&leaderOverlap(rect,[reserve.x,reserve.y,reserve.x+reserve.width,reserve.y+reserve.height]))continue;
  if(used.some(other=>leaderOverlap(rect,other))||boxes.some(box=>leaderOverlap(rect,box)))continue;
  if(leaderFrames(t,5).some(box=>leaderOverlap(rect,box)))continue;
  return{x,y,rect,font,leaderAnchor:anchor};
 }
 return null;
}
function mapNumberLabelFit(f,t,text,font,used,area,reserve){
 // Digits are narrower than Chinese names. Keep the same readable font size
 // instead of shrinking a missing number until it becomes illegible.
 const width=Array.from(text).reduce((sum,c)=>sum+font*(/\d/.test(c)?.64:1.04),0)+8;
 const height=font*1.2+6;
 const pos=mapLabelFit(f,t,width,height,used,area,reserve);
 return pos?{...pos,font}:null;
}
function mapOrderedLabelRows(anchors,top,bottom,gap){
 // Isotonic regression: preserve north-to-south order and minimum spacing,
 // while moving the whole dense cluster as little as possible.
 if(!anchors.length||bottom-top<(anchors.length-1)*gap)return null;
 const blocks=[];
 anchors.forEach((y,i)=>{
  blocks.push({sum:y-i*gap,count:1});
  while(blocks.length>1){const b=blocks.at(-1),a=blocks.at(-2);
   if(a.sum/a.count<=b.sum/b.count)break;
   blocks.splice(-2,2,{sum:a.sum+b.sum,count:a.count+b.count});
  }
 });
 const limit=bottom-(anchors.length-1)*gap,rows=[];
 for(const block of blocks){const y=Math.max(top,Math.min(limit,block.sum/block.count));
  for(let i=0;i<block.count;i++)rows.push(y+rows.length*gap);
 }
 return rows;
}
function mapLabelColumnEdge(items,t,side,ys,font,fallback){
 // Follow the coastline of this cluster's latitude band rather than the
 // distant north-east corner of a long county such as Kaohsiung.
 const step=Math.max(3,font/2),top=Math.min(...ys)-font,bottom=Math.max(...ys)+font;
 let edge=side==='left'?Infinity:-Infinity;
 for(let y=top;y<=bottom+step;y+=step){
  const row=items.filter(f=>f.box[1]*t.scale+t.ty<=y&&f.box[3]*t.scale+t.ty>=y);
  if(!row.length)continue;
  const left=Math.min(...row.map(f=>f.box[0]*t.scale+t.tx)),right=Math.max(...row.map(f=>f.box[2]*t.scale+t.tx));
  for(let x=side==='left'?left:right;side==='left'?x<=right:x>=left;x+=side==='left'?step:-step){
   if(row.some(f=>regionContains(f,x,y,t))){edge=side==='left'?Math.min(edge,x-step):Math.max(edge,x+step);break}
  }
 }
 return Number.isFinite(edge)?edge:fallback;
}
function mapOutsideLabelColumns(pending,t,used,area,reserve,items){
 if(!pending.length)return[];
 const frames=leaderFrames(t,0),groups=new Map(),placed=[];
 for(const q of pending){
  const anchor=mapLabelAnchor(q.f,t);if(!anchor)continue;
  const frame=frames.findIndex(box=>leaderIn(anchor.x,anchor.y,box));
  const key=frame<0?'main':String(frame);
  if(!groups.has(key))groups.set(key,[]);
  groups.get(key).push({...q,anchor});
 }
 for(const [key,entries]of groups){
  const frame=key==='main'?null:frames[Number(key)];
  const localItems=items.filter(f=>{const p=mapLabelAnchor(f,t);return p&&(frame?leaderIn(p.x,p.y,frame):!frames.some(b=>leaderIn(p.x,p.y,b)))});
  if(!localItems.length)continue;
  const box=[Math.min(...localItems.map(f=>f.box[0]*t.scale+t.tx)),Math.min(...localItems.map(f=>f.box[1]*t.scale+t.ty)),
   Math.max(...localItems.map(f=>f.box[2]*t.scale+t.tx)),Math.max(...localItems.map(f=>f.box[3]*t.scale+t.ty))];
  const font=entries[0].font,width=Math.max(...entries.map(q=>q.text.length))*font*.68+12,height=font*1.2+6,gap=height+7;
  const limits=frame?{left:Math.max(area.left,frame[0]+4),right:Math.min(area.right,frame[2]-4),top:Math.max(area.top,frame[1]+height),bottom:Math.min(area.bottom,frame[3]-4)}:area;
  const positions={left:box[0]-width/2-22,right:box[2]+width/2+22};
  // Split a dense cluster between the two margins. Minimizing displacement
  // prevents a city-centre group from stretching across the entire map height.
  const westToEast=[...entries].sort((a,b)=>a.anchor.x-b.anchor.x||a.anchor.y-b.anchor.y||String(a.f.id).localeCompare(String(b.f.id)));
  const ordered=rows=>[...rows].sort((a,b)=>a.anchor.y-b.anchor.y||a.anchor.x-b.anchor.x||String(a.f.id).localeCompare(String(b.f.id)));
  let sides=null,best=Infinity;
  for(let split=0;split<=entries.length;split++){
   const candidate={left:ordered(westToEast.slice(0,split)),right:ordered(westToEast.slice(split))};let score=0;
   for(const side of ['left','right']){
    const rows=candidate[side],x=positions[side];if(!rows.length)continue;
    if(x-width/2<limits.left||x+width/2>limits.right){score=Infinity;break}
    const ys=mapOrderedLabelRows(rows.map(q=>q.anchor.y),limits.top+height/2,limits.bottom-height/2,gap);
    if(!ys){score=Infinity;break}
    rows.forEach((q,i)=>{score+=(ys[i]-q.anchor.y)**2+.002*(x-q.anchor.x)**2});
   }
   if(score<best){best=score;sides=candidate}
  }
  if(!sides)continue;
  for(const side of ['left','right']){
   const rows=sides[side].sort((a,b)=>a.anchor.y-b.anchor.y||a.anchor.x-b.anchor.x||String(a.f.id).localeCompare(String(b.f.id)));
   if(!rows.length)continue;
   const ys=mapOrderedLabelRows(rows.map(q=>q.anchor.y),limits.top+height/2,limits.bottom-height/2,gap);
   if(!ys)continue;
   const edge=frame?(side==='left'?box[0]:box[2]):mapLabelColumnEdge(localItems,t,side,ys.concat(rows.map(q=>q.anchor.y)),font,side==='left'?box[0]:box[2]);
   const x=side==='left'?edge-width/2-22:edge+width/2+22;
   if(x-width/2<limits.left||x+width/2>limits.right)continue;
   const rail=side==='left'?edge-8:edge+8;
   rows.forEach((q,i)=>{
    const y=ys[i],rect=[x-width/2,y-height/2,x+width/2,y+height/2];
    if(used.some(other=>leaderOverlap(rect,other)))return;
    if(reserve&&leaderOverlap(rect,[reserve.x,reserve.y,reserve.x+reserve.width,reserve.y+reserve.height]))return;
    const end=x+(side==='left'?width/2+3:-width/2-3);
    // The horizontal stems end outside the geometry. Ordered fan segments
    // stay in the margin, so adjacent callouts cannot cross one another.
    const leaderPath=`M${q.anchor.x},${q.anchor.y}H${rail}L${end},${y}`;
    used.push(rect);placed.push({...q,x,y,rect,leaderAnchor:q.anchor,leaderPath,column:side});
   });
  }
 }
 // Insets or very unusual extents may have no column margin. Still use a
 // checked local callout rather than silently dropping a district number.
 const done=new Set(placed.map(q=>q.f.id));
 for(const q of pending)if(!done.has(q.f.id)){
  const pos=mapOutsideLabelFit(q.f,t,q.text,q.font,used,area,reserve,items);
  if(pos){used.push(pos.rect);placed.push({...q,...pos})}
 }
 // A nationwide panel can exhaust a cluster's local margin. Allocate the
 // remaining numbers in the panel's outer gutters, preserving latitude order.
 // Unlike the local fallback, these slots are not rejected by distant polygon
 // bounding boxes (which cover large empty sea areas in concave counties).
 const complete=new Set(placed.map(q=>q.f.id));
 const missing=pending.filter(q=>!complete.has(q.f.id)).map(q=>({...q,anchor:mapLabelAnchor(q.f,t)}))
  .filter(q=>q.anchor).sort((a,b)=>a.anchor.y-b.anchor.y||a.anchor.x-b.anchor.x||String(a.f.id).localeCompare(String(b.f.id)));
 const reserved=reserve?[reserve.x,reserve.y,reserve.x+reserve.width,reserve.y+reserve.height]:null;
 for(const q of missing){
  const width=Array.from(q.text).length*q.font*.68+12,height=q.font*1.2+6,gap=height+7;
  const sides=q.anchor.x<(area.left+area.right)/2?['left','right']:['right','left'];
  let best=null;
  for(const side of sides){
   for(let column=0;column<3;column++){
    const x=side==='left'?area.left+width/2+6+column*(width+10):area.right-width/2-6-column*(width+10);
    for(let y=area.top+height/2+4;y<=area.bottom-height/2-4;y+=gap){
     const rect=[x-width/2,y-height/2,x+width/2,y+height/2];
     if(used.some(r=>leaderOverlap(rect,r))||reserved&&leaderOverlap(rect,reserved)||frames.some(r=>leaderOverlap(rect,r)))continue;
     if(items.some(f=>x>=f.box[0]*t.scale+t.tx&&x<=f.box[2]*t.scale+t.tx&&y>=f.box[1]*t.scale+t.ty&&y<=f.box[3]*t.scale+t.ty&&regionContains(f,x,y,t)))continue;
     const score=Math.abs(y-q.anchor.y)+Math.abs(x-q.anchor.x)*.12+column*gap;
     if(!best||score<best.score)best={x,y,rect,score,side};
    }
   }
  }
  if(!best)continue;
  const {x,y,rect,side}=best,end=x+(side==='left'?width/2+3:-width/2-3);
  const rail=side==='left'?end+8:end-8;
  used.push(rect);placed.push({...q,x,y,rect,leaderAnchor:q.anchor,
   leaderPath:`M${q.anchor.x},${q.anchor.y}H${rail}V${y}H${end}`,column:side});
 }
 return placed;
}

function countyMayorOverview(){
 return(state.level==='counties'||(typeof mayorTownBoundaryOverlay==='function'&&mayorTownBoundaryOverlay()))&&!state.county&&state.fillMode==='prediction'&&state.predictionOffice==='mayor';
}
const COUNTY_CITY_CALLOUTS=new Set(['台北市','基隆市','新竹市','嘉义市','桃园市','高雄市']);
// All 25 perimeter probes must be inside the county: a central point alone
// can allow a name to spill over a concave administrative boundary.
function countyInsideName(f,t,name,font,used,area,reserve){
 const center=f.center||f.labelAnchor||[(f.box[0]+f.box[2])/2,(f.box[1]+f.box[3])/2];
 const cx=center[0]*t.scale+t.tx,cy=center[1]*t.scale+t.ty;
 const samples=[-.5,-.375,-.25,-.125,0,.125,.25,.375,.5];
 for(const ratio of [1]){
  const size=font*ratio,width=Array.from(name).length*size*1.1+12,height=size*1.7+8;
  let best=null;
  const consider=p=>{
   const rect=[p.x-width/2,p.y-height/2,p.x+width/2,p.y+height/2];
   if(rect[0]<area.left||rect[2]>area.right||rect[1]<area.top||rect[3]>area.bottom)return;
   if(reserve&&leaderOverlap(rect,[reserve.x,reserve.y,reserve.x+reserve.width,reserve.y+reserve.height]))return;
   if(used.some(other=>leaderOverlap(rect,other)))return;
   if(!samples.every(dx=>samples.every(dy=>regionContains(f,p.x+dx*width,p.y+dy*height,t))))return;
   const score=(p.x-cx)**2+(p.y-cy)**2;
   if(!best||score<best.score)best={x:p.x,y:p.y,rect,font:size,score};
  };
  for(const p of mapLabelCandidatePoints(f,t))consider(p);
  // A thin crescent such as New Taipei City can have a valid interior label
  // between the coarse candidate grid points; search densely only if needed.
  if(!best){
   const b=f.box;
   for(let i=1;i<24;i++)for(let j=1;j<24;j++)
    consider({x:(b[0]+(b[2]-b[0])*i/24)*t.scale+t.tx,
     y:(b[1]+(b[3]-b[1])*j/24)*t.scale+t.ty});
  }
  if(best)return best;
 }
 return null;
}
// In the nationwide mayor view, offshore county titles belong in the bottom
// centre of their respective inset frames, never beneath the island geometry.
function countyIslandName(f,t,name,font){
 const inset=insetDefinitionForFeature(f);
 if(!inset)return null;
 const left=inset.box[0]*t.scale+t.tx,right=inset.box[2]*t.scale+t.tx;
 const top=inset.box[1]*t.scale+t.ty,bottom=inset.box[3]*t.scale+t.ty;
 const size=font;
 const width=Array.from(name).length*size*1.04+4,height=size*1.5+4;
 const x=(left+right)/2,y=bottom-height/2-7;
 const rect=[x-width/2,y-height/2,x+width/2,y+height/2];
 if(rect[0]<left+4||rect[2]>right-4||rect[1]<top+4)return null;
 return{x,y,rect,font:size,island:true,insetBottom:true};
}
// City callouts follow the coast while avoiding other labels and inset frames.
function countyCityCallout(f,t,name,font,used,area,reserve,items,leaders=[]){
 const anchor=townVisualCenter(f,t);
 const mainland=items.filter(item=>!isInsetIslandFeature(item));
 const width=Array.from(name).length*font*1.04+8,height=font*1.5+5;
 const preferred=['台北市','基隆市'].includes(name)?'right':'left';
 const frames=leaderFrames(t,6);
 const blocked=rect=>rect[0]<area.left||rect[2]>area.right||rect[1]<area.top||rect[3]>area.bottom||
  used.some(other=>leaderOverlap(rect,other))||
  !mapLeaderRectIsClear(rect,leaders)||
  frames.some(frame=>leaderOverlap(rect,frame))||
  !!(reserve&&leaderOverlap(rect,[reserve.x,reserve.y,reserve.x+reserve.width,reserve.y+reserve.height]));
 let best=null;
 for(const side of [preferred,preferred==='left'?'right':'left']){
  const sign=side==='left'?-1:1;
  const coast=mapLabelColumnEdge(mainland,t,side,[anchor.y-height,anchor.y+height],font,anchor.x);
  for(const shift of [0,-1,1,-2,2,-3,3,-4,4,-5,5,-6,6,-7,7,-8,8,-9,9,-10,10,-11,11,-12,12]){
   const y=anchor.y+shift*(height+5);
   const x=coast+sign*(width/2+Math.max(37,font*2.5));
   const rect=[x-width/2,y-height/2,x+width/2,y+height/2];
   if(blocked(rect))continue;
   if([-.42,0,.42].some(dx=>[-.42,0,.42].some(dy=>mainland.some(item=>regionContains(item,x+dx*width,y+dy*height,t)))))continue;
   const route=mapOrthogonalLeader(anchor,side,x,y,width,coast,leaders,used,area,frames);
   if(!route)continue;
   const score=Math.abs(y-anchor.y)+Math.abs(x-anchor.x)*.25+(side===preferred?0:90);
   if(!best||score<best.score)best={x,y,rect,font,leaderAnchor:anchor,...route,column:side,score};
  }
 }
 return best;
}
function countyMayorLabelLayout(items,t,font,area,reserve){
 const sizes=f=>(f.box[2]-f.box[0])*(f.box[3]-f.box[1]);
 const regular=[],offshore=[],cities=[],missing=[],labels=[],used=[],leaders=[];
 for(const f of items){
  if(!shownLabel(f))continue;
  if(isInsetIslandFeature(f))offshore.push(f);
  else if(COUNTY_CITY_CALLOUTS.has(f.name))cities.push(f);
  else regular.push(f);
 }
 regular.sort((a,b)=>sizes(b)-sizes(a));
 for(const f of regular){
  const name=shownLabel(f),pos=countyInsideName(f,t,name,font,used,area,reserve);
  if(pos){used.push(pos.rect);labels.push({f,...pos,text:name,numeric:false})}
  else missing.push(f);
 }
 for(const f of offshore){
  const name=shownLabel(f),pos=countyIslandName(f,t,name,font);
  if(pos){used.push(pos.rect);labels.push({f,...pos,text:name,numeric:false})}
  else missing.push(f);
 }
 const order=['基隆市','台北市','新竹市','嘉义市'];
 cities.sort((a,b)=>order.indexOf(a.name)-order.indexOf(b.name));
 for(const f of [...cities,...missing]){
  const name=shownLabel(f),pos=countyCityCallout(f,t,name,font,used,area,reserve,items,leaders);
  if(pos){used.push(pos.rect);labels.push({f,...pos,text:name,numeric:false});leaders.push(pos.leaderPoints)}
 }
 return labels;
}

// Full names instead of lookup numbers for county-scoped township forecast maps.
function directTownNameLabels(){
 return state.level==='towns'&&!!state.county&&
  state.workspaceMode==='prediction'&&state.fillMode==='prediction'&&
  (state.predictionOffice==='township'||
   state.predictionOffice==='mayor'&&state.predictionScale==='overlay');
}
// Town-name callouts use *perimeter lanes* rather than fanning diagonal
// lines across the colored map. Assign labels to the closest available side,
// preserve geographic north/south order, and keep all vertical stems outside
// the county outline. Actual paths are painted behind ALL name labels.
// Find a high-clearance representative point close to the geographic
// interior. Cache original map coordinates across view/layout changes.
const townVisualCenters=new WeakMap();
function townVisualCenter(f,t){
 let raw=townVisualCenters.get(f);
 if(!raw){
  const b=f.box,w=b[2]-b[0],h=b[3]-b[1],middle=[(b[0]+b[2])/2,(b[1]+b[3])/2];
  const desired=f.center||f.labelAnchor||middle,unit={scale:1,tx:0,ty:0};
  const candidates=[f.center,f.labelAnchor,middle].filter(Boolean).map(p=>[p[0],p[1]]);
  for(let iy=1;iy<=11;iy++)for(let ix=1;ix<=11;ix++)
   candidates.push([b[0]+w*ix/12,b[1]+h*iy/12]);
  const radius=Math.max(.001,Math.min(w,h)),radii=[.06,.12,.19,.27,.35];
  const dirs=[[1,0],[-1,0],[0,1],[0,-1],[.707,.707],[.707,-.707],[-.707,.707],[-.707,-.707]];
  let best=null,bestScore=-Infinity;
  for(const [x,y] of candidates){
   if(!regionContains(f,x,y,unit))continue;
   let clearance=0;
   for(const fraction of radii){
    if(!dirs.every(([dx,dy])=>regionContains(f,x+dx*radius*fraction,y+dy*radius*fraction,unit)))break;
    clearance=fraction;
   }
   const distance=Math.hypot((x-desired[0])/Math.max(w,.001),(y-desired[1])/Math.max(h,.001));
   const score=clearance*3-distance*.2;
   if(score>bestScore){bestScore=score;best=[x,y]}
  }
  const fallback=mapLabelAnchor(f,unit);
  raw=best||[fallback?.x??middle[0],fallback?.y??middle[1]];
  townVisualCenters.set(f,raw);
 }
 return{x:raw[0]*t.scale+t.tx,y:raw[1]*t.scale+t.ty};
}
// The entire rendered name (including a small safety margin) must fit inside
// the true polygon boundary. Sort candidate placements by visual-centre
// distance; no label is permitted to cross a town border.
function townInsideLabelFit(f,t,width,height,used,area,reserve){
 const b=f.box,center=townVisualCenter(f,t);
 if((b[2]-b[0])*t.scale<width+3||(b[3]-b[1])*t.scale<height+3)return null;
 const candidates=[center,...mapLabelCandidatePoints(f,t)];
 for(let ix=1;ix<=15;ix++)for(let iy=1;iy<=15;iy++)
  candidates.push({x:(b[0]+(b[2]-b[0])*ix/16)*t.scale+t.tx,
   y:(b[1]+(b[3]-b[1])*iy/16)*t.scale+t.ty});
 candidates.sort((a,b)=>Math.hypot(a.x-center.x,a.y-center.y)-Math.hypot(b.x-center.x,b.y-center.y));
 for(const p of candidates){
  const rect=[p.x-width/2-1.5,p.y-height/2-1.5,p.x+width/2+1.5,p.y+height/2+1.5];
  if(rect[0]<area.left||rect[2]>area.right||rect[1]<area.top||rect[3]>area.bottom)continue;
  if(reserve&&leaderOverlap(rect,[reserve.x,reserve.y,reserve.x+reserve.width,reserve.y+reserve.height]))continue;
  if(used.some(r=>leaderOverlap(rect,r)))continue;
  let entirelyInside=true;
  for(let ix=0;ix<=6&&entirelyInside;ix++)for(let iy=0;iy<=6;iy++){
   const x=rect[0]+(rect[2]-rect[0])*ix/6,y=rect[1]+(rect[3]-rect[1])*iy/6;
   if(!regionContains(f,x,y,t)){entirelyInside=false;break}
  }
  if(entirelyInside)return{x:p.x,y:p.y,rect};
 }
 return null;
}

function townNameLabelLayout(items,t,font,area,reserve,attempt=0){
 const height=font*1.5+5,insideHeight=font*1.37+5;
 const labelWidth=(name,size=font)=>Array.from(name).length*size*1.04+8;
 const insideWidth=name=>Array.from(name).length*font*.99+7;
 // Regions with the fewest viable interior positions get first choice.
 // Previously large polygons were placed first, unnecessarily pushing
 // narrow urban districts into long, crowded outside callouts.
 const sorted=[...items].filter(f=>shownLabel(f)).sort((a,b)=>{
  const fit=f=>Math.min(
   (f.box[2]-f.box[0])*t.scale/insideWidth(shownLabel(f)),
   (f.box[3]-f.box[1])*t.scale/insideHeight);
  return fit(a)-fit(b)||String(a.id).localeCompare(String(b.id));
 });
 const labels=[],used=[],leaderText=[],pending=[],leaders=[];
 const reserved=reserve?[reserve.x,reserve.y,reserve.x+reserve.width,reserve.y+reserve.height]:null;
 const valid=(rect)=>rect[0]>=area.left+2&&rect[2]<=area.right-2&&
  rect[1]>=area.top+2&&rect[3]<=area.bottom-2&&
  !(reserved&&leaderOverlap(rect,reserved))&&!used.some(other=>leaderOverlap(rect,other));
 // Keep one fixed font across interior names and external callouts.
 // A narrow region moves outside instead of silently shrinking its type.
 for(const f of sorted){
  const text=shownLabel(f),width=insideWidth(text);
  let pos=townInsideLabelFit(f,t,width,insideHeight,used,area,reserve),lines=null;
  // A narrow north-south town may fit a compact two-line name even when
  // one row would spill into an adjacent district. Keep the full name and
  // original font; never rotate, abbreviate or shrink the characters.
  const chars=Array.from(text);
  if(!pos&&chars.length>=3&&chars.length<=6){
   const split=Math.ceil(chars.length/2);
   const rows=[chars.slice(0,split).join(''),chars.slice(split).join('')];
   const twoWidth=Math.max(...rows.map(insideWidth));
   const twoHeight=font*2.35+4;
   pos=townInsideLabelFit(f,t,twoWidth,twoHeight,used,area,reserve);
   if(pos)lines=rows;
  }
  if(pos){used.push(pos.rect);labels.push({f,...pos,font,text,lines,numeric:false})}
  else pending.push({f,text,font,anchor:townVisualCenter(f,t)});
 }
 if(!pending.length)return labels;
 const box={
  left:Math.min(...items.map(f=>f.box[0]*t.scale+t.tx)),
  right:Math.max(...items.map(f=>f.box[2]*t.scale+t.tx))
 };
 const columnWidth=Math.max(...pending.map(q=>labelWidth(q.text)))+6;
 const colX={
  left:box.left-columnWidth/2-44,
  right:box.right+columnWidth/2+44
 };
 const fitsSide=side=>colX[side]-columnWidth/2>=area.left+5&&
  colX[side]+columnWidth/2<=area.right-5;
 // Give adjacent outside names an 8–13 px visible breathing gap rather
 // than the previous ~1 px. Reduce that extra gap only when the county has
 // more labels than two full columns could otherwise accommodate.
 const idealRowGap=height+Math.max(16,font*1.05);
 const room=Math.max(0,area.bottom-area.top-height-11);
 const rowGap=Math.max(height+8,Math.min(idealRowGap,
  pending.length>2?room/Math.max(1,Math.ceil(pending.length/2)-1):idealRowGap));
 const maxRows=Math.max(1,1+Math.floor(room/rowGap));
 const capacity={left:fitsSide('left')?maxRows:0,right:fitsSide('right')?maxRows:0};
 const sides={left:[],right:[]},remaining=[];
 const strokeGap=2.4; // independent stems must never hug each other
 const order=[...pending].sort((a,b)=>{
  // Route tiny urban districts first so they are not trapped by longer
  // callouts already occupying their perimeter exit lanes.
  const size=f=>(f.box[2]-f.box[0])*(f.box[3]-f.box[1]);
  const pa=a.anchor,pb=b.anchor;
  const ca=pa?Math.min(Math.abs(pa.x-box.left),Math.abs(box.right-pa.x)):Infinity;
  const cb=pb?Math.min(Math.abs(pb.x-box.left),Math.abs(box.right-pb.x)):Infinity;
  return size(a.f)-size(b.f)||ca-cb||(pa?.y??0)-(pb?.y??0)||
   String(a.f.id).localeCompare(String(b.f.id));
 });
 for(const q of order){
  if(!q.anchor){remaining.push(q);continue}
  const mid=(box.left+box.right)/2,halfWidth=Math.max(1,(box.right-box.left)/2);
  const geographicSide=q.anchor.x<=mid?'left':'right';
  const preference=attempt===2?(geographicSide==='left'?'right':'left'):geographicSide;
  // Strong geographic preference for east/west towns, while central
  // locations can share whichever column has less nearby congestion.
  const side=['left','right'].map(k=>{
   const rows=sides[k],max=capacity[k];
   if(rows.length>=max)return{side:k,score:Infinity};
   const coast=k==='left'?box.left:box.right;
   const near=rows.reduce((sum,r)=>sum+Math.max(0,1-Math.abs(r.anchor.y-q.anchor.y)/(rowGap*2)),0);
   const utilization=(rows.length/Math.max(1,max))**2;
   const eastWest=Math.min(1,Math.abs(q.anchor.x-mid)/halfWidth);
   const crossingPenalty=k===geographicSide?0:320*eastWest+100*eastWest*eastWest;
   return{side:k,score:.22*Math.abs(q.anchor.x-coast)+
    near*rowGap*1.35+utilization*rowGap*2+crossingPenalty+
    (k===preference?0:8)};
  }).sort((a,b)=>a.score-b.score||(a.side===preference?-1:1))[0];
  if(side&&Number.isFinite(side.score))sides[side.side].push(q);else remaining.push(q);
 }
 const coastRail={left:box.left,right:box.right};
 const insetFrames=leaderFrames(t,3);
 for(const side of (attempt===3?['right','left']:['left','right'])){
  const rows=sides[side].sort((a,b)=>a.anchor.y-b.anchor.y||
   a.anchor.x-b.anchor.x||String(a.f.id).localeCompare(String(b.f.id)));
  if(!rows.length)continue;
  const yValues=mapOrderedLabelRows(rows.map(q=>q.anchor.y),
   area.top+height/2+5,area.bottom-height/2-6,rowGap);
  if(!yValues){remaining.push(...rows);continue}
  const indexes=rows.map((_,i)=>i);
  if(attempt===1||attempt===3)indexes.reverse();
  else if(attempt===2)indexes.sort((i,j)=>{
   const size=f=>(f.box[2]-f.box[0])*(f.box[3]-f.box[1]);
   return size(rows[i].f)-size(rows[j].f);
  });
  for(const i of indexes){
   const q=rows[i],width=labelWidth(q.text),x=colX[side],y=yValues[i];
   let rect=[x-width/2-4,y-height/2-3,x+width/2+4,y+height/2+3];
   // Make small ordered adjustments if a legend or a large interior name
   // occupies a projected label lane. Never disturb the order of the rows.
   let chosen=null;
   const step=rowGap;
   for(const shift of [0,-1,1,-2,2,-3,3,-4,4,-5,5,-6,6,-7,7,-8,8]){
    const yy=y+shift*step;
    const rr=[rect[0],yy-height/2-3,rect[2],yy+height/2+3];
    if(!valid(rr))continue;
    const route=mapOrthogonalLeader(q.anchor,side,x,yy,width,
     coastRail[side],leaders,leaderText,area,insetFrames,strokeGap)||
     mapGridLeaderRoute(q.anchor,side,x,yy,width,leaders,leaderText,area,insetFrames,strokeGap);
    if(route){chosen={y:yy,rect:rr,...route};break}
   }
   if(!chosen){remaining.push(q);continue}
   used.push(chosen.rect);leaderText.push(chosen.rect);leaders.push(chosen.leaderPoints);
   labels.push({f:q.f,x,y:chosen.y,rect:chosen.rect,text:q.text,font,
    numeric:false,calloutLane:'perimeter',leaderAnchor:q.anchor,leaderPath:chosen.leaderPath,
    leaderPoints:chosen.leaderPoints,column:side});
  }
 }
 // Insets and rare full columns: place a small label near its own territory
 // and use an orthogonal elbow rather than a diagonal through other towns.
 for(const q of remaining){
  const anchor=q.anchor||townVisualCenter(q.f,t),width=labelWidth(q.text);
  const outward=anchor.x<(box.left+box.right)/2?-1:1;
  const xs=[12,30,55,95,155].flatMap(gap=>
   [anchor.x+outward*(width/2+gap),anchor.x-outward*(width/2+gap)])
   .concat(outward<0?[colX.left,colX.right]:[colX.right,colX.left]);
  let pos=null;
  for(const x0 of xs){
   const x=Math.max(area.left+width/2+8,
    Math.min(area.right-width/2-8,x0));
   const side=x<anchor.x?'left':'right',coast=anchor.x;
   for(let n=0;n<Math.min(16,Math.ceil((area.bottom-area.top)/(height*.6+4)))&&!pos;n++){
    for(const k of n?[n,-n]:[0]){
     const y=anchor.y+k*(height*.7+8);
     const rect=[x-width/2-4,y-height/2-3,x+width/2+4,y+height/2+3];
     if(!valid(rect))continue;
     const route=mapOrthogonalLeader(anchor,side,x,y,width,coast,leaders,leaderText,area,insetFrames,strokeGap)||
      mapGridLeaderRoute(anchor,side,x,y,width,leaders,leaderText,area,insetFrames,strokeGap);
     if(route){pos={x,y,rect,side,...route};break}
    }
   }
   if(pos)break;
  }
  if(!pos)continue;
  used.push(pos.rect);leaderText.push(pos.rect);leaders.push(pos.leaderPoints);
  labels.push({f:q.f,x:pos.x,y:pos.y,rect:pos.rect,text:q.text,font,numeric:false,
   leaderAnchor:anchor,leaderPath:pos.leaderPath,leaderPoints:pos.leaderPoints,column:pos.side});
 }
 if(attempt===0&&labels.length<sorted.length){
  let best=labels;
  for(const retry of [1,2]){
   const alternate=townNameLabelLayout(items,t,font,area,reserve,retry);
   if(alternate.length>best.length)best=alternate;
   if(best.length===sorted.length)break;
  }
  return best;
 }
 return labels;
}

function labelLayout(items,t,font=15){
 const area=t.area||contentArea(sceneSpec()),reserve=state.legend.show?legendBox(sceneSpec()):null;
 if(countyMayorOverview())return countyMayorLabelLayout(items,t,font,area,reserve);
 if(directTownNameLabels()){
  const labels=townNameLabelLayout(items,t,font,area,reserve);
  const done=new Set(labels.map(q=>q.f.id)),used=labels.map(q=>q.rect);
  const pending=items.filter(f=>shownLabel(f)&&!done.has(f.id))
   .map(f=>({f,font,text:shownLabel(f),numeric:false}));
  const leaders=labels.filter(q=>q.leaderPoints).map(q=>q.leaderPoints);
  for(const q of mapOutsideLabelColumns(pending,t,used,area,reserve,items)){
   const anchor=townVisualCenter(q.f,t),width=Array.from(q.text).length*font*1.04+8;
   const side=q.x<anchor.x?'left':'right',frames=leaderFrames(t,3);
   const occupied=labels.map(row=>row.rect);
   const route=mapOrthogonalLeader(anchor,side,q.x,q.y,width,anchor.x,leaders,occupied,area,frames)||
    mapGridLeaderRoute(anchor,side,q.x,q.y,width,leaders,occupied,area,frames);
   const end=q.x+(side==='left'?width/2+6:-width/2-6),rail=end+(side==='left'?8:-8);
   labels.push({...q,...route,leaderAnchor:anchor,
    leaderPath:route?.leaderPath||`M${anchor.x},${anchor.y}H${rail}V${q.y}H${end}`});
   if(route)leaders.push(route.leaderPoints);
  }
  return labels;
 }
 const sizes=f=>(f.box[2]-f.box[0])*(f.box[3]-f.box[1]);
 const sorted=[...items].sort((a,b)=>sizes(b)-sizes(a)),used=[],labels=[],needsNumber=[],outside=[];
 for(const f of sorted){
  const name=shownLabel(f);if(!name)continue;
  if(['council','legislative'].includes(state.level)&&!f.parentDistrictId&&!f.legislativeTown){
   const districtNumber=districtMapNumber(f),text=districtNumber||name;
   const pos=mapNumberLabelFit(f,t,text,font,used,area,reserve);
   if(pos){
    used.push(pos.rect);
    labels.push({f,x:pos.x,y:pos.y,font:pos.font,text,numeric:false,districtNumber:!!districtNumber});
   }else outside.push({f,font,text,numeric:false,districtNumber:!!districtNumber});
   continue;
  }
  const width=Array.from(name).length*font*1.04+4,height=font*1.5+3;
  if(isInsetIslandFeature(f)){
   const pos=mapInsetLabelFit(f,t,width,height,used,area,reserve);
   used.push(pos.rect);labels.push({f,x:pos.x,y:pos.y,font,text:name,numeric:false,island:true});
   continue;
  }
  const pos=mapLabelFit(f,t,width,height,used,area,reserve);
  if(pos){used.push(pos.rect);labels.push({f,x:pos.x,y:pos.y,font,text:name,numeric:false})}
  else needsNumber.push(f);
 }
 // Administrative reference numbers follow geography, not Chinese collation.
 needsNumber.sort((a,b)=>String(a.county).localeCompare(String(b.county),'zh')||
  (a.center?.[1]??a.box[1])-(b.center?.[1]??b.box[1])||
  (a.center?.[0]??a.box[0])-(b.center?.[0]??b.box[0])||String(a.id).localeCompare(String(b.id)));
 const numberRows=exportNumberRows===null?mapNumberRows:exportNumberRows;
 let nextNumber=numberRows.length+1;
 for(const f of needsNumber){
  const value=String(nextNumber);
  const pos=mapNumberLabelFit(f,t,value,font,used,area,reserve);
  const q={f,font,text:value,numeric:true,number:value};
  if(pos){used.push(pos.rect);labels.push({...q,...pos})}else outside.push(q);
  nextNumber++;
 }
 labels.push(...mapOutsideLabelColumns(outside,t,used,area,reserve,items));
 return labels;
}

// Highlight the exact corresponding polygon on name hover. CSS controls
// the temporary colour so underlying prediction/party fills are untouched.
function toggleLabelRegionHighlight(f,active){
 const layer=$('regions');
 const featureId=String(f.id);
 for(const path of layer.querySelectorAll('path[data-region]')){
  if(path.dataset.region===featureId)path.classList.toggle('label-region-highlighted',active);
 }
}
function drawLabels(group,items,t,font=15,interactive=false){
 const overview=state.level==='towns'&&!state.county&&!(typeof mayorTownBoundaryOverlay==='function'&&mayorTownBoundaryOverlay());
 const rendered=overview?(data?.counties||[]):items;
 if(overview){font=19;interactive=false}
 const zoomRatio=interactive&&view&&items.some(f=>districtMapNumber(f))?Math.min(1,view.w/sceneSpec().width):1;
 font*=zoomRatio;
 group.replaceChildren();
 // Paint EVERY leader behind all labels, using identical county/town
 // styling. Later callouts can never obscure an earlier name.
 const mapLeaderLayer=svgEl('g',{'data-map-leader-layer':'true'});
 if(directTownNameLabels())mapLeaderLayer.setAttribute('data-town-leader-layer','true');
 group.append(mapLeaderLayer);
 for(const q of labelLayout(rendered.filter(f=>shownLabel(f)),t,font)){
  const g=svgEl('g',{'class':'map-label'});group.append(g);
  if(q.leaderAnchor){
   const direction=q.x<q.leaderAnchor.x?-1:1;
   const end=q.x-direction*(Array.from(q.text).length*q.font*.52+5);
   const elbow=q.leaderAnchor.x+direction*12;
   const leaderPath=q.leaderPath||('M'+q.leaderAnchor.x+','+q.leaderAnchor.y+
    'H'+elbow+'V'+q.y+'H'+end);
   mapLeaderLayer.append(svgEl('path',{d:leaderPath,fill:'none',
    style:'fill:none;stroke:#fff;stroke-width:2.1px;stroke-linecap:round;stroke-linejoin:round;stroke-opacity:.94',
    'vector-effect':'non-scaling-stroke','pointer-events':'none','data-label-leader-halo':q.f.id}));
   const line=svgEl('path',{d:leaderPath,fill:'none',
    style:'fill:none;stroke:#537d6b;stroke-width:0.9px;stroke-linecap:round;stroke-linejoin:round;stroke-opacity:.78',
    'vector-effect':'non-scaling-stroke','pointer-events':'none',
    'data-label-leader':q.f.id,'data-label-column':q.column||'local',
    'data-prominent-leader':'true'});
   mapLeaderLayer.append(line);
   mapLeaderLayer.append(svgEl('circle',{cx:q.leaderAnchor.x,cy:q.leaderAnchor.y,
    r:1.9*zoomRatio,fill:'#537d6b',style:'stroke:#fff;stroke-width:1.1px',
    'pointer-events':'none','data-label-anchor':q.f.id}));
  }
  const label=svgEl('text',{x:q.x,y:q.y,'font-size':q.font,'data-label':q.f.id,
   'data-placement':q.leaderAnchor?'outside':q.districtNumber?'district-number':q.island?(q.insetBottom?'inset-bottom':'below-island'):'inside','data-callout-lane':q.calloutLane||'','text-anchor':'middle','dominant-baseline':'middle',
   'font-weight':q.numeric||q.districtNumber?700:500,fill:'#2c493b',stroke:'#ffffffed',
   'stroke-width':q.numeric?3:2.4,'paint-order':'stroke','stroke-linejoin':'round'});
  label.style.strokeWidth=(q.numeric?2.6:2.4)*zoomRatio;
  // CSS resets SVG text-anchor; enforce the measured centre for this overview.
  label.style.textAnchor='middle';
  // Callout labels retain the same typography as the labels placed inside districts.
  if(q.lines?.length===2){
   const spacing=q.font*1.08;
   for(const [i,line]of q.lines.entries()){
    const span=svgEl('tspan',{x:q.x,y:q.y+(i-.5)*spacing,
     'dominant-baseline':'middle'});
    span.textContent=line;label.append(span);
   }
  }else label.textContent=q.text;
  if(q.numeric){label.setAttribute('data-number-key',q.number);mapNumberRecord(q.f,q.number)}
  if(interactive){
   label.style.pointerEvents='auto';label.style.cursor='pointer';
   label.setAttribute('tabindex','0');
   label.addEventListener('pointerenter',()=>toggleLabelRegionHighlight(q.f,true));
   label.addEventListener('pointerleave',()=>toggleLabelRegionHighlight(q.f,false));
   label.addEventListener('focus',()=>toggleLabelRegionHighlight(q.f,true));
   label.addEventListener('blur',()=>toggleLabelRegionHighlight(q.f,false));
   label.onclick=()=>paint(q.f);
   label.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();paint(q.f)}};
  }
  g.append(label);
 }
}
function drawIdentityPanelLabels(group,interactive=false,exportAll=false){
 group.replaceChildren();
 const condensed=state.level==='legislative'&&!state.county&&!exportAll&&view&&view.w>=sceneSpec().width*.72;
 for(const panel of identityPanelLayouts()){
  const layer=svgEl('g',{'data-electorate-labels':panel.identity});group.append(layer);
  const items=condensed&&panel.identity!=='regional'?data.counties.map(f=>({...f,number:''})):panel.items;
  if(items.length)drawLabels(layer,items,panel.t,condensed?17:sceneSpec().font,interactive&&!condensed)
 }
}
function renderLabels(){
 clearTimeout(navigationLabelTimer);navigationLabelTimer=0;
 const group=$('labels');group.replaceChildren();mapNumberRows=[];
 if(state.labels&&view){
  if(identityPanelsActive())drawIdentityPanelLabels(group,true,false);
  else if(state.level==='villages')drawVillageLabels(group,currentItems(),geometryLayout(currentItems(),true),view,true);
  else drawLabels(group,currentItems(),geometryLayout(currentItems(),true),sceneSpec().font,true);
 }
 renderMapNumberTable();
}
function insetDefinitions(){return[
 {name:'马祖',county:'连江县',box:[20,20,140,140],label:[80,30]},
 {name:'金门',county:'金门县',d:'M20,160H110V190H140V220H20Z',label:[65,169],box:[20,160,140,220]},
 {name:'乌坵',town:'乌坵乡',box:[110,160,140,190],label:[125,183]},
 {name:'澎湖',county:'澎湖县',box:[20,435,110,565],label:[65,445]}
 ]}
function activeInsetDefinitions(){const town=state.level==='villages'&&state.villageTown?data.towns.find(f=>f.id===state.villageTown):null,county=state.county||town?.county||'';return insetDefinitions().filter(q=>{if(town?.name==='乌坵乡')return q.town==='乌坵乡';if(town&&q.town==='乌坵乡')return false;return !county||q.county===county||data.towns.some(f=>f.name===q.town&&f.county===county)})}
function appendInsetFrames(group,t,spec,prefix=''){for(const q of activeInsetDefinitions()){const b=q.box,g=svgEl('g',{'data-inset':prefix+q.name});const p=q.d?svgEl('path',{d:q.d,transform:transformOf(t),fill:'none',stroke:'#a3b5a8','stroke-width':.75,'vector-effect':'non-scaling-stroke'}):svgEl('rect',{x:b[0]*t.scale+t.tx,y:b[1]*t.scale+t.ty,width:(b[2]-b[0])*t.scale,height:(b[3]-b[1])*t.scale,rx:3,fill:'none',stroke:'#a3b5a8','stroke-width':.75,'vector-effect':'non-scaling-stroke'});g.append(p);group.append(g)}}
function drawInsetFrames(group,t,spec){group.replaceChildren();if(identityPanelsActive()){for(const panel of identityPanelLayouts()){const {area}=panel;group.append(svgEl('rect',{x:area.left,y:area.top-52,width:area.right-area.left,height:area.bottom-area.top+52,rx:16,fill:'#fbfdfb',stroke:'#d7e2d9','stroke-width':1.4}));const title=svgEl('text',{x:(area.left+area.right)/2,y:area.top-18,'text-anchor':'middle','font-size':30,'font-weight':600,fill:'#294a3a'});title.textContent=panel.label;group.append(title);const note=svgEl('text',{x:(area.left+area.right)/2,y:area.top+13,'text-anchor':'middle','font-size':16,fill:'#74877a'});note.textContent=panel.items.length?panel.items.length+(panel.townLevel?' 个乡镇市区':' 个选区'):mapLoadState[state.level==='council'?'议员选区':'立法机构民代选区']==='loading'?'正在载入地图…':'当前范围没有此类选区';group.append(note);appendInsetFrames(group,panel.t,spec,panel.identity+'-')}return}appendInsetFrames(group,t,spec)}
function drawMapFurniture(group,t,spec){group.replaceChildren();const wide=isNationwide(),area=contentArea(spec),footerTop=spec.height-furnitureFooterHeight(),unit=wide?1.3:1,nx=spec.width-138,ny=wide?125:110,okNorth=decorationClear([nx-20,ny-12,nx+20,ny+57]),cx=okNorth?nx:spec.width-75,cy=okNorth?ny:85;
 const north=svgEl('g',{'data-decoration':'north-arrow',transform:`translate(${cx},${cy}) scale(${unit})`});north.append(svgEl('path',{d:'M0,8L-10,42L0,34L10,42Z',fill:'#365d49'}));north.append(svgEl('path',{d:'M0,8L0,34L10,42Z',fill:'#fff',stroke:'#365d49','stroke-width':.8}));const n=svgEl('text',{x:0,y:0,'font-size':13,'font-weight':600,'text-anchor':'middle',fill:'#365d49'});n.textContent='N';north.append(n);group.append(north);
 const pixelsPerKm=t.scale*10000/6371.0088,target=Math.min(wide?220:140,area.right-area.left-120),km=[.01,.02,.05,.1,.2,.5,1,2,5,10,20,50,100,200].reduce((a,b)=>Math.abs(b*pixelsPerKm-target)<Math.abs(a*pixelsPerKm-target)?b:a),length=km*pixelsPerKm,sx=area.left+70,sy=footerTop-8,okScale=decorationClear([sx-15,sy-30,sx+length+72,sy+32]),x=okScale?sx:area.left+20,y=okScale?sy:footerTop+15,font=wide?15:10,bar=svgEl('g',{'data-decoration':'scale-bar','data-distance-km':km,'data-length':length});
 bar.append(svgEl('rect',{x:x-12,y:y-24,width:length+70,height:52,rx:6,fill:'#ffffffed'}));for(let i=0;i<2;i++)bar.append(svgEl('rect',{x:x+i*length/2,y,width:length/2,height:6,fill:i?'#fff':'#365d49',stroke:'#365d49','stroke-width':.8}));for(let i=0;i<3;i++){const text=svgEl('text',{x:x+i*length/2,y:y-7,'font-size':font,'text-anchor':'middle',fill:'#466253'});text.textContent=Number(((km<1?km*1000:km)*i/2).toFixed(2))+(i===2?(km<1?' m':' km'):'');bar.append(text)}group.append(bar);
}
function renderMapFurniture(){const spec=sceneSpec(),t=identityPanelsActive()?identityPanelLayouts()[0]?.t:geometryLayout(currentItems(),state.labels);if(!t)return;drawInsetFrames($('insetFrames'),t,spec);drawMapFurniture($('mapFurniture'),t,spec)}

function regionPath(f){const identity=identityPanelsActive()?' · '+electorateName(featureElectorate(f)):'';const p=svgEl('path',{d:f.d,fill:fillColor(f),stroke:'none','stroke-width':0,'vector-effect':'non-scaling-stroke','fill-rule':'evenodd','data-region':f.id,'data-electorate':featureElectorate(f),tabindex:0,role:'button','aria-label':`${f.county}${f.name===f.county?'':f.name}${identity}，${regionDetail(f)}`});const title=svgEl('title');title.textContent=f.county+(f.name===f.county?'':f.name)+identity;p.append(title);p.addEventListener('click',()=>{if(!moved)paint(f)});p.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();paint(f)}};p.onpointermove=e=>{if(drag)return;const tip=$('tooltip'),r=$('canvas').getBoundingClientRect();tip.replaceChildren();const label=document.createElement('span');label.textContent=f.name;const sub=document.createElement('small');sub.textContent=f.county+(f.town?' · '+f.town:'')+identity+' · '+regionDetail(f);tip.append(label,sub);tip.hidden=false;tip.style.left=Math.min(e.clientX-r.left+15,r.width-165)+'px';tip.style.top=Math.max(45,e.clientY-r.top-48)+'px'};p.onpointerleave=()=>$('tooltip').hidden=true;return p}

// Nationwide views show shared internal borders only; county views restore
// complete polygon outlines, including coastal and isolated-island edges.
function sharedBoundaryGeometry(features,includeCoast=false){
 const edges=new Map();
 const rounded=n=>{const v=Math.round(n*100)/100;return Object.is(v,-0)?0:v};
 const point=(x,y)=>[rounded(x),rounded(y)];
 const vertex=p=>p[0]+','+p[1];
 for(let index=0;index<features.length;index++){
  const feature=features[index];
  if(!feature||typeof feature.d!=='string'||!feature.d)continue;
  const owner=String(feature.id??index);
  const tokens=feature.d.match(/[MmLlHhVvZz]|[-+]?(?:\d*\.?\d+)(?:[eE][-+]?\d+)?/g)||[];
  let cursor=0,command='',previous=null,first=null;
  const add=(a,b)=>{
   if(!a||!b)return;
   const x=vertex(a),y=vertex(b);
   if(x===y)return;
   const key=x<y?x+'|'+y:y+'|'+x;
   const entry=edges.get(key);
   if(!entry){edges.set(key,{a:x,b:y,owner,county:feature.county||feature.name||'',town:feature.townId||feature.id||'',other:null});return}
   if(entry.owner!==owner&&!entry.other)entry.other={owner,county:feature.county||feature.name||'',town:feature.townId||feature.id||''};
  };
  while(cursor<tokens.length){
   if(/^[MmLlHhVvZz]$/.test(tokens[cursor])){
    command=tokens[cursor++];
    if(command.toUpperCase()==='Z'){add(previous,first);previous=first;first=null;continue}
   }
   const kind=command.toUpperCase();
   if(!['M','L','H','V'].includes(kind)){cursor++;continue}
   if(cursor>=tokens.length||/^[MmLlHhVvZz]$/.test(tokens[cursor]))continue;
   const x=Number(tokens[cursor++]);
   let next;
   if(kind==='H')next=point((command==='h'&&previous?previous[0]:0)+x,previous?.[1]||0);
   else if(kind==='V')next=point(previous?.[0]||0,(command==='v'&&previous?previous[1]:0)+x);
   else{
    if(cursor>=tokens.length||/^[MmLlHhVvZz]$/.test(tokens[cursor]))break;
    const y=Number(tokens[cursor++]);
    next=point((command===command.toLowerCase()&&previous?previous[0]:0)+x,(command===command.toLowerCase()&&previous?previous[1]:0)+y);
   }
   if(!Number.isFinite(next[0])||!Number.isFinite(next[1]))continue;
   if(kind==='M'){first=next;command=command==='m'?'l':'L'}
   else add(previous,next);
   previous=next;
  }
 }
 const all=[],byCounty=Object.create(null),byTown=Object.create(null);
 const write=(arr,a,b)=>{if(arr.last===a)arr.push('L'+b);else arr.push('M'+a+'L'+b);arr.last=b};
 for(const edge of edges.values()){
  if(!edge.other&&!includeCoast)continue;
  write(all,edge.a,edge.b);
  for(const county of new Set([edge.county,edge.other?.county])){
   if(!county)continue;
   const arr=byCounty[county]||(byCounty[county]=[]);
   write(arr,edge.a,edge.b);
  }
  for(const town of new Set([edge.town,edge.other?.town])){
   if(!town)continue;
   const arr=byTown[town]||(byTown[town]=[]);
   write(arr,edge.a,edge.b);
  }
 }
 return {all:all.join(''),byCounty:Object.fromEntries(Object.entries(byCounty).map(([k,v])=>[k,v.join('')])),byTown:Object.fromEntries(Object.entries(byTown).map(([k,v])=>[k,v.join('')]))};
}
const EMPTY_SHARED_BORDER_FEATURES=[];
const sharedBorderCache=new Map();
function sharedMapBorders(level,identity='regional',includeCoast=false){
 const regional=data[level]||[],indigenous=['council','legislative'].includes(level)?data[level+'Indigenous']||EMPTY_SHARED_BORDER_FEATURES:null;
 const key=level+':'+identity+':'+(includeCoast?'complete':'internal'),prior=sharedBorderCache.get(key);
 if(prior&&prior.regional===regional&&prior.indigenous===indigenous)return prior.mesh;
 const features=indigenous?.length?[...regional,...indigenous].filter(f=>featureElectorate(f)===identity):regional;
 const mesh=sharedBoundaryGeometry(features,includeCoast);
 sharedBorderCache.set(key,{regional,indigenous,mesh});
 return mesh;
}
function appendSharedBorders(group,level,identity='regional',filterTown=false){
 const mesh=sharedMapBorders(level,identity,!!state.county);
 const d=filterTown&&state.villageTown?mesh.byTown[state.villageTown]||'':state.county?mesh.byCounty[state.county]||'':mesh.all;
 if(d)group.append(svgEl('path',{d,fill:'none','vector-effect':'non-scaling-stroke','data-shared-boundary':level}));
}


function render(){
 if(!data)return;ensureMapDetails();syncMapLayerStatus();$('canvas').classList.toggle('nationwide-mode',isNationwide());$('canvas').classList.toggle('county-mode',state.level==='counties'||mayorTownBoundaryOverlay());
 const regionGroup=$('regions'),borderGroup=$('borders'),districtGroup=$('districtBorders'),townGroup=$('townBorders');
 for(const group of [regionGroup,borderGroup,districtGroup,townGroup]){group.replaceChildren();group.removeAttribute('transform')}
 if(identityPanelsActive()){
  renderTownBorders();
  for(const panel of identityPanelLayouts()){
   const transform=transformOf(panel.t),regions=svgEl('g',{'data-electorate':panel.identity,transform}),districts=svgEl('g',{'data-electorate':panel.identity,transform}),counties=svgEl('g',{'data-electorate':panel.identity,transform});
   for(const f of panel.items)regions.append(regionPath(f));
   appendSharedBorders(districts,panel.townLevel?'towns':state.level,panel.identity);
   appendSharedBorders(counties,'counties');
   regionGroup.append(regions);districtGroup.append(districts);borderGroup.append(counties);
  }
 }else{
  const transform=transformOf(geometryLayout(currentItems(),state.labels));
  for(const group of [regionGroup,borderGroup,districtGroup,townGroup])group.setAttribute('transform',transform);
  renderTownBorders();
  appendSharedBorders(districtGroup,mayorTownBoundaryOverlay()?'counties':state.level,'regional',state.level==='villages');
  for(const f of currentItems())regionGroup.append(regionPath(f));
  if(state.level!=='counties'&&!mayorTownBoundaryOverlay()&&!(state.level==='villages'&&state.villageTown))appendSharedBorders(borderGroup,'counties');
 }
 fit();renderPalette();renderLegend();renderList();updateProgress();updateHistory();applyBorders();renderMapFurniture();
 if(typeof renderPredictionDecorations==='function')renderPredictionDecorations()
}
function recolor(){if(state.fillMode==='prediction'){render();return}if(state.fillMode==='gradient'){for(const p of $('regions').querySelectorAll('path')){const f=currentItems().find(f=>f.id===p.dataset.region);if(!f)continue;p.setAttribute('fill',fillColor(f));p.setAttribute('aria-label',f.county+(f.name===f.county?'':f.name)+'，'+regionDetail(f));}return;}for(const p of $('regions').querySelectorAll('path')){const f=currentItems().find(x=>x.id===p.dataset.region);if(!f)continue;const pal=paletteById(featureFillId(f));p.setAttribute('fill',pal?.color||'#edf1e9');p.setAttribute('aria-label',f.county+(f.name===f.county?'':f.name)+'，'+(pal?.name||'未填色'))}}
function paint(f){if(state.fillMode==='prediction'&&typeof openPredictionRegion==='function'){openPredictionRegion(f);return}if(typeof inspectCandidateRegion==='function'&&inspectCandidateRegion(f))return;if(state.fillMode==='gradient'){if(erase){pushHistory();delete state.elections[state.level][f.id];afterElectionEdit();return;}openVoteEditor(f);return;}const id=erase?undefined:state.selected,store=f.legislativeTown?state.legislativeTownFills[featureElectorate(f)]:state.fills[state.level],key=f.legislativeTown?f.sourceId:f.id;if(store[key]===id)return;pushHistory();if(id)store[key]=id;else delete store[key];recolor();renderPalette();renderLegend();renderList();updateProgress();persist()}
function zoom(factor,anchor){if(!view)return;const next=view.w*factor;if(next<baseView.w/16||next>baseView.w*2)return;const a=anchor||[.5,.5];view={x:view.x+view.w*a[0]*(1-factor),y:view.y+view.h*a[1]*(1-factor),w:next,h:view.h*factor};applyView();if(state.labels&&['council','legislative'].includes(state.level))scheduleNavigationLabels()}
$('county').onchange=()=>{state.county=$('county').value;state.villageTown='';syncVillageControls();render();persist()};for(const [id,level]of [['townLevel','towns'],['countyLevel','counties'],['councilLevel','council'],['legislativeLevel','legislative'],['villageLevel','villages']])$(id).onclick=()=>{if(state.level===level)return;state.level=level;if(state.fillMode==='prediction'&&state.predictionOffice==='mayor'&&state.predictionScale==='town'&&['towns','counties'].includes(level))state.predictionScale='district';if(typeof predictionLevelChanged==='function')predictionLevelChanged(level);syncInputs();render();persist();toast('各地图图层的填色和数据分别保存')};$('showLabels').onchange=()=>{state.labels=$('showLabels').checked;render();persist()};$('search').oninput=renderList;for(const [id,key]of [['mapTitle','title'],['legendTitle','legendTitle']]){let editing=false;$(id).onfocus=()=>editing=false;$(id).oninput=()=>{if(!editing){pushHistory();editing=true}state[key]=simplify($(id).value);if(key==='legendTitle')renderLegend();persist()};}$('eraser').onclick=()=>{erase=!erase;renderPalette();updateBrush()};$('undo').onclick=()=>restore('undo');$('redo').onclick=()=>restore('redo');$('zoomIn').onclick=()=>zoom(.8);$('zoomOut').onclick=()=>zoom(1.25);$('fit').onclick=fit;
$('map').addEventListener('wheel',e=>{if(!view)return;e.preventDefault();flushView();const p=new DOMPoint(e.clientX,e.clientY).matrixTransform($('map').getScreenCTM().inverse());zoom(e.deltaY>0?1.1:1/1.1,[(p.x-view.x)/view.w,(p.y-view.y)/view.h])},{passive:false});
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
$('saveProject').onclick=()=>{download(new Blob([JSON.stringify(projectStateForSave(),null,2)],{type:'application/json'}),filename()+'.json');toast('方案已保存，可在其他设备打开')};$('loadProject').onclick=()=>$('projectFile').click();$('projectFile').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>10000000)throw Error('方案文件过大');const next=cleanProject(JSON.parse(await file.text()));if(next.county&&!data.counties.some(f=>f.name===next.county))throw Error('方案中的县市未找到');pushHistory();state=next;erase=false;syncInputs();render();persist();toast('已打开地图方案')}catch(err){toast(err.message||'无法读取方案')}finally{e.target.value=''}};
function exportPredictionWinnerRows(){
 if(mayorTownBoundaryOverlay())return[]; // Nationwide overview is navigation, not county winners.
 if(!state.exportSettings.winnerTable||state.fillMode!=='prediction'||typeof predictionDistricts!=='function'||typeof directoryCandidates!=='function')return[];
 const rows=[],numeric=predictionUsesVoteDisplay()&&!(typeof localPredictionActive==='function'&&localPredictionActive()&&state.predictionOffice==='mayor'&&state.predictionDisplay==='composition');
 const candidateMode=state.predictionDisplay==='candidateVote',selectedCandidateId=candidateMode?state.localDisplayCandidate:'';
 function add(d,record,district,local=false){
  const candidates=directoryCandidates(d),ids=new Set(local?[record.leaderId].filter(Boolean):record.winners||[]);
  const complete=local?!!record.leaderId:predictionSummary(d).status==='complete';
  if(!numeric&&!complete)return;
  let leading=null;if(!candidateMode)try{leading=PredictionCore.voteResult(candidates,record)}catch(e){}
  for(const c of candidates){
   const estimate=record.estimates?.[c.id],selected=ids.has(c.id);
   const hasVotes=estimate?.votes!==null&&estimate?.votes!==undefined&&String(estimate.votes).trim()!=='';
   const hasShare=estimate?.share!==null&&estimate?.share!==undefined&&String(estimate.share).trim()!=='';
   // Specified-candidate exports use the same chosen ID as the map, not every entered estimate.
   if(candidateMode){
    if(c.id!==selectedCandidateId||(!hasVotes&&!hasShare))continue;
   }else if(numeric?!estimate&&!selected:!selected)continue;
   const party=predictionParty(c.party);let result=null;
   if(!candidateMode)try{result=PredictionCore.candidateVoteResult(candidates,record,c.id)}catch(e){}
   const status=selected?(local?'手选胜出':'手选当选'):leading?.candidate.id===c.id?(leading.partial?'暂时领先':d.type==='council'?'第一高票':'预测领先'):'已录入';
   rows.push({district,number:c.number||'待补',name:candidateDisplayName(c),gender:c.gender||'待补',party:c.party,color:party.color,logo:logoFor(party),incumbent:c.incumbent===true?'现任':'',
    ...(numeric?{estimated:true,specified:candidateMode,hasVotes,hasShare,
     votes:candidateMode?(hasVotes?Number(estimate.votes).toLocaleString('zh-CN'):'—'):result?.votes==null?'—':result.votes.toLocaleString('zh-CN'),
     share:candidateMode?(hasShare?Number(Number(estimate.share).toFixed(2))+'%':'—'):result?.share==null?'—':Number(result.share.toFixed(2))+'%'+(result.partial?'*':''),status}:{}),local});
  }
 }
 if(typeof localPredictionActive==='function'&&localPredictionActive()){
  for(const f of currentItems()){
   const d=directoryDistrictById.get(f.parentDistrictId);if(!d)continue;
   if(exportPanelFilter&&state.level==='council'&&DistrictCore.identity(d)!==exportPanelFilter)continue;
   add(d,localRecord(d,f),[state.county?'':d.county,f.name].filter(Boolean).join(' · '),true);
  }
 }else for(const d of predictionDistricts()){
  if(exportPanelFilter&&state.level==='council'&&DistrictCore.identity(d)!==exportPanelFilter)continue;
  const record=state.predictions[d.id];if(!record)continue;
  add(d,record,state.county?(d.county===d.name?d.county:shortDirectoryName(d)):(d.county===d.name?d.county:d.county+' · '+shortDirectoryName(d)));
 }
 return rows;
}
function exportTextWidth(value){let n=0;for(const c of Array.from(String(value||'')))n+=/[\u0000-\u00ff]/.test(c)?.55:1;return n}
function truncateExportText(value,max){const text=String(value||'');if(exportTextWidth(text)<=max)return text;let out='',width=0;for(const c of Array.from(text)){const step=/[\u0000-\u00ff]/.test(c)?.55:1;if(width+step>max-1)break;out+=c;width+=step}return out+'…'}
function wrapExportText(value,max=82){const lines=[];for(const paragraph of String(value||'').split(/\r?\n/)){if(!paragraph){lines.push('');continue}let line='',width=0;for(const token of paragraph.match(/[A-Za-z0-9]+(?:[’'-][A-Za-z0-9]+)*|[\s\S]/gu)||[]){for(const part of exportTextWidth(token)>max?Array.from(token):[token]){const step=exportTextWidth(part);if(line&&width+step>max){lines.push(line);line='';width=0}line+=part;width+=step}}if(line)lines.push(line)}return lines}
function appendExportNote(root,lines,y){if(!lines.length)return 0;const height=26+lines.length*19;root.append(svgEl('rect',{x:40,y,width:1120,height,rx:10,fill:'#f3f7f3',stroke:'#e0e8e1','stroke-width':1}));const label=svgEl('text',{x:60,y:y+21,'font-size':11,'font-weight':600,fill:'#557064'});label.textContent='说明';root.append(label);lines.forEach((line,index)=>{const text=svgEl('text',{x:102,y:y+21+index*19,'font-size':11.5,fill:'#60766b'});text.textContent=line;root.append(text)});return height}
function polishedPredictionTableLayout(rows){
 // Two adjacent candidates per visual row; each candidate shows only
 // district, name (with an inline incumbent badge) and party + emblem.
 const width=1120,innerWidth=1084,gap=14,slotWidth=(innerWidth-gap)/2;
 const widths=[120,172,slotWidth-292],font=15.5,lineHeight=21.5,rowHeight=55;
 const headingHeight=62,tableHeaderHeight=44,paddingBottom=18;
 const entries=rows.map(row=>{
  const district=wrapExportText(row.district,Math.max(3,(widths[0]-24)/14.2));
  const name=wrapExportText(row.name,Math.max(3,(widths[1]-(row.incumbent?62:25))/font));
  const party=wrapExportText(row.party,Math.max(3,(widths[2]-64)/14));
  const height=Math.max(rowHeight,Math.max(district.length,name.length,party.length)*lineHeight+23);
  return{row,cells:[district,name,party],height};
 });
 const pairs=[];
 for(let i=0;i<entries.length;i+=2){
  const entriesInRow=entries.slice(i,i+2);
  pairs.push({entries:entriesInRow,height:Math.max(...entriesInRow.map(e=>e.height))});
 }
 return{polished:true,columns:2,width,innerWidth,slotWidth,gap,widths,font,lineHeight,rowHeight,
  headers:['选区','姓名','政党'],pairs,chunk:Math.ceil(rows.length/2),
  tableHeaderHeight,headingHeight,height:headingHeight+tableHeaderHeight+
   pairs.reduce((sum,pair)=>sum+pair.height,0)+paddingBottom};
}
function exportPredictionTableLayout(rows){
 // With up to 28 non-numeric winners there is room for a true editorial table:
 // larger names, aligned party logos and a compact incumbent-status chip.
 if(rows.length&&rows.length<=28&&!rows.some(row=>row.estimated))return polishedPredictionTableLayout(rows);
 const columns=rows.length<=28?1:rows.length<=90?2:rows.length<=260?3:4,font=columns===1?12.5:11.5,lineHeight=font*1.45,rowHeight=34,gap=20;
 const specified=rows.length>0&&rows.every(row=>row.specified),estimated=rows.some(row=>row.estimated);
 const width=Math.max(1120,columns*(estimated?940:570)+gap*(columns-1)+40),blockWidth=(width-40-gap*(columns-1))/columns,chunk=Math.ceil(rows.length/columns),headers=['选区','号次','姓名','性别','政党','是否现任'];
 const metricFields=estimated?(specified?['votes','share'].filter(field=>rows.some(row=>field==='votes'?row.hasVotes:row.hasShare)):['votes','share','status']):[];
 const metricHeaders={votes:'预测得票数',share:'预测得票率',status:'标记'},metricWidths={votes:100,share:85,status:95};
 headers.push(...metricFields.map(field=>metricHeaders[field]));
 const longest=key=>Math.max(0,...rows.map(row=>exportTextWidth(row?.[key])));
 const fixed=[52,47,65],flexWidth=blockWidth-fixed.reduce((n,v)=>n+v,0)-metricFields.reduce((n,field)=>n+metricWidths[field],0),desired=[Math.max(120,Math.min(215,longest('district')*font+24)),Math.max(110,Math.min(185,longest('name')*font+24)),Math.max(170,Math.min(260,longest('party')*font+52))],sum=desired.reduce((n,v)=>n+v,0);
 const widths=[flexWidth*desired[0]/sum,fixed[0],flexWidth*desired[1]/sum,fixed[1],flexWidth*desired[2]/sum,fixed[2]];widths.push(...metricFields.map(field=>metricWidths[field]));
 const blocks=Array.from({length:columns},(_,column)=>rows.slice(column*chunk,(column+1)*chunk).map(row=>{
  const values=[row?.district,row?.number,row?.name,row?.gender,row?.party,row?.incumbent];for(const field of metricFields)values.push(row?.[field]|| (field==='status'?'手选当选':'—'));
  const cells=values.map((value,i)=>wrapExportText(value,Math.max(1,(widths[i]-(i===4?55:16))/font)));
  const height=Math.max(rowHeight,Math.max(...cells.map(lines=>lines.length))*lineHeight+18);
  return{row,cells,height};
 })),bodyHeight=Math.max(rowHeight,...blocks.map(block=>rowHeight+block.reduce((n,r)=>n+r.height,0))),height=bodyHeight+79;
 return{columns,rowHeight,font,lineHeight,gap,width,blockWidth,widths,chunk,headers,blocks,height,specified};
}
function appendExportPolishedWinnerTable(root,rows,y,layout){
 const card=svgEl('g',{'data-export-winner-table':'true','data-export-table-style':'two-up'});
 root.append(card);
 const outerX=40,innerX=58,innerWidth=layout.innerWidth;
 card.append(svgEl('rect',{x:outerX,y,width:layout.width,height:layout.height,rx:17,fill:'#fff',
  stroke:'#d9e5dd','stroke-width':1.3}));
 card.append(svgEl('rect',{x:outerX,y:y+18,width:4,height:28,rx:2,fill:'#3f8562'}));
 const heading=svgEl('text',{x:63,y:y+38,'font-size':21,'font-weight':700,fill:'#274d3b'});
 heading.textContent=rows.some(row=>row.local)?'乡镇市区预测胜出候选人':'预测当选候选人';card.append(heading);
 const headerY=y+layout.headingHeight,headerH=layout.tableHeaderHeight,bodyY=headerY+headerH;
 const slotX=i=>innerX+i*(layout.slotWidth+layout.gap);
 for(let i=0;i<2;i++){
  const x=slotX(i);
  card.append(svgEl('rect',{x,y:headerY,width:layout.slotWidth,height:headerH,
   rx:7,fill:'#eaf3ed'}));
  let tx=x;
  layout.headers.forEach((name,k)=>{
   const label=svgEl('text',{x:tx+13,y:headerY+headerH/2,'font-size':14,'font-weight':650,
    fill:'#375d48','dominant-baseline':'middle','data-export-winner-header':name});
   label.textContent=name;card.append(label);tx+=layout.widths[k];
  });
 }
 let currentY=bodyY;
 layout.pairs.forEach((pair,pairIndex)=>{
  const group=svgEl('g',{'data-export-winner-row':'true','data-export-row-index':pairIndex});
  card.append(group);
  if(pairIndex%2===1)group.append(svgEl('rect',{x:innerX,y:currentY,width:innerWidth,
   height:pair.height,fill:'#f7faf8'}));
  const mid=currentY+pair.height/2;
  for(const [slotIndex,entry]of pair.entries.entries()){
   const x=slotX(slotIndex),row=entry.row;
   const item=svgEl('g',{'data-export-winner-entry':'true','data-export-slot':slotIndex,
    'data-export-district':row.district});
   group.append(item);
   const [districtLines,nameLines,partyLines]=entry.cells;
   function linesAt(lines,xPos,size,weight,color,kind){
    const text=svgEl('text',{x:xPos,y:mid-(lines.length-1)*layout.lineHeight/2,
     'font-size':size,'font-weight':weight,fill:color,'dominant-baseline':'middle',
     'data-export-field':kind});
    lines.forEach((line,i)=>{
     const span=svgEl('tspan',{x:xPos,dy:i?layout.lineHeight:0});
     span.textContent=line;text.append(span);
    });
    item.append(text);
   }
   const [districtWidth,nameWidth]=layout.widths;
   linesAt(districtLines,x+13,14.2,450,'#536e60','district');
   const nameX=x+districtWidth+12;
   linesAt(nameLines,nameX,layout.font,650,'#254a39','name');
   if(row.incumbent){
    const lastLine=nameLines.at(-1)||'';
    const lastLineY=mid+(nameLines.length-1)*layout.lineHeight/2;
    // The name column reserves space for this inline badge, even when wrapping.
    const offset=exportTextWidth(lastLine)*layout.font+8;
    const badgeX=nameX+offset;
    item.append(svgEl('rect',{x:badgeX,y:lastLineY-10.5,width:39,height:21,
     rx:10.5,fill:'#e3f3e8','data-export-incumbent':'true'}));
    const badge=svgEl('text',{x:badgeX+19.5,y:lastLineY+.5,'font-size':11.5,
     'font-weight':600,fill:'#2b754b','text-anchor':'middle','dominant-baseline':'middle'});
    badge.textContent='现任';item.append(badge);
   }
   const partyX=x+districtWidth+nameWidth;
   item.append(svgEl('rect',{x:partyX+11,y:mid-12,width:3,height:24,rx:1.5,
    fill:row.color||'#71867a'}));
   if(row.logo)appendCircularPartyLogo(item,row.logo,partyX+22,mid-12,24,
    {'data-export-party-logo':'true'});
   linesAt(partyLines,partyX+55,14,500,'#526b5e','party');
  }
  if(pairIndex!==layout.pairs.length-1)group.append(svgEl('line',{x1:innerX+9,
   x2:innerX+innerWidth-9,y1:currentY+pair.height,y2:currentY+pair.height,
   stroke:'#dfe9e2','stroke-width':.8}));
  currentY+=pair.height;
 });
 // A gentle middle divider distinguishes the two parallel candidates.
 card.append(svgEl('line',{x1:innerX+layout.slotWidth+layout.gap/2,
  y1:headerY+7,x2:innerX+layout.slotWidth+layout.gap/2,
  y2:currentY,stroke:'#d6e4da','stroke-width':1}));
 return layout.height;
}
function appendExportPredictionTable(root,rows,y){
 if(!rows.length)return 0;const layout=exportPredictionTableLayout(rows);
 if(layout.polished)return appendExportPolishedWinnerTable(root,rows,y,layout);
 const card=svgEl('g',{'data-export-winner-table':'true'});root.append(card);card.append(svgEl('rect',{x:40,y,width:layout.width,height:layout.height,rx:14,fill:'#fff',stroke:'#dce5df','stroke-width':1.2}));const heading=svgEl('text',{x:60,y:y+31,'font-size':19,'font-weight':600,fill:'#294a3a'});heading.textContent=layout.specified?'指定候选人得票预测':rows.some(row=>row.estimated)?'预测得票候选人':rows.some(row=>row.local)?'乡镇市区预测胜出候选人':'预测当选候选人';card.append(heading);card.append(svgEl('line',{x1:60,y1:y+46,x2:layout.width+20,y2:y+46,stroke:'#e5ece6'}));
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

function numberTableExportMetrics(entries,columns=1){
 const rows=mapNumberSorted(entries),cols=Math.max(1,columns),perColumn=Math.ceil(rows.length/cols);
 return{width:cols*210+22,height:53+perColumn*22,columns:cols,perColumn};
}
function appendNumberTableExport(root,entries,x,y,columns=1){
 const rows=mapNumberSorted(entries);if(!rows.length)return 0;
 const m=numberTableExportMetrics(rows,columns);
 const panel=svgEl('g',{'data-map-number-key':'true'});
 panel.append(svgEl('rect',{x,y,width:m.width,height:m.height,rx:11,fill:'#fff',stroke:'#dce5df','stroke-width':1}));
 const heading=svgEl('text',{x:x+13,y:y+28,'font-size':17,'font-weight':650,fill:'#294a3a'});
 heading.textContent='数字对照表';panel.append(heading);
 for(let i=0;i<rows.length;i++){
  const row=rows[i],col=Math.floor(i/m.perColumn),index=i%m.perColumn;
  const bx=x+10+col*210,by=y+48+index*22;
  if(index%2===0)panel.append(svgEl('rect',{x:bx,y:by-3,width:207,height:21,fill:'#f5f8f5'}));
  const num=svgEl('text',{x:bx+8,y:by+12,'font-size':12,'font-weight':700,fill:'#235443'});
  num.textContent=row.number;panel.append(num);
  const value=svgEl('text',{x:bx+39,y:by+12,'font-size':12,fill:'#365344'});
  value.textContent=mapNumberDisplayName(row,rows);panel.append(value);
 }
 root.append(panel);return m.height;
}

// Every administrative area or electoral district must be identified somewhere
// in the FINAL exported figure, even when its polygon cannot hold a legible label.
function exportLabelCoverage(items,map,detailLabelled=new Set()){
 const labelled=new Set();
 for(const el of map.querySelectorAll('[data-label]')){
  if(el.hasAttribute('data-number-key'))continue; // mapped admin number belongs to the paired number key
  labelled.add(String(el.getAttribute('data-label')));
 }
 const keyed=new Set(exportNumberRows.map(row=>row.id));
 const rows=[],seen=new Set();
 for(const f of items){
  const id=String(f.id),token=[id,featureElectorate(f)].join('/');
  if(seen.has(token))continue;seen.add(token);
  if(labelled.has(id)||detailLabelled.has(id)||keyed.has(id))continue;
  const scope=[f.county,f.town].filter(Boolean).join(' · ');
  const district=['council','legislative'].includes(state.level)&&!f.parentDistrictId&&!f.legislativeTown;
  const number=districtMapNumber(f);
  const originalName=String(f.name||'').trim(),plainDistrict=originalName.match(/^(?:第\s*)?(\d+)\s*(?:选|選)(?:举|舉)?(?:区|區)$/);
  const sameAsNumber=!!(number&&plainDistrict&&Number(plainDistrict[1])===Number(number));
  const value=district?(number?'第'+number+'选区'+(originalName&&!sameAsNumber?' · '+originalName:''):originalName):originalName;
  rows.push({id,scope,value:value||f.name||id});
 }
 return rows.sort((a,b)=>a.scope.localeCompare(b.scope,'zh')||a.value.localeCompare(b.value,'zh'));
}
// Export-only detail maps restore geographic context in dense areas.
 // Never draw a label unless its text has passed the same overlap test as the main map.
function appendExportDetailInsets(root,features,targetIds,y,width){
 const wanted=new Set(targetIds.map(String));
 const candidates=features.filter(f=>wanted.has(String(f.id))&&Array.isArray(f.box)&&f.d);
 candidates.sort((a,b)=>String(a.county).localeCompare(String(b.county),'zh')||
  ((a.center?.[1]??(a.box[1]+a.box[3])/2)-(b.center?.[1]??(b.box[1]+b.box[3])/2))||
  ((a.center?.[0]??(a.box[0]+a.box[2])/2)-(b.center?.[0]??(b.box[0]+b.box[2])/2)));
 const chosen=candidates.slice(0,48),groups=[];
 for(const f of chosen){
  const last=groups.at(-1);
  if(last&&last.length<5&&last[0].county===f.county)last.push(f);
  else groups.push([f]);
 }
 if(!groups.length)return{height:0,labelled:new Set()};
 const cols=width>=850?2:1,gap=18,cellWidth=(width-gap*(cols-1))/cols,cellHeight=355;
 const rows=Math.ceil(groups.length/cols),labelled=new Set(),mapGroup=svgEl('g',{'data-export-detail-maps':'true'});
 groups.forEach((items,index)=>{
  const x=40+(index%cols)*(cellWidth+gap),top=y+Math.floor(index/cols)*(cellHeight+gap),
   panel=svgEl('g',{'data-export-detail-map':items[0].county||'区域'});
  panel.append(svgEl('rect',{x,y:top,width:cellWidth,height:cellHeight,rx:13,fill:'#fcfefc',stroke:'#d7e3d8','stroke-width':1.2}));
  const title=svgEl('text',{x:x+16,y:top+30,'font-size':16,'font-weight':650,fill:'#294a3a'});
  title.textContent=(items[0].county||'区域')+' · 局部放大 '+(index+1);panel.append(title);
  const b=bounds(items),left=x+24,right=x+cellWidth-24,upper=top+54,lower=top+cellHeight-20;
  const scale=Math.min((right-left)/Math.max(.0001,b[2]-b[0]),(lower-upper)/Math.max(.0001,b[3]-b[1]));
  const t={scale,tx:(left+right)/2-(b[0]+b[2])/2*scale,
   ty:(upper+lower)/2-(b[1]+b[3])/2*scale,area:{left,right,top:upper,bottom:lower}};
  const land=svgEl('g',{transform:transformOf(t)});
  for(const f of items)land.append(svgEl('path',{d:f.d,fill:fillColor(f),
   stroke:'#486b58','stroke-width':1.3,'vector-effect':'non-scaling-stroke','fill-rule':'evenodd'}));
  panel.append(land);
  const used=[];
  for(const f of [...items].sort((a,b)=>(b.box[2]-b.box[0])*(b.box[3]-b.box[1])-(a.box[2]-a.box[0])*(a.box[3]-a.box[1]))){
   const text=['council','legislative'].includes(state.level)?districtMapNumber(f)||f.name:f.name;
   if(!text)continue;
   const pos=mapAdaptiveLabel(f,t,text,16,used,t.area,null);
   if(!pos)continue;
   const label=svgEl('text',{x:pos.x,y:pos.y,'text-anchor':'middle',
    'dominant-baseline':'middle','font-size':pos.font,'font-weight':600,
    fill:'#284538',stroke:'#fff','stroke-width':3,'paint-order':'stroke',
    'data-export-detail-label':String(f.id)});
   label.textContent=text;panel.append(label);used.push(pos.rect);labelled.add(String(f.id));
  }
  mapGroup.append(panel);
 });
 root.append(mapGroup);
 return{height:rows*cellHeight+(rows-1)*gap,labelled};
}

function exportLabelCoverageLayout(rows,width){
 const columns=Math.max(1,Math.min(3,Math.floor((width-40)/300))),
  gap=14,margin=20,blockWidth=(width-margin*2-gap*(columns-1))/columns;
 const chunks=Array.from({length:columns},(_,i)=>rows.slice(i*Math.ceil(rows.length/columns),(i+1)*Math.ceil(rows.length/columns)));
 const maxChars=Math.max(6,(blockWidth-35)/13);
 const prepared=chunks.map(chunk=>chunk.map(row=>{
  const text=[row.scope,row.value].filter(Boolean).join(' · ');
  const lines=wrapExportText(text,maxChars);
  return{lines,height:Math.max(30,12+lines.length*17)};
 }));
 const height=52+Math.max(0,...prepared.map(chunk=>chunk.reduce((sum,row)=>sum+row.height,0)))+18;
 return{columns,gap,margin,blockWidth,prepared,height};
}
function appendExportLabelCoverage(root,rows,x,y,width){
 if(!rows.length)return 0;
 const m=exportLabelCoverageLayout(rows,width),g=svgEl('g',{'data-export-label-coverage':'true'});
 g.append(svgEl('rect',{x,y,width,height:m.height,rx:12,fill:'#fff',stroke:'#dbe6dc','stroke-width':1.1}));
 const h=svgEl('text',{x:x+20,y:y+30,'font-size':18,'font-weight':700,fill:'#294a3a'});
 h.textContent='密集区域完整标注';g.append(h);
 m.prepared.forEach((chunk,i)=>{
  const colX=x+m.margin+i*(m.blockWidth+m.gap);
  let rowY=y+49;
  chunk.forEach((record,j)=>{
   if(j%2===0)g.append(svgEl('rect',{x:colX,y:rowY,width:m.blockWidth,height:record.height,rx:3,fill:'#f6f9f6'}));
   const tx=svgEl('text',{x:colX+8,y:rowY+18,'font-size':12.4,fill:'#335748'});
   record.lines.forEach((line,k)=>{
    const span=svgEl('tspan',{x:colX+8,dy:k?17:0});span.textContent=line;tx.append(span);
   });
   g.append(tx);rowY+=record.height;
  });
 });
 root.append(g);return m.height;
}

function exportSvg(){
 const spec=sceneSpec(),winnerRows=exportPredictionWinnerRows(),tableLayout=winnerRows.length?exportPredictionTableLayout(winnerRows):null;
 const coreWidth=tableLayout?tableLayout.width+80:1200,contentWidth=coreWidth-80,contentHeight=Math.round(contentWidth*spec.height/spec.width);
 const notes=String(state.exportSettings.note||'').trim(),annotationLines=notes?wrapExportText(notes):[];
 const noteHeight=annotationLines.length?26+annotationLines.length*19:0,mapY=annotationLines.length?88+noteHeight:78;
 const root=svgEl('svg',{xmlns:NS,width:coreWidth,height:1,viewBox:'0 0 '+coreWidth+' 1'});
 root.append(svgEl('rect',{width:coreWidth,height:1,fill:'#fff'}));
 const style=svgEl('style');style.textContent='path{stroke-linejoin:round}text{font-family:"Microsoft YaHei","PingFang SC",Arial,sans-serif}';root.append(style);
 const title=svgEl('text',{x:60,y:54,fill:'#294a3a','font-size':26,'font-weight':500});
 title.textContent=state.title||(state.fillMode==='prediction'?'2026 '+directoryOfficeName[state.predictionOffice]+'预测地图':$('scopeTitle').textContent);root.append(title);
 if(annotationLines.length)appendExportNote(root,annotationLines,72);
 const map=svgEl('svg',{x:40,y:mapY,width:contentWidth,height:contentHeight,viewBox:'0 0 '+spec.width+' '+spec.height,preserveAspectRatio:'xMidYMid meet'});
 exportNumberRows=[];
 try{
  for(const id of ['predictionPatterns','insetFrames','regions','townBorders','districtBorders','borders','labels','mapFurniture','legend']){
   if(id==='labels'&&!state.labels)continue;if(!$(id))continue;
   const g=$(id).cloneNode(true);g.removeAttribute('id');
   if(id==='labels'&&identityPanelsActive())drawIdentityPanelLabels(g,false,true);
   else if(id==='labels'&&state.level!=='villages')drawLabels(g,currentItems(),geometryLayout(currentItems(),true),sceneSpec().font,false);
   else if(id==='labels'&&state.level==='villages')drawVillageLabels(g,currentItems(),geometryLayout(currentItems(),true),fittedView(),false);
   map.append(g);
  }
  const keyRows=mapNumberSorted(exportNumberRows);
  root.append(map);
  // The complete key belongs below the drawing, never over external numbers.
  let appendixHeight=0;
  if(keyRows.length){
   const appendixColumns=Math.min(Math.max(1,Math.floor((contentWidth-30)/210)),Math.ceil(keyRows.length/12));
   appendixHeight=appendNumberTableExport(root,keyRows,40,mapY+contentHeight+12,appendixColumns);
  }
  const originalItems=currentItems();
  const unresolved=exportLabelCoverage(originalItems,map);
  const zoomTargets=[...unresolved.map(row=>row.id),...keyRows.map(row=>row.id)];
  const detailY=mapY+contentHeight+(appendixHeight?appendixHeight+24:14);
  const details=state.exportSettings.layout==='compact'?{height:0,labelled:new Set()}:appendExportDetailInsets(root,originalItems,zoomTargets,detailY,contentWidth);
  const coverageRows=exportLabelCoverage(originalItems,map,details.labelled);
  const coverageY=detailY+(details.height?details.height+22:0);
  const coverageHeight=appendExportLabelCoverage(root,coverageRows,40,coverageY,contentWidth);
  const tableY=Math.max(mapY+contentHeight+40,coverageY+coverageHeight+30);
  if(winnerRows.length)appendExportPredictionTable(root,winnerRows,tableY);
  const height=Math.max(mapY+contentHeight+72,coverageY+coverageHeight+32,winnerRows.length?tableY+tableLayout.height+32:0);
  const actualWidth=coreWidth;
  root.setAttribute('width',actualWidth);root.setAttribute('height',height);root.setAttribute('viewBox','0 0 '+actualWidth+' '+height);
  root.firstChild?.setAttribute('width',actualWidth);root.firstChild?.setAttribute('height',height);
  return new XMLSerializer().serializeToString(root);
 }finally{exportNumberRows=null}
}

function preparedExportSvg(){const oldFilter=exportPanelFilter,oldLegend=state.legend.show,oldCouncilView=state.councilViewScope,oldLabels=state.labels;state.councilViewScope='all';exportPanelFilter=state.level==='council'&&state.exportSettings.councilScope!=='all'?state.exportSettings.councilScope:'';state.legend.show=true;state.labels=true;render();try{return exportSvg()}finally{exportPanelFilter=oldFilter;state.legend.show=oldLegend;state.councilViewScope=oldCouncilView;state.labels=oldLabels;render()}}
function exportFilename(){const suffix=state.level==='council'&&state.exportSettings.councilScope!=='all'?'_'+electorateName(state.exportSettings.councilScope):'';return filename()+suffix}
$('exportWinnerTable').onchange=()=>{state.exportSettings.winnerTable=$('exportWinnerTable').checked;persist()};$('exportNote').oninput=()=>{state.exportSettings.note=simplify($('exportNote').value).trim().slice(0,500);persist()};$('councilExportScope').onchange=()=>{state.exportSettings.councilScope=$('councilExportScope').value;persist()};$('exportSvg').onclick=async()=>{try{await ensureExportMapReady();download(new Blob([preparedExportSvg()],{type:'image/svg+xml;charset=utf-8'}),exportFilename()+'.svg');toast('SVG 矢量图已导出，包含比例尺、指北针和对应图例')}catch(e){toast(e.message||'SVG 导出失败')}};$('exportPng').onclick=async()=>{const b=$('exportPng');b.disabled=true;const old=b.textContent;b.textContent='正在导出…';let url;try{await ensureExportMapReady();const source=preparedExportSvg(),doc=new DOMParser().parseFromString(source,'image/svg+xml'),height=Number(doc.documentElement.getAttribute('height')),width=Number(doc.documentElement.getAttribute('width'));if(!width||!height)throw Error('图片尺寸无效');const scale=Math.min(3,Math.floor(16000/Math.max(width,height)),Math.floor(Math.sqrt(55000000/(width*height))));if(scale<1)throw Error('图片过大，请取消当选名单表格，或使用 SVG 矢量图完整导出');url=URL.createObjectURL(new Blob([source],{type:'image/svg+xml;charset=utf-8'}));const img=new Image();img.src=url;await new Promise((ok,no)=>{img.onload=ok;img.onerror=no});const c=document.createElement('canvas');c.width=width*scale;c.height=height*scale;const ctx=c.getContext('2d');if(!ctx)throw Error('设备无法创建图片画布，请改用 SVG');ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(img,0,0,c.width,c.height);const blob=await new Promise(ok=>c.toBlob(ok,'image/png'));if(!blob)throw Error('图片生成失败，请改用 SVG');download(blob,exportFilename()+'.png');toast(scale===3?'已导出 3 倍清晰度 PNG 图片':'大图已自动调整为 '+scale+' 倍清晰度 PNG')}catch(e){toast(e.message||'导出失败，请尝试导出 SVG 矢量图')}finally{if(url)URL.revokeObjectURL(url);b.disabled=false;b.textContent=old}};
// Retry large static map downloads without losing locally saved election projects.
// The retry URL bypasses stale/corrupt intermediary caches while remaining same-origin.
async function fetchMapJson(url,label,attempts=3){
 let lastError;
 for(let attempt=0;attempt<attempts;attempt++){
  try{
   const requestUrl=attempt?url+(url.includes('?')?'&':'?')+'retry='+Date.now()+'-'+attempt:url;
   const response=await fetch(requestUrl,{cache:attempt?'reload':'default'});
   if(!response.ok)throw Error('HTTP '+response.status);
   const result=await response.json();
   if(!result||typeof result!=='object')throw Error('地图文件内容无效');
   return result;
  }catch(error){
   lastError=error;
   console.warn(label+'载入尝试 '+(attempt+1)+'/'+attempts+' 失败',error);
   if(attempt+1<attempts)await new Promise(resolve=>setTimeout(resolve,400*(attempt+1)));
  }
 }
 throw Error(label+'载入失败（已重试'+attempts+'次）：'+(lastError?.message||'网络连接异常'));
}
// Load only the map layers the current user actually opens.
const detailRequests=Object.create(null),mapLoadState=Object.create(null);
function syncMapLayerStatus(){const box=$('mapLoadingStatus');if(!box)return;const relevant=name=>name==='villages'?state.level==='villages':name==='议员选区'?state.level==='council':name==='立法机构民代选区'?state.level==='legislative':true;const loading=Object.keys(mapLoadState).filter(name=>relevant(name)&&mapLoadState[name]==='loading'),failed=Object.keys(mapLoadState).filter(name=>relevant(name)&&mapLoadState[name]==='error');box.hidden=!loading.length&&!failed.length;$('mapLoadingMessage').textContent=loading.length?'正在载入：'+loading.join('、'):'地图载入失败：'+failed.join('、');$('retryMapLayer').hidden=!!loading.length}
if($('retryMapLayer'))$('retryMapLayer').onclick=()=>{for(const key of Object.keys(mapLoadState))if(mapLoadState[key]==='error')delete mapLoadState[key];render()};
function loadMapDetail(name,url,apply){
 if(detailRequests[name])return detailRequests[name];
 mapLoadState[name]='loading';
 detailRequests[name]=fetchMapJson(url,name).then(value=>{apply(value);mapLoadState[name]='ready';render();return true}).catch(e=>{
  delete detailRequests[name];mapLoadState[name]='error';syncMapLayerStatus();
  console.error('地图图层载入失败：'+name,e);
  toast(e.message||'地图数据载入失败，请重新选择地图层级');
  return false
 });
 return detailRequests[name];
}
function ensureMapDetails(){
 if(!data)return;
 const layer=state.level;
 if(layer==='council'&&!data.council.length)loadMapDetail('议员选区','assets/map-council.json?v=20261031-split-v25',part=>{if(!Array.isArray(part.council)||part.council.length!==161||!Array.isArray(part.councilIndigenous)||part.councilIndigenous.length!==60)throw Error('议员选区数据不完整');data.council=part.council;data.councilIndigenous=part.councilIndigenous;});
 if(layer==='legislative'&&!data.legislative.length)loadMapDetail('立法机构民代选区','assets/map-legislative.json?v=20261031-split-v25',part=>{if(!Array.isArray(part.legislative)||part.legislative.length!==73||!Array.isArray(part.legislativeIndigenous))throw Error('立法机构民代数据不完整');data.legislative=part.legislative;data.legislativeIndigenous=part.legislativeIndigenous;for(const f of data.legislative)if(data.legislative.filter(x=>x.county===f.county).length===1)f.name=f.county;});
 if(layer==='villages'&&!data.villages.length&&!detailRequests.villages){
  mapLoadState.villages='loading';
  detailRequests.villages=Promise.all([1,2,3,4,5].map(n=>fetchMapJson('assets/map-villages-'+n+'.json?v=20261031-split-v25','村里地图第'+n+'部分'))).then(parts=>{const rows=parts.flat();if(rows.length!==data.villageMetadata.count)throw Error('村里边界数据不完整');data.villages=rows;mapLoadState.villages='ready';render();return true}).catch(e=>{delete detailRequests.villages;mapLoadState.villages='error';syncMapLayerStatus();toast(e.message||'村里地图载入失败');return false});
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
 const required=state.level==='council'?['议员选区']:state.level==='legislative'?['立法机构民代选区']:state.level==='villages'?['villages']:[];
 const finished=await Promise.all(required.map(n=>detailRequests[n]||Promise.resolve(true)));
 if(finished.some(ok=>ok!==true))throw Error('地图边界资料载入失败，请重试或刷新页面');
 if(state.level==='council'&&(data.council.length!==161||data.councilIndigenous.length!==60))throw Error('议员选区资料尚未完整载入');
 if(state.level==='legislative'&&(data.legislative.length!==73||data.legislativeIndigenous.length!==2))throw Error('立法机构民代选区资料尚未完整载入');
 if(state.level==='villages'&&data.villages.length!==data.villageMetadata.count)throw Error('村里地图资料尚未完整载入');
 if(!currentItems().length)throw Error('当前地图没有可导出的地理区域');
}
let mapPromise,mapLoadSequence=0;
function showMapLoadError(error,phase='下载'){
 const message=error?.message||String(error)||'未知错误';
 $('loadError').hidden=false;
 $('loadErrorMessage').textContent=phase==='渲染'?'地图渲染出现问题：'+message:'地图资料载入失败：'+message;
 $('progress').textContent='地图载入失败（可以重试）';
 console.error('地图'+phase+'失败',error);
}
function finishMapInitialization(d){
 if(!d||!Array.isArray(d.counties)||d.counties.length!==22||!Array.isArray(d.towns)||!Array.isArray(d.legislative)){
  throw Error('基础地图资料不完整，请重新下载');
 }
 data=d;
 for(const f of d.legislative)if(d.legislative.filter(x=>x.county===f.county).length===1)f.name=f.county;
 for(const f of [...d.counties].sort((a,b)=>COUNTY_ORDER.indexOf(a.name)-COUNTY_ORDER.indexOf(b.name))){
  const o=document.createElement('option');o.value=f.name;o.textContent=f.name;$('county').append(o)
 }
 if(state.county&&!d.counties.some(f=>f.name===state.county))state.county='';
 syncInputs();render();
 $('loadError').hidden=true;
}
function startMapLoad(){
 const sequence=++mapLoadSequence;
 $('loadError').hidden=true;
 $('progress').textContent='正在载入地图…';
 const embedded=$('embeddedMap');
 mapPromise=embedded?new Promise((resolve,reject)=>{
  const ready=()=>{try{resolve(JSON.parse(embedded.textContent))}catch(error){reject(error)}};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ready,{once:true});else ready()
 }):fetchMapJson('assets/map-base.json?v=20261031-split-v25','基础地图');
 mapPromise.then(async d=>{
  if(document.readyState==='loading')await new Promise(resolve=>document.addEventListener('DOMContentLoaded',resolve,{once:true}));
  if(sequence!==mapLoadSequence)return;
  try{finishMapInitialization(d)}catch(error){showMapLoadError(error,'渲染')}
 }).catch(error=>{if(sequence===mapLoadSequence)showMapLoadError(error)});
 return mapPromise;
}
$('retryMapLoad').onclick=()=>{
 if(data){
  try{syncInputs();render();$('loadError').hidden=true;return}
  catch(error){showMapLoadError(error,'渲染');return}
 }
 startMapLoad();
};
startMapLoad();

for(const p of PARTY_PRESETS){const o=document.createElement('option');o.value=p.id;o.textContent=p.name;$('partyPreset').append(o)}
$('partyPreset').onchange=()=>{const preset=PARTY_PRESETS.find(p=>p.id===$('partyPreset').value);if(!preset)return;const found=state.palette.find(p=>partyMatch(p.name)?.id===preset.id);if(found){setBrush(found.id);toast('已选择'+preset.name)}else{pushHistory();const id='party-'+preset.id;state.palette.push({id,name:preset.name,color:preset.color});setBrush(id);renderLegend();persist();toast('已添加'+preset.name)}$('partyPreset').value=''};
$('applyStandard').onclick=()=>{pushHistory();for(const p of state.palette){const preset=partyMatch(p.name);if(preset){p.name=preset.name;p.color=preset.color}}renderPalette();recolor();renderLegend();renderList();persist();toast('已按指定模板应用政党标准配色')};

const borderControls=[['boundaryColor','borderColor'],['boundaryHex','borderColor'],['boundaryWidth','borderWidth'],['countyBoundaryColor','countyBorderColor'],['countyBoundaryHex','countyBorderColor'],['countyBoundaryWidth','countyBorderWidth'],['townBoundaryColor','townBorderColor'],['townBoundaryHex','townBorderColor'],['townBoundaryWidth','townBorderWidth']];
function syncBorderControls(){
 $('primaryBoundaryLabel').textContent=(mayorTownBoundaryOverlay()?'县市':levelLabel(state.level))+'边界';
 $('countyBoundarySettings').hidden=state.level==='counties'||mayorTownBoundaryOverlay();$('townBoundarySettings').hidden=!['legislative','council','villages'].includes(state.level)&&!mayorTownBoundaryOverlay();$('showTownBoundaries').checked=state.showTownBoundaries;
 for(const [id,key]of borderControls)$(id).value=id.endsWith('Hex')?state[key].toUpperCase():state[key];
 $('boundaryWidthValue').value=Number(state.borderWidth).toFixed(1)+' px';
 $('countyBoundaryWidthValue').value=Number(state.countyBorderWidth).toFixed(1)+' px';$('townBoundaryWidthValue').value=Number(state.townBorderWidth).toFixed(1)+' px';
}
function applyBorders(){
 for(const [selector,color,width]of [['#regions path','none',0],['#districtBorders path',state.borderColor,state.borderWidth],['#borders path',state.countyBorderColor,state.countyBorderWidth],['#townBorders path',state.townBorderColor,state.townBorderWidth]])
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
 out.predictionOffice=['mayor','council','township'].includes(s.predictionOffice)?s.predictionOffice:'mayor';out.predictionDisplay=['composition','seats','leader','share','votes','partyShare','partyVotes','winnerShare','winnerVotes','candidateShare','candidateVotes','topVote','partyTop','candidateVote'].includes(s.predictionDisplay)?s.predictionDisplay:'composition';out.predictionCandidateScope=['topVote','candidateVote'].includes(s.predictionCandidateScope)?s.predictionCandidateScope:(['candidateVote','candidateShare','candidateVotes'].includes(s.predictionDisplay)?'candidateVote':'topVote');out.predictionVoteMetric=s.predictionVoteMetric==='votes'?'votes':'share';out.predictionScale=['town','overlay'].includes(s.predictionScale)?s.predictionScale:'district';out.councilViewScope=['all','regional','plains','mountain'].includes(s.councilViewScope)?s.councilViewScope:'all';out.localPredictions=typeof TownPredictionCore!=='undefined'?TownPredictionCore.sanitizeAll(s.localPredictions):{};out.localPredictionDisplay=['composition','leader','share','votes','partyShare','partyVotes','candidateShare','candidateVotes','topVote','partyTop','candidateVote'].includes(s.localPredictionDisplay||s.predictionDisplay)?s.localPredictionDisplay||s.predictionDisplay:'';out.localDisplayCandidate=String(s.localDisplayCandidate||'').slice(0,80);out.localTown=/^\d{8}$/.test(s.localTown||'')?s.localTown:'';out.predictions={};
 for(const [id,r]of Object.entries(s.predictions||{})){if(!/^(mayor|council|township):[0-9:]{5,30}$/.test(id))continue;const winners=[...new Set(r.winners||[])].filter(x=>typeof x==='string'&&x.length<80).slice(0,100),estimates={};for(const [cid,e]of Object.entries(r.estimates||{})){if(cid.length>80)continue;const votes=PredictionCore.number(e.votes),share=PredictionCore.number(e.share,true);if(votes!==null||share!==null)estimates[cid]={votes,share}}out.predictions[id]={winners,estimates,note:String(r.note||'').slice(0,300),method:r.method==='ranking'?'ranking':'manual',updatedAt:String(r.updatedAt||'').slice(0,40)}}

 out.gradient={groupBy:s.gradient?.groupBy==='party'?'party':'candidate',metric:s.gradient?.metric==='votes'?'votes':'share',min:0,max:null,marginManual:s.gradient?.marginManual===true};
 const min=Number(s.gradient?.min);if(Number.isFinite(min)&&min>=0)out.gradient.min=min;
 if(s.gradient?.max!==null&&s.gradient?.max!==undefined&&s.gradient?.max!==''){const max=Number(s.gradient.max);if(Number.isFinite(max)&&max>out.gradient.min&&(out.gradient.metric==='votes'||out.fillMode==='prediction'&&['votes','partyVotes','winnerVotes','candidateVotes'].includes(out.predictionDisplay)||max<=100))out.gradient.max=max;else out.gradient.min=0;}
 if(out.gradient.metric==='share'&&out.gradient.min>=100)out.gradient.min=0;
 out.legend={show:s.legend?.show!==false,onlyUsed:s.legend?.onlyUsed!==false,fontSize:Math.max(9,Math.min(22,Number(s.legend?.fontSize)||12)),caption:String(s.legend?.caption||'').slice(0,80),hidden:Array.isArray(s.legend?.hidden)?s.legend.hidden.filter(id=>out.palette.some(p=>p.id===id)):[]};
 out.exportSettings={winnerTable:s.exportSettings?.winnerTable!==false,note:simplify(String(s.exportSettings?.note||'')).trim().slice(0,500),councilScope:['all','regional','plains','mountain'].includes(s.exportSettings?.councilScope)?s.exportSettings.councilScope:'all',layout:s.exportSettings?.layout==='compact'?'compact':'complete'};
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
function shownLabel(f){if((f.name==='乌坵'||f.name==='乌坵乡')&&!directTownNameLabels())return'';if(f.parentDistrictId||f.legislativeTown)return f.name;const identity=identityPanelsActive()?featureElectorate(f):activeElectorate();if(['council','legislative'].includes(state.level)&&identity!=='regional')return state.county?f.name:f.county==='\u5168\u56fd'?f.name:f.county+f.name.replace(/^第/, '第');if(state.level==='legislative'&&data.legislative.filter(x=>x.county===f.county).length===1)return f.county;return !state.county&&['council','legislative'].includes(state.level)?f.county+f.number:f.name}
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
 const wide=isNationwide(),panelScale=identityPanelsActive()?2:1,font=state.legend.fontSize*(wide?1.4:1)*panelScale,width=(wide?350:280)*panelScale,labelX=Math.max(63,44+font*1.6),limit=Math.max(4,Math.floor((width-labelX-18)/font)),gradient=state.fillMode==='gradient'||state.fillMode==='prediction'&&predictionUsesGradient();
 const rows=entries.map(p=>{const predictionLabel=Object.hasOwn(p,'legendSuffix')?p.name+p.legendSuffix:p.name+'（'+(counts()[p.id]||0)+(typeof predictionLegendCountUnit==='function'?predictionLegendCountUnit():predictionUsesVoteDisplay()?'区':'席')+'）',chars=Array.from(state.fillMode==='prediction'?predictionLabel:p.name),lines=[];for(let i=0;i<chars.length;i+=limit)lines.push(chars.slice(i,i+limit).join(''));return{p,lines,height:Math.max(font*1.85,lines.length*font*1.4+10)+(gradient?font*3.4:0)}});
 const title=Array.from(state.legendTitle||'图例'),titleLimit=Math.max(4,Math.floor((width-36)/(font+1))),titleLines=[];for(let i=0;i<title.length;i+=titleLimit)titleLines.push(title.slice(i,i+titleLimit).join(''));
 // Prediction legends show only the count of currently displayed electoral areas.
 // Keep the candidates, party emblems and color-bin labels, but omit explanatory prose.
 const captionText=state.fillMode==='prediction'
  ?'总共'+new Set(currentItems().map(f=>f.townId||f.sourceId||f.id)).size+(state.predictionOffice==='mayor'&&typeof mayorLegendUnit==='function'?mayorLegendUnit():'个选区')
  :state.legend.caption||'';
 const caption=Array.from(captionText),captionLines=[],captionLimit=Math.max(5,Math.floor((width-36)/(font*.8)));for(let i=0;i<caption.length;i+=captionLimit)captionLines.push(caption.slice(i,i+captionLimit).join(''));
 const headerHeight=Math.max(48,titleLines.length*(font+1)*1.3+22)+captionLines.length*font*1.25;
 const statuses=gradient?currentItems().map(f=>state.fillMode==='prediction'?(typeof predictionMapResult==='function'?predictionMapResult(f):{status:typeof predictionDisplayResult==='function'&&predictionDisplayResult(predictionDistrictFor(f))?'winner':'missing'}):regionResult(f)):[],tie=statuses.some(r=>r?.status==='tie'),missing=statuses.some(r=>!['winner','tie'].includes(r?.status)),showGradientHint=gradient&&state.fillMode!=='prediction',footerHeight=(tie?font*1.7:0)+(missing?font*1.7:0)+(showGradientHint?font*1.4:0);
 return{font,width,labelX,rows,titleLines,captionLines,headerHeight,gradient,tie,missing,showGradientHint,footerHeight,height:headerHeight+rows.reduce((n,r)=>n+r.height,0)+footerHeight};
}

function decorationClear(rect){
 if(!data)return true;
 const layers=identityPanelsActive()?identityPanelLayouts().map(p=>({items:p.items,t:p.t}))
  :[{items:currentItems(),t:geometryLayout(currentItems(),state.labels)}];
 for(const layer of layers){
  const t=layer.t;
  for(const f of layer.items){const b=f.box,r=[b[0]*t.scale+t.tx,b[1]*t.scale+t.ty,b[2]*t.scale+t.tx,b[3]*t.scale+t.ty];if(leaderOverlap(rect,r))return false}
  if(leaderFrames(t,8).some(r=>leaderOverlap(rect,r)))return false;
 }
 return true;
}
function legendBox(spec){
 if(!state.legend.show)return{x:spec.width,y:spec.height,width:0,height:0};
 const m=legendMetrics(legendReserveEntries()),x0=spec.width-m.width-30,y0=spec.height-furnitureFooterHeight()-6;
 for(const [up,left] of (isNationwide()?[[85,20],[48,16],[20,8],[0,0]]:[[48,20],[28,10],[12,4],[0,0]])){
  const x=x0-left,y=y0-up;
  if(y>=72&&decorationClear([x-12,y-12,x+m.width+8,y+m.height+8]))return{x,y,...m};
 }
 return{x:x0,y:y0,...m};
 }
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
let customLogo='';
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
function syncVillageControls(){if(!data)return;$('villageTownControls').hidden=state.level!=='villages';$('districtLeaderControls').hidden=true;$('districtLeaders').checked=state.districtLeaders;const select=$('villageTown');select.replaceChildren();const all=document.createElement('option');all.value='';all.textContent='全部乡镇市区';select.append(all);for(const f of data.towns.filter(f=>!state.county||f.county===state.county)){const o=document.createElement('option');o.value=f.id;o.textContent=(state.county?'':f.county+' · ')+f.name;select.append(o)}if(![...select.options].some(o=>o.value===state.villageTown))state.villageTown='';select.value=state.villageTown}
$('villageTown').onchange=()=>{state.villageTown=$('villageTown').value;render();persist()};
$('districtLeaders').onchange=()=>{state.districtLeaders=$('districtLeaders').checked;renderLabels();persist()};
function drawVillageLabels(group,items,t,v,interactive=false){
 group.replaceChildren();
 if(!items.length)return;
 if(items.length<=120)return drawLabels(group,items,t,8,interactive);
 const font=interactive?Math.max(7,v.w/Math.max(500,$('map').getBoundingClientRect().width)*11):9;
 const visible=items.filter(f=>f.box[2]*t.scale+t.tx>v.x&&f.box[0]*t.scale+t.tx<v.x+v.w&&
  f.box[3]*t.scale+t.ty>v.y&&f.box[1]*t.scale+t.ty<v.y+v.h);
 const chosen=visible.length>450?[...visible].sort((a,b)=>
  (b.box[2]-b.box[0])*(b.box[3]-b.box[1])-(a.box[2]-a.box[0])*(a.box[3]-a.box[1])).slice(0,450):visible;
 drawLabels(group,chosen,t,font,interactive);
}
function moveParty(id,direction){const index=state.palette.findIndex(p=>p.id===id),next=index+direction;if(index<0||next<0||next>=state.palette.length)return;pushHistory();const scroll=$('palette').scrollTop;[state.palette[index],state.palette[next]]=[state.palette[next],state.palette[index]];renderPalette();renderLegend();persist();$('palette').scrollTop=scroll;[...$('palette').children].find(row=>row.dataset.party===id)?.querySelector('.party-drag-handle')?.focus({preventScroll:true})}

function renderTownBorders(){
 const group=$('townBorders');group.replaceChildren();
 if(!['legislative','council','villages'].includes(state.level)&&!mayorTownBoundaryOverlay())return;
 if(identityPanelsActive()){
  for(const panel of identityPanelLayouts()){
   if(panel.townLevel)continue;
   const layer=svgEl('g',{'data-electorate':panel.identity,transform:transformOf(panel.t)});
   appendSharedBorders(layer,'towns');
   group.append(layer);
  }
 }else appendSharedBorders(group,'towns','regional',state.level==='villages');
}
$('showTownBoundaries').onchange=()=>{pushHistory();state.showTownBoundaries=$('showTownBoundaries').checked;applyBorders();persist()};

$('electorate').onchange=()=>{pushHistory();state.electorate[state.level]=$('electorate').value;syncInputs();render();persist()};
