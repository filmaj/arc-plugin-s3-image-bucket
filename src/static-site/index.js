let { bucketPath, bukkit } = require('../');
let { defaultLocalOptions } = require('../utils');

exports.handler = async request => {
  let object = request.params.proxy;
  let pathOnBucket = bucketPath.replace('{proxy}', object);
  return {
    statusCode: 301,
    headers: {
      location: `http://${defaultLocalOptions.address}:${defaultLocalOptions.port}/${bukkit}${pathOnBucket}`
    }
  };
};
