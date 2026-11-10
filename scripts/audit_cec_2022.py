import io,zipfile,urllib.request,collections,sys
url='https://data.cec.gov.tw/%E9%81%B8%E8%88%89%E8%B3%87%E6%96%99%E5%BA%AB/votedata.zip'
print('DOWNLOAD',url,flush=True)
with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0'}),timeout=120) as r:
 data=r.read()
print('ARCHIVE BYTES',len(data),flush=True)
z=zipfile.ZipFile(io.BytesIO(data))
names=z.namelist()
print('FILES',len(names))
for n in names:
 if ('111' in n or '2022' in n) and any(x in n.lower() for x in ('elcand','elprof','elbase','.zip')):
  print('MATCH',repr(n),flush=True)
print('SAMPLE ARCHIVE ROOT')
for n in names[:35]: print('NAME',repr(n))

print('SAMPLES FROM 2022 FILES')
for n in names:
 if '2022-111' not in n or not n.endswith(('elcand.csv','elprof.csv','elbase.csv')): continue
 if '/C1/' not in n and '/C2/' not in n and '/D1/' not in n and '/T1/' not in n and '/T2/' not in n and '/T3/' not in n: continue
 raw=z.read(n)
 print('FILE',n.split('2022-111',1)[1].rsplit('/',1)[0].split('/')[-3:],n.rsplit('/',1)[-1],len(raw))
 for encoding in ('utf-8-sig','big5','cp950','gb18030'):
  try:
   sample=raw.decode(encoding)
   print('ENC',encoding,'LINES',len(sample.splitlines()))
   for line in sample.splitlines()[:4]: print('ROW',repr(line[:300]))
   break
  except UnicodeDecodeError: continue
