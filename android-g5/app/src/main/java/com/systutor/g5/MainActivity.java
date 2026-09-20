package com.systutor.g5;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.webkit.ConsoleMessage;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.ScrollView;
import android.widget.TextView;

import com.chaquo.python.PyObject;
import com.chaquo.python.Python;
import com.chaquo.python.android.AndroidPlatform;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

public class MainActivity extends Activity {
    private static final String TAG = "G5";
    private static final int PG_PORT = 54329;
    private static final int PERMISSION_REQUEST = 1000;
    private static final int FILE_CHOOSER_REQUEST = 1001;

    private final StringBuilder uiLog = new StringBuilder();
    private TextView tv;
    private WebView webView;
    private Process pg;
    private volatile boolean pgReady = false;
    private ValueCallback<Uri[]> filePathCallback;

    private synchronized void out(String s) {
        uiLog.append(s).append("\n");
        Log.i(TAG, s);
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        tv = new TextView(this);
        tv.setTextSize(10f);
        ScrollView sv = new ScrollView(this);
        sv.addView(tv);
        setContentView(sv);

        createWebView();
        requestAppPermissions();

        if (!Python.isStarted()) {
            Python.start(new AndroidPlatform(this));
        }
        new Thread(this::runAll).start();
    }

    private void createWebView() {
        WebView.setWebContentsDebuggingEnabled(true);
        webView = new WebView(this);
        WebSettings ws = webView.getSettings();
        ws.setJavaScriptEnabled(true);
        ws.setDomStorageEnabled(true);
        ws.setMediaPlaybackRequiresUserGesture(false);
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onConsoleMessage(ConsoleMessage message) {
                Log.i(TAG, "console[" + message.messageLevel() + "] "
                        + message.message() + " @ " + message.sourceId()
                        + ":" + message.lineNumber());
                return true;
            }

            @Override
            public void onPermissionRequest(PermissionRequest request) {
                Log.i(TAG, "webview permission request: " + java.util.Arrays.toString(
                        request.getResources()));
                for (String resource : request.getResources()) {
                    if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(resource)
                            || PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)) {
                        request.grant(request.getResources());
                        return;
                    }
                }
                super.onPermissionRequest(request);
            }

            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback,
                                             FileChooserParams params) {
                if (filePathCallback != null) {
                    filePathCallback.onReceiveValue(null);
                }
                filePathCallback = callback;
                try {
                    Intent intent = params.createIntent();
                    intent.addCategory(Intent.CATEGORY_OPENABLE);
                    startActivityForResult(intent, FILE_CHOOSER_REQUEST);
                    return true;
                } catch (Exception exc) {
                    Log.i(TAG, "file chooser error: " + exc);
                    filePathCallback = null;
                    return false;
                }
            }
        });
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onReceivedError(WebView view, WebResourceRequest request,
                                        WebResourceError error) {
                Log.i(TAG, "webview error: " + error.getDescription()
                        + " " + request.getUrl());
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                Log.i(TAG, "webview loaded: " + url);
                view.evaluateJavascript(
                        "(document.body ? document.body.innerText.slice(0, 200) : 'no-body')",
                        value -> Log.i(TAG, "webview body=" + value));
            }
        });
        Log.i(TAG, "webview warming up");
        webView.loadUrl("about:blank");
    }

    private void requestAppPermissions() {
        List<String> needed = new ArrayList<>();
        needed.add(Manifest.permission.CAMERA);
        if (Build.VERSION.SDK_INT >= 33) {
            needed.add(Manifest.permission.READ_MEDIA_IMAGES);
            needed.add(Manifest.permission.READ_MEDIA_VIDEO);
            if (Build.VERSION.SDK_INT >= 34) {
                needed.add(Manifest.permission.READ_MEDIA_VISUAL_USER_SELECTED);
            }
        } else {
            needed.add(Manifest.permission.READ_EXTERNAL_STORAGE);
        }

        List<String> pending = new ArrayList<>();
        for (String permission : needed) {
            if (checkSelfPermission(permission) != PackageManager.PERMISSION_GRANTED) {
                pending.add(permission);
            }
        }
        if (!pending.isEmpty()) {
            requestPermissions(pending.toArray(new String[0]), PERMISSION_REQUEST);
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(requestCode, permissions, results);
        if (requestCode == PERMISSION_REQUEST) {
            for (int i = 0; i < permissions.length; i++) {
                Log.i(TAG, "permission " + permissions[i] + " -> "
                        + (results[i] == PackageManager.PERMISSION_GRANTED ? "granted" : "denied"));
            }
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != FILE_CHOOSER_REQUEST) {
            return;
        }
        Uri[] results = null;
        if (resultCode == RESULT_OK && data != null) {
            if (data.getClipData() != null) {
                int count = data.getClipData().getItemCount();
                results = new Uri[count];
                for (int i = 0; i < count; i++) {
                    results[i] = data.getClipData().getItemAt(i).getUri();
                }
            } else if (data.getData() != null) {
                results = new Uri[]{data.getData()};
            }
        }
        if (filePathCallback != null) {
            filePathCallback.onReceiveValue(results);
            filePathCallback = null;
        }
    }

    private void runAll() {
        try {
            File files = getFilesDir();
            File nativeDir = new File(getApplicationInfo().nativeLibraryDir);

            out("filesDir=" + files);
            out("nativeLibraryDir=" + nativeDir);

            File webapp = new File(files, "webapp");
            out("-- refreshing webapp.zip --");
            extractZip("webapp.zip", webapp);

            if (!new File(files, "plugins/productos/plugin.json").exists()) {
                out("-- extracting plugins.zip --");
                extractZip("plugins.zip", files);
            }

            File seedCsv = new File(files, "seed_productos.csv");
            if (!seedCsv.exists()) {
                out("-- copying seed_productos.csv --");
                copyAsset("seed_productos.csv", seedCsv);
            }

            if (!new File(files, "usr/lib/postgresql").isDirectory()) {
                out("-- extracting pgextensions.zip --");
                extractZip("pgextensions.zip", files);
            }

            launchPostgres(files, nativeDir);
            if (!waitReady(120)) {
                out("FATAL postgres not ready");
                return;
            }

            Python py = Python.getInstance();
            String core = py.getModule("g5core")
                    .callAttr("run", files.getAbsolutePath()).toString();
            out("--- systutor-core (postgresql) ---\n" + core);

            showWebApp();
        } catch (Throwable t) {
            out("FATAL " + t);
        } finally {
            final String text = uiLog.toString();
            runOnUiThread(() -> tv.setText(text));
        }
    }

    private void showWebApp() {
        runOnUiThread(() -> {
            setContentView(webView);
            Log.i(TAG, "webview loading app");
            webView.clearCache(true);
            webView.loadUrl("http://127.0.0.1:8000/");
        });
    }

    private boolean portOpen(int port) {
        try (java.net.Socket socket = new java.net.Socket()) {
            socket.connect(new java.net.InetSocketAddress("127.0.0.1", port), 500);
            return true;
        } catch (IOException exc) {
            return false;
        }
    }

    private void launchPostgres(File files, File nativeDir) throws IOException {
        File pgdata = new File(files, "pgdata");

        if (portOpen(PG_PORT)) {
            out("-- reusing running postmaster on " + PG_PORT + " --");
            pgReady = true;
            return;
        }

        File pidFile = new File(pgdata, "postmaster.pid");
        if (pidFile.exists()) {
            out("-- removing stale postmaster.pid --");
            pidFile.delete();
        }

        if (!new File(pgdata, "PG_VERSION").exists()) {
            out("-- extracting pgsupport.zip --");
            extractZip("pgsupport.zip", files);
        } else {
            out("-- reusing existing PGDATA --");
        }

        writeFile(new File(pgdata, "pg_hba.conf"),
                "local all all trust\n"
                        + "host all all 127.0.0.1/32 trust\n"
                        + "host all all ::1/128 trust\n");

        chmodTree(pgdata);
        chmodTree(new File(files, "usr"));
        new File(files, "tmp").mkdirs();

        File pgshare = new File(files, "usr/share/postgresql");
        if (pgshare.isDirectory()) {
            copyMerge(pgshare, new File(files, "usr"));
            chmodTree(new File(files, "usr"));
        }

        List<String> cmd = new ArrayList<>();
        cmd.add(new File(nativeDir, "libpostgres.so").getAbsolutePath());
        cmd.add("-D");
        cmd.add(pgdata.getAbsolutePath());
        cmd.add("-c");
        cmd.add("listen_addresses=127.0.0.1");
        cmd.add("-c");
        cmd.add("port=" + PG_PORT);
        cmd.add("-c");
        cmd.add("unix_socket_directories=");
        cmd.add("-c");
        cmd.add("shared_buffers=16MB");
        cmd.add("-c");
        cmd.add("max_connections=5");
        cmd.add("-c");
        cmd.add("log_min_messages=warning");
        cmd.add("-c");
        cmd.add("log_statement=none");
        cmd.add("-c");
        cmd.add("log_min_duration_statement=-1");

        ProcessBuilder pb = new ProcessBuilder(cmd);
        pb.redirectErrorStream(true);
        pb.environment().put("LD_LIBRARY_PATH", nativeDir.getAbsolutePath());
        pb.environment().put("TMPDIR", files.getAbsolutePath() + "/tmp");
        pb.environment().put("HOME", files.getAbsolutePath());
        pb.environment().put("TZ", "UTC");
        pg = pb.start();

        final InputStream is = pg.getInputStream();
        new Thread(() -> {
            try (BufferedReader r = new BufferedReader(new InputStreamReader(is))) {
                String line;
                while ((line = r.readLine()) != null) {
                    if (line.contains("ready to accept connections")) {
                        pgReady = true;
                    }
                    if (line.contains("ready to accept connections")
                            || line.contains("ERROR")
                            || line.contains("FATAL")
                            || line.contains("PANIC")) {
                        Log.i(TAG, "[pg] " + line);
                    }
                }
            } catch (Throwable ignored) {
            }
        }).start();
    }

    private boolean waitReady(int seconds) {
        for (int i = 0; i < seconds; i++) {
            if (pgReady) {
                out("postgres ready after " + i + "s");
                return true;
            }
            try {
                Thread.sleep(1000);
            } catch (InterruptedException ignored) {
            }
        }
        return false;
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        if (pg != null) {
            pg.destroy();
        }
    }

    private void extractZip(String asset, File dest) throws IOException {
        try (InputStream in = getAssets().open(asset); ZipInputStream z = new ZipInputStream(in)) {
            ZipEntry e;
            byte[] buf = new byte[16384];
            while ((e = z.getNextEntry()) != null) {
                File f = new File(dest, e.getName());
                if (e.isDirectory()) {
                    f.mkdirs();
                    continue;
                }
                File parent = f.getParentFile();
                if (parent != null) {
                    parent.mkdirs();
                }
                try (FileOutputStream o = new FileOutputStream(f)) {
                    int n;
                    while ((n = z.read(buf)) > 0) {
                        o.write(buf, 0, n);
                    }
                }
            }
        }
    }

    private void copyAsset(String asset, File dest) throws IOException {
        dest.getParentFile().mkdirs();
        try (InputStream in = getAssets().open(asset);
             OutputStream o = new FileOutputStream(dest)) {
            byte[] buf = new byte[16384];
            int n;
            while ((n = in.read(buf)) > 0) {
                o.write(buf, 0, n);
            }
        }
    }

    private void copyMerge(File src, File dst) throws IOException {
        File[] kids = src.listFiles();
        if (kids == null) {
            return;
        }
        for (File k : kids) {
            File target = new File(dst, k.getName());
            if (k.isDirectory()) {
                target.mkdirs();
                copyMerge(k, target);
            } else if (!target.exists()) {
                try (InputStream in = new FileInputStream(k);
                     OutputStream o = new FileOutputStream(target)) {
                    byte[] buf = new byte[16384];
                    int n;
                    while ((n = in.read(buf)) > 0) {
                        o.write(buf, 0, n);
                    }
                }
            }
        }
    }

    private void chmodTree(File f) {
        if (!f.exists()) {
            return;
        }
        if (f.isDirectory()) {
            f.setReadable(true, true);
            f.setWritable(true, true);
            f.setExecutable(true, true);
            File[] kids = f.listFiles();
            if (kids != null) {
                for (File k : kids) {
                    chmodTree(k);
                }
            }
        } else {
            f.setReadable(true, true);
            f.setWritable(true, true);
            f.setExecutable(false, true);
        }
    }

    private void writeFile(File f, String content) throws IOException {
        try (OutputStream o = new FileOutputStream(f)) {
            o.write(content.getBytes(StandardCharsets.UTF_8));
        }
    }
}
