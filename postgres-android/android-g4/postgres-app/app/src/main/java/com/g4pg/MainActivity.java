package com.g4pg;

import android.app.Activity;
import android.os.Bundle;
import android.util.Log;
import android.widget.ScrollView;
import android.widget.TextView;

import java.io.BufferedReader;
import java.io.File;
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
    private static final String TAG = "G4PG";
    private static final int PORT = 54329;
    private final StringBuilder log = new StringBuilder();
    private Process pg;
    private volatile boolean pgReady = false;

    private synchronized void out(String s) {
        log.append(s).append("\n");
        Log.i(TAG, s);
    }

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        TextView tv = new TextView(this);
        tv.setTextSize(11f);
        ScrollView sv = new ScrollView(this);
        sv.addView(tv);
        setContentView(sv);

        new Thread(() -> {
            try {
                runAll();
            } catch (Throwable t) {
                out("FATAL " + t);
            }
            final String text = log.toString();
            runOnUiThread(() -> tv.setText(text));
        }).start();
    }

    private void runAll() throws Exception {
        File files = getFilesDir();
        File nativeDir = new File(getApplicationInfo().nativeLibraryDir);
        File pgdata = new File(files, "pgdata");

        out("nativeLibraryDir=" + nativeDir);
        out("filesDir=" + files);
        out("PGDATA=" + pgdata);

        out("-- extracting assets --");
        deleteRecursive(pgdata);
        extractZip("pgsupport.zip", files);
        out("extracted. pgdata exists=" + new File(pgdata, "PG_VERSION").exists());

        writeFile(new File(pgdata, "pg_hba.conf"),
                "local all all trust\nhost all all 127.0.0.1/32 trust\nhost all all ::1/128 trust\n");

        chmodTree(new File(files, "pgdata"));
        chmodTree(new File(files, "usr"));
        new File(files, "tmp").mkdirs();

        File pgshare = new File(files, "usr/share/postgresql");
        if (pgshare.isDirectory()) {
            copyMerge(pgshare, new File(files, "usr"));
            out("mirrored share/postgresql -> usr/");
        }
        chmodTree(new File(files, "usr"));

        out("-- start #1 --");
        startPostgres(files, nativeDir, pgdata);
        if (!waitReady(90)) { out("NOT READY after 90s"); stopPostgres(); return; }

        out("-- SQL --");
        runClient(files, nativeDir, "phase7");

        out("-- stop --");
        stopPostgres();
        Thread.sleep(2000);

        out("-- start #2 (persistence) --");
        startPostgres(files, nativeDir, pgdata);
        if (!waitReady(90)) { out("NOT READY after restart"); stopPostgres(); return; }
        runClient(files, nativeDir, "persist");
        stopPostgres();

        out("G4 RESULT: done");
    }

    private void startPostgres(File files, File nativeDir, File pgdata) throws IOException {
        pgReady = false;
        List<String> cmd = new ArrayList<>();
        cmd.add(new File(nativeDir, "libpostgres.so").getAbsolutePath());
        cmd.add("-D"); cmd.add(pgdata.getAbsolutePath());
        cmd.add("-c"); cmd.add("listen_addresses=127.0.0.1");
        cmd.add("-c"); cmd.add("port=" + PORT);
        cmd.add("-c"); cmd.add("unix_socket_directories=");
        cmd.add("-c"); cmd.add("shared_buffers=16MB");
        cmd.add("-c"); cmd.add("max_connections=5");
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
                    out("[pg] " + line);
                    if (line.contains("ready to accept connections")) pgReady = true;
                }
            } catch (Throwable ignored) {}
        }).start();
    }

    private void stopPostgres() {
        if (pg == null) return;
        pg.destroy();
        try { pg.waitFor(); } catch (InterruptedException ignored) {}
        out("postgres exited=" + !pg.isAlive());
        pg = null;
    }

    private boolean waitReady(int seconds) {
        for (int i = 0; i < seconds; i++) {
            if (pgReady) { out("ready marker after " + i + "s"); return true; }
            try { Thread.sleep(1000); } catch (InterruptedException ignored) {}
        }
        return false;
    }

    private void runClient(File files, File nativeDir, String phase) {
        try {
            List<String> cmd = new ArrayList<>();
            cmd.add(new File(nativeDir, "libg4sql.so").getAbsolutePath());
            cmd.add(phase);
            ProcessBuilder pb = new ProcessBuilder(cmd);
            pb.redirectErrorStream(true);
            pb.environment().put("LD_LIBRARY_PATH", nativeDir.getAbsolutePath());
            pb.environment().put("TMPDIR", files.getAbsolutePath() + "/tmp");
            Process p = pb.start();
            BufferedReader r = new BufferedReader(new InputStreamReader(p.getInputStream()));
            String line;
            while ((line = r.readLine()) != null) out("[sql:" + phase + "] " + line);
            out("client exit=" + p.waitFor());
        } catch (Throwable t) {
            out("client ERROR: " + t);
        }
    }

    private void extractZip(String asset, File dest) throws IOException {
        try (InputStream in = getAssets().open(asset); ZipInputStream z = new ZipInputStream(in)) {
            ZipEntry e;
            byte[] buf = new byte[16384];
            while ((e = z.getNextEntry()) != null) {
                File f = new File(dest, e.getName());
                if (e.isDirectory()) { f.mkdirs(); continue; }
                f.getParentFile().mkdirs();
                try (FileOutputStream o = new FileOutputStream(f)) {
                    int n;
                    while ((n = z.read(buf)) > 0) o.write(buf, 0, n);
                }
            }
        }
    }

    private void copyMerge(File src, File dst) throws IOException {
        File[] kids = src.listFiles();
        if (kids == null) return;
        for (File k : kids) {
            File target = new File(dst, k.getName());
            if (k.isDirectory()) {
                target.mkdirs();
                copyMerge(k, target);
            } else if (!target.exists()) {
                try (InputStream in = new java.io.FileInputStream(k);
                     OutputStream o = new FileOutputStream(target)) {
                    byte[] buf = new byte[16384];
                    int n;
                    while ((n = in.read(buf)) > 0) o.write(buf, 0, n);
                }
            }
        }
    }

    private void chmodTree(File f) {
        if (!f.exists()) return;
        if (f.isDirectory()) {
            f.setReadable(true, true); f.setWritable(true, true); f.setExecutable(true, true);
            File[] kids = f.listFiles();
            if (kids != null) for (File k : kids) chmodTree(k);
        } else {
            f.setReadable(true, true); f.setWritable(true, true); f.setExecutable(false, true);
        }
    }

    private void writeFile(File f, String content) throws IOException {
        try (OutputStream o = new FileOutputStream(f)) { o.write(content.getBytes(StandardCharsets.UTF_8)); }
    }

    private void deleteRecursive(File f) {
        if (!f.exists()) return;
        if (f.isDirectory()) { File[] k = f.listFiles(); if (k != null) for (File c : k) deleteRecursive(c); }
        f.delete();
    }
}
