# Series Cast & Crew Platform

हर web series का अलग cast & crew database, और हर series का अपना shareable form link।

## Run
```bash
ADMIN_PASSWORD=yourpassword npm start     # http://localhost:3000
```
- `/` → admin dashboard (password login): series बनाएँ, series पर click करके पूरा database देखें
  (department tabs, search, CSV export, print, delete)
- `/s/<slug>` → public form link (हर series का अलग) जो cast & crew को भेजना है
- Data `data/db.json` में और selfies `data/uploads/` में save होती हैं (इस folder का backup रखें)।

Departments/designations बदलने के लिए `config.js` edit करें।
