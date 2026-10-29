package com.stelledge.nijigenmusicmaster;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.ServiceInfo;
import android.media.AudioManager;
import android.media.MediaMetadata;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import org.json.JSONObject;

/** Owns the retained audio page's foreground lifetime and background clock. */
public final class PlaybackService extends Service {
    private static final String CHANNEL = "karuta_playback";
    private static final int NOTIFICATION = 51;
    private static final Handler MAIN = new Handler(Looper.getMainLooper());
    private static PlaybackService instance;
    private static JSONObject snapshot = new JSONObject();
    private static boolean playbackIntent;
    private MediaSession session;
    private PowerManager.WakeLock wakeLock;
    private boolean foreground;
    private long pausedAt;

    public static boolean hasSession() { return instance != null || playbackIntent; }
    public static boolean isPlayingIntent() { return playbackIntent; }
    public static void publish(Context context,String json) {
        MAIN.post(() -> {
            try {
                JSONObject next = new JSONObject(json);
                boolean active = next.optBoolean("active");
                snapshot = next; playbackIntent = active;
                if(instance == null && active) {
                    try { context.startForegroundService(new Intent(context,PlaybackService.class).setAction("sync")); }
                    catch(RuntimeException e) { playbackIntent = false; MainActivity.postToPage("window.dispatchEvent(new CustomEvent('karuta-native-error',{detail:'无法启动后台播放服务，请保持应用前台后重试'}))"); }
                } else if(instance != null) instance.update();
                MainActivity.refreshPlaybackVisibility();
            } catch(Exception ignored) {}
        });
    }
    public static void command(String command) {
        if("play".equals(command) || "toggle".equals(command)) {
            playbackIntent = true;
            try { snapshot.put("active",true); } catch(Exception ignored) {}
            if(instance != null) instance.enterForeground(instance.notification());
            MainActivity.refreshPlaybackVisibility();
        }
        MainActivity.postToPage("window.dispatchEvent(new CustomEvent('karuta-native-command',{detail:" + JSONObject.quote(command) + "}))");
    }
    @Override public void onCreate() {
        super.onCreate(); instance = this;
        ((NotificationManager)getSystemService(NOTIFICATION_SERVICE)).createNotificationChannel(new NotificationChannel(CHANNEL,"音乐播放",NotificationManager.IMPORTANCE_LOW));
        wakeLock = ((PowerManager)getSystemService(POWER_SERVICE)).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK,getPackageName() + ":playback");
        wakeLock.setReferenceCounted(false);
        session = new MediaSession(this,"NijigenMusicMaster");
        session.setCallback(new MediaSession.Callback() {
            @Override public void onPlay() { command("play"); }
            @Override public void onPause() { command("pause"); }
            @Override public void onStop() { command("stop"); }
            @Override public void onSkipToNext() { command("next"); }
            @Override public void onSkipToPrevious() { command("previous"); }
            @Override public void onSeekTo(long position) { MainActivity.postToPage("window.dispatchEvent(new CustomEvent('karuta-native-seek',{detail:" + position / 1000.0 + "}))"); }
        },MAIN);
        session.setActive(true);
        IntentFilter filter = new IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY);
        if(Build.VERSION.SDK_INT >= 33) registerReceiver(noisy,filter,Context.RECEIVER_NOT_EXPORTED);
        else registerReceiver(noisy,filter);
        // Satisfy the foreground-service deadline even before the first page heartbeat.
        enterForeground(notification());
        MAIN.post(clock);
    }
    private final BroadcastReceiver noisy = new BroadcastReceiver() {
        @Override public void onReceive(Context context,Intent intent) { command("pause"); }
    };
    @Override public int onStartCommand(Intent intent,int flags,int startId) {
        // Notification actions use startForegroundService, including pause and stop.
        if(!foreground) enterForeground(notification());
        String action = intent == null ? "" : intent.getAction();
        if(action != null && !"sync".equals(action)) command(action);
        update();
        return START_NOT_STICKY; // Never restart audio unexpectedly after the process is killed.
    }
    private final Runnable clock = new Runnable() {
        @Override public void run() {
            if(instance != PlaybackService.this) return;
            if(playbackIntent) MainActivity.postToPage("window.karutaNativeHeartbeat && window.karutaNativeHeartbeat()");
            else if(pausedAt > 0 && android.os.SystemClock.elapsedRealtime() - pausedAt > 600000) { stopSelf(); return; }
            MAIN.postDelayed(this,100);
        }
    };
    private void enterForeground(Notification notification) {
        if(Build.VERSION.SDK_INT >= 29) startForeground(NOTIFICATION,notification,ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
        else startForeground(NOTIFICATION,notification);
        foreground = true;
    }
    private void update() {
        boolean active = snapshot.optBoolean("active");
        playbackIntent = active;
        session.setMetadata(new MediaMetadata.Builder()
                .putString(MediaMetadata.METADATA_KEY_TITLE,snapshot.optString("title","歌牌播放器"))
                .putString(MediaMetadata.METADATA_KEY_ARTIST,snapshot.optString("subtitle",""))
                .putLong(MediaMetadata.METADATA_KEY_DURATION,(long)(snapshot.optDouble("duration") * 1000)).build());
        long actions = PlaybackState.ACTION_PLAY | PlaybackState.ACTION_PAUSE | PlaybackState.ACTION_PLAY_PAUSE | PlaybackState.ACTION_STOP | PlaybackState.ACTION_SKIP_TO_NEXT | PlaybackState.ACTION_SKIP_TO_PREVIOUS | PlaybackState.ACTION_SEEK_TO;
        session.setPlaybackState(new PlaybackState.Builder().setActions(actions)
                .setState(active ? PlaybackState.STATE_PLAYING : PlaybackState.STATE_PAUSED,(long)(snapshot.optDouble("position") * 1000),active ? 1 : 0).build());
        Notification notification = notification();
        if(active) {
            pausedAt = 0;
            if(!wakeLock.isHeld()) wakeLock.acquire();
            if(!foreground) enterForeground(notification);
            else ((NotificationManager)getSystemService(NOTIFICATION_SERVICE)).notify(NOTIFICATION,notification);
        } else {
            if(wakeLock.isHeld()) wakeLock.release();
            if(pausedAt == 0) pausedAt = android.os.SystemClock.elapsedRealtime();
            if(foreground) { stopForeground(false); foreground = false; }
            ((NotificationManager)getSystemService(NOTIFICATION_SERVICE)).notify(NOTIFICATION,notification);
            if(!snapshot.optBoolean("available")) stopSelf();
        }
    }
    private PendingIntent action(String name,int request) {
        return PendingIntent.getForegroundService(this,request,new Intent(this,PlaybackService.class).setAction(name),PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
    private Notification notification() {
        PendingIntent open = PendingIntent.getActivity(this,0,new Intent(this,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP),PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        boolean active = snapshot.optBoolean("active");
        return new Notification.Builder(this,CHANNEL).setSmallIcon(com.stelledge.nijigenmusicmaster.R.drawable.app_icon)
                .setContentTitle(snapshot.optString("title","歌牌播放器"))
                .setContentText(snapshot.optString("subtitle",active ? "后台播放中" : "已暂停"))
                .setContentIntent(open).setDeleteIntent(action("stop",4)).setOnlyAlertOnce(true).setShowWhen(false)
                .setVisibility(Notification.VISIBILITY_PUBLIC).setCategory(Notification.CATEGORY_TRANSPORT).setOngoing(active)
                .addAction(new Notification.Action.Builder(android.R.drawable.ic_media_previous,"上一首",action("previous",1)).build())
                .addAction(new Notification.Action.Builder(active ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play,active ? "暂停" : "播放",action(active ? "pause" : "play",2)).build())
                .addAction(new Notification.Action.Builder(android.R.drawable.ic_media_next,"下一首",action("next",3)).build())
                .addAction(new Notification.Action.Builder(android.R.drawable.ic_menu_close_clear_cancel,"停止",action("stop",4)).build())
                .setStyle(new Notification.MediaStyle().setMediaSession(session.getSessionToken()).setShowActionsInCompactView(0,1,2)).build();
    }
    @Override public void onDestroy() {
        MAIN.removeCallbacks(clock);
        try { unregisterReceiver(noisy); } catch(Exception ignored) {}
        if(wakeLock.isHeld()) wakeLock.release();
        session.setActive(false); session.release();
        stopForeground(true); ((NotificationManager)getSystemService(NOTIFICATION_SERVICE)).cancel(NOTIFICATION);
        instance = null; playbackIntent = false;
        MainActivity.releaseDetachedPlayback();
        super.onDestroy();
    }
    @Override public IBinder onBind(Intent intent) { return null; }
}
