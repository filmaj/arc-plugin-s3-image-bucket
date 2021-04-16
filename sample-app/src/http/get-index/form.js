let s3 = require('./s3');

/**
 * render a direct to s3 file upload form
 *
 * @param {object} params
 * @param {string} params.redirect
 * @returns {DOMString}
 */
module.exports = function form ({ redirect, bucket, accessKey, secretKey, region }) {
  let nonce = Math.random().toString(36).replace(/[^a-z]+/g, '').substr(0, 3);
  let name = `${Date.now()}-${nonce}`;
  let key = `raw/${name}`;
  let type = 'image/';

  let config = {
    accessKey,
    secretKey,
    bucket,
    region
  };

  let doc = s3(config, { filename: key, contentType: type, redirect });
  let hidden = k => `<input type=hidden name=${k} value="${doc.params[k]}">`;

  return `
  <form action=${doc.endpoint} method=post enctype=multipart/form-data>
    ${Object.keys(doc.params).map(hidden).join('')}
    <!-- do the thing -->
    <input type=file name=file>
    <input type=submit name=submit value=Upload>
  </form>`;
};
