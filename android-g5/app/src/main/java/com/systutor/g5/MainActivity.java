package com.systutor.g5;

import android.app.Activity;
import android.os.Bundle;
import android.util.Log;
import android.webkit.ConsoleMessage;
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

    private final StringBuilder uiLog = new StringBuilder();
    private TextView tv;
    private WebView webView;
    private Process pg;
    private volatile boolean pgReady = false;

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
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onConsoleMessage(ConsoleMessage message) {
                Log.i(TAG, "console[" + message.messageLevel() + "] "
                        + message.message() + " @ " + message.sourceId()
                        + ":" + message.lineNumber());
                return true;
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

    private void runAll() {
        try {
            File files = getFilesDir();
            File nativeDir = new File(getApplicationInfo().nativeLibraryDir);

            out("filesDir=" + files);
            out("nativeLibraryDir=" + nativeDir);

            File webapp = new File(files, "webapp");
            if (!new File(webapp, "index.html").exists()) {
                out("-- extracting webapp.zip --");
                extractZip("webapp.zip", webapp);
            }

            launchPostgres(files, nativeDir);
            if (!waitReady(120)) {
                out("FATAL postgres not ready");
                return;
            }

            Python py = Python.getInstance();
            String stack = py.getModule("g5main").callAttr("probe").toString();
            String core = py.getModule("g5core")
                    .callAttr("run", files.getAbsolutePath()).toString();
            out(stack + "\n--- systutor-core (postgresql) ---\n" + core);

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
            webView.loadUrl("http://127.0.0.1:8000/");
        });
    }

    private void launchPostgres(File files, File nativeDir) throws IOException {
        File pgdata = new File(files, "pgdata");

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
                    Log.i(TAG, "[pg] " + line);
                    if (line.contains("ready to accept connections")) {
                        pgReady = true;
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
