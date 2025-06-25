import busboy from 'busboy';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

export const config = { api: { bodyParser: false } };

// פונקציה לקבלת גישה ל-Dropbox (עם Refresh Token)
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

// פונקציית עזר לקרוא גוף JSON
async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

export default async function handler(req, res) {
  if (req.method === 'POST' && req.headers['content-type'].startsWith('application/json')) {
    // שלב יצירת תיקיה
    const body = await readJsonBody(req);
    const folderName = body.folderName;
    const basePath = `/forms/${folderName}`;

    const DROPBOX_TOKEN = await getDropboxAccessToken();

    // אם קיימת תיקיה ישנה - מחק
    const checkResp = await fetch("https://api.dropboxapi.com/2/files/get_metadata", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${DROPBOX_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ path: basePath })
    });

    if (checkResp.ok) {
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

    return res.status(200).json({ message: "Folder created" });
  }

  if (req.method === 'POST') {
    // שלב העלאת קובץ
    const bb = busboy({ headers: req.headers });
    let folderName = '';
    let fileName = '';
    let filePath = '';

    bb.on('field', (name, value) => {
      if (name === 'folderName') folderName = value;
      if (name === 'fileName') fileName = value;
    });

    bb.on('file', (name, file, info) => {
      const tmpPath = path.join(os.tmpdir(), info.filename);
      filePath = tmpPath;
      file.pipe(fs.createWriteStream(tmpPath));
    });

    bb.on('close', async () => {
      try {
        const DROPBOX_TOKEN = await getDropboxAccessToken();
        const content = await fs.readFile(filePath);
        const basePath = `/forms/${folderName}`;

        await fetch("https://content.dropboxapi.com/2/files/upload", {
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
          body: content
        });

        await fs.unlink(filePath);
        res.status(200).json({ message: "File uploaded" });

      } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
      }
    });

    req.pipe(bb);
  } else {
    res.status(405).json({ error: 'Method Not Allowed' });
  }
}
