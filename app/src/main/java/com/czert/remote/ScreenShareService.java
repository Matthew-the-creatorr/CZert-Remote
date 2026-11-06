package com.czert.remote;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.Context;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.os.Handler;
import android.os.Looper;
import android.util.DisplayMetrics;
import org.json.JSONObject;
import org.webrtc.*;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

/** Explicit, user-initiated Android screen capture. Visible foreground notification + Stop action.
 *  Only one capture session at a time. No boot receiver, stealth mode, or automatic start. */
public final class ScreenShareService extends Service {
    private static final String CHANNEL="czert_share_visible";
    private static final int NOTIFICATION=927;
    public static final String ACTION_STOP="com.czert.remote.STOP_SHARING";
    private static ScreenShareService current;
    private static final List<IceEvent> queuedIce = new ArrayList<>();
    private final Handler ui=new Handler(Looper.getMainLooper());
    private PeerConnectionFactory factory;
    private PeerConnection pc;
    private SurfaceTextureHelper helper;
    private EglBase egl;
    private ScreenCapturerAndroid capturer;
    private VideoSource source;
    private VideoTrack track;
    private String sid="";
    private boolean remoteReady=false;
    private boolean stopping=false;
    private static class IceEvent {final String sid, candidate;IceEvent(String a,String b){sid=a;candidate=b;}}
    public static synchronized void submitIce(String sid,String json){
        if(sid==null||json==null||json.length()>5000)return;
        if(current!=null&&sid.equals(current.sid))current.handleIce(json);
        else if(queuedIce.size()<150)queuedIce.add(new IceEvent(sid,json));
    }
    @Override public void onCreate(){super.onCreate(); synchronized(ScreenShareService.class){current=this;}}
    @Override public IBinder onBind(Intent i){return null;}
    private Notification notification(){
        NotificationManager nm=getSystemService(NotificationManager.class);
        if(Build.VERSION.SDK_INT>=26)nm.createNotificationChannel(new NotificationChannel(CHANNEL,"CZert Remote – aktívne zdieľanie",NotificationManager.IMPORTANCE_HIGH));
        Intent stop=new Intent(this,ScreenShareService.class).setAction(ACTION_STOP);
        PendingIntent stopIntent=PendingIntent.getService(this,0,stop,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        Intent open=new Intent(this,MainActivity.class);
        PendingIntent openIntent=PendingIntent.getActivity(this,0,open,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        return new Notification.Builder(this,CHANNEL)
            .setSmallIcon(android.R.drawable.ic_menu_camera)
            .setContentTitle("CZert Remote – ZDIEĽA SA OBRAZOVKA")
            .setContentText("Obrazovku práve vidí schválený administrátor. Ťukni na Zastaviť.")
            .setOngoing(true).setContentIntent(openIntent)
            .addAction(android.R.drawable.ic_media_pause,"ZASTAVIŤ",stopIntent)
            .build();
    }
    @Override public int onStartCommand(Intent i,int flags,int startId){
        if(i==null){stopSelf();return START_NOT_STICKY;}
        if(ACTION_STOP.equals(i.getAction())){stopSelf();return START_NOT_STICKY;}
        if(!sid.isEmpty()){stopSelf();return START_NOT_STICKY;}
        sid=i.getStringExtra("session");String offer=i.getStringExtra("offer");
        Intent token;
        if(Build.VERSION.SDK_INT>=33)token=i.getParcelableExtra("permissionData",Intent.class);
        else token=(Intent)i.getParcelableExtra("permissionData");
        if(sid==null||!sid.matches("[A-Za-z0-9]{12,64}")||offer==null||token==null){stopSelf();return START_NOT_STICKY;}
        // MUST happen before ScreenCapturerAndroid obtains MediaProjection (Android 14+).
        if(Build.VERSION.SDK_INT>=29)startForeground(NOTIFICATION,notification(),ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION);
        else startForeground(NOTIFICATION,notification());
        final Intent permissionToken=token;
        ui.post(()->{try{startPeer(offer,permissionToken);}catch(Exception e){MainActivity.failure(sid,"Zdieľanie obrazovky zlyhalo: "+e.getMessage());stopSelf();}});
        return START_NOT_STICKY;
    }
    private void startPeer(String offer,Intent token){
        PeerConnectionFactory.initialize(PeerConnectionFactory.InitializationOptions.builder(getApplicationContext()).createInitializationOptions());
        egl=EglBase.create();
        factory=PeerConnectionFactory.builder().setVideoEncoderFactory(new DefaultVideoEncoderFactory(egl.getEglBaseContext(),true,true))
          .setVideoDecoderFactory(new DefaultVideoDecoderFactory(egl.getEglBaseContext())).createPeerConnectionFactory();
        helper=SurfaceTextureHelper.create("CZertScreenCapture",egl.getEglBaseContext());
        source=factory.createVideoSource(true);
        capturer=new ScreenCapturerAndroid(token,new android.media.projection.MediaProjection.Callback(){
            @Override public void onStop(){ui.post(()->stopSelf());}
        });
        capturer.initialize(helper,getApplicationContext(),source.getCapturerObserver());
        track=factory.createVideoTrack("czertScreenVideo",source);
        PeerConnection.RTCConfiguration cfg=new PeerConnection.RTCConfiguration(
            Arrays.asList(PeerConnection.IceServer.builder("stun:stun.l.google.com:19302").createIceServer()));
        pc=factory.createPeerConnection(cfg,new PeerConnection.Observer(){
            @Override public void onSignalingChange(PeerConnection.SignalingState st){}
            @Override public void onIceConnectionChange(PeerConnection.IceConnectionState st){
                if(st==PeerConnection.IceConnectionState.FAILED)MainActivity.failure(sid,"WebRTC ICE spojenie zlyhalo. Môže chýbať sieťová cesta medzi telefónmi; pri rôznych sieťach môže byť potrebný TURN server.");
            }
            @Override public void onIceConnectionReceivingChange(boolean receiving){}
            @Override public void onIceGatheringChange(PeerConnection.IceGatheringState st){}
            @Override public void onIceCandidate(IceCandidate ice){
                try {JSONObject j=new JSONObject();j.put("candidate",ice.sdp);j.put("sdpMid",ice.sdpMid);j.put("sdpMLineIndex",ice.sdpMLineIndex);MainActivity.candidate(j.toString());}catch(Exception ignored){}
            }
            @Override public void onIceCandidatesRemoved(IceCandidate[] ice){}
            @Override public void onAddStream(MediaStream stream){}
            @Override public void onRemoveStream(MediaStream stream){}
            @Override public void onDataChannel(DataChannel dc){}
            @Override public void onRenegotiationNeeded(){}
            @Override public void onAddTrack(RtpReceiver receiver,MediaStream[] streams){}
        });
        if(pc==null)throw new IllegalStateException("WebRTC PeerConnection nie je dostupný.");
        pc.addTrack(track,Collections.singletonList("czertScreen"));
        DisplayMetrics dm=getResources().getDisplayMetrics();
        float scale=Math.min(1f,720f/Math.max(dm.widthPixels,dm.heightPixels));
        int width=Math.max(2,((int)(dm.widthPixels*scale))&~1),height=Math.max(2,((int)(dm.heightPixels*scale))&~1);
        capturer.startCapture(width,height,15);
        pc.setRemoteDescription(new SimpleSdp(){
            @Override public void onSetSuccess(){remoteReady=true;flushIce();createAnswer();}
            @Override public void onSetFailure(String error){MainActivity.failure(sid,"Neplatný SDP: "+error);stopSelf();}
        },new SessionDescription(SessionDescription.Type.OFFER,offer));
    }
    private void createAnswer(){if(pc==null)return;pc.createAnswer(new SimpleSdp(){
        @Override public void onCreateSuccess(SessionDescription answer){
            if(pc==null)return;
            pc.setLocalDescription(new SimpleSdp(){
                @Override public void onSetSuccess(){MainActivity.answer(sid,answer.description);}
                @Override public void onSetFailure(String error){MainActivity.failure(sid,error);stopSelf();}
            },answer);
        }
        @Override public void onCreateFailure(String error){MainActivity.failure(sid,error);stopSelf();}
    },new MediaConstraints());}
    private void handleIce(String json){
        if(!remoteReady){synchronized(ScreenShareService.class){queuedIce.add(new IceEvent(sid,json));}return;}
        try{JSONObject j=new JSONObject(json);IceCandidate c=new IceCandidate(j.optString("sdpMid"),j.optInt("sdpMLineIndex"),j.optString("candidate"));
            if(pc!=null)pc.addIceCandidate(c);
        }catch(Exception ignored){}
    }
    private void flushIce(){List<IceEvent> copy; synchronized(ScreenShareService.class){copy=new ArrayList<>(queuedIce);queuedIce.clear();}
        for(IceEvent e:copy)if(sid.equals(e.sid))handleIce(e.candidate);
    }
    private abstract static class SimpleSdp implements SdpObserver {
        @Override public void onCreateSuccess(SessionDescription sdp){}
        @Override public void onSetSuccess(){}
        @Override public void onCreateFailure(String e){}
        @Override public void onSetFailure(String e){}
    }
    @Override public void onDestroy(){
        if(!stopping){stopping=true;
            // Tear down capture and peer in an orderly way when user stops the session.
            try{if(capturer!=null)capturer.stopCapture();}catch(Exception ignored){}
            try{if(capturer!=null)capturer.dispose();}catch(Exception ignored){}
            if(pc!=null){pc.close();pc.dispose();pc=null;}
            if(track!=null){track.dispose();track=null;}
            if(source!=null){source.dispose();source=null;}
            if(helper!=null){helper.dispose();helper=null;}
            if(factory!=null){factory.dispose();factory=null;}
            if(egl!=null){egl.release();egl=null;}
            synchronized(ScreenShareService.class){if(current==this)current=null;queuedIce.clear();}
            MainActivity.stopped(sid);
        }
        super.onDestroy();
    }
}
