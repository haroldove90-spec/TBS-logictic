const fs = require('fs');
let content = fs.readFileSync('pages/AdminDashboard.tsx', 'utf8');
content = content.replace(/odometer_anterior.*?null,/g, '');
fs.writeFileSync('pages/AdminDashboard.tsx', content);
