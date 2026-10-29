using System;
using System.IO;
using System.Linq;
using System.Drawing;
using System.Windows.Forms;
using System.Reflection;
using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;
using System.IO.Compression;
using System.Web.Script.Serialization;
using System.Collections.Generic;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

[assembly: AssemblyTitle("歌牌播放器")]
[assembly: AssemblyCompany("StellEdge")]
[assembly: AssemblyProduct("Nijigen Music Master")]
[assembly: AssemblyVersion("1.0.0.7")]
internal static class Program {
 internal static string Data = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"StellEdge","NijigenMusicMaster");
 internal static string Files;
 [STAThread] static void Main(string[] args) {
  Application.EnableVisualStyles(); Application.SetCompatibleTextRenderingDefault(false);
  try {
   var assembly = Assembly.GetExecutingAssembly();
   string version = assembly.ManifestModule.ModuleVersionId.ToString("N");
   Files = Path.Combine(Data,"app",version);
   Directory.CreateDirectory(Files);
   using(var stream = assembly.GetManifestResourceStream("payload.zip"))
   using(var zip = new ZipArchive(stream,ZipArchiveMode.Read)) {
    foreach(var entry in zip.Entries) {
     var target = Path.GetFullPath(Path.Combine(Files,entry.FullName));
     if(!target.StartsWith(Files + Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase)) throw new IOException("Invalid bundled path");
     if(!File.Exists(target)) { Directory.CreateDirectory(Path.GetDirectoryName(target)); entry.ExtractToFile(target); }
    }
   }
   AssemblyResolveEventHandler();
   if(args.Contains("--verify")) {
    // Load all managed dependencies without opening a window.
    Assembly.LoadFrom(Path.Combine(Files,"Microsoft.Web.WebView2.Core.dll"));
    Assembly.LoadFrom(Path.Combine(Files,"Microsoft.Web.WebView2.WinForms.dll"));
    File.WriteAllText(Path.Combine(Data,"verification.txt"),"PASS payload and managed dependencies\r\n"+Files);
    return;
   }
   Run(args.Contains("--smoke-test"));
  } catch(Exception error) { File.WriteAllText(Path.Combine(Data,"error.txt"),error.ToString()); MessageBox.Show("启动失败："+error.Message,"歌牌播放器",MessageBoxButtons.OK,MessageBoxIcon.Error); }
 }
 static void AssemblyResolveEventHandler() {
  AppDomain.CurrentDomain.AssemblyResolve += (sender,eventArgs) => {
   string path = Path.Combine(Files,new AssemblyName(eventArgs.Name).Name+".dll");
   return File.Exists(path) ? Assembly.LoadFrom(path) : null;
  };
  SetDllDirectory(Files);
 }
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode)] static extern bool SetDllDirectory(string directory);
 [MethodImpl(MethodImplOptions.NoInlining)] static void Run(bool smoke) { Application.Run(new Player(smoke)); }
}
[ComVisible(true),ClassInterface(ClassInterfaceType.AutoDual)]
public sealed class PackBridge {
 readonly JavaScriptSerializer json = new JavaScriptSerializer();
 readonly string file = Path.Combine(Program.Data,"packs.json");
 readonly object gate = new object();
 List<Dictionary<string,string>> Read() {
  try { return json.Deserialize<List<Dictionary<string,string>>>(File.ReadAllText(file)) ?? new List<Dictionary<string,string>>(); }
  catch { return new List<Dictionary<string,string>>(); }
 }
 void Save(List<Dictionary<string,string>> packs) { File.WriteAllText(file,json.Serialize(packs)); }
 public string Add(string[] paths) {
  lock(gate) {
   var packs=Read(); var ids=new List<string>();
   foreach(var path in paths) {
    var found=packs.FirstOrDefault(p=>String.Equals(p["path"],path,StringComparison.OrdinalIgnoreCase));
    if(found==null) { found=new Dictionary<string,string>{{"id",Guid.NewGuid().ToString("N")},{"path",path}}; packs.Add(found); }
    ids.Add(found["id"]);
   }
   Save(packs); return json.Serialize(ids);
  }
 }
 public string listPacks() {
  lock(gate) {
   var list=new List<object>();
   foreach(var p in Read()) {
    var f=new FileInfo(p["path"]);
    if(f.Exists) list.Add(new {id=p["id"],name=f.Name,size=f.Length,url="https://appassets.androidplatform.net/imports/"+p["id"]});
    else list.Add(new {id=p["id"],error="曲包文件已移动或删除，请重新选择："+p["path"]});
   }
   return json.Serialize(list);
  }
 }
 public void forgetPack(string id) { lock(gate) Save(Read().Where(p=>p["id"]!=id).ToList()); }
 public string readPackRange(string id,long begin,long end) {
  try {
   if(begin<0||end<=begin||end-begin>1024*1024) throw new IOException("读取范围无效");
   string path; lock(gate) { path=Read().First(p=>p["id"]==id)["path"]; }
   byte[] bytes=new byte[(int)(end-begin)];
   using(var stream=File.Open(path,FileMode.Open,FileAccess.Read,FileShare.Read)) {
    if(end>stream.Length) throw new IOException("ZIP 已变更，请重新导入");
    stream.Position=begin; int offset=0;
    while(offset<bytes.Length) { int n=stream.Read(bytes,offset,bytes.Length-offset); if(n==0) throw new EndOfStreamException(); offset+=n; }
   }
   return json.Serialize(new {data=Convert.ToBase64String(bytes)});
  } catch(Exception e) { return json.Serialize(new {error="无法读取曲包，请重新选择 ZIP："+e.Message}); }
 }
}
internal sealed class Player : Form {
 readonly WebView2 web=new WebView2();
 readonly PackBridge bridge=new PackBridge();
 readonly bool smoke;
 public Player(bool test) {
  smoke=test; Text="歌牌播放器"; Width=1200; Height=800; MinimumSize=new Size(640,360); StartPosition=FormStartPosition.CenterScreen;
  BackColor=Color.FromArgb(233,243,250);
  Icon=new Icon(Path.Combine(Program.Files,"app.ico"));
  web.Dock=DockStyle.Fill; web.DefaultBackgroundColor=BackColor; Controls.Add(web);
  Shown+=async(sender,args)=> {
   try {
    var environment=await CoreWebView2Environment.CreateAsync(null,Path.Combine(Program.Data,"WebView2"),new CoreWebView2EnvironmentOptions("--autoplay-policy=no-user-gesture-required"));
    await web.EnsureCoreWebView2Async(environment);
    var core=web.CoreWebView2;
    core.SetVirtualHostNameToFolderMapping("appassets.androidplatform.net",Program.Files,CoreWebView2HostResourceAccessKind.DenyCors);
    core.Settings.AreDevToolsEnabled=smoke; core.Settings.AreDefaultContextMenusEnabled=false; core.Settings.IsStatusBarEnabled=false;
    core.AddHostObjectToScript("packs",bridge);
    // Expose exactly the local-file API already used by Android; audio stays in the normal web engine.
    await core.AddScriptToExecuteOnDocumentCreatedAsync(@"window.AndroidFiles={listPacks:()=>chrome.webview.hostObjects.sync.packs.listPacks(),forgetPack:id=>chrome.webview.hostObjects.sync.packs.forgetPack(id),readPackRange:(id,a,b)=>chrome.webview.hostObjects.sync.packs.readPackRange(id,a,b),saveText:(name,text)=>chrome.webview.postMessage({type:'save',name,text})}; document.addEventListener('DOMContentLoaded',()=>{document.getElementById('zipButton').onclick=()=>chrome.webview.postMessage({type:'import'});document.getElementById('dropzone').addEventListener('keydown',e=>{if(e.target===document.getElementById('dropzone')&&(e.key==='Enter'||e.key===' ')){e.preventDefault();e.stopImmediatePropagation();chrome.webview.postMessage({type:'import'});}},true);document.getElementById('dropzone').ondrop=e=>{e.preventDefault();document.getElementById('dropzone').classList.remove('drag');chrome.webview.postMessageWithAdditionalObjects({type:'drop'},Array.from(e.dataTransfer.files));};});");
    core.WebMessageReceived+=OnMessage;
    core.NavigationStarting+=(s,e)=> { if(!e.Uri.StartsWith("https://appassets.androidplatform.net/player/",StringComparison.Ordinal)) e.Cancel=true; };
    core.NewWindowRequested+=(s,e)=>e.Handled=true;
    string smokePackId=null;
    string smokePack=Environment.GetEnvironmentVariable("KARUTA_SMOKE_ZIP");
    if(smoke && !String.IsNullOrEmpty(smokePack)) smokePackId=new JavaScriptSerializer().Deserialize<string[]>(bridge.Add(new[]{smokePack}))[0];
    if(smoke) core.NavigationCompleted+=async(s,e)=> {
     if(core.Source != "https://appassets.androidplatform.net/player/index.html") return;
     try {
      await System.Threading.Tasks.Task.Delay(1300);
      if(smokePackId!=null) {
       await core.ExecuteScriptAsync("document.querySelector('#play').click()");
       await System.Threading.Tasks.Task.Delay(1800);
      }
      string result=await core.ExecuteScriptAsync(@"(()=>{try{return JSON.stringify({title:document.title,bridge:typeof AndroidFiles.readPackRange,ready:!document.body.classList.contains('app-loading'),menus:document.querySelectorAll('.menu-panel').length,songs:document.querySelector('#total')?.textContent,state:document.querySelector('#state')?.textContent,position:document.querySelector('#seek')?.value,errors:document.querySelector('#issues')?.textContent,location:location.href,body:document.body.innerText.slice(0,400)})}catch(e){return String(e)}})()");
      File.WriteAllText(Path.Combine(Program.Data,"smoke-test.json"),"Navigation: "+e.IsSuccess+" "+e.WebErrorStatus+"\r\n"+result);
     }catch(Exception error){File.WriteAllText(Path.Combine(Program.Data,"smoke-test.json"),error.ToString());}
     if(smokePackId!=null) bridge.forgetPack(smokePackId);
     Close();
    };
    core.Navigate("https://appassets.androidplatform.net/player/index.html");
   }catch(WebView2RuntimeNotFoundException) {
    MessageBox.Show("需要安装 Microsoft Edge WebView2 Runtime。\n请从微软官网下载后重新打开：\nhttps://developer.microsoft.com/microsoft-edge/webview2/","缺少 WebView2",MessageBoxButtons.OK,MessageBoxIcon.Information); Close();
   }catch(Exception error){File.WriteAllText(Path.Combine(Program.Data,"error.txt"),error.ToString());MessageBox.Show(error.Message,"启动失败");Close();}
  };
  var clock=new System.Windows.Forms.Timer{Interval=100};
  clock.Tick+=async(s,e)=> { if(WindowState==FormWindowState.Minimized && web.CoreWebView2!=null) { try { await web.CoreWebView2.ExecuteScriptAsync("window.karutaNativeHeartbeat && window.karutaNativeHeartbeat()"); } catch {} } };
  Resize+=async(s,e)=> { if(web.CoreWebView2!=null) { try { await web.CoreWebView2.ExecuteScriptAsync("window.dispatchEvent(new CustomEvent('karuta-native-visibility',{detail:"+(WindowState==FormWindowState.Minimized ? "true" : "false")+"}))"); } catch {} } };
  clock.Start();
  FormClosed+=(s,e)=>{clock.Stop();clock.Dispose();web.Dispose();};
 }
 async void OnMessage(object sender,CoreWebView2WebMessageReceivedEventArgs args) {
  try {
   var json=new JavaScriptSerializer();
   var message=json.Deserialize<Dictionary<string,string>>(args.WebMessageAsJson);
   if(message["type"]=="import") {
    using(var dialog=new OpenFileDialog{Title="选择 ZIP 曲包",Filter="ZIP 曲包 (*.zip)|*.zip",Multiselect=true}) {
     if(dialog.ShowDialog(this)==DialogResult.OK) {
      string ids=bridge.Add(dialog.FileNames);
      await web.CoreWebView2.ExecuteScriptAsync("window.karutaImportNativePacks("+ids+",true)");
     }
    }
   }else if(message["type"]=="drop") {
    var paths=args.AdditionalObjects.OfType<CoreWebView2File>().Select(f=>f.Path).ToArray();
    if(paths.Length==0 || paths.Any(path=>!String.Equals(Path.GetExtension(path),".zip",StringComparison.OrdinalIgnoreCase))) throw new IOException("仅支持 ZIP 曲包");
    string ids=bridge.Add(paths);
    await web.CoreWebView2.ExecuteScriptAsync("window.karutaImportNativePacks("+ids+",true)");
   }else if(message["type"]=="save") {
    using(var dialog=new SaveFileDialog{Title="导出对局记录",FileName=Path.GetFileName(message["name"]),Filter="JSON 文件 (*.json)|*.json"}) {
     if(dialog.ShowDialog(this)==DialogResult.OK) File.WriteAllText(dialog.FileName,message["text"],new System.Text.UTF8Encoding(false));
    }
   }
  }catch(Exception error){MessageBox.Show(error.Message,"操作失败");}
 }
}
