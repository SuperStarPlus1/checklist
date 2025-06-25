import formidable from 'formidable';
import fs from 'fs/promises';

export const config = {
  api: {
    bodyParser: false,
  },
};

const DROPBOX_TOKEN = process.env.DROPBOX_TOKEN;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  const form = new formidable.IncomingForm({ multiples: true, keepExtensions: true });
  form.parse(req, async (err, fields, files) => {
    if (err) {
      res.status(500).json({ error: 'Error parsing form data' });
      return;
    }

    const workerName = fields.workerName || 'ללא שם';
    const section1 = fields.section1 ? 'בוצע' : 'לא בוצע';
    const section2 = fields.section2 ? 'בוצע' : 'לא בוצע';
    const dateStr = new Date().toISOString().split('T')[0];
    const folderPath = `/FORMS/${dateStr}`;

    await fetch('https://api.dropboxapi.com/2/files/create_folder_v2', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${DROPBOX_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ path: folderPath, autorename: true })
    });

    const images = Array.isArray(files.imageUpload) ? files.imageUpload : [files.imageUpload];
    for (const file of images) {
      const data = await fs.readFile(file.filepath);
      await fetch('https://content.dropboxapi.com/2/files/upload', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${DROPBOX_TOKEN}`,
          'Dropbox-API-Arg': JSON.stringify({ path: `${folderPath}/${file.originalFilename}`, mode: 'add', autorename: true }),
          'Content-Type': 'application/octet-stream'
        },
        body: data
      });
    }

    const reportHtml = `
      <html><body>
      <h1>רשימת תיוג ליום ${dateStr}</h1>
      <p>שם עובד: ${workerName}</p>
      <p>סעיף ראשון: ${section1}</p>
      <p>סעיף שני: ${section2}</p>
      </body></html>`;

    await fetch('https://content.dropboxapi.com/2/files/upload', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${DROPBOX_TOKEN}`,
        'Dropbox-API-Arg': JSON.stringify({ path: `${folderPath}/report.html`, mode: 'add', autorename: true }),
        'Content-Type': 'application/octet-stream'
      },
      body: Buffer.from(reportHtml, 'utf8')
    });

    const shareRes = await fetch('https://api.dropboxapi.com/2/sharing/create_shared_link_with_settings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${DROPBOX_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ path: `${folderPath}/report.html` })
    });

    const shareData = await shareRes.json();
    res.status(200).json({ sharedLink: shareData.url });
  });
}
