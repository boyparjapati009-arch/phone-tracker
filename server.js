const express = require("express");
const multer = require("multer");

const app = express();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024
  }
});

const PORT = process.env.PORT || 10000;

const OWNER = process.env.GITHUB_OWNER;
const REPO = process.env.GITHUB_REPO;
const TOKEN = process.env.GITHUB_TOKEN;

app.get("/", (req, res) => {
  res.json({
    ok: true,
    service: "PhoneTracker OTA"
  });
});

app.post("/upload-apk", upload.single("apk"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: "APK missing"
      });
    }

    const versionCode = String(req.body.versionCode || Date.now());
    const versionName = String(req.body.versionName || versionCode);

    const fileName =
      `${versionCode}-${versionName.replace(/[^a-zA-Z0-9._-]/g, "_")}.apk`;

    // 1. Create GitHub Release
    const releaseResponse = await fetch(
      `https://api.github.com/repos/${OWNER}/${REPO}/releases`,
      {
        method: "POST",
        headers: {
          "Accept": "application/vnd.github+json",
          "Authorization": `Bearer ${TOKEN}`,
          "X-GitHub-Api-Version": "2026-03-10",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          tag_name: `v${versionName}-${versionCode}`,
          name: `PhoneTracker v${versionName}`,
          body: `PhoneTracker OTA update ${versionName} (${versionCode})`,
          draft: false,
          prerelease: false
        })
      }
    );

    const release = await releaseResponse.json();

    if (!releaseResponse.ok) {
      return res.status(releaseResponse.status).json({
        error: release.message || "GitHub release creation failed"
      });
    }

    // 2. Upload APK as release asset
    const uploadUrl = release.upload_url
      .replace("{?name,label}", "") +
      `?name=${encodeURIComponent(fileName)}`;

    const assetResponse = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        "Accept": "application/vnd.github+json",
        "Authorization": `Bearer ${TOKEN}`,
        "X-GitHub-Api-Version": "2026-03-10",
        "Content-Type": "application/vnd.android.package-archive",
        "Content-Length": String(req.file.size)
      },
      body: req.file.buffer
    });

    const asset = await assetResponse.json();

    if (!assetResponse.ok) {
      return res.status(assetResponse.status).json({
        error: asset.message || "APK upload failed"
      });
    }

    res.json({
      success: true,
      versionCode,
      versionName,
      fileName,
      downloadUrl: asset.browser_download_url,
      releaseUrl: release.html_url
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: error.message
    });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`OTA server running on ${PORT}`);
});
