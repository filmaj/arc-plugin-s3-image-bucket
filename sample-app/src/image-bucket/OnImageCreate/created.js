let aws = require('aws-sdk');
let fileType = require('file-type');
let thumbnail = require('./thumbnail');

/**
 * process one create event
 */
module.exports = function created (record) {
  return new Promise(function ugh (resolve, reject) {

    let s3 = new aws.S3;

    // read the uploaded file
    s3.getObject({
      Bucket: record.s3.bucket.name,
      Key: record.s3.object.key
    }).promise().then(function read (result) {

      // guess the uploaded filetype
      let guess = fileType(result.Body);

      // write the orig with correct ContentType and extension
      let orig = s3.putObject({
        ContentType: guess.mime,
        Bucket: record.s3.bucket.name,
        Key: record.s3.object.key.replace('raw/', 'orig/') + '.' + guess.ext,
        Body: result.Body
      }).promise();

      // cleanup the raw uploaded blob
      let clean = s3.deleteObject({
        Bucket: record.s3.bucket.name,
        Key: record.s3.object.key
      }).promise();

      // thumbnail if its an image
      let thumb = thumbnail({
        bucket: record.s3.bucket.name,
        key: record.s3.object.key,
        mime: guess.mime,
        ext: guess.ext,
        body: result.Body
      });

      return Promise.all([ orig, clean, thumb ]);
    }).catch(reject);
  });
};
