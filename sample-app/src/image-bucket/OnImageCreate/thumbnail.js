let aws = require('aws-sdk')
let gm = require('gm')

const MAX_WIDTH = 100
const MAX_HEIGHT = 100

/**
 * if ext is jpg or png write thumb/filename.(png|jpg)
 *
 * @param {string} bucket
 * @param {string} key
 * @param {string} mime
 * @param {string} ext
 * @param {Buffer} body
 * @returns {Promise}
 */
module.exports = function thumbnail({bucket, key, mime, ext, body, s3}) {

  // early exit if this isn't an image
  let thumb = ext === 'jpg' || ext === 'png'
  if (!thumb)
    return Promise.resolve()

  // if it is an image resize it
  return new Promise(function argh(res, rej) {
    let mg = gm.subClass({imageMagick: true})
    mg(body).size(function size(err, size) {
      if (err) rej(err)
      else {

        let scaling = Math.min(MAX_WIDTH / size.width, MAX_HEIGHT / size.height)
        let width  = scaling * size.width
        let height = scaling * size.height

        // resize the file buffer
        this.resize(width, height).toBuffer(ext, function resize(err, buffer) {
          if (err) rej(err)
          else {

            // write the buffer to s3 under thumb/
            s3.putObject({
              ContentType: mime,
              Bucket: bucket,
              Key: key.replace('raw/', 'thumb/') + '.' + ext,
              Body: buffer
            }).promise().then(res).catch(rej)
          }
        })
      }
    })
  })
}
