package com.stelledge.nijigenmusicmaster;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Intent;
import android.content.res.AssetFileDescriptor;
import android.database.Cursor;
import android.provider.OpenableColumns;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.system.Os;
import android.system.OsConstants;
import android.util.Base64;
import android.os.Build;
import android.view.View;
import android.view.ViewGroup;
import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.MimeTypeMap;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.FilterInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import org.json.JSONArray;
import org.json.JSONObject;

/** Offline WebView shell. No network or broad storage permissions, no third-party libraries. */
public final class MainActivity extends Activity {
    private static final String HOST = "appassets.androidplatform.net";
    private static final String HOME = "https://" + HOST + "/player/index.html";
    private static final int PICK_FILE = 100, SAVE_RECORD = 101;
    private WebView browser;
    private static WebView retainedBrowser;
    private static final Handler UI = new Handler(Looper.getMainLooper());
    public static void postToPage(String javascript) {
        UI.post(() -> { if(retainedBrowser != null) retainedBrowser.evaluateJavascript(javascript,null); });
    }
    public static void refreshPlaybackVisibility() {
        UI.post(() -> { if(retainedBrowser instanceof AudioWebView) ((AudioWebView)retainedBrowser).refresh(); });
    }
    public static void releaseDetachedPlayback() {
        UI.post(() -> {
            if(retainedBrowser != null && retainedBrowser.getParent() == null) { retainedBrowser.destroy(); retainedBrowser = null; }
        });
    }
    private static final class AudioWebView extends WebView {
        AudioWebView(Context context) { super(context); }
        @Override protected void onWindowVisibilityChanged(int visibility) {
            super.onWindowVisibilityChanged(PlaybackService.isPlayingIntent() ? View.VISIBLE : visibility);
        }
        void refresh() { onWindowVisibilityChanged(getWindowVisibility()); }
    }
    public static final class PlaybackBridge {
        private final Context context;
        PlaybackBridge(Context context) { this.context = context; }
        @JavascriptInterface public void update(String json) { if(json != null && json.length() <= 8192) PlaybackService.publish(context,json); }
    }
    private ValueCallback<Uri[]> fileCallback;
    private byte[] pendingExport;
    private boolean pickingZip;
    private final Object packLock = new Object();

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(Color.rgb(233,243,250));
        getWindow().setNavigationBarColor(Color.rgb(233,243,250));
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        boolean restoring = retainedBrowser != null;
        browser = restoring ? retainedBrowser : new AudioWebView(getApplicationContext());
        retainedBrowser = browser;
        if(browser.getParent() instanceof ViewGroup) ((ViewGroup)browser.getParent()).removeView(browser);
        browser.setBackgroundColor(Color.rgb(233,243,250));
        setContentView(browser);
        WebSettings settings = browser.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSupportZoom(false);
        browser.addJavascriptInterface(new Exports(), "AndroidFiles");
        browser.addJavascriptInterface(new PlaybackBridge(getApplicationContext()),"AndroidPlayback");
        browser.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if ("https".equals(uri.getScheme()) && HOST.equals(uri.getHost())) {
                    if (uri.getPath() != null && uri.getPath().startsWith("/imports/")) return serveImported(uri,request.getRequestHeaders());
                    return serve(uri, request.getRequestHeaders());
                }
                // All app resources are bundled. Refuse network subresources.
                return response(403, "Forbidden", "text/plain", new ByteArrayInputStream(new byte[0]), new HashMap<>());
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if ("https".equals(uri.getScheme()) && HOST.equals(uri.getHost())) return false;
                if (request.isForMainFrame() && ("https".equals(uri.getScheme()) || "http".equals(uri.getScheme()))) {
                    try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); } catch (ActivityNotFoundException ignored) {}
                }
                return true;
            }
        });
        browser.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                boolean audio = false;
                for (String accept : params.getAcceptTypes()) if (accept != null && (accept.contains("audio") || accept.contains("mp3"))) audio = true;
                pickingZip = !audio;
                Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType(audio ? "audio/*" : "*/*");
                if (!audio) intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"application/zip", "application/x-zip-compressed", "application/octet-stream"});
                intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE);
                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
                try { startActivityForResult(intent, PICK_FILE); }
                catch (ActivityNotFoundException e) { fileCallback.onReceiveValue(null); fileCallback = null; Toast.makeText(MainActivity.this, "找不到系统文件选择器", Toast.LENGTH_LONG).show(); }
                return true;
            }
        });
        if(!restoring) browser.loadUrl(HOME);
        postToPage("window.dispatchEvent(new CustomEvent('karuta-native-visibility',{detail:false}))");
    }

    private JSONArray savedPacks() {
        try { return new JSONArray(getSharedPreferences("packs",MODE_PRIVATE).getString("documents","[]")); }
        catch (Exception ignored) { return new JSONArray(); }
    }
    private String rememberPack(Uri uri) throws Exception {
        synchronized (packLock) {
            JSONArray packs = savedPacks();
            for (int i = 0; i < packs.length(); i++) if(uri.toString().equals(packs.getJSONObject(i).optString("uri"))) return packs.getJSONObject(i).getString("id");
            String id = UUID.randomUUID().toString();
            packs.put(new JSONObject().put("id",id).put("uri",uri.toString()));
            getSharedPreferences("packs",MODE_PRIVATE).edit().putString("documents",packs.toString()).apply();
            return id;
        }
    }
    private JSONObject findPack(String id) throws Exception {
        synchronized (packLock) {
            JSONArray packs = savedPacks();
            for(int i = 0; i < packs.length(); i++) if(id.equals(packs.getJSONObject(i).optString("id"))) return packs.getJSONObject(i);
        }
        throw new IOException("Unknown ZIP");
    }
    private JSONObject describePack(JSONObject pack) throws Exception {
        Uri uri = Uri.parse(pack.getString("uri"));
        String name = "曲包.zip"; long size = -1;
        try(Cursor cursor = getContentResolver().query(uri,new String[]{OpenableColumns.DISPLAY_NAME,OpenableColumns.SIZE},null,null,null)) {
            if(cursor != null && cursor.moveToFirst()) {
                if(!cursor.isNull(0)) name = cursor.getString(0);
                if(!cursor.isNull(1)) size = cursor.getLong(1);
            }
        }
        try(AssetFileDescriptor file = getContentResolver().openAssetFileDescriptor(uri,"r")) {
            if(file == null) throw new IOException("No file");
            if(size < 0) size = file.getLength();
        }
        if(size < 0) throw new IOException("Unknown ZIP size");
        return new JSONObject().put("id",pack.getString("id")).put("name",name).put("size",size).put("url","https://" + HOST + "/imports/" + pack.getString("id"));
    }
    private WebResourceResponse serveImported(Uri uri,Map<String,String> requestHeaders) {
        InputStream stream = null;
        try {
            JSONObject pack = findPack(uri.getLastPathSegment());
            long size = describePack(pack).getLong("size");
            String range = null;
            for(Map.Entry<String,String> header : requestHeaders.entrySet()) if("Range".equalsIgnoreCase(header.getKey())) range = header.getValue();
            if(range == null || !range.matches("bytes=\\d+-\\d+")) return response(416,"Range Not Satisfiable","application/zip",new ByteArrayInputStream(new byte[0]),new HashMap<>());
            String[] parts = range.substring(6).split("-");
            long begin = Long.parseLong(parts[0]), end = Math.min(size - 1,Long.parseLong(parts[1]));
            if(begin < 0 || end < begin || end - begin + 1 > 512L * 1024 * 1024) throw new IOException("Invalid range");
            stream = getContentResolver().openInputStream(Uri.parse(pack.getString("uri")));
            if(stream == null) throw new IOException("No file");
            long skipped = 0;
            while(skipped < begin) { long n = stream.skip(begin - skipped); if(n <= 0) { if(stream.read() < 0) throw new IOException("Truncated ZIP"); n = 1; } skipped += n; }
            Map<String,String> headers = new HashMap<>();
            headers.put("Content-Range","bytes " + begin + "-" + end + "/" + size);
            headers.put("Content-Length",Long.toString(end - begin + 1)); headers.put("Cache-Control","no-store"); headers.put("Accept-Ranges","bytes");
            return response(206,"Partial Content","application/zip",new LimitedStream(stream,end - begin + 1),headers);
        } catch(Exception e) {
            if(stream != null) try { stream.close(); } catch(IOException ignored) {}
            return response(404,"Not Found","application/zip",new ByteArrayInputStream(new byte[0]),new HashMap<>());
        }
    }

    private WebResourceResponse serve(Uri uri, Map<String,String> requestHeaders) {
        InputStream stream = null;
        try {
            String path = uri.getPath();
            if (path == null || !path.startsWith("/player/") || path.contains("..") || path.indexOf('\0') >= 0 || path.contains("\\")) throw new IOException("Bad path");
            String asset = path.substring(1);
            stream = getAssets().open(asset);
            long length;
            try (AssetFileDescriptor descriptor = getAssets().openFd(asset)) { length = descriptor.getLength(); }
            catch (IOException compressed) {
                ByteArrayOutputStream buffer = new ByteArrayOutputStream();
                byte[] chunk = new byte[16384]; int read;
                while ((read = stream.read(chunk)) != -1) buffer.write(chunk,0,read);
                stream.close(); byte[] bytes = buffer.toByteArray(); stream = new ByteArrayInputStream(bytes); length = bytes.length;
            }
            String mime = MimeTypeMap.getSingleton().getMimeTypeFromExtension(path.substring(path.lastIndexOf('.') + 1).toLowerCase(java.util.Locale.ROOT));
            if (path.endsWith(".js")) mime = "text/javascript";
            if (mime == null) mime = "application/octet-stream";
            Map<String,String> headers = new HashMap<>();
            headers.put("Accept-Ranges", "bytes");
            headers.put("Cache-Control", "no-cache");
            headers.put("X-Content-Type-Options", "nosniff");
            String range = null;
            for (Map.Entry<String,String> entry : requestHeaders.entrySet()) if ("Range".equalsIgnoreCase(entry.getKey())) range = entry.getValue();
            int status = 200;
            if (range != null && range.matches("bytes=\\d+-\\d*")) {
                String[] parts = range.substring(6).split("-", -1);
                long begin = Long.parseLong(parts[0]), end = parts[1].isEmpty() ? length - 1 : Math.min(length - 1, Long.parseLong(parts[1]));
                if (begin > end || begin >= length) {
                    stream.close(); headers.put("Content-Range", "bytes */" + length);
                    return response(416,"Range Not Satisfiable",mime,new ByteArrayInputStream(new byte[0]),headers);
                }
                long skipped = 0;
                while (skipped < begin) { long step = stream.skip(begin - skipped); if (step <= 0) { if (stream.read() == -1) throw new IOException("Truncated asset"); step = 1; } skipped += step; }
                headers.put("Content-Range", "bytes " + begin + "-" + end + "/" + length);
                length = end - begin + 1; stream = new LimitedStream(stream,length); status = 206;
            }
            headers.put("Content-Length", Long.toString(length));
            return response(status,status == 206 ? "Partial Content" : "OK",mime,stream,headers);
        } catch (Exception e) {
            if (stream != null) try { stream.close(); } catch (IOException ignored) {}
            return response(404,"Not Found","text/plain",new ByteArrayInputStream(new byte[0]),new HashMap<>());
        }
    }
    private static WebResourceResponse response(int status, String reason, String mime, InputStream stream, Map<String,String> headers) {
        return new WebResourceResponse(mime,"UTF-8",status,reason,headers,stream);
    }
    private static final class LimitedStream extends FilterInputStream {
        private long remaining;
        LimitedStream(InputStream stream,long length) { super(stream); remaining = length; }
        @Override public int read() throws IOException { if (remaining <= 0) return -1; int b = in.read(); if (b != -1) remaining--; return b; }
        @Override public int read(byte[] b) throws IOException { return read(b,0,b.length); }
        @Override public int read(byte[] b,int offset,int length) throws IOException { if (remaining <= 0) return -1; int n = in.read(b,offset,(int)Math.min(length,remaining)); if (n > 0) remaining -= n; return n; }
    }

    public final class Exports {
        /** Bounded SAF reads bypass WebView's HTTP/cache handling of synthetic ZIP URLs. */
        @JavascriptInterface public String readPackRange(String id,long begin,long end) {
            try {
                if(begin < 0 || end <= begin || end - begin > 1024 * 1024) throw new IOException("读取范围无效");
                JSONObject pack = findPack(id);
                Uri uri = Uri.parse(pack.getString("uri"));
                byte[] bytes = new byte[(int)(end - begin)];
                try(AssetFileDescriptor descriptor = getContentResolver().openAssetFileDescriptor(uri,"r")) {
                    if(descriptor == null) throw new IOException("无法打开 ZIP，请重新选择文件");
                    long length = descriptor.getLength();
                    if(length >= 0 && end > length) throw new IOException("ZIP 已变更，请重新导入");
                    // createInputStream respects a provider's start offset and declared length.
                    try(InputStream stream = descriptor.createInputStream()) {
                        boolean positioned = false;
                        try {
                            Os.lseek(descriptor.getFileDescriptor(),descriptor.getStartOffset() + begin,OsConstants.SEEK_SET);
                            positioned = true;
                        } catch(Exception nonSeekable) { /* Pipe-based providers need sequential skipping. */ }
                        if(!positioned) {
                            long remaining = begin;
                            while(remaining > 0) {
                                long skipped = stream.skip(remaining);
                                if(skipped > 0) remaining -= skipped;
                                else { if(stream.read() < 0) throw new IOException("ZIP 读取不完整，请重新导入"); remaining--; }
                            }
                        }
                        int offset = 0;
                        while(offset < bytes.length) {
                            int count = stream.read(bytes,offset,bytes.length - offset);
                            if(count < 0) throw new IOException("ZIP 读取不完整，请重新导入");
                            if(count == 0) { int value = stream.read(); if(value < 0) throw new IOException("ZIP 读取不完整"); bytes[offset++] = (byte)value; }
                            else offset += count;
                        }
                    }
                }
                return new JSONObject().put("data",Base64.encodeToString(bytes,Base64.NO_WRAP)).toString();
            } catch(Exception error) {
                try { return new JSONObject().put("error",error instanceof SecurityException ? "曲包读取授权已失效，请重新选择 ZIP" : "无法读取曲包：" + error.getMessage()).toString(); }
                catch(Exception ignored) { return "{\"error\":\"无法读取曲包，请重新选择 ZIP\"}"; }
            }
        }
        @JavascriptInterface public String listPacks() {
            JSONArray result = new JSONArray(), packs;
            synchronized(packLock) { packs = savedPacks(); }
            for(int i = 0; i < packs.length(); i++) {
                try { result.put(describePack(packs.getJSONObject(i))); }
                catch(Exception e) {
                    try { result.put(new JSONObject().put("id",packs.getJSONObject(i).getString("id")).put("error","曲包已移动、删除或文件授权失效，请重新选择")); } catch(Exception ignored) {}
                }
            }
            return result.toString();
        }
        @JavascriptInterface public void forgetPack(String id) {
            synchronized(packLock) {
                JSONArray packs = savedPacks(), retained = new JSONArray();
                for(int i = 0; i < packs.length(); i++) {
                    JSONObject pack = packs.optJSONObject(i);
                    if(pack == null) continue;
                    if(!id.equals(pack.optString("id"))) retained.put(pack);
                    else try { getContentResolver().releasePersistableUriPermission(Uri.parse(pack.getString("uri")),Intent.FLAG_GRANT_READ_URI_PERMISSION); } catch(Exception ignored) {}
                }
                getSharedPreferences("packs",MODE_PRIVATE).edit().putString("documents",retained.toString()).apply();
            }
        }
        @JavascriptInterface public void saveText(String filename, String text) {
            if (text == null || text.length() > 2 * 1024 * 1024) return;
            runOnUiThread(() -> {
                if (browser == null || browser.getUrl() == null || !HOME.equals(browser.getUrl().split("#")[0])) return;
                pendingExport = text.getBytes(StandardCharsets.UTF_8);
                Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("application/json");
                intent.putExtra(Intent.EXTRA_TITLE,filename.replaceAll("[^a-zA-Z0-9_.-]","_"));
                try { startActivityForResult(intent,SAVE_RECORD); }
                catch (ActivityNotFoundException e) { pendingExport = null; Toast.makeText(MainActivity.this,"无法打开保存位置",Toast.LENGTH_LONG).show(); }
            });
        }
    }
    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode,resultCode,data);
        if (requestCode == PICK_FILE && fileCallback != null) {
            Uri[] result = null;
            if (resultCode == RESULT_OK && data != null) {
                ClipData clips = data.getClipData();
                if (clips != null) { result = new Uri[clips.getItemCount()]; for (int i = 0; i < result.length; i++) result[i] = clips.getItemAt(i).getUri(); }
                else if (data.getData() != null) result = new Uri[]{data.getData()};
            }
            if(pickingZip && result != null) {
                JSONArray ids = new JSONArray();
                boolean persisted = true;
                for(Uri uri : result) try {
                    try { getContentResolver().takePersistableUriPermission(uri,Intent.FLAG_GRANT_READ_URI_PERMISSION); }
                    catch(SecurityException e) { persisted = false; }
                    ids.put(rememberPack(uri));
                } catch(Exception ignored) {}
                fileCallback.onReceiveValue(null); fileCallback = null;
                browser.evaluateJavascript("window.karutaImportNativePacks && window.karutaImportNativePacks(" + ids.toString() + ",true)",null);
                if(!persisted) Toast.makeText(this,"该文件来源不支持长期授权，下次可能需要重新选择",Toast.LENGTH_LONG).show();
            } else { fileCallback.onReceiveValue(result); fileCallback = null; }
        } else if (requestCode == SAVE_RECORD) {
            byte[] export = pendingExport; pendingExport = null;
            if (resultCode == RESULT_OK && data != null && data.getData() != null && export != null) {
                try (OutputStream output = getContentResolver().openOutputStream(data.getData())) { if (output == null) throw new IOException(); output.write(export); Toast.makeText(this,"记录已保存",Toast.LENGTH_SHORT).show(); }
                catch (IOException e) { Toast.makeText(this,"保存失败，请重试",Toast.LENGTH_LONG).show(); }
            }
        }
    }
    @Override public void onBackPressed() {
        browser.evaluateJavascript("(function(){var b=document.querySelector('[aria-expanded=\"true\"][aria-controls]');if(b){b.click();return true;}return false;})()", result -> { if (!"true".equals(result)) moveTaskToBack(true); });
    }
    @Override protected void onPause() {
        // Background audio stays in the retained page, owned by PlaybackService.
        // Do not send the old pause command or call WebView.onPause().
        postToPage("window.dispatchEvent(new CustomEvent('karuta-native-visibility',{detail:true}))");
        super.onPause();
    }
    @Override protected void onResume() {
        super.onResume(); if(browser != null) browser.onResume();
        postToPage("window.dispatchEvent(new CustomEvent('karuta-native-visibility',{detail:false}))");
    }
    @Override protected void onDestroy() {
        if (fileCallback != null) fileCallback.onReceiveValue(null);
        if(browser != null) {
            if(browser.getParent() instanceof ViewGroup) ((ViewGroup)browser.getParent()).removeView(browser);
            if(!PlaybackService.hasSession()) { browser.removeJavascriptInterface("AndroidFiles"); browser.removeJavascriptInterface("AndroidPlayback"); browser.destroy(); retainedBrowser = null; }
            browser = null;
        }
        super.onDestroy();
    }
}
