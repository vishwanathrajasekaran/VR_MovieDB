🎬 Vishwanath Movie DataBase

A personal movie & series database powered by Google Sheets + JavaScript.
Browse, search, and filter 2000+ titles in a clean UI.

⸻

🚀 Live Demo

👉 https://movies.vishwanathrajasekaran.in

⸻

📌 Features

* 🔍 Search by title, cast, director
* 🎭 Filter by genre, language, year, platform
* ⭐ Custom rating system (VR Rating)
* 🎬 Grid & list view toggle
* 📊 Dynamic stats (total titles, results count)
* ☁️ Live data from Google Sheets

⸻

🗂️ Project Structure
/project-root
  ├── index.html              # App structure
  ├── style.css               # UI styling
  ├── app.js                  # Core logic (filters, rendering)
  ├── google-sheets-loader.js # Fetches live data from Google Sheets

  ⸻

⚙️ How It Works

* google-sheets-loader.js fetches data using Google Sheets API
* Data is transformed into objects (window.MOVIES_DATA)
* app.js renders UI and applies filters

⸻

🔑 Google Sheets Setup

1. Create a Google Sheet
2. Make it public:
    * Share → Anyone with link → Viewer
3. Get:
    * Sheet ID (from URL)
    * Sheet Name (tab name)
4. Create API Key from Google Cloud

⸻

🔗 API Format
https://sheets.googleapis.com/v4/spreadsheets/{SHEET_ID}/values/{SHEET_NAME}?key={API_KEY}

⸻

⚠️ Important Notes

* Google Sheet must be public
* API key should be restricted to:
    * Your domain
    * *.vercel.app
* Direct API URL in browser may show 403 (expected)

⸻

🛠️ Deployment

Hosted using Vercel

Steps:

1. Push code to GitHub
2. Import repo in Vercel
3. Add custom domain (optional)

⸻

📈 Future Improvements

* Auto refresh without reload
* Watchlist tracking
* Backend integration
* User login system

⸻

👤 Author

Vishwanath Rajasekaran

⸻

⭐ Support

If you like this project, consider giving it a ⭐ on Git
