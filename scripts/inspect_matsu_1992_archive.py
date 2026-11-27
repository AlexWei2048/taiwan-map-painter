"""One-time read-only archival discovery; never modifies election data."""
import urllib.request, urllib.parse, subprocess, tempfile, pathlib, hashlib
from bs4 import BeautifulSoup
base='https://data.matsu-news.gov.tw/main.php'
def fetch(url, data=None, limit=2_000_000):
    req=urllib.request.Request(url,data=data,headers={'User-Agent':'Mozilla/5.0 historical election research'})
    with urllib.request.urlopen(req,timeout=35) as r:
        b=r.read(limit+1)
        if len(b)>limit: raise ValueError('response exceeds limit')
        return b
try:
    html=BeautifulSoup(fetch(base),'html.parser')
    for form in html.find_all('form'):
        print('FORM',form.get('method'),form.get('action'),flush=True)
        for x in form.find_all(['input','select','button']):
            print('CONTROL',x.name,x.get('name'),x.get('type'),x.get('value'),[o.get('value') for o in x.find_all('option')][:100],flush=True)
        print('LABEL',form.get_text(' ',strip=True)[:600],flush=True)
except Exception as e: print('FORM_ERROR',repr(e),flush=True)
url='https://client.matsu.idv.tw/literature/matsunews/1992_12.pdf'
try:
    with tempfile.TemporaryDirectory() as tmp:
        p=pathlib.Path(tmp)/'archive.pdf'
        p.write_bytes(fetch(url,limit=70_000_000))
        print('PDF_BYTES',p.stat().st_size,'SHA256',hashlib.sha256(p.read_bytes()).hexdigest(),flush=True)
        print(subprocess.check_output(['pdfinfo',str(p)],text=True)[:3000],flush=True)
        result=subprocess.check_output(['pdftotext','-layout',str(p),'-']).decode('utf-8','replace')
        pages=result.split('\f')
        print('TEXT_PAGE_LENGTHS',[(i+1,len(s.strip())) for i,s in enumerate(pages)],flush=True)
        for i,s in enumerate(pages):
            if ('曹爾忠' in s or '曹原彰' in s or '立委' in s or '立法委員' in s) and len(s.strip())>30:
                print('MATCH_PAGE',i+1,flush=True)
                for line in s.splitlines():
                    if any(x in line for x in ['曹爾忠','曹原彰','選舉','得票','南竿','北竿','莒光','東引']):
                        print(line[:240],flush=True)
except Exception as e: print('PDF_ERROR',repr(e),flush=True)
