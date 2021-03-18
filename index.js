/*
const { updater } = require('@architect/utils');
const update = updater('S3 Image Bucket', {});
*/
const { join } = require('path');
const createLambdaJSON = require('@architect/package/createLambdaJSON');

module.exports = {
  package: function s3ImageBucketPackage ({ arc, cloudformation: cfn, /* stage = 'staging',*/ inventory }) {
    if (!arc['image-bucket']) return cfn;
    let options = opts(arc['image-bucket']);
    const bukkit = `${arc.app}-image-buket`;
    // also export as SSM parameter for service discovery purposes
    cfn.Resources.ImageBucketParam = {
      Type: 'AWS::SSM::Parameter',
      Properties: {
        Type: 'String',
        Name: { 'Fn::Sub': '/${AWS::StackName}/imagebucket/name' },
        Value: bukkit
      }
    };
    // our glorious bucket
    cfn.Resources.ImageBucket = {
      Type: 'AWS::S3::Bucket',
      DependsOn: [],
      Properties: {
        BucketName: bukkit
      }
    };
    // give the overarching arc app role access to the bucket
    cfn.Resources.Role.Properties.Policies.push({
      PolicyName: 'ImageBucketAccess',
      PolicyDocument: {
        Statement: [ {
          Effect: 'Allow',
          Action: [
            's3:GetObject',
            's3:PutObject',
            's3:DeleteObject',
            's3:PutObjectAcl',
            's3:ListBucket'
          ],
          Resource: [ {
            'Fn::Join': [ '', [ 'arn:aws:s3:::', bukkit ] ]
          }, {
            'Fn::Join': [ '', [ 'arn:aws:s3:::', bukkit, '/*' ] ]
          } ]
        } ]
      }
    });
    // create a minimal IAM user that clients will use to upload to the bucket
    cfn.Resources.ImageBucketUploader = {
      Type: 'AWS::IAM::User',
      Properties: {}
    };
    // grand it minimal permissions to upload
    cfn.Resources.UploadMinimalPolicy = {
      Type: 'AWS::IAM::Policy',
      DependsOn: 'ImageBucket',
      Properties: {
        PolicyName: 'UploadPolicy',
        PolicyDocument: {
          Statement: [ {
            Effect: 'Allow',
            Action: [
              's3:PutObject',
              's3:PutObjectAcl'
            ],
            Resource: [ {
              'Fn::Join': [ '', [ 'arn:aws:s3:::', bukkit ] ]
            }, {
              'Fn::Join': [ '', [ 'arn:aws:s3:::', bukkit, '/*' ] ]
            } ]
          } ]
        },
        Users: [ { Ref: 'ImageBucketUploader' } ],
      }
    };
    // create a secret key that will be used by randos on the internet
    cfn.Resources.ImageBucketCreds = {
      Type: 'AWS::IAM::AccessKey',
      DependsOn: 'ImageBucketUploader',
      Properties: {
        UserName: { Ref: 'ImageBucketUploader' }
      }
    };
    // expose the key and secret for above user in the service map
    cfn.Resources.ImageBucketKeyParam = {
      Type: 'AWS::SSM::Parameter',
      Properties: {
        Type: 'String',
        Name: { 'Fn::Sub': '/${AWS::StackName}/imagebucket/accessKey' },
        Value: { Ref: 'ImageBucketCreds' }
      }
    };
    cfn.Resources.ImageBucketSecretParam = {
      Type: 'AWS::SSM::Parameter',
      Properties: {
        Type: 'String',
        Name: { 'Fn::Sub': '/${AWS::StackName}/imagebucket/secretKey' },
        Value: { 'Fn::GetAtt': [ 'ImageBucketCreds', 'SecretAccessKey' ] }
      }
    };

    // should the bucket be set up for static hosting?
    if (options.StaticWebsite) {
      cfn.Resources.ImageBucket.Properties.WebsiteConfiguration = {
        IndexDocument: 'index.html'
      };
      // TODO: optional referer conditions provided
      // let refs = options.StaticWebsite.slice(1);
      cfn.Resources.ImageBucketPolicy = {
        Type: 'AWS::S3::BucketPolicy',
        DependsOn: bukkit,
        Properties: {
          Bucket: bukkit,
          PolicyDocument: {
            Statement: [ {
              Action: [ 's3:GetObject' ],
              Effect: 'Allow',
              Resource: {
                'Fn::Join': [
                  '',
                  [ 'arn:aws:s3:::', bukkit, '/*' ]
                ]
              },
              Principal: '*'
              /*
              Condition: {
                StringLike: {
                  'aws:Referer': refs
                }
              }
              */
            } ]
          }
        }
      };
    }
    // CORS access rules for the bucket
    if (options.CORS) {
      cfn.Resources.ImageBucket.Properties.CorsConfiguration = {
        CorsRules: options.CORS
      };
    }
    // set up lambda triggers
    if (options.lambdas && options.lambdas.length) {
      // drop a reference to ImageMagick binaries as a Lamda Layer via a nested stack
      // App: https://serverlessrepo.aws.amazon.com/applications/arn:aws:serverlessrepo:us-east-1:145266761615:applications~image-magick-lambda-layer
      cfn.Resources.ImageMagick = {
        Type: 'AWS::Serverless::Application',
        Properties: {
          Location: {
            ApplicationId: 'arn:aws:serverlessrepo:us-east-1:145266761615:applications/image-magick-lambda-layer',
            SemanticVersion: '1.0.0'
          }
        }
      };
      // iterate over each lambda and add the plethora of CFN resources
      const cwd = inventory.inv._project.src;
      const lambdaConfigs = [];
      options.lambdas.forEach(lambda => {
        // set up the lambdas themselves
        let src = lambdaPath(cwd, lambda.name);
        let [ functionName, functionDefn ] = createLambdaJSON({ inventory, src });
        cfn.Resources[functionName] = functionDefn;
        // customize some things about the lambdas
        cfn.Resources[functionName].Properties.Runtime = 'nodejs10.x'; // the imagemagick layer requires node 10 :(
        // We get the below layer, which contains Image Magick binaries, from
        // the serverless 'application' we incorporated above
        cfn.Resources[functionName].Properties.Layers = [ { 'Fn::GetAtt': [ 'ImageMagick', 'Outputs.LayerVersion' ] } ];
        // set up the notification events from s3 to the lambdas
        let events = Object.keys(lambda.events);
        events.forEach(event => {
          let cfg = {
            Function: { 'Fn::GetAtt': [ functionName, 'Arn' ] },
            Event: event
          };
          if (lambda.events[event] && lambda.events[event].length) {
            cfg.Filter = { S3Key: { Rules: lambda.events[event].map(filterPair => ({ Name: filterPair[0], Value: filterPair[1] })) } };
          }
          lambdaConfigs.push(cfg);
        });
        // give the image bucket permission to invoke each lambda trigger
        const invokePerm = `${functionName}InvokePermission`;
        cfn.Resources[invokePerm] = {
          Type: 'AWS::Lambda::Permission',
          DependsOn: functionName,
          Properties: {
            FunctionName: { 'Fn::GetAtt': [ functionName, 'Arn' ] },
            Action: 'lambda:InvokeFunction',
            Principal: 's3.amazonaws.com',
            SourceAccount: { Ref: 'AWS::AccountId' },
            SourceArn: `arn:aws:s3:::${bukkit}`
          }
        };
        cfn.Resources.ImageBucket.DependsOn.push(invokePerm);
      });
      // wire up s3 notification events for lambdas
      cfn.Resources.ImageBucket.Properties.NotificationConfiguration = {
        LambdaConfigurations: lambdaConfigs
      };
    }
    // TODO: add the s3 bucket url to the cfn outputs. maybe take into account
    // `StaticWebsite` option and reflect the url based on that?
    return cfn;
  },
  pluginFunctions: function s3ImageBucketLambdas ({ arc, inventory }) {
    if (!arc['image-bucket']) return [];
    let options = opts(arc['image-bucket']);
    if (!options.lambdas || (Array.isArray(options.lambdas) && options.lambdas.length === 0)) return [];
    const cwd = inventory.inv._project.src;
    return options.lambdas.map(lambda => {
      return {
        src: lambdaPath(cwd, lambda.name),
        body: 'exports.handler = async function (event) { console.log(event); }'
      };
    });
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

function lambdaPath (cwd, name) {
  return join(cwd, 'src', 'image-bucket', name.length ? name : 'lambda');
}
