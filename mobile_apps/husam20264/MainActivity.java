package com.example.restaurantapp;

import android.os.Bundle;

import androidx.appcompat.app.AppCompatActivity;

import android.webkit.WebView;

public class MainActivity extends AppCompatActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        WebView webView = findViewById(R.id.webView);
        webView.loadUrl("file:///android_asset/index.html");
    }
}