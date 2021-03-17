let arc = require('@architect/functions');

async function getIndex () {
  if (!arc.services) await arc._loadServices();
  return {
    headers: {
      'cache-control': 'no-cache, no-store, must-revalidate, max-age=0, s-maxage=0',
      'content-type': 'text/html; charset=utf8'
    },
    body: `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>Architect w/ S3 Image Bucket Example</title>
      <link rel="stylesheet" href="${arc.static('app.css')}">
    </head>
    <body>
    <h1>Hi there</h1>
    <p>Still testing this big time.</p>
    <h3>Service discovery list:</h3>
    <pre><code>
    ${JSON.stringify(arc.services, null, 2)}
    </code></pre>
    </body>
    </html>`
  };
}

exports.handler = arc.http.async(getIndex);
