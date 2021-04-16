const aws = require('aws-sdk');

module.exports = async function (arc) {
  let config;
  if (process.env.NODE_ENV === 'testing') {
    let services = await arc.services();
    const { accessKey, secretKey } = services['arc-plugin-s3-image-bucket'];
    config = {
      s3ForcePathStyle: true,
      accessKeyId: accessKey,
      secretAccessKey: secretKey,
      endpoint: new aws.Endpoint('http://localhost:4569')
    };
  }
  return new aws.S3(config);
};
