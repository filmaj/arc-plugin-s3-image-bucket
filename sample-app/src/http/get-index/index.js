let arc = require('@architect/functions');
let form = require('./form');
const aws = require('aws-sdk');

async function getIndex (req) {
  if (!arc.services) await arc._loadServices();
  const redirect = `https://${req.headers.Host || req.headers.host}/success`;
  const { name, accessKey, secretKey } = arc.services.imagebucket;
  const region = process.env.AWS_REGION;
  const upload = form({ redirect, bucket: name, accessKey, secretKey, region });
  const s3 = new aws.S3;
  const images = await s3.listObjects({ Bucket: name, Prefix: 'thumb/' }).promise();
  const imgTags = images.Contents.map(i => i.Key.replace('thumb/', '/img/')).map(i => `<img src="${i}" />`).join('\n');
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
    <h1>And here are all the previously uploaded images:</h1>
    ${imgTags}
    </body>
    </html>`
  };
}

exports.handler = arc.http.async(getIndex);
