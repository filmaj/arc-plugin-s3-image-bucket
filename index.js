const createLambdaJSON = require('@architect/package/createLambdaJSON');
const { updater } = require('@architect/utils');
const { join } = require('path');
const update = updater('S3 Image Bucket', {});

module.exports = {
  package: function s3ImageBucketPackage ({ arc, cloudformation: cfn, /* stage = 'staging',*/ inventory }) {
    if (!arc['image-bucket']) return cfn;
    if (!cfn.Parameters) cfn.Parameters = {};
    cfn.Parameters.ImageBucketName = {
      Type: 'String',
      Default: `${arc.app}-image-bucket`
    };
    let options = opts(arc['image-bucket']);
    cfn.Resources.ImageBucket = {
      Type: 'AWS::S3::Bucket',
      Properties: {
        BucketName: {
          Ref: 'ImageBucketName'
        }
      }
    };
    if (options.StaticWebsite) {
      cfn.Resources.ImageBucket.Properties.WebsiteConfiguration = {};
      if (Array.isArray(options.StaticWebsite)) {
        let refs = options.StaticWebsite.slice(1);
        cfn.Resources.ImageBucketPolicy = {
          Type: 'AWS::S3::BucketPolicy',
          DependsOn: {
            Ref: 'ImageBucketName'
          },
          Properties: {
            Bucket: {
              Ref: 'ImageBucketName'
            },
            PolicyDocument: {
              Statement: [ {
                Action: [ 's3:GetObject' ],
                Effect: 'Allow',
                Resource: {
                  'Fn::Join': [
                    '',
                    [ 'arn:aws:s3:::', { Ref: 'ImageBucketName' }, '/*' ]
                  ]
                },
                Principal: '*',
                Condition: {
                  StringLike: {
                    'aws:Referer': refs
                  }
                }
              } ]
            }
          }
        };
      }
    }
    if (options.CORS) {
      cfn.Resources.ImageBucket.Properties.CorsConfiguration = {
        CorsRules: options.CORS
      };
    }
  },
  pluginFunctions: function s3ImageBucketLambdas ({ arc, inventory }) {
    if (!arc['image-bucket']) return [];
  }
};

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
        obj.CORS.push(opt[key]);
      } else {
        obj[key] = opt[key];
      }
    }
  }, {});
}
