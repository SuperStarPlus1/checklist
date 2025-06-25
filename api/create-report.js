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
    throw new Error('Cannot refresh Dropbox token: ' + error);
  }

  const data = await res.json();
  return data.access_token;
}

async function createSharedLink(DROPBOX_TOKEN, path) {
  const res = await fetch("https://api.dropboxapi.com/2/sharing/create_shared_link_with_settings", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${DROPBOX_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ path })
  });

  if (res.ok) {
    const data = await res.json();
    return data.url.replace("?dl=0", "?raw=1");  // הפיכה ל־direct link
  } else {
    // יתכן שכבר יש לינק קיים -> נשתמש בו
    const existing = await fetch("https://api.dropboxapi.com/2/sharing/list_shared_links", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${DROPBOX_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ path })
    });

    const existingData = await existing.json();
    if (existingData.links && existingData.links.length > 0) {
      return existingData.links[0].url.replace("?dl=0", "?raw=1");
    } else {
      throw new Error("Cannot create or retrieve shared link for " + path);
    }
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { folderName, employeeName, sections } = req.body;
  if (!folderName || !employeeName || !sections) {
    return res.status(400).json({ error: 'Missing data' });
  }

  const DROPBOX_TOKEN = await getDropboxAccessToken();
  const basePath = `/forms/${folderName}`;

  let html = `
  <html lang="he" dir="rtl"><head><meta charset="UTF-8"><title>דוח</title>
  <style>
    body { font-family: sans-serif; text-align:center; direction:rtl; }
    table { width: 90%; border-collapse: collapse; margin: auto; margin-top: 20px; }
    th, td { border: 1px solid #aaa; padding: 10px; text-align: center; }
    .done { color: green; font-weight: bold; }
    .fail { color: red; font-weight: bold; }
    img { width:150px; margin:5px; }
  </style></head><body>
  <h2>דוח סגירת סניף</h2>
  <p><b>שם עובד:</b> ${employeeName}</p>
  <table><tr><th>סטטוס</th><th>סעיף</th></tr>`;

  for (const item of sections) {
    html += `<tr><td class="${item.done ? 'done' : 'fail'}">${item.done ? 'בוצע' : 'לא בוצע'}</td><td>${item.text}</td></tr>`;
    if (item.images && item.images.length > 0) {
      html += `<tr><td colspan="2">`;
      for (const img of item.images) {
        const imagePath = `${basePath}/${img}`;
        const imageLink = await createSharedLink(DROPBOX_TOKEN, imagePath);
        html += `<a href="${imageLink}" target="_blank"><img src="${imageLink}"></a>`;
      }
      html += `</td></tr>`;
    }
  }

  html += `</table></body></html>`;

  // מעלה את הדוח עצמו לדרופבוקס
  await fetch("https://content.dropboxapi.com/2/files/upload", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${DROPBOX_TOKEN}`,
      "Content-Type": "application/octet-stream",
      "Dropbox-API-Arg": JSON.stringify({
        path: `${basePath}/report.html`,
        mode: "overwrite",
        autorename: false
      })
    },
    body: Buffer.from(html, 'utf8')
  });

  // גם לקובץ הדוח עצמו נייצר קישור שיתוף
  const reportSharedLink = await createSharedLink(DROPBOX_TOKEN, `${basePath}/report.html`);

  res.status(200).json({ link: reportSharedLink });
}
