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
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { folderName } = req.body;
  if (!folderName) return res.status(400).json({ error: 'Missing folderName' });

  const filePath = `/forms/${folderName}/report.html`;

  try {
    const DROPBOX_TOKEN = await getDropboxAccessToken();

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
