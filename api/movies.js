export default async function handler(req, res) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${process.env.VITE_SHEET_ID}/values/MasterSheet?key=${process.env.VITE_SHEETS_API_KEY}`;
  const resp = await fetch(url);
  const data = await resp.json();
  res.setHeader('Cache-Control', 's-maxage=300');
  res.json(data);
}
