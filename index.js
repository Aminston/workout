// index.js
require('dotenv').config();
const app = require('./app');
const port = process.env.PORT || 3000;

// Optional health check
app.get('/health', (_, res) => res.send('OK'));

app.listen(port, () => {
  console.log(`🚀 Server listening on http://localhost:${port}`);
});
