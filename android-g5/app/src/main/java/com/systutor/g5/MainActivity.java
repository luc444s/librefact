package com.systutor.g5;

import android.app.Activity;
import android.os.Bundle;
import android.util.Log;
import android.widget.TextView;

import com.chaquo.python.PyObject;
import com.chaquo.python.Python;
import com.chaquo.python.android.AndroidPlatform;

public class MainActivity extends Activity {
    private static final String TAG = "G5";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (!Python.isStarted()) {
            Python.start(new AndroidPlatform(this));
        }
        Python py = Python.getInstance();
        PyObject mod = py.getModule("g5main");
        String info = mod.callAttr("probe").toString();
        Log.i(TAG, "probe: " + info);
        TextView tv = new TextView(this);
        tv.setText(info);
        setContentView(tv);
    }
}
