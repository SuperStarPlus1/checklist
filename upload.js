export const config = { runtime: "nodejs" };

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { folderName, fileName, fileData } = req.body;

  const DROPBOX_TOKEN = process.env.DROPBOX_TOKEN;
  const basePath = `/forms/${folderName}`;

  try {
    // שלב 1: אם זה שלב יצירת תיקיה בלבד
    if (!fileName && !fileData) {
      // בדיקה אם התיקיה קיימת
      const checkResp = await fetch("https://api.dropboxapi.com/2/files/get_metadata", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${DROPBOX_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ path: basePath })
      });

      if (checkResp.ok) {
        // אם קיימת - מוחקים אותה
        await fetch("https://api.dropboxapi.com/2/files/delete_v2", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${DROPBOX_TOKEN}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ path: basePath })
        });
      }

      // יוצרים תיקיה מחדש
      const createResp = await fetch("https://api.dropboxapi.com/2/files/create_folder_v2", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${DROPBOX_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ path: basePath, autorename: false })
      });

      if (!createResp.ok) {
        const error = await createResp.text();
        return res.status(500).json({ error });
      }

      return res.status(200).json({ message: "Folder prepared" });
    }

    // שלב 2: אם זה שלב העלאת קובץ
    if (!fileName || !fileData) {
      return res.status(400).json({ error: 'Missing file name or file data' });
    }

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
      body: Buffer.from(fileData, 'base64')
    });

    if (!uploadResp.ok) {
      const error = await uploadResp.text();
      return res.status(500).json({ error });
    }

    return res.status(200).json({ message: "File uploaded" });

  } catch (err) {
    console.error("Upload API Error:", err);
    return res.status(500).json({ error: err.message });
  }
}
