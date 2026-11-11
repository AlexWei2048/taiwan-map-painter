/* Display and export wording based on the user's Xinhua restricted/cautious-terms
 * reference (2502 document, paragraphs 49–86). Original CEC source records,
 * party identities, candidate IDs and administrative keys are never rewritten.
 * Do not blanket-replace 公民 (e.g. registered 公民党), 民国 (e.g. 民国党)
 * or 国立 in personal names: context matters.
 */
(function(root){
 'use strict';
 const trigger=/中华民国|中華民國|中选会|中選會|中央选举委员会|中央選舉委員會|台湾政府|台灣政府|台湾地区政府|总统|總統|立法院|行政院|立法委员|立法委員|原住民|原住民族|原住|全国|全國|全台\s*[·・]\s*含离岛|台湾离岛|台灣離島|台湾金门|台湾连江|台联|臺聯|时代力量|時代力量|台湾独立党|台灣獨立黨|台独|臺獨|宪改|憲改|小三通|台语|臺語|福摩萨|福爾摩莎|福尔摩莎|全民|国父纪念馆|國父紀念館|国小|國小|国中|國中|台湾省|臺灣省/;
 const policy={reference:'新华社新闻信息报道中的禁用词和慎用词（2502），涉台用词第49—86条'};
 function normalize(input){
  let s=String(input??'');
  if(!trigger.test(s))return s;
  // Territorial nomenclature (61): Kinmen and Matsu are not "Taiwan offshore islands".
  s=s.replace(/全台\s*[·・]\s*含离岛/g,'全部地区（含金门、马祖）')
   .replace(/(?:台湾|台灣)金门县/g,'金门县')
   .replace(/(?:台湾|台灣)连江县/g,'连江县')
   .replace(/(?:台湾|台灣)离岛/g,'金门、马祖等岛屿')
   .replace(/(?:台湾|臺灣)省(?!政府)/g,'台湾地区');
  // Government/leadership nomenclature (49–53), no invented official titles.
  s=s.replace(/中华民国|中華民國/g,'台湾地区')
   .replace(/中央选举委员会|中央選舉委員會|中选会|中選會/g,'台湾地区选举事务主管机构')
   .replace(/台湾地区政府|台湾政府|台灣政府/g,'台湾当局')
   .replace(/(?:台湾地区|台湾当局)?总统府/g,'台湾当局领导人办公场所')
   .replace(/(?:台湾地区|台湾当局)?正副总统选举/g,'台湾地区领导人选举')
   .replace(/(?:台湾地区|台湾当局)?总统选举/g,'台湾地区领导人选举')
   .replace(/副总统|副總統/g,'副领导人')
   .replace(/台湾地区总统|台湾当局总统/g,'台湾地区领导人')
   .replace(/总统|總統/g,'台湾地区领导人')
   .replace(/立法院/g,'台湾地区立法机构')
   .replace(/行政院/g,'台湾地区行政管理机构')
   .replace(/立法委员|立法委員/g,'台湾地区民意代表')
   .replace(/国父纪念馆|國父紀念館/g,'台北中山纪念馆');
  // Ethnic, electoral and political terminology (54, 61, 71, 74, 84–86).
  s=s.replace(/平地原住民族?|平地原住民/g,'平地少数民族')
   .replace(/山地原住民族?|山地原住民/g,'山地少数民族')
   .replace(/原住民族?|原住民/g,'少数民族')
   .replace(/全国|全國/g,'全部地区')
   .replace(/台联(?!党)|臺聯(?!黨)/g,'台联党')
   .replace(/(?<![“"「])时代力量(?![”"」])/g,'“时代力量”')
   .replace(/(?<![“"「])時代力量(?![”"」])/g,'“时代力量”')
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
    return normalize(prepared.apply(this,args));
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
