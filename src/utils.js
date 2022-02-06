const { join } = require('path');

const defaultLocalOptions = {
  port: 4569,
  address: 'localhost',
  directory: './buckets', // TODO maybe use os.tmpdir and clean up on shutdown?
  accessKeyId: 'S3RVER',
  secretAccessKey: 'S3RVER',
  allowMismatchedSignatures: true,
  resetOnClose: true
};

// use a global for bucket name so that the various plugin methods, when running in sandbox, generate a bucket name once and reuse that
let bukkit;
function getBucketName (appname, stage) {
  if (bukkit) return bukkit;
  bukkit = generateBucketName(appname[0], stage);
  return bukkit;
}

function generateBucketName (app, stage) {
  // this can be tricky as S3 Bucket names can have a max 63 character length
  // so the math ends up like this:
  // - ${stage} can have a max length of 10 (for "production") - tho even this
  //   is not exact as custom stage names can be provided and could be longer!
  // - "-img-bucket-" is 12
  // - account IDs are 12 digits
  // = 34 characters
  // that leaves 29 characters for the app name
  // so lets cut it off a bit before that
  let appLabel = app.substr(0, 24);
  if (stage === 'testing') {
    // In sandbox, we need to provide a simple string for the S3 mock server
    return `${appLabel}-${stage}-img-bucket-123456789012`;
  }
  // For cloudformation, though, we need to use the Sub function to sub in the
  // AWS account ID
  return {
    'Fn::Sub': `${appLabel}-${stage}-img-bucket-\${AWS::AccountId}`
  };
}

function lambdaPath (cwd, name) {
  return join(cwd, 'src', 'image-bucket', name.length ? name : 'lambda');
}

function opts (pragma) {
  return pragma.reduce((obj, opt) => {
    if (Array.isArray(opt)) {
      if (opt.length > 2) {
        obj[opt[0]] = opt.slice(1);
      } else {
        obj[opt[0]] = opt[1];
      }
    } else if (typeof opt === 'string') {
      obj[opt] = true;
    } else {
      let key = Object.keys(opt)[0];
      if (key.startsWith('CORS')) {
        if (!obj.CORS) obj.CORS = [];
        let corsRules = opt[key];
        Object.keys(corsRules).forEach(k => {
          // All CORS options must be arrays, even for singular items
          if (typeof corsRules[k] === 'string') corsRules[k] = [ corsRules[k] ];
        });
        obj.CORS.push(opt[key]);
      } else if (key.startsWith('Lambda')) {
        if (!obj.lambdas) obj.lambdas = [];
        let lambda = {
          name: key.replace(/^Lambda/, ''),
          events: {}
        };
        let props = opt[key];
        let lambdaKeys = Object.keys(props);
        lambdaKeys.forEach(eventName => {
          let filterPairs = props[eventName];
          lambda.events[eventName] = [];
          for (let i = 0; i < filterPairs.length - 1; i++) {
            if (i % 2 === 1) continue;
            lambda.events[eventName].push([ filterPairs[i], filterPairs[i + 1] ]);
          }
        });
        obj.lambdas.push(lambda);
      } else {
        obj[key] = opt[key];
      }
    }
    return obj;
  }, {});
}

module.exports = {
  defaultLocalOptions,
  getBucketName,
  generateBucketName,
  lambdaPath,
  opts,
};
