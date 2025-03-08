const http = require('http');
const { processComplianceAlerts } = require('./compliance-processor');

function createServer() {
  return http.createServer(async (req, res) => {
    // Allow CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle OPTIONS request for CORS preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host}`);
    
    // Health check endpoint for Render
    if (url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'healthy',
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
      }));
      return;
    }
    
    // Manual trigger endpoint
    if (url.pathname === '/run') {
      try {
        const result = await processComplianceAlerts();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          processed: result.processed,
          newAlerts: result.newAlerts.length,
          timestamp: new Date().toISOString()
        }));
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: false,
          error: error.message
        }));
      }
      return;
    }

    // Default route
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`
      <html>
        <head>
          <title>Compliance Monitor Service</title>
          <style>
            body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
            pre { background: #f4f4f4; padding: 10px; border-radius: 5px; }
            button { padding: 10px 15px; background: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer; }
            button:hover { background: #45a049; }
          </style>
        </head>
        <body>
          <h1>Compliance Monitor Service</h1>
          <p>Service is running. Checks are performed every 20 minutes.</p>
          <p>Last check: <span id="lastCheck">Loading...</span></p>
          <p>
            <button onclick="runCheck()">Run Manual Check</button>
          </p>
          <h2>API Endpoints:</h2>
          <ul>
            <li><code>/health</code> - Health check endpoint</li>
            <li><code>/run</code> - Manually trigger a compliance check</li>
          </ul>
          <div id="result"></div>
          <script>
            async function runCheck() {
              document.getElementById('result').innerHTML = '<p>Running check...</p>';
              try {
                const response = await fetch('/run');
                const data = await response.json();
                document.getElementById('result').innerHTML = '<h3>Check Results:</h3><pre>' + JSON.stringify(data, null, 2) + '</pre>';
                document.getElementById('lastCheck').textContent = data.timestamp;
              } catch (error) {
                document.getElementById('result').innerHTML = '<p>Error: ' + error.message + '</p>';
              }
            }

            // Update last check time
            fetch('/health')
              .then(response => response.json())
              .then(data => {
                document.getElementById('lastCheck').textContent = data.timestamp;
              });
          </script>
        </body>
      </html>
    `);
  });
}

module.exports = { createServer };