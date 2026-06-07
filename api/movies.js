export default async function handler(req, res) {
  try {
    const sheetId  = process.env.VITE_SHEET_ID;
    const apiKey   = process.env.VITE_SHEETS_API_KEY;

    // Debug — log what env vars look like (first 6 chars only, safe)
    console.log('SHEET_ID prefix:', sheetId ? sheetId.slice(0,6) : 'MISSING');
    console.log('API_KEY prefix:', apiKey ? apiKey.slice(0,6) : 'MISSING');

    if (!sheetId || !apiKey) {
      return res.status(500).json({ error: 'Missing environment variables', sheetId: !!sheetId, apiKey: !!apiKey });
    }

    const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/MasterSheet?key=${apiKey}`;
    console.log('Fetching:', url.replace(apiKey, 'REDACTED'));

    const resp = await fetch(url);
    const data = await resp.json();

    console.log('Sheets response status:', resp.status);
    console.log('Has values:', !!data.values, 'Row count:', data.values?.length);

    if (!resp.ok) {
      return res.status(resp.status).json({ error: 'Sheets API error', details: data });
    }

    res.setHeader('Cache-Control', 's-maxage=300');
    res.json(data);

  } catch (err) {
    console.error('api/movies error:', err);
    res.status(500).json({ error: err.message });
  }
}
