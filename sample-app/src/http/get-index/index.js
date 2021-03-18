let arc = require('@architect/functions');
let form = require('./form');

async function getIndex (req) {
  if (!arc.services) await arc._loadServices();
  console.log(arc.services);
  const redirect = `https://${req.headers.Host || req.headers.host}/success`;
  const { name, accessKey, secretKey } = arc.services.imagebucket;
  const region = process.env.AWS_REGION;
  const upload = form({ redirect, bucket: name, accessKey, secretKey, region });
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
    <h1>Hi! Upload something directly from the browser to the S3 bucket.</h1>
    ${upload}
    </body>
    </html>`
  };
}

exports.handler = arc.http.async(getIndex);
