/* Display and export wording based on the user's Xinhua restricted/cautious-terms
 * reference (2502 document, paragraphs 49–86). Original CEC source records,
 * party identities, candidate IDs and administrative keys are never rewritten.
 * Do not blanket-replace 公民 (e.g. registered 公民党), 民国 (e.g. 民国党)
 * or 国立 in personal names: context matters.
 */
(function(root){
 'use strict';
 const trigger=/[黄黃]宏成[台臺][湾灣]阿成世界[伟偉]人[财財]神台湾地区领导人|中华民国|中華民國|中选会|中選會|中央选举委员会|中央選舉委員會|台湾政府|台灣政府|台湾地区政府|总统|總統|立法院|行政院|立法委员|立法委員|原住民|原住民族|原住|全国|全國|全台|全臺|全台\s*[·・]\s*含离岛|台湾离岛|台灣離島|台湾金门|台湾连江|金门县|连江县|金門縣|連江縣|台湾团结联盟|台灣團結聯盟|臺灣團結聯盟|台联|臺聯|时代力量|時代力量|台湾基进|台灣基進|臺灣基進|台湾独立党|台灣獨立黨|台独|臺獨|宪改|憲改|小三通|台语|臺語|福摩萨|福爾摩莎|福尔摩莎|全民|国父纪念馆|國父紀念館|国小|國小|国中|國中|台湾省|臺灣省|全国民主非政党联盟|全國民主非政黨聯盟|全部地区民主非政党联盟|一边一国行动党|一邊一國行動黨|自由台湾党|自由台灣黨|自由臺灣黨|建国党|建國黨|台澎国际法法理建国党|台澎國際法法理建國黨|台澎党|台澎黨|喜乐岛联盟|喜樂島聯盟|新国家连线|新國家連線/;
 const policy={reference:'新华社新闻信息报道中的禁用词和慎用词（2502），涉台用词第49—86条'};
 // Protect complete historical party names before applying generic editorial substitutions.
 // Quotes are presentation only; do not modify historical identity or logo keys.
 const partyNames=["中华民主向日葵宪政改革联盟","中华民国台湾基本法连线","三等国民公义人权自救党","中国国家社会主义劳工党","台湾团结联盟（台联党）","全部地区民主非政党联盟","教科文预算保障e联盟","中华民国国政监督联盟","台澎国际法法理建国党","中华台湾原住民团结党","全国民主非政党联盟","小民参政欧巴桑联盟","绿党社会民主党联盟","台湾整复师联盟工党","天宙和平统一家庭党","中华文化复兴在理党","中华少数民族正义党","中国台湾少数民族党","中国台湾原住民党","台湾SoR无法党","三势团结促进联盟","中华统一促进党","一边一国行动党","台湾双语无法党","台湾第一民族党","中华社会民主党","大道慈悲济世党","台湾慧行志工党","大中华统一阵线","台湾动物保护党","绿色本土清新党","保护台湾大联盟","中华台商爱国党","台湾麻将最大党","中华爱国同心党","中华文化共和党","中国人民行动党","中国和平统一党","中国大同民主党","中国全民福利党","中国民主社会党","中华民国机车党","台湾人民共产党","中华民族致公党","中国民主进步党","全民生活政策党","永久和平自然法","台湾团结联盟","无党团结联盟","健保免费连线","合一行动联盟","信心希望联盟","军公教联盟党","国会政党联盟","大爱宪改联盟","和平鸽联盟党","台湾国民会议","人民民主阵线","家庭基本收入","中华新住民党","言论自由联盟","台湾新住民党","台湾建国联盟","皇君人民政党","台湾人权联盟","台湾原住民党","中国国民党","民主进步党","台湾民众党","喜乐岛联盟","人民最大党","台湾主义党","司法改革党","台湾独立党","自由台湾党","制度救世岛","第三社会党","台湾农民党","中国生产党","新国家连线","民主自由党","中华联合党","复康联盟党","中国青年党","台湾革命党","台湾前进党","国家民主党","中国团结党","金门高粱党","社会改革党","台湾民意党","司法正义党","社会民主党","中华妇女党","人民民主党","兴中同盟会","社会福利党","台湾未来党","中国忠义党","中华照生党","台湾君民党","中国中青党","洪运忠义党","台湾国民党","世界和平党","金色力量党","青年阳光党","中国妇女党","中国民众党","台湾建国党","台湾民族党","大道人民党","新政世纪党","新华劳动党","台湾进步党","嘉意公益党","欢乐无法党","台湾维新","时代力量","安定力量","民主联盟","台湾基进","制宪联盟","台湾吾党","宗教联盟","台湾绿党","台湾工党","工教联盟","民生公益","左翼联盟","正神名党","大爱宪改","亲民党","民国党","台澎党","公民党","建国党","劳动党","客家党","泛盟党","真理党","共和党","劳工党","天一党","基进党","台联党","中兴党","聋国党","经济党","前进党","华声党","联合党","爱心党","爱民党","更生党","原民党","新党","绿党","树党","红党","正党","龙党","圆党","工党"];
 const quotedParties=new Set(["台湾团结联盟（台联党）","台湾团结联盟","台联党","时代力量","台湾基进","台湾独立党","大爱宪改","大爱宪改联盟","制宪联盟","一边一国行动党","自由台湾党","台澎国际法法理建国党","台澎党","喜乐岛联盟","新国家连线","建国党","全国民主非政党联盟"]);
 const corrections={'中国台湾少数民族党':'中国台湾原住民党','全部地区民主非政党联盟':'全国民主非政党联盟'};
 const traditional={'国':'國','台':'臺台','湾':'灣','党':'黨','华':'華','联':'聯','团':'團','进':'進','时':'時','动':'動','劳':'勞','农':'農','权':'權','义':'義','统':'統','会':'會','经':'經','济':'濟','卫':'衛','复':'復','兴':'興','爱':'愛','民':'民','运':'運','纪':'紀','宪':'憲','际':'際','无':'無','绿':'綠','线':'線','乐':'樂','独':'獨','势':'勢','岛':'島','教':'教','护':'護','领':'領','区':'區','机':'機','车':'車','监':'監','督':'督','听':'聽','聋':'聾','圆':'圓','总':'總','众':'眾','产':'產','环':'環','优':'優','学':'學','阳':'陽','诚':'誠','谊':'誼','凤':'鳳','马':'馬','关':'關','锐':'銳','泽':'澤','龙':'龍','汉':'漢','万':'萬','东':'東','门':'門','广':'廣','预':'預','证':'證','须':'須','员':'員','党':'黨','数':'數','种':'種','语':'語','双':'雙','进':'進','湾':'灣'};
 const escapeRe=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\ function normalize(input){');
 const pattern=s=>Array.from(s,ch=>traditional[ch]?'['+ch+traditional[ch]+']':escapeRe(ch)).join('');
 const partyPatterns=partyNames.map(name=>({name,re:new RegExp(pattern(name),'g')}));
 function normalize(input){
  const source=String(input??'');
  // Match against the original input only. Longest registered name wins.
  const found=[];
  for(const {name,re} of partyPatterns){re.lastIndex=0;for(const match of source.matchAll(re)){const start=match.index,end=start+match[0].length;if(found.some(x=>start<x.end&&end>x.start))continue;found.push({start,end,name})}}
  if(!found.length)return normalizeGeneric(source);
  found.sort((a,b)=>a.start-b.start);
  let cursor=0,masked='';const values=[];
  for(const item of found){
   const name=corrections[item.name]||item.name;
   const paired=/[“"「]/.test(source[item.start-1]||'')&&/[”"」]/.test(source[item.end]||'');
   masked+=source.slice(cursor,item.start);const marker='\uE100'+values.length+'\uE101';
   masked+=marker;values.push(quotedParties.has(name)&&!paired?'“'+name+'”':name);cursor=item.end;
  }
  masked+=source.slice(cursor);
  return normalizeGeneric(masked).replace(/\uE100(\d+)\uE101/g,(_,index)=>values[Number(index)])
 }
 function normalizeGeneric(input){
  let s=String(input??'').replace(/中国台湾少数民族党|中國台灣少數民族黨/g,'中国台湾原住民党');
  // Display-only nomination labels; do not alter party IDs or option values.
  s=s.replace(/(?:无党籍|無黨籍)\s*[（(]\s*(?:连署|連署)\s*[）)]/g,'无党籍')
   .replace(/(^|[·｜“"「、，：:\s])(?:连署|連署)(?=$|[｜”"」·：:、，\s])/g,'$1无党籍');
  if(!trigger.test(s))return s;
  // Territorial nomenclature (61): Kinmen and Matsu are not "Taiwan offshore islands".
  s=s.replace(/全台\s*[·・]\s*含离岛/g,'全部地区（含金门、马祖）')
   .replace(/(?:台湾|台灣|臺灣)(?:地区)?(?:金门县|金門縣)/g,'金门')
   .replace(/(?:台湾|台灣|臺灣)(?:地区)?(?:连江县|連江縣)/g,'马祖')
   .replace(/金门县|金門縣/g,'金门')
   .replace(/连江县|連江縣/g,'马祖')
   .replace(/(?:台湾|台灣|臺灣)离岛/g,'福建外岛')
   .replace(/(?:台湾|臺灣)省(?!政府)/g,'台湾地区')
   .replace(/全台|全臺/g,'全部地区');
  // Government/leadership nomenclature (49–53), no invented official titles.
  s=s.replace(/中华民国|中華民國/g,'台湾地区')
   .replace(/中央选举委员会|中央選舉委員會|中选会|中選會/g,'台湾地区选举事务主管机构')
   .replace(/台湾地区政府|台湾政府|台灣政府/g,'台湾当局')
   .replace(/(?:台湾地区|台湾当局)?总统府/g,'台湾当局领导人办公场所')
   .replace(/(?:台湾地区|台湾当局)?正副总统选举/g,'台湾地区领导人选举')
   .replace(/(?:台湾地区|台湾当局)?总统选举/g,'台湾地区领导人选举')
   .replace(/副总统|副總統/g,'副领导人')
   .replace(/台湾地区总统|台湾当局总统/g,'台湾地区领导人')
   // Preserve the registered personal name, including traditional/mixed-script variants.
   .replace(/([黄黃]宏成[台臺][湾灣]阿成世界[伟偉]人[财財]神)(总统|總統|台湾地区领导人)|总统|總統/g,(match,name,suffix)=>name?name+(suffix==='台湾地区领导人'?'总统':suffix):'台湾地区领导人')
   .replace(/(?:台湾地区|台湾)?立法院/g,'台湾地区立法机构')
   .replace(/(?:台湾地区|台湾)?行政院/g,'台湾地区行政管理机构')
   .replace(/立法委员|立法委員/g,'台湾地区民意代表')
   .replace(/国父纪念馆|國父紀念館/g,'台北中山纪念馆');
  // Ethnic, electoral and political terminology (54, 61, 71, 74, 84–86).
  s=s.replace(/平地原住民族?|平地原住民/g,'平地少数民族')
   .replace(/山地原住民族?|山地原住民/g,'山地少数民族')
   .replace(/原住民族?|原住民/g,'少数民族')
   .replace(/全国(?!民主非政党联盟)|全國(?!民主非政黨聯盟)/g,'全部地区')
   .replace(/台联(?!党)|臺聯(?!黨)/g,'台联党')
   // Uniform on-screen party labels, including the long and short names.
   // When both names appear together, quote the complete combined name,
   // rather than producing nested quotation marks around the abbreviation.
   .replace(/(?<![“"「])(?:台湾团结联盟|台灣團結聯盟|臺灣團結聯盟)[（(](?:台联党|臺聯黨)[）)](?![”"」])/g,'“台湾团结联盟（台联党）”')
   .replace(/(?<![“"「])(?:台湾团结联盟|台灣團結聯盟|臺灣團結聯盟)(?![”"」])/g,'“台湾团结联盟”')
   .replace(/(?<![“"「])(?<!台湾团结联盟（)(?<!台灣團結聯盟（)(?<!臺灣團結聯盟（)(?:台联党|臺聯黨)(?![”"」])/g,'“台联党”')
   .replace(/(?<![“"「])时代力量(?![”"」])/g,'“时代力量”')
   .replace(/(?<![“"「])時代力量(?![”"」])/g,'“时代力量”')
   // Editorial extension for this site's party display. The 2502 reference
   // explicitly names 时代力量, but does not separately prescribe quotes for
   // 台湾基进. Normalize display/export text, never registered party IDs.
   .replace(/(?<![“"「])(?:台湾基进|台灣基進|臺灣基進)(?![”"」])/g,'“台湾基进”')
   .replace(/(?<![“"「])台湾独立党(?![”"」])/g,'“台湾独立党”')
   .replace(/(?<![“"「])台灣獨立黨(?![”"」])/g,'“台湾独立党”')
   .replace(/(?<![“"「])大爱宪改(?![”"」])/g,'“大爱宪改”')
   .replace(/(?<![“"「])大愛憲改(?![”"」])/g,'“大爱宪改”')
   .replace(/(?<![“"「])台独(?![”"」])/g,'“台独”')
   .replace(/(?<![“"「])臺獨(?![”"」])/g,'“台独”')
   .replace(/(?<![“"「])小三通(?![”"」])/g,'“小三通”')
   .replace(/台语|臺語/g,'台湾闽南语')
   .replace(/(?<![“"「])福摩萨(?![”"」])/g,'“福摩萨”')
   .replace(/(?<![“"「])福尔摩莎(?![”"」])/g,'“福尔摩莎”')
   .replace(/(?<![“"「])福爾摩莎(?![”"」])/g,'“福尔摩莎”')
   .replace(/全民(?!党)/g,'台湾民众')
   .replace(/国小|國小/g,'小学')
   .replace(/国中|國中/g,'初中');
  // Exact party identities remain untouched in archived data and map keys.
  // Only visible wording (including exported labels) receives editorial quotes.
  // Public independence/constitutional state-building positions are documented
  // in reports/party-identity-wording-20261115.md.
  const extraPartyQuotes=[
   [/(?<![“"「])(?:全国民主非政党联盟|全國民主非政黨聯盟|全部地区民主非政党联盟)(?![”"」])/g,'“全国民主非政党联盟”'],
   [/(?<![“"「])(?:一边一国行动党|一邊一國行動黨)(?![”"」])/g,'“一边一国行动党”'],
   [/(?<![“"「])(?:自由台湾党|自由台灣黨|自由臺灣黨)(?![”"」])/g,'“自由台湾党”'],
   [/(?<![“"「])(?:台澎国际法法理建国党|台澎國際法法理建國黨)(?![”"」])/g,'“台澎国际法法理建国党”'],
   [/(?<![“"「])(?:台澎党|台澎黨)(?![”"」])/g,'“台澎党”'],
   [/(?<![“"「])(?:喜乐岛联盟|喜樂島聯盟)(?![”"」])/g,'“喜乐岛联盟”'],
   [/(?<![“"「])(?:新国家连线|新國家連線)(?![”"」])/g,'“新国家连线”'],
   [/(?<![“"「])(?<!法理)(?<!福利)(?:建国党|建國黨)(?![”"」])/g,'“建国党”']
  ];
  for(const [re,label] of extraPartyQuotes)s=s.replace(re,label);
  return s;
 }
 // Normalize visible text and accessible descriptions, not input values or data IDs.
 const attrs=['alt','title','aria-label','placeholder'];
 const skip=new Set(['SCRIPT','STYLE','TEXTAREA','INPUT','CODE','PRE']);
 function fixNode(node){
  if(!node)return;
  if(node.nodeType===3){
   if(node.parentElement&&skip.has(node.parentElement.tagName))return;
   const before=node.nodeValue,after=normalize(before);
   if(before!==after)node.nodeValue=after;
   return;
  }
  if(node.nodeType!==1||skip.has(node.tagName))return;
  for(const attr of attrs)if(node.hasAttribute(attr)){
   const before=node.getAttribute(attr),after=normalize(before);
   if(after!==before)node.setAttribute(attr,after);
  }
  for(const child of node.childNodes)fixNode(child);
 }
 function init(){
  if(!root.document?.body)return;
  fixNode(root.document.body);
  const watch=new MutationObserver(mutations=>{
   for(const m of mutations){
    if(m.type==='characterData')fixNode(m.target);
    else if(m.type==='attributes'&&m.target.nodeType===1){
     const key=m.attributeName,before=m.target.getAttribute(key),after=normalize(before);
     if(after!==before)m.target.setAttribute(key,after);
    }else for(const node of m.addedNodes)fixNode(node);
   }
  });
  watch.observe(root.document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:attrs});
  // PNG is generated from the same SVG, so this also covers both image exports.
  if(typeof root.preparedExportSvg==='function'){
   const prepared=root.preparedExportSvg;
   root.preparedExportSvg=function(...args){
    fixNode(root.document.body);
    const original=prepared.apply(this,args);
    // Only textual content and accessible descriptions change; never map IDs.
    const doc=new DOMParser().parseFromString(original,'image/svg+xml');
    if(doc.querySelector('parsererror'))return original;
    fixNode(doc.documentElement);
    return new XMLSerializer().serializeToString(doc);
   };
  }
 }
 policy.normalize=normalize;
 policy.fixNode=fixNode;
 root.XinhuaWording=policy;
 if(typeof module!=='undefined'&&module.exports)module.exports=policy;
 if(root.document){
  if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
 }
})(typeof window==='undefined'?globalThis:window);
