export const config = { runtime: "nodejs" };

async function getDropboxAccessToken() {
  const params = new URLSearchParams();
  params.append('grant_type', 'refresh_token');
  params.append('refresh_token', process.env.DROPBOX_REFRESH_TOKEN);

  const res = await fetch('https://api.dropboxapi.com/oauth2/token', {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + Buffer.from(
        `${process.env.DROPBOX_APP_KEY}:${process.env.DROPBOX_APP_SECRET}`
      ).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: params
  });

  if (!res.ok) {
    const error = await res.text();
    console.error('Failed to refresh token:', error);
    throw new Error('Cannot refresh Dropbox token');
  }

  const data = await res.json();
  return data.access_token;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { folderName, fileName, fileData } = req.body;

    if (!folderName) {
      return res.status(400).json({ error: 'Missing folderName' });
    }

    const basePath = `/forms/${folderName}`;
    const DROPBOX_TOKEN = await getDropboxAccessToken();

    if (!fileName && !fileData) {
      // שלב יצירת תיקיה בלבד
      const checkResp = await fetch("https://api.dropboxapi.com/2/files/get_metadata", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${DROPBOX_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ path: basePath })
      });

      if (checkResp.ok) {
        // מחק תיקיה קיימת אם קיימת
        await fetch("https://api.dropboxapi.com/2/files/delete_v2", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${DROPBOX_TOKEN}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ path: basePath })
        });
      }

      // צור תיקיה חדשה
      await fetch("https://api.dropboxapi.com/2/files/create_folder_v2", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${DROPBOX_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ path: basePath, autorename: false })
      });

      return res.status(200).json({ message: "Folder prepared" });
    }

    if (!fileName || !fileData) {
      return res.status(400).json({ error: 'Missing fileName or fileData' });
    }

    // המרת base64 ל-buffer
    const fileBuffer = Buffer.from(fileData, 'base64');

    const uploadResp = await fetch("https://content.dropboxapi.com/2/files/upload", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${DROPBOX_TOKEN}`,
        "Content-Type": "application/octet-stream",
        "Dropbox-API-Arg": JSON.stringify({
          path: `${basePath}/${fileName}`,
          mode: "overwrite",
          autorename: false,
          mute: false
        })
      },
      body: fileBuffer
    });

    if (!uploadResp.ok) {
      const error = await uploadResp.text();
      console.error("Dropbox upload error:", error);
      return res.status(500).json({ error: error });
    }

    return res.status(200).json({ message: "File uploaded" });

  } catch (err) {
    console.error("Upload API Error:", err);
    return res.status(500).json({ error: err.message });
  }
}
