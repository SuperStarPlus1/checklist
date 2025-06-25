export const config = { runtime: "nodejs" };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { folderName } = req.body;
  if (!folderName) return res.status(400).json({ error: 'Missing folderName' });

  const DROPBOX_TOKEN = process.env.DROPBOX_TOKEN;
  const filePath = `/forms/${folderName}/report.html`;

  try {
    // יצירת קישור שיתוף
    const createResponse = await fetch("https://api.dropboxapi.com/2/sharing/create_shared_link_with_settings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${DROPBOX_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ path: filePath, settings: { requested_visibility: "public" } })
    });

    const createResult = await createResponse.json();
    if (!createResponse.ok) return res.status(500).json(createResult);

    const link = createResult.url.replace("?dl=0", "?raw=1");
    res.status(200).json({ link });

  } catch (err) {
    console.error("Share error:", err);
    res.status(500).json({ error: err.message });
  }
}
