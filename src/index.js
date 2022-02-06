const { join } = require('path');
const { updater } = require('@architect/utils');
const update = updater('S3 Image Bucket', {});

const deploy = require('./deploy');
const sandbox = require('./sandbox');
const { getBucketName, lambdaPath, opts } = require('./utils');
let bucketPath, bukkit;

module.exports = {
  set: {
    http: function localStaticSite ({ arc, inventory }) {
      let { deployStage } = inventory.inv._project;
      if (!arc['image-bucket'] || deployStage) return;

      let options = opts(arc['image-bucket']);
      bukkit = getBucketName(arc.app, 'testing');
      // TODO: static website proxy support
      if (options?.StaticWebsite?.Map) {
        // convert API Gateway proxy syntax to Router path param syntax
        let imgRequestPath = options.StaticWebsite.Map[0].replace('{proxy+}', ':proxy');
        update.status(`Mounting ${imgRequestPath} as proxy to local S3 Image Bucket`);
        // Set up a proxy on the sandbox http server to our s3rver bucket
        return {
          method: 'get',
          path: imgRequestPath,
          src: join(__dirname, 'static-site')
        };
      }
    },
    customLambdas: function s3ImageBucketLambdas ({ arc, inventory }) {
      if (!arc['image-bucket']) return [];
      let options = opts(arc['image-bucket']);
      if (!options.lambdas || (Array.isArray(options.lambdas) && options.lambdas.length === 0)) return [];
      const { cwd } = inventory.inv._project;
      return options.lambdas.map(({ name }) => {
        return {
          name,
          src: lambdaPath(cwd, name),
          config: {
            runtime: 'nodejs12.x' // the imagemagick layer requires node 12.x :(
          }
        };
      });
    },
  },
  deploy,
  sandbox,
  opts,
  bukkit,
  bucketPath,
};
