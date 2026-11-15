/* Party-list legislative election explorer: historical rules, party shares and original winners.
 * A declared official winner is NEVER inferred from a candidate's party-share rank.
 * Party slates are partial where an official nominated-order archive has not yet been verified.
 */
(function(root){
 'use strict';
 const ERA_SEATS={1992:[30,6],1995:[30,6],1998:[41,8],2001:[41,8],2004:[41,8]};
 const WINNERS={
  2001:{
   '中国国民党':'饶颖奇 江丙坤 陈健治 黄昭顺 高育仁 王钟渝 黄德福 蔡铃兰 陈健民 郑逢时 侯彩凤 李和顺 陈建年',
   '民主进步党':'洪奇昌 尤清 陈道明 刘世芳 张俊宏 林浊水 高志鹏 许荣淑 邱永仁 颜锦福 邱彰 郑贵莲 陈胜宏 陈忠信 刘俊雄',
   '亲民党':'刘忆如 殷乃平 李桐豪 刘松藩 林惠官 顾崇廉 钟荣吉 蔡中涵 高明见',
   '台湾团结联盟':'黄宗源 吴东昇 程振隆 黄政哲'
  },
  2004:{
   '民主进步党':'蔡煌瑯 陈秀惠 洪奇昌 张俊雄 高志鹏 蔡英文 薛凌 王荣璋 尤清 张庆惠 林浊水 卢天麟 田秋堇 黄淑英 邱永仁 王涂发',
   '中国国民党':'王金平 江丙坤 黄志雄 李纪珠 曾永权 白添枝 黄昭顺 黄德福 郭素春 刘盛良 章仁香 曹寿民 苏起 侯彩凤 帅化民',
   '亲民党':'刘忆如 刘文雄 蔡胜佳 顾崇廉 钟荣吉 林惠官',
   '台湾团结联盟':'赖幸媛 黄政哲 郭林勇 陈银河'
  },
  2008:{
   '民主进步党':'陈节如 蔡煌瑯 涂醒哲 邱议莹 柯建铭 黄淑英 王幸男 薛凌 高志鹏 陈莹 余政道 翁金珠 蔡同荣 田秋堇',
   '中国国民党':'王金平 洪秀柱 曾永权 潘维刚 邱毅 郑金玲 陈杰 李纪珠 张显耀 赵丽云 李嘉进 廖婉汝 纪国栋 罗淑蕾 李明星 郭素春 刘盛良 郑丽文 帅化民 徐少萍'
  },
  2012:{
   '中国国民党':'王金平 王育敏 曾巨威 杨玉欣 邱文彦 洪秀柱 吴育仁 潘维刚 陈镇湘 李贵敏 苏清泉 陈碧涵 詹凯臣 徐少萍 纪国栋 陈淑慧',
   '民主进步党':'陈节如 柯建铭 吴宜臻 李应元 田秋堇 蔡煌瑯 萧美琴 陈其迈 郑丽君 段宜康 尤美女 吴秉叡 薛凌',
   '台湾团结联盟':'许忠信 黄文玲 林世嘉','亲民党':'李桐豪 张晓风'
  },
  2016:{
   '民主进步党':'吴焜裕 吴玉琴 陈曼丽 顾立雄 蔡培慧 王荣璋 谷辣斯·尤达卡 余宛如 苏嘉全 段宜康 郑丽君 陈其迈 尤美女 李应元 钟孔炤 林静仪 徐国勇 周春米',
   '中国国民党':'王金平 柯志恩 陈宜民 林丽蝉 许毓仁 曾铭宗 黄昭顺 吴志扬 张丽善 徐榛蔚 王育敏',
   '亲民党':'李鸿钧 陈怡洁 周陈秀霞','时代力量':'高潞·以用 徐永明'
  },
  2020:{
   '民主进步党':'吴玉琴 洪申翰 范云 罗美玲 邱泰源 周春米 游锡堃 柯建铭 管碧玲 庄瑞雄 沈发惠 林楚茵 汤蕙祯',
   '中国国民党':'曾铭宗 叶毓兰 李贵敏 吴斯怀 郑丽文 林文瑞 廖婉汝 翁重钧 吴怡玎 陈以信 张育美 李德维 温玉霞',
   '台湾民众党':'赖香伶 张其禄 高虹安 邱臣远 蔡壁如',
   '时代力量':'陈椒华 邱显智 王婉谕'
  },
  2024:{
   '民主进步党':'林月琴 沈伯洋 张雅琳 洪申翰 罗美玲 游锡堃 范云 柯建铭 沈发惠 庄瑞雄 林楚茵 郭昱晴 陈培瑜',
   '中国国民党':'韩国瑜 柯志恩 葛如钧 翁晓玲 陈菁徽 吴宗宪 林倩绮 陈永康 许宇甄 谢龙介 苏清泉 张嘉郡 王育敏',
   '台湾民众党':'黄珊珊 黄国昌 陈昭姿 吴春城 麦玉珍 林国成 林忆君 张启楷'
  }
 };

 // Published party rosters are recorded in original ballot order. 2024 contains
 // all 177 approved nominees across 16 lists, including parties with zero seats.
 const SLATES_2024={
  '小民参政欧巴桑联盟':'高芸婷 林诗涵 闵柏陵',
  '台湾绿党':'钟宝珠 李菁琪 黄柔嘉 吴伊婷 希婻·玛飞洑 林莉棻 黄慧芬 张竹芩',
  '台湾双语无法党':'陈亭谕 萧文乾',
  '台湾基进':'史惟筑 陈奕齐 黄枫茹 陈君恺 杨佩桦 黄馨莹 徐煊博',
  '中华统一促进党':'丁炳仁 黄妙如 肖云霞 张安乐',
  '民主进步党':'林月琴 沈伯洋 张雅琳 洪申翰 罗美玲 游锡堃 范云 柯建铭 沈发惠 庄瑞雄 林楚茵 郭昱晴 王正旭 王义川 陈培瑜 陈俊翰 张秀君 黄奕睿 孙一信 吴祥荣 陈慧君 柯富扬 刘柏君 石明谨 曾美玲 黄真玮 曾湘桦 郑力嘉 陈右欣 余宛如 许菡芸 周威佑 廖韶吟 蔡宜文',
  '制度救世岛':'林丽容 石人仁 张怡菁 古文发 黄千明',
  '时代力量':'林依莹 王宝萱 宋国鼎 江盛 陈泰源 陈昱安 余佳蒨 郑侑青',
  '中国国民党':'韩国瑜 柯志恩 葛如钧 翁晓玲 陈菁徽 吴宗宪 林倩绮 陈永康 许宇甄 谢龙介 苏清泉 张嘉郡 王育敏 蔡明忠 吴亮仪 李玉婵 李霞 杨应超 徐弘庭 钟沛君 江怡臻 简荣宗 田长沛 沈采颖 林琼嘉 陈克威 邱一峰 廖怡琇 李缙颖 李茂芊 丁瑀 杨智伃 何嘉霖 康晋瑜',
  '司法改革党':'戴翊如 张静 李柏融 尤瑞敏 赖伯琦 吴振橐 晏扬清 许韶珍 杨启珊',
  '新党':'王建煊 仉桂美 吴成典 贺桦 林易升 陈丽玲 戴德满 王子芩',
  '台湾民众党':'黄珊珊 黄国昌 陈昭姿 吴春城 麦玉珍 林国成 林忆君 张启楷 刘书彬 洪毓祥 蔡春绸 王安祥 邱慧洳 陈清龙 李贞秀 许忠信 徐瑞希 杨弘意 陈智菡 庄贻量 林筱淇 蔡丰州 张雪如 汤宏正 林淑芬 梁明辉 廖维欣 冯启彦 林子宇 张清俊 林治华 李家豪 邱于珊 周榆修',
  '台湾维新':'苏焕智 刘亦恩 江映瑶',
  '亲民党':'李桐豪 陈怡洁 曲兆祥 何伟真 简泰河 蓝志玟 吴建德 黎淑慧 孙信君 黎建南',
  '人民最大党':'林东雄 赖方静静',
  '台湾团结联盟':'周倪安 刘一德 欧阳瑞莲 王思棠 张登凯 吴家庆'
 };
 const SLATE_SOURCE_2024='https://zh.wikipedia.org/wiki/2024%E5%B9%B4%E4%B8%AD%E8%8F%AF%E6%B0%91%E5%9C%8B%E7%AB%8B%E6%B3%95%E5%A7%94%E5%93%A1%E9%81%B8%E8%88%89#全國不分區及僑居國外國民選舉';

 const OVERSEAS_WINNERS={
  2004:{
   '中国国民党':'吴英毅 谢文政 吴松柏',
   '民主进步党':'陈明真 庄和子 陈重信',
   '亲民党':'梅长锜',
   '台湾团结联盟':'刘宽平'
  },
  2001:{
   '中国国民党':'关沃暖 孙国华',
   '民主进步党':'萧美琴 张秀珍 张旭成',
   '亲民党':'林政义 杨富美',
   '台湾团结联盟':'王政中'
  }
 };
 const OVERSEAS_SOURCES={2004:'https://web.cec.gov.tw/api/file/66199533-8d61-4512-adf9-05f3f1bf022b.pdf',2001:'https://web.cec.gov.tw/api/file/80c0e18d-31cd-4104-a6c5-2b0a3dc2fc21.pdf'};

 const EXTRA={
  2016:{'民主进步党':[{rank:18,name:'施义芳',elected:false},{rank:19,name:'周春米',elected:true}],
        '中国国民党':[{rank:11,name:'曾永权',elected:false},{rank:12,name:'王育敏',elected:true}]},
  2024:{'民主进步党':[{rank:13,name:'王正旭',elected:false},{rank:14,name:'王义川',elected:false},{rank:15,name:'陈培瑜',elected:true}]}
 };
 const VERIFIED={
  1992:{'中国国民党':23,'民主进步党':13},
  1995:{'中国国民党':18,'民主进步党':13,'新党':5},
  1998:{'中国国民党':27,'民主进步党':18,'新党':4},
  2001:{'民主进步党':18,'中国国民党':15,'亲民党':11,'台湾团结联盟':5},
  2004:{'民主进步党':19,'中国国民党':18,'亲民党':7,'台湾团结联盟':5},
  2008:{'中国国民党':20,'民主进步党':14},
  2012:{'中国国民党':16,'民主进步党':13,'台湾团结联盟':3,'亲民党':2},
  2016:{'民主进步党':18,'中国国民党':11,'亲民党':3,'时代力量':2},
  2020:{'民主进步党':13,'中国国民党':13,'台湾民众党':5,'时代力量':3},
  2024:{'民主进步党':13,'中国国民党':13,'台湾民众党':8}
 };
 const SOURCES={
  1992:'https://www.president.gov.tw/Page/294/36980',
  1995:'https://www.npf.org.tw/2/648',1998:'https://www.npf.org.tw/2/648',2001:'https://web.cec.gov.tw/api/file/80c0e18d-31cd-4104-a6c5-2b0a3dc2fc21.pdf',
  2004:'https://web.cec.gov.tw/api/file/66199533-8d61-4512-adf9-05f3f1bf022b.pdf',
  2008:'https://web.cec.gov.tw/api/file/f596f3d8-74bc-45b8-82fc-42ebce92c681.pdf',
  2012:'https://web.cec.gov.tw/api/file/ffb8f1b6-709e-40eb-aff7-ae98eb3d5da8.pdf',
  2016:'https://election.ltn.com.tw/2016/news/breakingnews/1575386',
  2020:'https://www.cna.com.tw/news/firstnews/202001115030.aspx',
  2024:'https://2024.cec.gov.tw/article/content/?id=NEWS&target=%2Farticle%2FA0217'
 };
 const LAW_NEW='https://law.cec.gov.tw/LawContent.aspx?id=GL000292';
 const LAW_OLD='https://www.president.gov.tw/Page/294/36980';
 const openParties=new Set();
 const key=s=>String(s||'').replace(/[臺台]/g,'台').replace(/[·．‧]/g,'·').trim();
 const isIndependent=s=>['无党籍','無黨籍','无','無','无党籍及未经政党推荐','無黨籍及未經政黨推薦'].includes(key(s));
 const format=n=>Number(n||0).toLocaleString('zh-CN');
 const percent=n=>(Number(n||0)*100).toFixed(2)+'%';
 function allocate(votes,seats){
  const eligible=votes.filter(r=>r.eligible),base=eligible.reduce((s,r)=>s+r.votes,0);
  if(!base)return {assigned:new Map(),base:0,unallocated:seats};
  const shares=eligible.map(r=>{
   const raw=r.votes*seats/base,floor=Math.floor(raw);
   return {...r,raw,floor,remainder:raw-floor,assigned:floor};
  });
  let remaining=seats-shares.reduce((n,r)=>n+r.floor,0);
  shares.sort((a,b)=>b.remainder-a.remainder||b.votes-a.votes||a.party.localeCompare(b.party,'zh'));
  for(let i=0;i<shares.length&&i<remaining;i++)shares[i].assigned++;
  return {assigned:new Map(shares.map(r=>[r.party,r.assigned])),base,unallocated:Math.max(0,remaining-shares.length)};
 }
 function build(year,snapshot){
  year=Number(year);
  const old=year<2008,parts=ERA_SEATS[year]||[34,0];
  const national=(snapshot?.rows||[]).filter(r=>r.electorate==='party'&&r.level==='national');
  const parties=new Map();
  for(const r of national){
   const party=key(r.party||r.name);
   if(!party||isIndependent(party))continue;
   const votes=Number(r.votes||0);
   if(!Number.isFinite(votes)||votes<0)continue;
   parties.set(party,(parties.get(party)||0)+votes);
  }
  const total=[...parties.values()].reduce((a,b)=>a+b,0);
  const items=[...parties].map(([party,votes])=>({party,votes,share:total?votes/total:0,eligible:total?votes*20>=total:false}));
  const primary=allocate(items,parts[0]),overseas=old?allocate(items,parts[1]):null;
  const expected=VERIFIED[year]||{};
  const result=items.map(item=>{
   const first=primary.assigned.get(item.party)||0,second=overseas?.assigned.get(item.party)||0,seats=first+second;
   return {...item,seats,atLarge:first,overseas:second,expected:expected[item.party]??0,
    checked:Object.prototype.hasOwnProperty.call(expected,item.party)?seats===expected[item.party]:!seats,
    winners:nominees(year,item.party),overseasWinners:(OVERSEAS_WINNERS[year]?.[item.party]||'').split(/\s+/).filter(Boolean)};
  }).sort((a,b)=>b.seats-a.seats||b.votes-a.votes||a.party.localeCompare(b.party,'zh'));
  return {year,old,parts,total,eligibleTotal:primary.base,parties:result,
   totalAssigned:result.reduce((n,p)=>n+p.seats,0),
   matchesOfficial:result.every(p=>p.checked)&&result.reduce((n,p)=>n+p.seats,0)===parts[0]+parts[1]};
 }
 function nominees(year,party){
  if(Number(year)===2024&&SLATES_2024[party]){
   const winners=new Set((WINNERS[2024]?.[party]||'').split(/\s+/));
   return SLATES_2024[party].split(/\s+/).map((name,i)=>({rank:i+1,name,elected:winners.has(name)}));
  }
  const names=WINNERS[year]?.[party]?.split(/\s+/).filter(Boolean)||[];
  if(!names.length)return [];
  let candidates=names.map((name,i)=>({rank:i+1,name,elected:true}));
  const special=EXTRA[year]?.[party];
  if(special?.length){
   const map=new Map(special.map(row=>[row.name,row]));
   candidates=candidates.filter(row=>!map.has(row.name)).map((row,i)=>({...row,rank:i+1}));
   candidates.push(...special);
  }
  return candidates.sort((a,b)=>a.rank-b.rank);
 }
 function element(tag,klass,text){
  const n=document.createElement(tag);if(klass)n.className=klass;if(text!==undefined)n.textContent=text;return n;
 }
 function addParty(host,party,makeParty){
  if(makeParty)makeParty(host,party);else host.append(element('span','',party));
 }
 function render(container,{year,snapshot,makeParty}={}){
  const model=build(year,snapshot);
  container.replaceChildren();container.hidden=false;
  const box=element('section','history-list-explorer');
  const head=element('div','history-list-head');
  const heading=element('div');
  heading.append(element('span','history-list-eyebrow','第'+(model.year===1992?2:model.year===1995?3:model.year===1998?4:model.year===2001?5:model.year===2004?6:(model.year-2008)/4+7)+'届 · '+model.year+'年'),
   element('h3','','不分区民代选举结果与当选名单'),
   element('p','',model.old?'旧制：按政党推荐的区域及少数民族候选人得票计算；无独立政党票。':'新制：独立政党票，34席采用比例分配。'));
  head.append(heading);
  const link=element('a','history-list-source','查看选举资料');link.href=SOURCES[model.year]||LAW_NEW;link.target='_blank';link.rel='noopener noreferrer';head.append(link);
  box.append(head);
  const stats=element('div','history-list-stats');
  for(const [label,value] of [['比例代表席次',model.parts[0]+model.parts[1]+' 席'],
   ['取得席次政党',model.parties.filter(p=>p.seats).length+' 个'],
   [model.old?'有推荐候选人政党':'参选政党',model.parties.length+' 个'],
   ['5% 门槛','得票满 5%']]){
    const tile=element('div','history-list-stat');tile.append(element('span','',label),element('strong','',value));stats.append(tile);
  }
  box.append(stats);
  if(model.old){
   const types=element('div','history-list-oldsplit');
   types.append(element('span','','不分区 '+model.parts[0]+' 席'),element('span','','侨居国外代表 '+model.parts[1]+' 席'),
    element('span','', '两类分别计算席次、分别登记候选人'));
   box.append(types);
  }
  const chart=element('div','history-list-seatbar');
  chart.setAttribute('role','img');
  chart.setAttribute('aria-label',model.parties.filter(p=>p.seats).map(p=>p.party+' '+p.seats+'席').join('、'));
  for(const p of model.parties.filter(p=>p.seats)){
   const part=element('span','history-list-seat-segment',p.seats>=3?p.seats+'席':'');
   const simpleParty=typeof root.predictionParty==='function'?root.predictionParty(p.party):null;
   part.style.background=simpleParty?.color||({'中国国民党':'#2268b8','民主进步党':'#328e63','台湾民众党':'#41aeb4','亲民党':'#e58f35','时代力量':'#debc42','台湾团结联盟':'#9465bd'}[p.party]||'#889b9c');
   part.style.flex=String(p.seats);part.title=p.party+' '+p.seats+'席';chart.append(part);
  }
  box.append(chart);
  const caption=element('p','history-list-context',model.old?
   '旧制的票数为政党推荐候选人的票数汇总；无党籍与未经政党推荐的候选人票不纳入政党分配。席次分配按不分区、侨选分别计算。':
   '仅得票率达到5%的政党参与第二阶段席次分配，按合格政党的票数重新归一化，再以最大余额法分配34席。');
  box.append(caption);
  if(!model.matchesOfficial){
   box.append(element('p','history-list-alert','注意：当前资料按法定规则计算的席次与已核对历史结果存在差异，本页保留计算值供核查，不将其标为官方当选名单。'));
  }
  const section=element('div','history-list-section-title');
  section.append(element('h4','','政党席次与提名名单'));
  section.append(element('span','','按分配席次和得票数排序 · 点击政党展开'));
  box.append(section);
  const table=element('div','history-list-party-list');
  for(const p of model.parties){
   const details=element('details','history-list-party');
   if(openParties.has(year+':'+p.party)||!openParties.size&&p.seats>0&&model.parties.indexOf(p)<2)details.open=true;
   details.addEventListener('toggle',()=>{const k=year+':'+p.party;if(details.open)openParties.add(k);else openParties.delete(k)});
   const summary=element('summary','history-list-party-row');
   const partyCell=element('div','history-list-party-name');addParty(partyCell,p.party,makeParty);
   const count=element('span','history-list-count',format(p.votes)+'票');
   const rate=element('span','history-list-rate',percent(p.share));
   const seat=element('strong','history-list-seat',p.seats+'席');
   const status=element('span','history-list-qualifier',p.eligible?'达到5%':'未达5%');
   if(p.eligible)status.classList.add('qualified');
   summary.append(partyCell,count,rate,status,seat,element('span','history-list-chevron','⌄'));
   details.append(summary);
   const body=element('div','history-list-party-details');
   const line=element('p','history-list-party-breakdown',
    (model.old?'不分区 '+p.atLarge+'席 · 侨选 '+p.overseas+'席':'得票 '+format(p.votes)+' 票 · '+percent(p.share)+'（原始得票率）')+
     ' · '+(p.seats?'获配席次':'未取得席次'));
   body.append(line);
   if(p.winners.length){
    body.append(element('h5','',model.year===2024&&SLATES_2024[p.party]?'完整提名名单 · '+p.winners.length+'人 · 原始当选 '+p.winners.filter(c=>c.elected).length+'人':'原始当选名单 · 已核实 '+p.winners.filter(c=>c.elected).length+' 人'));
    const grid=element('div','history-list-nominees');
    for(const n of p.winners){
     const row=element('div','history-list-nominee');
     if(n.elected)row.classList.add('elected');
     row.append(element('span','history-list-rank',n.rank+'.'),
      element('span','history-list-person',n.name),
      element('span','history-list-result',n.elected?'★ 当选':'未当选'));
     if(n.rank>p.seats&&n.elected)row.title='按妇女保障规则优先当选，并非单纯前N名';
     grid.append(row);
    }
    body.append(grid);
    if(model.old&&p.overseasWinners.length){
     body.append(element('h5','','侨选原始当选名单 · '+p.overseasWinners.length+'人'));
     const overseasGrid=element('div','history-list-nominees');
     for(const [i,name] of p.overseasWinners.entries()){
      const row=element('div','history-list-nominee elected');
      row.append(element('span','history-list-rank',String(i+1)+'.'),element('span','history-list-person',name),element('span','history-list-result','★ 当选'));
      overseasGrid.append(row);
     }
     body.append(overseasGrid);
    }
    body.append(element('p','history-list-caveat',model.old?
     [2001,2004].includes(model.year)?'本届已核对当选的不分区41人及侨选8人；尚未收录全部未当选提名人。':'此处仅收录已核实的不分区当选人，尚未录入本届侨选名单及全部未当选提名人。':
     model.year===2024&&SLATES_2024[p.party]?'2024年原始提名顺序与选举当晚当选名单；任期内递补不改变此处的原始当选标记。':'这里只展示已核实的原始当选名单及部分特殊提名顺序，不代表完整政党提名名单；任期内辞职、递补不计入本表。'));
   }else{
    body.append(element('p','history-list-caveat',p.seats?
     '本届该党获得席次，但原始当选人及完整提名名册尚未逐项核实，因此暂不展示姓名。':
     '此党未分配到席次；其完整提名名册尚未逐项核实，暂不展示未经确认的姓名。'));
   }
   const ref=element('a','history-list-detail-link','核对本届原始选举资料');
   ref.href=model.year===2024?SLATE_SOURCE_2024:SOURCES[model.year]||LAW_NEW;ref.target='_blank';ref.rel='noopener noreferrer';body.append(ref);
   details.append(body);table.append(details);
  }
  if(!model.parties.length)table.append(element('p','history-list-caveat','本届的政党得票数据尚未加载。'));
  box.append(table);
  const expl=document.createElement('details');expl.className='history-list-method';
  const exTitle=element('summary','','席次如何计算？（2008年前后区别）');expl.append(exTitle);
  const copy=element('div','history-list-method-body');
  const steps=[
   '① 票源：1992—2004年将各政党推荐的区域与少数民族候选人得票汇总，排除无党籍及未经推荐者；2008年起直接使用独立政党票。',
   '② 资格：政党原始得票率达到5%方可分配席次。未过门槛者的票数，不参与下一阶段的分母。',
   '③ 分配：合格政党票数 ÷ 合格政党总票数 × 当届应选席次。先取整数席，余席按小数余额从大到小分配（最大余额法）。',
   model.old?'④ 旧制：不分区与侨选分别核算，不能将旧制'+(model.parts[0]+model.parts[1])+'席合并后计算；依旧制提名名单、当届妇女保障规定决定实际人选。':
     '④ 新制：每党获配席次依候选人名单顺序确定；当选名单中的女性必须至少占一半，不足时由后续女性优先补足。',
   '⑤ 本页显示投票时的原始当选结果，而非任期中递补后的在任名单；旧制来源汇总不等于独立投出的政党票。'
  ];
  for(const step of steps)copy.append(element('p','',step));
  for(const [name,url] of [['1991年旧制规则',LAW_OLD],['现行选罢法第67条',LAW_NEW]]){
   const a=element('a','history-list-detail-link',name);a.href=url;a.target='_blank';a.rel='noopener noreferrer';copy.append(a);
  }
  expl.append(copy);box.append(expl);
  container.append(box);
  return model;
 }
 const api={build,allocate,nominees,render,ERA_SEATS,VERIFIED};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 else root.HistoryLegislativeParty=api;
})(typeof window==='undefined'?{}:window);
