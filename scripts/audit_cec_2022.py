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
