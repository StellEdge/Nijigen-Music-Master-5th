"""Build a single-file Windows x64 EXE using .NET Framework and official WebView2 SDK."""
from pathlib import Path
import subprocess,zipfile,hashlib,json
from PIL import Image
ROOT=Path(__file__).resolve().parent
PLAYER=ROOT.parent
BUILD=ROOT/'build'
DIST=PLAYER/'dist'
VENDOR=ROOT/'vendor'
BUILD.mkdir(exist_ok=True)
DIST.mkdir(exist_ok=True)
Image.open(PLAYER/'assets/app-icon-5th-v2.png').save(BUILD/'app.ico',format='ICO',sizes=[(16,16),(32,32),(48,48),(64,64),(128,128),(256,256)])
payload=BUILD/'payload.zip'
files={name:PLAYER/name for name in ['index.html','style.css','core.js','zip.js','app.js']}
files.update({str(p.relative_to(PLAYER)).replace('\\','/'):p for p in (PLAYER/'assets').rglob('*') if p.is_file() and p.suffix.lower()!='.md' and p.name not in ['app-icon-5th.png','app-icon-5th-v2.png']})
with zipfile.ZipFile(payload,'w',zipfile.ZIP_DEFLATED) as z:
 for name,path in files.items():z.write(path,'player/'+name)
 for name in ['Microsoft.Web.WebView2.Core.dll','Microsoft.Web.WebView2.WinForms.dll']:z.write(VENDOR/'lib/net462'/name,name)
 z.write(VENDOR/'runtimes/win-x64/native/WebView2Loader.dll','WebView2Loader.dll')
 z.write(BUILD/'app.ico','app.ico')
 z.write(VENDOR/'LICENSE.txt','WebView2-LICENSE.txt')
output=DIST/'NijigenMusicMaster-Windows-x64-preview7.exe'
csc=Path('C:/Windows/Microsoft.NET/Framework64/v4.0.30319/csc.exe')
args=[str(csc),'/nologo','/target:winexe','/platform:x64','/optimize+','/utf8output','/out:'+str(output),'/win32icon:'+str(BUILD/'app.ico'),'/resource:'+str(payload)+',payload.zip','/r:System.Windows.Forms.dll','/r:System.Drawing.dll','/r:System.Web.Extensions.dll','/r:System.IO.Compression.dll','/r:System.IO.Compression.FileSystem.dll']
for name in ['Microsoft.Web.WebView2.Core.dll','Microsoft.Web.WebView2.WinForms.dll']: args.append('/r:'+str(VENDOR/'lib/net462'/name))
args.append(str(ROOT/'Program.cs'))
subprocess.run(args,check=True)
with zipfile.ZipFile(payload) as z:
 assert z.testzip() is None
 for name,path in files.items():assert z.read('player/'+name)==path.read_bytes()
digest=hashlib.sha256(output.read_bytes()).hexdigest()
(DIST/(output.name+'.sha256')).write_text(digest+'  '+output.name+'\n',encoding='ascii')
(BUILD/'payload-manifest.json').write_text(json.dumps({n:hashlib.sha256(p.read_bytes()).hexdigest() for n,p in files.items()},indent=2),encoding='utf-8')
print(str(output)+'\nSize: '+str(output.stat().st_size)+'\nSHA256: '+digest)
