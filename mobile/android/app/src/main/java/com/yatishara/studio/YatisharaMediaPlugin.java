package com.yatishara.studio;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Streams signed Studio media URLs directly into Android MediaStore or a
 * FileProvider-backed share intent. No broad storage permission is required.
 */
@CapacitorPlugin(name = "YatisharaMedia")
public class YatisharaMediaPlugin extends Plugin {
    private static final int CONNECT_TIMEOUT_MS = 20_000;
    private static final int READ_TIMEOUT_MS = 120_000;
    private final ExecutorService ioExecutor = Executors.newFixedThreadPool(2);

    @PluginMethod
    public void saveToGallery(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            call.reject("Saving to Gallery requires Android 10 or newer");
            return;
        }
        DownloadRequest request;
        try {
            request = parseRequest(call);
        } catch (IllegalArgumentException error) {
            call.reject(error.getMessage());
            return;
        }

        ioExecutor.execute(() -> {
            Uri destination = null;
            try {
                ContentResolver resolver = getContext().getContentResolver();
                ContentValues values = new ContentValues();
                values.put(MediaStore.MediaColumns.DISPLAY_NAME, request.filename);
                values.put(MediaStore.MediaColumns.MIME_TYPE, request.mimeType);
                values.put(MediaStore.MediaColumns.RELATIVE_PATH, relativePath(request.mimeType));
                values.put(MediaStore.MediaColumns.IS_PENDING, 1);

                destination = resolver.insert(collectionFor(request.mimeType), values);
                if (destination == null) throw new IOException("Android could not create the gallery item");

                try (
                    InputStream input = openStream(request.url);
                    OutputStream output = resolver.openOutputStream(destination)
                ) {
                    if (output == null) throw new IOException("Android could not open the gallery destination");
                    copy(input, output);
                }

                values.clear();
                values.put(MediaStore.MediaColumns.IS_PENDING, 0);
                resolver.update(destination, values, null, null);

                JSObject result = new JSObject();
                result.put("uri", destination.toString());
                result.put("filename", request.filename);
                call.resolve(result);
            } catch (Exception error) {
                if (destination != null) {
                    getContext().getContentResolver().delete(destination, null, null);
                }
                call.reject("Could not save media: " + safeMessage(error), error);
            }
        });
    }

    @PluginMethod
    public void shareFile(PluginCall call) {
        DownloadRequest request;
        try {
            request = parseRequest(call);
        } catch (IllegalArgumentException error) {
            call.reject(error.getMessage());
            return;
        }

        ioExecutor.execute(() -> {
            try {
                File shareDir = new File(getContext().getCacheDir(), "shared");
                if (!shareDir.exists() && !shareDir.mkdirs()) {
                    throw new IOException("Could not create share cache");
                }
                pruneOldShares(shareDir);
                File outputFile = new File(shareDir, request.filename);
                try (
                    InputStream input = openStream(request.url);
                    OutputStream output = new FileOutputStream(outputFile)
                ) {
                    copy(input, output);
                }

                Uri uri = FileProvider.getUriForFile(
                    getContext(),
                    getContext().getPackageName() + ".fileprovider",
                    outputFile
                );
                Intent intent = new Intent(Intent.ACTION_SEND);
                intent.setType(request.mimeType);
                intent.putExtra(Intent.EXTRA_STREAM, uri);
                String title = call.getString("title");
                String text = call.getString("text");
                if (title != null) intent.putExtra(Intent.EXTRA_SUBJECT, title);
                if (text != null) intent.putExtra(Intent.EXTRA_TEXT, text);
                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

                Intent chooser = Intent.createChooser(intent, title == null ? "Share from Studio" : title);
                chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(chooser);

                JSObject result = new JSObject();
                result.put("shared", true);
                call.resolve(result);
            } catch (Exception error) {
                call.reject("Could not share media: " + safeMessage(error), error);
            }
        });
    }

    @Override
    protected void handleOnDestroy() {
        ioExecutor.shutdownNow();
        super.handleOnDestroy();
    }

    private DownloadRequest parseRequest(PluginCall call) {
        String rawUrl = call.getString("url");
        if (rawUrl == null || rawUrl.isBlank()) throw new IllegalArgumentException("A media URL is required");
        try {
            URI uri = URI.create(rawUrl);
            if (!"https".equalsIgnoreCase(uri.getScheme())) {
                throw new IllegalArgumentException("Only HTTPS media URLs are allowed");
            }
        } catch (IllegalArgumentException error) {
            throw new IllegalArgumentException("A valid HTTPS media URL is required");
        }

        String mimeType = call.getString("mimeType", "application/octet-stream");
        String filename = sanitizeFilename(call.getString("filename", filenameFromUrl(rawUrl, mimeType)));
        return new DownloadRequest(rawUrl, filename, mimeType);
    }

    private InputStream openStream(String rawUrl) throws IOException {
        HttpURLConnection connection = (HttpURLConnection) new URL(rawUrl).openConnection();
        connection.setConnectTimeout(CONNECT_TIMEOUT_MS);
        connection.setReadTimeout(READ_TIMEOUT_MS);
        connection.setInstanceFollowRedirects(true);
        connection.setRequestProperty("User-Agent", "YatisharaStudio-Android/1");
        int status = connection.getResponseCode();
        if (status < 200 || status >= 300) {
            connection.disconnect();
            throw new IOException("Media server returned HTTP " + status);
        }
        return new ConnectionInputStream(connection);
    }

    private static Uri collectionFor(String mimeType) {
        if (mimeType.startsWith("image/")) return MediaStore.Images.Media.EXTERNAL_CONTENT_URI;
        if (mimeType.startsWith("video/")) return MediaStore.Video.Media.EXTERNAL_CONTENT_URI;
        if (mimeType.startsWith("audio/")) return MediaStore.Audio.Media.EXTERNAL_CONTENT_URI;
        return MediaStore.Downloads.EXTERNAL_CONTENT_URI;
    }

    private static String relativePath(String mimeType) {
        if (mimeType.startsWith("image/")) return Environment.DIRECTORY_PICTURES + "/Yatishara Studio";
        if (mimeType.startsWith("video/")) return Environment.DIRECTORY_MOVIES + "/Yatishara Studio";
        if (mimeType.startsWith("audio/")) return Environment.DIRECTORY_MUSIC + "/Yatishara Studio";
        return Environment.DIRECTORY_DOWNLOADS + "/Yatishara Studio";
    }

    private static String filenameFromUrl(String rawUrl, String mimeType) {
        try {
            String path = URI.create(rawUrl).getPath();
            String tail = path == null ? "" : path.substring(path.lastIndexOf('/') + 1);
            if (!tail.isBlank()) return tail;
        } catch (Exception ignored) {}
        String extension = mimeType.startsWith("image/") ? ".png"
            : mimeType.startsWith("video/") ? ".mp4"
            : mimeType.startsWith("audio/") ? ".mp3"
            : "";
        return "yatishara-" + System.currentTimeMillis() + extension;
    }

    private static String sanitizeFilename(String raw) {
        String safe = raw.replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", "_").trim();
        if (safe.isEmpty()) safe = "yatishara-" + System.currentTimeMillis();
        return safe.length() > 180 ? safe.substring(safe.length() - 180) : safe;
    }

    private static void copy(InputStream input, OutputStream output) throws IOException {
        byte[] buffer = new byte[64 * 1024];
        int count;
        while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
        output.flush();
    }

    private static void pruneOldShares(File shareDir) {
        File[] files = shareDir.listFiles();
        if (files == null) return;
        long cutoff = System.currentTimeMillis() - (24L * 60L * 60L * 1000L);
        for (File file : files) {
            if (file.lastModified() < cutoff) file.delete();
        }
    }

    private static String safeMessage(Exception error) {
        String message = error.getMessage();
        return message == null || message.isBlank() ? error.getClass().getSimpleName() : message;
    }

    private static final class DownloadRequest {
        final String url;
        final String filename;
        final String mimeType;

        DownloadRequest(String url, String filename, String mimeType) {
            this.url = url;
            this.filename = filename;
            this.mimeType = mimeType;
        }
    }

    private static final class ConnectionInputStream extends InputStream {
        private final HttpURLConnection connection;
        private final InputStream delegate;

        ConnectionInputStream(HttpURLConnection connection) throws IOException {
            this.connection = connection;
            this.delegate = connection.getInputStream();
        }

        @Override
        public int read() throws IOException {
            return delegate.read();
        }

        @Override
        public int read(byte[] bytes, int offset, int length) throws IOException {
            return delegate.read(bytes, offset, length);
        }

        @Override
        public void close() throws IOException {
            try {
                delegate.close();
            } finally {
                connection.disconnect();
            }
        }
    }
}
