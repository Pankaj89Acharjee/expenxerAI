export async function createAndPopulateGoogleSheet(
  token: string,
  title: string,
  headers: string[],
  rows: string[][]
): Promise<[string | null, string | null]> {
  const mediaType = 'application/json; charset=utf-8';

  try {
    const createRes = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': mediaType },
      body: JSON.stringify({ properties: { title } }),
    });

    if (!createRes.ok) {
      const errBody = await createRes.text();
      return [null, `Failed to create Sheet: HTTP ${createRes.status}. Details: ${errBody}`];
    }

    const createJson = (await createRes.json()) as {
      spreadsheetId?: string;
      spreadsheetUrl?: string;
    };
    const spreadsheetId = createJson.spreadsheetId;
    const spreadsheetUrl = createJson.spreadsheetUrl;

    if (!spreadsheetId) return [null, 'No spreadsheetId returned.'];

    const values = [headers, ...rows];
    const updateRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Sheet1!A1?valueInputOption=USER_ENTERED`,
      {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': mediaType },
        body: JSON.stringify({ range: 'Sheet1!A1', majorDimension: 'ROWS', values }),
      }
    );

    if (!updateRes.ok) {
      const updateErr = await updateRes.text();
      return [spreadsheetUrl ?? null, `Sheet created, but failed to write data rows: HTTP ${updateRes.status}. ${updateErr}`];
    }

    return [spreadsheetUrl ?? null, null];
  } catch (e) {
    return [null, `Connection error: ${e instanceof Error ? e.message : String(e)}`];
  }
}

function composeMimeMessage(toEmail: string, subject: string, bodyHtml: string): string {
  const lines = [
    `To: ${toEmail}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=utf-8',
    '',
    bodyHtml,
  ];
  return lines.join('\r\n');
}

function base64UrlEncode(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function sendGmailReport(
  token: string,
  toEmail: string,
  subject: string,
  bodyHtml: string
): Promise<[boolean, string | null]> {
  try {
    const mimeMessage = composeMimeMessage(toEmail, subject, bodyHtml);
    const base64Message = base64UrlEncode(mimeMessage);

    const res = await fetch('https://gmail.googleapis.com/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({ raw: base64Message }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      return [false, `Failed to send Email via Gmail API: HTTP ${res.status}. Details: ${errBody}`];
    }
    return [true, null];
  } catch (e) {
    return [false, `Connection error: ${e instanceof Error ? e.message : String(e)}`];
  }
}
