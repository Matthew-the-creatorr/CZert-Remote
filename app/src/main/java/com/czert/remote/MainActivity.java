package com.czert.remote;

import android.Manifest;
import android.app.Activity;
import android.app.ActivityManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.media.projection.MediaProjectionManager;
import android.os.BatteryManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.StatFs;
import android.util.DisplayMetrics;
import android.hardware.Sensor;
import android.hardware.SensorManager;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import org.json.JSONObject;
import java.lang.ref.WeakReference;

public class MainActivity extends Activity implements SensorEventListener {
    private static final String SITE = "https://prismatic-ganache-e69adc.netlify.app/";
    private static final String HOST = "prismatic-ganache-e69adc.netlify.app";
    private static final int CAPTURE_REQUEST = 1401;
    private static final int WEB_MEDIA_REQUEST = 1402;
    private WebView web;
    private SensorManager sensorManager;
    private volatile float[] accel, gyro;
    private volatile Float lux,pressure;
    private PermissionRequest pendingWebPermission;
    private String screenSession = "", screenOffer = "";
    private static WeakReference<MainActivity> running = new WeakReference<>(null);

    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        running = new WeakReference<>(this);
        sensorManager=(SensorManager)getSystemService(SENSOR_SERVICE);
        getWindow().setStatusBarColor(0xff080d16);
        getWindow().setNavigationBarColor(0xff080d16);
        web = new WebView(this);
        setContentView(web);
        web.getSettings().setJavaScriptEnabled(true);
        web.getSettings().setDomStorageEnabled(true);
        web.getSettings().setMediaPlaybackRequiresUserGesture(true);
        web.getSettings().setAllowFileAccess(false);
        web.getSettings().setAllowContentAccess(false);
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return !isTrusted(request.getUrl().toString());
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public void onPermissionRequest(PermissionRequest request) {
                runOnUiThread(() -> approveWebMedia(request));
            }
            @Override public void onPermissionRequestCanceled(PermissionRequest request) {
                if (pendingWebPermission == request) pendingWebPermission = null;
            }
        });
        web.addJavascriptInterface(new NativeBridge(), "CZertNative");
        web.loadUrl(SITE);
        if(Build.VERSION.SDK_INT>=33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED)
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS},1403);
    }
    private boolean isTrusted(String url) {
        try { android.net.Uri uri = android.net.Uri.parse(url);return "https".equals(uri.getScheme()) && HOST.equals(uri.getHost()); }
        catch (Exception ex) {return false;}
    }
    private void approveWebMedia(PermissionRequest req) {
        if (!isTrusted(req.getOrigin().toString())) {req.deny();return;}
        boolean camera = false,audio = false;
        for (String r : req.getResources()) {
            if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(r)) camera=true;
            else if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(r)) audio=true;
            else {req.deny();return;}
        }
        if (camera && checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED ||
                audio && checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            pendingWebPermission=req;
            if(camera && audio) requestPermissions(new String[]{Manifest.permission.CAMERA,Manifest.permission.RECORD_AUDIO},WEB_MEDIA_REQUEST);
            else requestPermissions(new String[]{camera?Manifest.permission.CAMERA:Manifest.permission.RECORD_AUDIO},WEB_MEDIA_REQUEST);
        } else req.grant(req.getResources());
    }
    @Override public void onRequestPermissionsResult(int requestCode,String[] perms,int[] results) {
        super.onRequestPermissionsResult(requestCode,perms,results);
        if(requestCode==WEB_MEDIA_REQUEST && pendingWebPermission!=null){
            PermissionRequest req=pendingWebPermission;pendingWebPermission=null;
            boolean all=true;for(int x:results)all &= x==PackageManager.PERMISSION_GRANTED;
            if(all)req.grant(req.getResources());else req.deny();
        }
    }
    private class NativeBridge {
        @JavascriptInterface public String getSpecs() {
            JSONObject j = new JSONObject();
            try {
                ActivityManager am=(ActivityManager)getSystemService(ACTIVITY_SERVICE);
                ActivityManager.MemoryInfo info=new ActivityManager.MemoryInfo();am.getMemoryInfo(info);
                j.put("ramTotalMB",info.totalMem/1048576.0);j.put("ramAvailMB",info.availMem/1048576.0);
                j.put("device",Build.MANUFACTURER+" "+Build.MODEL);j.put("androidVersion",Build.VERSION.RELEASE);
                j.put("cpuCores",Runtime.getRuntime().availableProcessors());
                DisplayMetrics dm=getResources().getDisplayMetrics();j.put("densityDpi",dm.densityDpi);
                BatteryManager bm=(BatteryManager)getSystemService(BATTERY_SERVICE);
                int percent=bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY);
                if(percent>=0 && percent<=100)j.put("batteryPct",percent);
                Intent status=registerReceiver(null,new android.content.IntentFilter(Intent.ACTION_BATTERY_CHANGED));
                if(status!=null){int temp=status.getIntExtra(BatteryManager.EXTRA_TEMPERATURE,-1);if(temp>=0)j.put("batteryTempC",temp/10.0);
                    int s=status.getIntExtra(BatteryManager.EXTRA_STATUS,-1);
                    j.put("charging",s==BatteryManager.BATTERY_STATUS_CHARGING||s==BatteryManager.BATTERY_STATUS_FULL);}
                JSONObject sensors=new JSONObject();
                if(accel!=null){sensors.put("ax",accel[0]);sensors.put("ay",accel[1]);sensors.put("az",accel[2]);}
                if(gyro!=null){sensors.put("gx",gyro[0]);sensors.put("gy",gyro[1]);sensors.put("gz",gyro[2]);}
                if(lux!=null)sensors.put("lux",lux);
                if(pressure!=null)sensors.put("pressure",pressure);
                j.put("sensors",sensors);
                StatFs stat = new StatFs(Environment.getDataDirectory().getPath());
                j.put("storageTotalMB",stat.getTotalBytes()/1048576.0);j.put("storageFreeMB",stat.getAvailableBytes()/1048576.0);
            } catch (Exception ignored) { }
            return j.toString();
        }
        @JavascriptInterface public void beginScreen(String sid,String offer){runOnUiThread(()->startScreen(sid,offer));}
        @JavascriptInterface public void addIce(String sid,String candidate){ScreenShareService.submitIce(sid,candidate);}
        @JavascriptInterface public void stopScreen(){runOnUiThread(()->stopService(new Intent(MainActivity.this,ScreenShareService.class)));}
    }
    private void startScreen(String sid,String offer) {
        if(!isTrusted(web.getUrl()))return;
        if(!sid.matches("[A-Za-z0-9]{12,64}")||offer==null||offer.length()>50000||!offer.startsWith("v=0")) {nativeError(sid,"Neplatná požiadavka WebRTC.");return;}
        screenSession=sid;screenOffer=offer;
        MediaProjectionManager pm=(MediaProjectionManager)getSystemService(MEDIA_PROJECTION_SERVICE);
        // Android always displays its own consent screen. This cannot be silently granted.
        startActivityForResult(pm.createScreenCaptureIntent(),CAPTURE_REQUEST);
    }
    @Override protected void onActivityResult(int requestCode,int resultCode,Intent data){
        super.onActivityResult(requestCode,resultCode,data);
        if(requestCode!=CAPTURE_REQUEST)return;
        if(resultCode!=RESULT_OK||data==null){nativeError(screenSession,"Používateľ nepovolil zdieľanie obrazovky.");return;}
        Intent start=new Intent(this,ScreenShareService.class);
        start.putExtra("session",screenSession);start.putExtra("offer",screenOffer);
        start.putExtra("permissionCode",resultCode);start.putExtra("permissionData",data);
        if(Build.VERSION.SDK_INT>=26)startForegroundService(start);else startService(start);
    }
    private void eval(String code){runOnUiThread(()->{if(web!=null&&isTrusted(web.getUrl()))web.evaluateJavascript(code,null);});}
    private void nativeError(String sid,String msg){
        eval("window.czNativeError?.("+JSONObject.quote(sid)+","+JSONObject.quote(msg)+")");
    }
    static void answer(String sid,String sdp){MainActivity a=running.get();if(a!=null)a.eval("window.czNativeAnswer?.("+JSONObject.quote(sid)+","+JSONObject.quote(sdp)+")");}
    static void candidate(String json){MainActivity a=running.get();if(a!=null)a.eval("window.czNativeIce?.("+JSONObject.quote(json)+")");}
    static void stopped(String sid){MainActivity a=running.get();if(a!=null)a.eval("window.czNativeStopped?.("+JSONObject.quote(sid)+")");}
    static void failure(String sid,String msg){MainActivity a=running.get();if(a!=null)a.nativeError(sid,msg);}
    @Override protected void onResume(){super.onResume();if(sensorManager!=null){for(int t:new int[]{Sensor.TYPE_ACCELEROMETER,Sensor.TYPE_GYROSCOPE,Sensor.TYPE_LIGHT,Sensor.TYPE_PRESSURE}){Sensor x=sensorManager.getDefaultSensor(t);if(x!=null)sensorManager.registerListener(this,x,SensorManager.SENSOR_DELAY_NORMAL);}}}
    @Override protected void onPause(){if(sensorManager!=null)sensorManager.unregisterListener(this);super.onPause();}
    @Override public void onAccuracyChanged(Sensor sensor,int accuracy){}
    @Override public void onSensorChanged(SensorEvent e){switch(e.sensor.getType()){
        case Sensor.TYPE_ACCELEROMETER:accel=e.values.clone();break;
        case Sensor.TYPE_GYROSCOPE:gyro=e.values.clone();break;
        case Sensor.TYPE_LIGHT:lux=e.values[0];break;
        case Sensor.TYPE_PRESSURE:pressure=e.values[0];break;
    }}
    @Override public void onBackPressed(){if(web!=null&&web.canGoBack())web.goBack();else super.onBackPressed();}
    @Override protected void onDestroy(){stopService(new Intent(this,ScreenShareService.class));running.clear();if(web!=null){web.destroy();web=null;}super.onDestroy();}
}
