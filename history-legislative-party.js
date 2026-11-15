/* Party-list legislative election explorer: historical rules, party shares and original winners.
 * A declared official winner is NEVER inferred from a candidate's party-share rank.
 * Party slates are partial where an official nominated-order archive has not yet been verified.
 */
(function(root){
 'use strict';
 const ERA_SEATS={1992:[30,6],1995:[30,6],1998:[41,8],2001:[41,8],2004:[41,8]};
 const WINNERS={
  1992:{
   '中国国民党':'程建人 蔡友土 李鸣皋 周书府 严启昌 陈健民 黄正一 李友吉 罗传进 洪冬桂 陈锡章 刘瑞生 陈玺安 刘国昭 葛雨琴 李源泉 杨吉雄 刘光华 李宗正',
   '民主进步党':'叶菊兰 张俊雄 戴振耀 余玲雅 林瑞卿 谢聪敏 黄尔璇 赵绣娃 侯海熊 方来进 叶耀鹏'
  },
  1995:{
   '中国国民党':'刘松藩 李鸣皋 洪冬桂 陈健民 李友吉 葛雨琴 刘国昭 罗传进 刘光华 杨吉雄 靳曾珍丽 王令麟 张光锦 陈琼赞 蔡璧煌',
   '民主进步党':'谢长廷 黄尔璇 巴燕·达鲁 张俊宏 王拓 简锡堦 洪奇昌 刘进兴 林瑞卿 林文郎 范巽绿',
   '新党':'陈癸淼 林郁方 郑龙水 陈一新'
  },
  1998:{
   '中国国民党':'饶颖奇 陈健治 高育仁 洪昭男 李鸣皋 陈琼赞 郑逢时 洪秀柱 翁重钧 林国龙 王令麟 曾振农 陈杰儒 杨吉雄 靳曾珍丽 周正之 游淮银 许素叶 刘光华 李正宗 蔡铃兰 廖风德 李全教',
   '民主进步党':'张俊宏 陈昭南 巴燕·达鲁 周清玉 颜锦福 林忠正 陈胜宏 许荣淑 黄尔璇 刘俊雄 戴振耀 范巽绿 陈忠信 简锡堦 林文郎',
   '新党':'李炷烽 张世良 郑龙水'
  },
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
  '小民参政欧巴桑联盟':'高芸婷 林诗涵 阎柏陵',
  '台湾绿党':'钟宝珠 李菁琪 黄柔嘉 吴伊婷 希婕·玛飞洑 林莉蔡 黄慧芬 张竹岑',
  '台湾双语无法党':'陈亭谕 萧文乾',
  '台湾基进':'史惟筑 陈奕齐 黄枫茹 陈君恺 杨佩桦 黄馨莹 徐焕博',
  '中华统一促进党':'丁炳仁 黄妙如 肖云霞 张安乐',
  '民主进步党':'林月琴 沈伯洋 张雅琳 洪申翰 罗美玲 游锡堃 范云 柯建铭 沈发惠 庄瑞雄 林楚茵 郭昱晴 王正旭 王义川 陈培瑜 陈俊翰 张秀君 黄奕睿 孙一信 吴祥荣 陈慧君 柯富扬 刘柏君 石明谨 曾美玲 黄真玮 曾湘桦 郑力嘉 陈右欣 余宛如 许菡芸 周威佑 廖韶吟 蔡宜文',
  '制度救世岛':'林丽容 石人仁 张怡菁 古文发 黄千明',
  '时代力量':'林依莹 王宝萱 宋国鼎 江盛 陈泰源 陈昱安 余佳倩 郑俏青',
  '中国国民党':'韩国瑜 柯志恩 葛如钧 翁晓玲 陈菁徽 吴宗宪 林倩绮 陈永康 许宇甄 谢龙介 苏清泉 张嘉郡 王育敏 蔡明忠 吴亮仪 李玉婵 李霞 杨应超 徐弘庭 钟沛君 江怡臻 简荣宗 田长沛 沈采颖 林环嘉 陈克威 邱一峰 廖怡琇 李继显 李茂芊 丁瑀 杨智伃 何嘉霖 康晋瑜',
  '司法改革党':'戴翊如 张静 李柏融 尤瑞敏 赖伯琦 吴振豪 晏扬清 许韶珍 杨启珊',
  '新党':'王建煊 仇桂美 吴成典 贺桦 林易升 陈丽玲 戴德满 王子苓',
  '台湾民众党':'黄珊珊 黄国昌 陈昭姿 吴春城 麦玉珍 林国成 林忆君 张启楷 刘书彬 洪毓祥 蔡春绸 王安祥 邱慧洳 陈清龙 李贞秀 许忠信 徐瑞希 杨弘意 陈智菡 庄贻量 林筱淇 蔡丰州 张雪如 汤宏正 林淑芬 梁明辉 廖维欣 冯启彦 林子宇 张清俊 林治华 李家豪 邱于珊 周榆修',
  '台湾维新':'苏焕智 刘亦恩 江映瑶',
  '亲民党':'李桐豪 陈怡洁 曲兆祥 何伟真 简泰河 蓝志玟 吴建德 黎淑慧 孙信君 黎建南',
  '人民最大党':'林东雄 赖方静静',
  '台湾团结联盟':'周倪安 刘一德 欧阳瑞莲 王思棠 张登凯 吴家庆'
 };
 const SLATE_SOURCE_2024='https://2024.cec.gov.tw/data/file/2fb887c81a7a4b3a888e4d3befe9259d.pdf';
 const SLATE_SOURCES={
  2001:'https://web.cec.gov.tw/api/file/516cdc62-a08b-4612-a818-7c3ad96511ce.pdf',
  2004:'https://web.cec.gov.tw/api/file/9ecb9f91-beff-44ad-9e72-e7d56be79b2a.pdf',
  2008:'https://web.cec.gov.tw/api/file/9b6521a5-f3ef-4754-bd3e-cd0a3292c282.pdf',
  2012:'https://gazette.nat.gov.tw/EG_FileManager/eguploadpub/eg018004/ch02/type3/gov15/num2/OEg.pdf',
  2016:'https://web.cec.gov.tw/api/file/26f914ad-93b3-4c8e-9844-546ea286c970.pdf',
  2020:'https://web.cec.gov.tw/api/file/480f911a-7a9f-46d1-b87f-a7b47a1ce1f4.pdf',
  2024:SLATE_SOURCE_2024
 };

 const OVERSEAS_WINNERS={
  1992:{
   '中国国民党':'江伟平 郭石城 张建国 廖光生',
   '民主进步党':'张旭成 陈唐山'
  },
  1995:{
   '中国国民党':'李文郎 黄清林 吴惠祖',
   '民主进步党':'张旭成 林哲夫',
   '新党':'钱达'
  },
  1998:{
   '中国国民党':'洪读 范扬盛 杨作洲 关沃暖',
   '民主进步党':'张旭成 钟金江 张秀珍',
   '新党':'营志宏'
  },
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

 // Candidate slates transcribed in published nomination order, including unsuccessful names.
 // Complete sets below have independent per-party totals to support integrity checks.
 const SLATES_BY_YEAR={
  2001:{
   '中国国民党':'饶颖奇 江丙坤 陈健治 黄昭顺 高育仁 王钟渝 黄德福 蔡铃兰 陈健民 郑逢时 侯彩凤 李和顺 陈建年 高仲源 黄逢时 许素叶 王事展 黄正义 陈钉云 李仁人 尹祈羊 李正宗 陈杰儒 魏镛 吴绮美 吕丽莉 刘宗明 简明哲 石元娜 许俊达 廖万隆 唐玺惠 韩国瑜 格桑德钦巴顿 陈美子 纪荣祥 张昆祥 李旭辉 曹一之',
   '民主进步党':'洪奇昌 尤清 陈道明 刘世芳 张俊宏 林浊水 高志鹏 许荣淑 邱永仁 颜锦福 邱彰 郑贵莲 陈胜宏 陈忠信 刘俊雄 林文郎 林忠正 张兆路 戴振耀 苏嘉富 黄国照 朱铭树 廖茂勋',
   '新党':'许历农 石齐平 李炳南 郑纪恩 延惠君 施诚 邓家基 谢图',
   '亲民党':'刘忆如 殷乃平 李桐豪 刘松藩 林惠官 顾崇廉 钟荣吉 蔡中涵 高明见 陈飞龙 宋楚瑜 李复甸 简金卿 邹桂蓉 郭晟生 郑阿月 吴雪山 林鹤锡 林忠信 孙荣吉 杨荣明 张万同 李允杰',
   '台湾团结联盟':'黄宗源 吴东昇 程振隆 黄政哲 苏进强 陈敏敦 许松根 黄昭展 潘至诚 蔡吉源 黄金郎 张祯祥 洪进益 邱垂亮 黄主文'
  },
  2008:{
   '公民党':'雷侨云 钱汉清 陈华足 孔仁奕',
   '制宪联盟':'吴景祥 黄馨主 黄千明',
   '台湾团结联盟':'陈永兴 陈玉峰 赖幸媛 施朝贤 钱林慧君 江伟君 黄昆辉 罗志明 李宜洁 范盛保 张金生 傅馨仪 黄昭展 叶津铃 李安妮',
   '第三社会党':'吕秀菊 杨伟中 林致真 杨静华 林志成',
   '民主进步党':'陈节如 蔡煌瑯 涂醒哲 邱议莹 柯建铭 黄淑英 王幸男 薛凌 高志鹏 陈莹 余政道 翁金珠 蔡同荣 田秋堇 洪奇昌 张富美 游盈隆 许荣淑 游锡堃 杨芳婉 周清玉 陈茂男 吴明敏 张秀珍 范巽绿 王涂发 张庆惠 周光宙 刘美德 施义芳 丽依京·尤玛 梁祯祥 陈慧玲',
   '新党':'周阳山 雷倩 高家俊 林美伦 徐宗懋 郭家芬 葛建埔 孙吉珍 李胜峰 郁慕明',
   '绿党':'陈曼丽 张辉山 张宏林 王芳萍',
   '台湾农民党':'钱小凤 柯俊雄 马国清 陈信宏 范姜秀珍 陈重光 洪美珍 张文正',
   '无党团结联盟':'刘忆如 陈杰儒',
   '中国国民党':'王金平 洪秀柱 曾永权 潘维刚 邱毅 郑金玲 陈杰 李纪珠 张显耀 赵丽云 李嘉进 廖婉汝 纪国栋 罗淑蕾 李明星 郭素春 刘盛良 郑丽文 帅化民 徐少萍 许舒博 陈淑慧 李全教 许宇甄 黄良华 杨玉珍 林正峰 华真 姚江临 邱美瑞 江绮雯 吕春霖 邱润容 谢坤宏',
   '红党':'杨玉欣 姚立明 陈耀昌 胡德夫 黄惠君 宗景宜 魏耀乾',
   '客家党':'宋楚瑜 钟棖婷 彭云煌'
  },
  2012:{
   '台湾国民会议':'陈嘉君 姚立明 张裕泰 许达夫 黄惠君',
   '人民最大党':'许荣淑 林守一',
   '民主进步党':'陈节如 柯建铭 吴宜臻 李应元 田秋堇 蔡煌瑯 萧美琴 陈其迈 郑丽君 段宜康 尤美女 吴秉叡 薛凌 余天 翁金珠 游锡堃 陈莹 苏贞昌 黄淑英 谢长廷 杨芳婉 蔡同荣 卓春英 赵永清 谢欣霓 施义芳 余莓莓 陈景峻 陈秀惠 赖万枝 尹伶瑛 戴振耀 涂醒哲',
   '台湾团结联盟':'许忠信 黄文玲 黄昆辉 林世嘉 赖振昌 叶津铃 刘国隆 周倪安 高基赞 丁玉玲',
   '中国国民党':'王金平 王育敏 曾巨威 杨玉欣 邱文彦 洪秀柱 吴育仁 潘维刚 陈镇湘 李贵敏 苏清泉 陈碧涵 詹凯臣 徐少萍 纪国栋 陈淑慧 尹启铭 詹满容 杨志良 许宇甄 吴清池 王美只 林万福 张琼玲 简明哲 赖素如 徐德馨 华真 李德维 邱素兰 詹澈 吴陈璇秋 吴威志 颜婉娟',
   '新党':'郁慕明 王鸿薇 王亚男 高家俊 陈丽玲 戴德成',
   '健保免费连线':'梅峰 廖美燕 王老养',
   '绿党':'赖美惠 钟宝珠',
   '亲民党':'李桐豪 张晓风 傅学鹏 陈怡洁 林乡维 何伟真 傅慰孤 郑美兰 胡祖庆 李培芬 任睦杉 高上晴 李继生 李慧慧 刘瀚宇 周怡廷 陈振训 余书华',
   '中华民国台湾基本法连线':'黄千明 王戴春满 陈祖祥 黄馨玉 谢正一 康淑敏',
   '台湾主义党':'姜水浪 陈儒涵 何棋生 陈俞蓉 温程显 颜文耀 林能达 王小玉'
  },
  2016:{
   '民主进步党':'吴焜裕 吴玉琴 陈曼丽 顾立雄 蔡培慧 王荣璋 谷辣斯·尤达卡 余宛如 苏嘉全 段宜康 郑丽君 陈其迈 尤美女 李应元 钟孔炤 林静仪 徐国勇 施义芳 周春米 李丽芬 郭正亮 邱泰源 蒋絜安 陈静敏 黄义佑 余莓莓 陈义聪 江梅惠 谢世英 曾美玲 董建宏 蔡宛芬 黄帝颖 王贵莲',
   '亲民党':'李鸿钧 陈怡洁 周陈秀霞 黄越宏 杨紫宗 何伟真 叶青 胡祖庆 郑美兰 任睦杉 刘冠霆 董贞吟 蓝姿宽 张克士 黎淑慧 李汉强',
   '自由台湾党':'萧晓玲 郭正典 周芷萱 林世杰 李淑慧 蔡丁贵',
   '和平鸽联盟党':'吴宛甄 郑文松 庄秉鸿',
   '军公教联盟党':'张赐 陈金梅 汪耀华 陆炳成 魏千妮',
   '民国党':'陈汉洲 林锡维 陈奕樵 蔡慧玲 李天铎 何宇羚 曾玉琼 蔡宥祥 陈丽纹 刘美贞',
   '信心希望联盟':'董保城 李莉娟 黄迺毓 陶君亮 南岳君 冯珮',
   '中华统一促进党':'张安乐 赵福芬 庄永彰 肖云霞 陈建华 李淑华 张孟崇 陈韵如 李宗奎 康淑敏',
   '中国国民党':'王金平 柯志恩 陈宜民 林丽蝉 许毓仁 曾铭宗 黄昭顺 吴志扬 张丽善 徐榛蔚 曾永权 王育敏 胡筑生 林奕华 童惠珍 李贵敏 徐巧芯 陈玉梅 侯佳龄 李德维 马在勤 连元章 林倩绮 邱素兰 王桂芸 林信华 杨建中 郭淑娟 郑女勤 李正皓 曾琼瑶 林家兴 萧敬严',
   '台湾团结联盟':'陈奕齐 颜绿芬 赖振昌 傅馨仪 黄光艺 李心仪 高基赞 张素华 张兆林 周倪安 丁文祺 林玉芳 李卓翰 张禾沂 蔡青芳',
   '时代力量':'高潞·以用 徐永明 郑秀玲 柯劭臻 林依莹 柯一正',
   '大爱宪改联盟':'黄千明 吾尔开希·多莱特 黄馨主 张怡菁 李宗勋 洪美珍',
   '绿党社会民主党联盟':'张丽芬 李根政 詹顺贵 叶大华 谢英俊 许秀雯',
   '台湾独立党':'田明达',
   '无党团结联盟':'林炳坤 黄美兰 游旻慈 郑美珠 蔡咏锝 蔡锦贤 谢忠恒',
   '新党':'叶毓兰 邱毅 沈采颖 唐慧琳 陈丽玲 王炳忠 苏恒 侯汉廷 赵家蓉 杨世光',
   '健保免费连线':'许荣淑 林东雄 黄嘉华',
   '树党':'潘翰声 邱馨慧'
  },
  2020:{
   '合一行动联盟':'彭迦智 龙传若玮 郝淑慧 廖金河 孙成玉 张宜兴 周美云 林杰忠',
   '中华统一促进党':'谢启大 丁炳仁 何建华 马银海 李承龙 张瑜庭 张安乐',
   '亲民党':'滕西华 李鸿钧 宣明智 刘宥彤 陈怡洁 张硕文 施寿全 李海同 蔡沁瑜 高瀚 游文人 陈秀玲 黄文卿 李本玟 黎淑慧 彭琼芳 刘宗夏 林昊宜 赵伟伶 萧涵方 陈一夫 吴方宜',
   '安定力量':'朱竹元 陈晓虹 毛嘉庆 冯瑞珠 裴佩恩 林秋屏 吴蔚洋 李允佳 洪正一 苏美玲',
   '台湾基进':'成令方 陈奕齐 吴欣岱 陈冠荣 何澄辉 李雨蓁',
   '时代力量':'陈椒华 邱显智 王婉谕 黄国昌 翟本乔 关心羚 王闵英 吴佩芸 白卿芬 赵芸菁 詹智钧',
   '新党':'邱毅 陈丽玲 沈采颖 王炳忠 贺桦 林明正 黄乃芸 庞文楚 郝永瑞 杨世光',
   '喜乐岛联盟':'林秀霞 施正锋 高大成 李素贞 张君瑜 林东征',
   '中国国民党':'曾铭宗 叶毓兰 李贵敏 吴斯怀 郑丽文 林文瑞 廖婉汝 翁重钧 吴怡玎 陈以信 张育美 李德维 温玉霞 吴敦义 谢龙介 车宜静 牛春茹 曾文培 李玉婵 王裕文 王桂芸 耿继文 侯佳龄 谢瀛华 邱素兰 张智伦 李惠兰 连元章 许谨如 林有志 黄琼华',
   '一边一国行动党':'陈昭姿 郑新助 朱孟庠 杨其文 张文朗',
   '劳动党':'罗美文 王娟萍',
   '台湾绿党':'邓惠文 高成炎 王浩宇 李菁琪 张佑辅 张竹芩',
   '宗教联盟':'朱武献 翁玮铁 吕玲玲 阎代霖 吕锡勋 袁慧心 吴亮仪 陈建平',
   '民主进步党':'吴玉琴 洪申翰 范云 罗美玲 邱泰源 周春米 游锡堃 柯建铭 管碧玲 庄瑞雄 沈发惠 林楚茵 施义芳 游万丰 欧蜜·伟浪 汤蕙祯 陈静敏 黄奕睿 许忠富 张菊芳 吕建德 陈培瑜 颜圣冠 李淑芬 柯富扬 黄金舜 林爱龙 董建宏 林世嘉 黄帝颖 赵心瑜 蒋念祖 杨懿珊',
   '台湾民众党':'赖香伶 张其禄 高虹安 邱臣远 蔡壁如 杨博宇 吴欣盈 詹翔钦 陈琬惠 林国成 孙智丽 杨弘仁 黄瀞莹 冯启彦 江惠仪 罗义兴 陈思宇 魏安国 李思慧 傅郁扬 何容君 端木正 陈安芃 何松颖 吴静怡 李家齐 周芳如 张学瀚',
   '台湾维新':'贺德芬 万淑娟 曾吉郎 蔡惠兰 詹昭能 苏焕智',
   '台澎党':'郑自才 黄圣峰 杨神龙 林碧如',
   '国会政党联盟':'徐欣莹 张宗杰 王静亚 陈汉洲 李宗芹 余舷',
   '台湾团结联盟':'潘建志 周倪安 刘一德 蔡以新 潘厚勋 欧阳瑞莲 高基赞'
  },
  2024:SLATES_2024
 };

 // CEC sixth-legislature registration register lists people but not their formal order.
 // Preserve a complete 2004 nomination inventory without inventing ranking.
 const UNORDERED_SLATES_2004={
  '中国国民党':'曹寿民 苏起 黄德福 帅化民 柴云清 王敏星 黄昭顺 张立宇 刘盛良 白添枝 黄志雄 郭素春 李纪珠 陈瑞昌 江丙坤 陈美子 侯彩凤 黄良华 王金平 曾永权 赵连出 华真 章仁香 董清池',
  '民主进步党':'陈时中 洪奇昌 黄诚 许永面 陈宗仁 黄淑英 田秋堇 蔡英文 高志鹏 吴明敏 邱永仁 周平德 王荣璋 李若华 张庆惠 徐进荣 薛凌 林浊水 蔡煌瑯 杨芳婉 张俊雄 卢孳艳 尤清 王涂发 卢天麟 曾智勇 许德祥 许荣淑 夷将·拔路儿 陈秀惠 林文郎',
  '亲民党':'李复甸 罗淑蕾 刘忆如 张志铭 董贞吟 刘文雄 李锦泉 林正国 顾崇廉 葛建埔 吴攀龙 陈进兴 兰梁筱娟 黄旐涛 王蔡幸 蔡胜佳 钟荣吉 李文来 林惠官',
  '台湾团结联盟':'陈鸿基 黄金郎 李旭辉 李研慧 赖幸媛 陈永兴 林志嘉 陈银河 黄政哲 郭林勇',
  '无党团结联盟':'张博雅 宋丽华 陈杰儒 萧苑瑜 吴庆堂'
 };
 const OVERSEAS_SLATES_2001={
  '中国国民党':'关沃暖 孙国华 吴松柏 林雪美 薛盛华 吴英毅 申章昌 黄林芝',
  '民主进步党':'萧美琴 张秀珍 张旭成 钟金江 康泰山',
  '新党':'营志宏 李竞芬',
  '亲民党':'林政义 杨富美 李廷亚 宋枕文 王绍文',
  '台湾团结联盟':'王政中'
 };

 const OVERSEAS_SLATES_2004={
  '中国国民党':'谢文政 吴英毅 吴松柏 薛盛华 王晓蓉',
  '台湾团结联盟':'吕宪治 刘宽平 陈炎生',
  '亲民党':'李廷亚 林政义 陈庆仰 李维灏 梅长锜',
  '民主进步党':'陈重信 庄和子 黄静枝 陈明真 陈东荣 李正三',
  '无党团结联盟':'黄正义'
 };

 const EXTRA={
  2012:{'台湾团结联盟':[{rank:3,name:'黄昆辉',elected:false},{rank:4,name:'林世嘉',elected:true}]},
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
  1992:'https://zh.wikipedia.org/wiki/1992%E5%B9%B4%E4%B8%AD%E8%8F%AF%E6%B0%91%E5%9C%8B%E7%AB%8B%E6%B3%95%E5%A7%94%E5%93%A1%E9%81%B8%E8%88%89',
  1995:'https://zh.wikipedia.org/wiki/1995%E5%B9%B4%E4%B8%AD%E8%8F%AF%E6%B0%91%E5%9C%8B%E7%AB%8B%E6%B3%95%E5%A7%94%E5%93%A1%E9%81%B8%E8%88%89',
  1998:'https://zh.wikipedia.org/wiki/1998%E5%B9%B4%E4%B8%AD%E8%8F%AF%E6%B0%91%E5%9C%8B%E7%AB%8B%E6%B3%95%E5%A7%94%E5%93%A1%E9%81%B8%E8%88%89',2001:'https://web.cec.gov.tw/api/file/80c0e18d-31cd-4104-a6c5-2b0a3dc2fc21.pdf',
  2004:'https://web.cec.gov.tw/api/file/66199533-8d61-4512-adf9-05f3f1bf022b.pdf',
  2008:'https://web.cec.gov.tw/api/file/9b6521a5-f3ef-4754-bd3e-cd0a3292c282.pdf',
  2012:'https://web.cec.gov.tw/api/file/94c76578-5aa9-4248-9f81-8e625f92d326.pdf',
  2016:'https://web.cec.gov.tw/api/file/26f914ad-93b3-4c8e-9844-546ea286c970.pdf',
  2020:'https://web.cec.gov.tw/api/file/480f911a-7a9f-46d1-b87f-a7b47a1ce1f4.pdf',
  2024:'https://2024.cec.gov.tw/data/file/2fb887c81a7a4b3a888e4d3befe9259d.pdf'
 };
 const LAW_NEW='https://law.cec.gov.tw/LawContent.aspx?id=GL000292';
 const LAW_OLD='https://www.president.gov.tw/Page/294/36980';
 const openParties=new Set();
 const NOMINATION_STATS={
  2001:{type:'不分区提名',source:'CEC',complete:true},
  2004:{type:'不分区及侨选提名',source:'CEC',complete:true},
  2008:{type:'政党提名',source:'CEC',complete:true},
  2012:{type:'政党提名',source:'行政院公报',complete:true},
  2016:{type:'政党提名',source:'CEC',complete:true},
  2020:{type:'政党提名',source:'CEC',complete:true},
  2024:{type:'政党提名',source:'CEC',complete:true}
 };
 function nominationCount(year){
  const slates=SLATES_BY_YEAR[year];
  if(slates)return Object.values(slates).reduce((n,value)=>n+value.split(/\s+/).filter(Boolean).length,0)+
   (Number(year)===2001?Object.values(OVERSEAS_SLATES_2001).reduce((n,value)=>n+value.split(/\s+/).filter(Boolean).length,0):0);
  if(Number(year)===2004)return Object.values(UNORDERED_SLATES_2004).reduce((n,value)=>n+value.split(/\s+/).filter(Boolean).length,0)+
   Object.values(OVERSEAS_SLATES_2004).reduce((n,value)=>n+value.split(/\s+/).filter(Boolean).length,0);
  return null;
 }
 const key=s=>String(s||'').replace(/[臺台]/g,'台').replace(/[·．‧]/g,'·').trim();
 const isIndependent=s=>['无党籍','無黨籍','无','無','无党籍及未经政党推荐','無黨籍及未經政黨推薦'].includes(key(s));
 const format=n=>Number(n||0).toLocaleString('zh-CN');
 const percent=n=>(Number(n||0)*100).toFixed(2)+'%';
 function allocate(votes,seats){
  const eligible=votes.filter(r=>r.eligible),base=eligible.reduce((s,r)=>s+r.votes,0);
  if(!base)return {assigned:new Map(),base:0,unallocated:seats};
  const round4=n=>Math.round((n+Number.EPSILON)*10000)/10000;
  const shares=eligible.map(r=>{
   const rate=round4(r.votes/base*100),raw=round4(rate/100*seats),floor=Math.floor(raw);
   return {...r,rate,raw,floor,remainder:round4(raw-floor),assigned:floor};
  });
  let remaining=seats-shares.reduce((n,r)=>n+r.floor,0);
  shares.sort((a,b)=>b.remainder-a.remainder||b.votes-a.votes||a.party.localeCompare(b.party,'zh'));
  for(let i=0;i<shares.length&&i<remaining;i++)shares[i].assigned++;
  return {assigned:new Map(shares.map(r=>[r.party,r.assigned])),detail:new Map(shares.map(r=>[r.party,{quota:r.raw,whole:r.floor,bonus:r.assigned-r.floor,rate:r.rate}])),base,unallocated:Math.max(0,remaining-shares.length)};
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
    quota:primary.detail?.get(item.party)||null,overseasQuota:overseas?.detail?.get(item.party)||null,
    winners:nominees(year,item.party),overseasWinners:(OVERSEAS_WINNERS[year]?.[item.party]||'').split(/\s+/).filter(Boolean),
    overseasNominees:(year===2001?OVERSEAS_SLATES_2001[item.party]:year===2004?OVERSEAS_SLATES_2004[item.party]:'').split(/\s+/).filter(Boolean)};
  }).sort((a,b)=>b.seats-a.seats||b.votes-a.votes||a.party.localeCompare(b.party,'zh'));
  return {year,old,parts,total,eligibleTotal:primary.base,parties:result,
   totalAssigned:result.reduce((n,p)=>n+p.seats,0),
   matchesOfficial:result.every(p=>p.checked)&&result.reduce((n,p)=>n+p.seats,0)===parts[0]+parts[1]};
 }
 function nominees(year,party){
  if(Number(year)===2004&&UNORDERED_SLATES_2004[party]){
   const winners=new Set((WINNERS[2004]?.[party]||'').split(/\s+/));
   return UNORDERED_SLATES_2004[party].split(/\s+/).map(name=>({rank:null,name,elected:winners.has(name)}));
  }
  const slate=SLATES_BY_YEAR[Number(year)]?.[party];
  if(slate){
   const winners=new Set((WINNERS[year]?.[party]||'').split(/\s+/));
   return slate.split(/\s+/).map((name,i)=>({rank:i+1,name,elected:winners.has(name)}));
  }
  const names=WINNERS[year]?.[party]?.split(/\s+/).filter(Boolean)||[];
  if(!names.length)return [];
  let candidates=names.map((name)=>({rank:null,name,elected:true}));
  const special=EXTRA[year]?.[party];
  if(special?.length){
   const map=new Map(special.map(row=>[row.name,row]));
   candidates=candidates.filter(row=>!map.has(row.name));
   candidates.push(...special);
  }
  return candidates.sort((a,b)=>(a.rank??Infinity)-(b.rank??Infinity));
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
   [nominationCount(model.year)!==null?'登记提名人数':'5% 门槛',nominationCount(model.year)!==null?nominationCount(model.year)+' 人':'得票满 5%']]){
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
   '旧制为政党推荐的区域及少数民族候选人票汇总；无党籍与未经推荐者的候选人票不纳入比例分配。席次按不分区、侨选分别计算。部分小党虽有地区候选人得票，未必另行提出不分区提名名单。':
   '仅得票率达到5%的政党参与第二阶段席次分配，按合格政党的票数重新归一化，再以最大余额法分配34席。');
  box.append(caption);
  box.append(element('p','history-list-context','席次以当届全区结果分配，切换县市或乡镇市区地图只影响地方票数展示，不改变各党实际获配的全区席次。'));
  if(model.year<2001){box.append(element('p','history-list-caveat','档案范围：本届原始不分区与侨选当选名单已补齐；部分政党的落选提名名册未能从可检索资料中逐名确认。'))}
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
   if(p.quota){
    const quotaText=model.old?'不分区分配配额 '+p.quota.quota.toFixed(4)+'席（整数'+p.quota.whole+'＋余数分配'+p.quota.bonus+'）'+
     (p.overseasQuota?'；侨选分配配额 '+p.overseasQuota.quota.toFixed(4)+'席（整数'+p.overseasQuota.whole+'＋余数分配'+p.overseasQuota.bonus+'）':''):
     '34席分配配额 '+p.quota.quota.toFixed(4)+'席（整数'+p.quota.whole+'＋余数分配'+p.quota.bonus+'）';
    body.append(element('p','history-list-quota',quotaText));
   }
   if(p.winners.length){
    body.append(element('h5','',SLATES_BY_YEAR[model.year]?.[p.party]?'提名名单 · '+p.winners.length+'人 · 原始当选 '+p.winners.filter(c=>c.elected).length+'人':
      model.year===2004&&UNORDERED_SLATES_2004[p.party]?'登记提名名单 · '+p.winners.length+'人（原始排序未核实）':'原始当选名单 · 已核实 '+p.winners.filter(c=>c.elected).length+' 人'));
    const grid=element('div','history-list-nominees');
    for(const n of p.winners){
     const row=element('div','history-list-nominee');
     if(n.elected)row.classList.add('elected');
     const mark=element('span','history-list-result');
     if(n.elected){const img=element('img','history-list-winner-mark');img.src='assets/elected-mark.png';img.alt='当选';img.loading='lazy';mark.append(img)}
     row.append(element('span','history-list-rank',n.rank?String(n.rank)+'.':'·'),element('span','history-list-person',n.name),mark);
     if(n.rank!==null&&n.rank>p.seats&&n.elected)row.title='按妇女保障规则优先当选，并非单纯前N名';
     grid.append(row);
    }
    body.append(grid);
    if(model.old&&(p.overseasNominees.length||p.overseasWinners.length)){
     const hasAll=p.overseasNominees.length>0,ordered=hasAll&&model.year===2001,
      overseasDisplay=hasAll?p.overseasNominees:p.overseasWinners,overseasWinnerSet=new Set(p.overseasWinners);
     body.append(element('h5','',hasAll?'侨选登记提名名单 · '+overseasDisplay.length+'人（'+(ordered?'按当届原始登记顺序':'原始排序未核实')+'）':'侨选原始当选名单 · '+p.overseasWinners.length+'人'));
     const overseasGrid=element('div','history-list-nominees');
     for(const [i,name] of overseasDisplay.entries()){
      const elected=overseasWinnerSet.has(name);
      const row=element('div','history-list-nominee'+(elected?' elected':''));
      const mark=element('span','history-list-result');
      if(elected){const img=element('img','history-list-winner-mark');img.src='assets/elected-mark.png';img.alt='当选';img.loading='lazy';mark.append(img)}
      row.append(element('span','history-list-rank',ordered||!hasAll?String(i+1)+'.':'·'),element('span','history-list-person',name),mark);
      overseasGrid.append(row);
     }
     body.append(overseasGrid);
    }
    body.append(element('p','history-list-caveat',model.old?
     model.year===2001?'已核对本届全部108名不分区与21名侨选的提名顺序，以及41名不分区、8名侨选的原始当选人。':
     model.year===2004?'已对照中选会不分区及侨选全部登记候选人，名单原始排序尚未全部核实；当选标记为首次选举结果。':
     '已收录不分区和侨选原始当选人；1992—1998年落选提名人与正式名单顺序尚待旧公报数字化核实。':
     SLATES_BY_YEAR[model.year]?.[p.party]?'本届已收录该党原始提名顺序及选举当时的当选名单；任期内递补不计入原始当选。':'仅收录已核实的原始当选名单；未取得完整提名顺序时不推断名次。'));
   }else{
    body.append(element('p','history-list-caveat',p.seats?
     '本届该党获得席次，但原始当选人及完整提名名册尚未逐项核实，因此暂不展示姓名。':
     '本届未取得席次；当前史料尚未确认该党是否提交不分区提名名单，因此不展示未经核实的姓名。'));
   }
   const ref=element('a','history-list-detail-link','核对本届原始选举资料');
   ref.href=SLATE_SOURCES[model.year]||SOURCES[model.year]||LAW_NEW;ref.target='_blank';ref.rel='noopener noreferrer';body.append(ref);
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
   '③ 分配：合格政党票数 ÷ 合格政党总票数 × 当届应选席次。得票率百分数与席次配额按法规计算至小数点后四位，再取整数席，余席按余额从大到小分配（最大余额法）。',
   model.old?'④ 旧制：不分区与侨选分别核算，不能将'+(model.parts[0]+model.parts[1])+'席合并后计算。妇女保障规则与新制不同：每党各类别获配5至10席应有至少1名女性，超过10席后每满10席增设1名女性名额。':
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
 const api={build,allocate,nominees,nominationCount,render,ERA_SEATS,VERIFIED};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 else root.HistoryLegislativeParty=api;
})(typeof window==='undefined'?{}:window);
