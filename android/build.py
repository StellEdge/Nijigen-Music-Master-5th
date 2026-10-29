"""Build a signed trial APK offline with Android SDK tools; no Gradle downloads."""
from pathlib import Path
import hashlib
import os
import shutil
import subprocess
import sys
import zipfile

ROOT = Path(__file__).resolve().parent
sys.stdout.reconfigure(encoding='utf-8',errors='replace')
PLAYER = ROOT.parent
SDK = Path(os.environ.get('ANDROID_SDK_ROOT') or os.environ.get('ANDROID_HOME') or '')
JAVA = Path(os.environ.get('JAVA_HOME') or SDK.parent / 'OpenJDK')
TOOLS = SDK / 'build-tools' / '34.0.0'
ANDROID = SDK / 'platforms' / 'android-34' / 'android.jar'
BUILD = ROOT / 'build'
DIST = PLAYER / 'dist'

def run(*args):
    result = subprocess.run([str(a) for a in args], text=True, encoding='utf-8', errors='replace', capture_output=True)
    if result.stdout.strip(): print(result.stdout.strip())
    if result.stderr.strip(): print(result.stderr.strip())
    result.check_returncode()
    return result.stdout

def main():
    for required in [JAVA / 'bin/java.exe', JAVA / 'bin/javac.exe', ANDROID, TOOLS / 'aapt2.exe']:
        if not required.is_file(): raise SystemExit(f'Missing build tool: {required}; set JAVA_HOME and ANDROID_SDK_ROOT')
    # This is a build-only directory in this project. Never clean user sources or imported packs.
    assets = BUILD / 'assets' / 'player'
    def fresh_directory(directory):
        resolved = directory.resolve()
        if resolved == BUILD.resolve() or not resolved.is_relative_to(BUILD.resolve()):
            raise RuntimeError(f'Refusing to clean outside build subdirectories: {resolved}')
        if resolved.exists(): shutil.rmtree(resolved)
        resolved.mkdir(parents=True,exist_ok=True)
    fresh_directory(assets)
    for name in ['index.html','style.css','core.js','zip.js','app.js']:
        shutil.copy2(PLAYER / name, assets / name)
    for source in (PLAYER / 'assets').rglob('*'):
        if source.is_file() and source.suffix.lower() not in ['.md'] and source.name not in ['app-icon-5th.png','app-icon-5th-v2.png']:
            target = assets / source.relative_to(PLAYER)
            target.parent.mkdir(parents=True,exist_ok=True)
            shutil.copy2(source,target)
    for name in ['classes','generated','dex']:
        fresh_directory(BUILD / name)
    DIST.mkdir(exist_ok=True)
    resources = BUILD / 'res'
    fresh_directory(resources)
    shutil.copytree(ROOT / 'res',resources,dirs_exist_ok=True)
    shutil.copy2(PLAYER / 'assets/app-icon-5th-v2.png',resources / 'drawable/launcher_icon.png')
    run(TOOLS / 'aapt2.exe','compile','--dir',resources,'-o',BUILD / 'resources.zip')
    run(TOOLS / 'aapt2.exe','link','-o',BUILD / 'unsigned.apk','--manifest',ROOT / 'AndroidManifest.xml','-I',ANDROID,'--java',BUILD / 'generated','-A',BUILD / 'assets','-0','mp3',BUILD / 'resources.zip')
    sources = sorted((ROOT / 'src').rglob('*.java')) + sorted((BUILD / 'generated').rglob('*.java'))
    boot = str(ANDROID) + os.pathsep + str(TOOLS / 'core-lambda-stubs.jar')
    run(JAVA / 'bin/javac.exe','-J-Duser.language=en','-J-Dfile.encoding=UTF-8','-encoding','UTF-8','-source','8','-target','8','-bootclasspath',boot,'-d',BUILD / 'classes',*sources)
    classes = sorted((BUILD / 'classes').rglob('*.class'))
    run(JAVA / 'bin/java.exe','-cp',TOOLS / 'lib/d8.jar','com.android.tools.r8.D8','--release','--min-api','26','--lib',ANDROID,'--output',BUILD / 'dex',*classes)
    with zipfile.ZipFile(BUILD / 'unsigned.apk','a') as apk:
        for dex in (BUILD / 'dex').glob('*.dex'): apk.write(dex,dex.name,compress_type=zipfile.ZIP_STORED)
    run(TOOLS / 'zipalign.exe','-f','-p','4',BUILD / 'unsigned.apk',BUILD / 'aligned.apk')
    signing = ROOT / 'signing'; signing.mkdir(exist_ok=True)
    key = signing / 'preview.jks'
    if not key.exists():
        run(JAVA / 'bin/keytool.exe','-genkeypair','-keystore',key,'-storepass','android','-keypass','android','-alias','androiddebugkey','-keyalg','RSA','-keysize','2048','-validity','10000','-dname','CN=StellEdge Preview,O=StellEdge,C=CN')
    output = DIST / 'NijigenMusicMaster-1.0.0-preview7.apk'
    run(JAVA / 'bin/java.exe','-jar',TOOLS / 'lib/apksigner.jar','sign','--ks',key,'--ks-key-alias','androiddebugkey','--ks-pass','pass:android','--key-pass','pass:android','--out',output,BUILD / 'aligned.apk')
    verification = run(JAVA / 'bin/java.exe','-jar',TOOLS / 'lib/apksigner.jar','verify','--verbose','--print-certs',output)
    run(TOOLS / 'zipalign.exe','-c','-p','4',output)
    badging = run(TOOLS / 'aapt.exe','dump','badging',output)
    with zipfile.ZipFile(output) as apk:
        assert apk.testzip() is None
        for name in ['classes.dex','assets/player/index.html','assets/player/app.js','assets/player/assets/cardback.png']:
            assert name in apk.namelist(), name
        assert apk.read('assets/player/app.js') == (PLAYER / 'app.js').read_bytes()
        music = PLAYER / 'assets/GRAND CARD TOUR   -The Fifth Anniversary Anthem-.mp3'
        assert apk.read('assets/player/assets/' + music.name) == music.read_bytes()
    digest = hashlib.sha256(output.read_bytes()).hexdigest()
    (DIST / (output.name + '.sha256')).write_text(f'{digest}  {output.name}\n',encoding='ascii')
    (DIST / 'apk-verification.txt').write_text(verification + '\n' + badging + f'\nSHA256: {digest}\n',encoding='utf-8')
    print(f'APK: {output}\nSize: {output.stat().st_size:,} bytes\nSHA256: {digest}')

if __name__ == '__main__': main()
