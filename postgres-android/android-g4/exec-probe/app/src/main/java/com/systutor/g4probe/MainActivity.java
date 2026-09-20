package com.systutor.g4probe;

import android.app.Activity;
import android.os.Bundle;
import android.util.Log;
import android.widget.ScrollView;
import android.widget.TextView;

import java.io.BufferedReader;
import java.io.File;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.List;

public class MainActivity extends Activity {
    private static final String TAG = "G4PROBE";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        final TextView tv = new TextView(this);
        tv.setTextSize(12f);
        tv.setPadding(24, 24, 24, 24);
        ScrollView sv = new ScrollView(this);
        sv.addView(tv);
        setContentView(sv);

        new Thread(() -> {
            StringBuilder out = new StringBuilder();
            String nativeDir = getApplicationInfo().nativeLibraryDir;
            out.append("nativeLibraryDir=").append(nativeDir).append("\n\n");

            out.append(run(nativeDir, "libprobe.so"));
            out.append("\n");
            out.append(run(nativeDir, "libprobe_dep.so"));
            out.append("\n");
            out.append(runCopiedToFilesDir(nativeDir, "libprobe.so"));

            final String text = out.toString();
            Log.i(TAG, "\n" + text);
            runOnUiThread(() -> tv.setText(text));
        }).start();
    }

    private String runCopiedToFilesDir(String nativeDir, String name) {
        StringBuilder sb = new StringBuilder();
        sb.append("=== filesDir exec test (").append(name).append(") ===\n");
        try {
            File dst = new File(getFilesDir(), name);
            java.io.FileInputStream in = new java.io.FileInputStream(new File(nativeDir, name));
            java.io.FileOutputStream outF = new java.io.FileOutputStream(dst);
            byte[] buf = new byte[8192];
            int r;
            while ((r = in.read(buf)) > 0) outF.write(buf, 0, r);
            in.close();
            outF.close();
            dst.setExecutable(true, false);
            sb.append("copied=").append(dst.getAbsolutePath()).append(" exists=").append(dst.exists()).append("\n");
            return sb.append(runFile(dst, nativeDir)).toString();
        } catch (Throwable t) {
            sb.append("EXCEPTION=").append(t).append("\n");
            return sb.toString();
        }
    }

    private String run(String nativeDir, String name) {
        return runFile(new File(nativeDir, name), nativeDir);
    }

    private String runFile(File bin, String libDir) {
        StringBuilder sb = new StringBuilder();
        sb.append("=== ").append(bin.getName()).append(" ===\n");
        sb.append("exists=").append(bin.exists())
          .append(" canExecute=").append(bin.canExecute())
          .append(" canonical=").append(safeCanonical(bin)).append("\n");
        try {
            List<String> cmd = new ArrayList<>();
            cmd.add(bin.getAbsolutePath());
            ProcessBuilder pb = new ProcessBuilder(cmd);
            pb.redirectErrorStream(true);
            pb.environment().put("TMPDIR", getFilesDir().getAbsolutePath());
            pb.environment().put("LD_LIBRARY_PATH", libDir);
            Process p = pb.start();
            BufferedReader r = new BufferedReader(new InputStreamReader(p.getInputStream()));
            String line;
            while ((line = r.readLine()) != null) sb.append(line).append("\n");
            int code = p.waitFor();
            sb.append("exit=").append(code).append("\n");
        } catch (Throwable t) {
            sb.append("EXCEPTION=").append(t).append("\n");
        }
        return sb.toString();
    }

    private static String safeCanonical(File f) {
        try { return f.getCanonicalPath(); } catch (Throwable t) { return "<err>"; }
    }
}
