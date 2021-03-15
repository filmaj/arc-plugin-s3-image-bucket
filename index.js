/*
const { updater } = require('@architect/utils');
const update = updater('S3 Image Bucket', {});
*/
const { join } = require('path');
const createLambdaJSON = require('@architect/package/createLambdaJSON');

module.exports = {
  package: function s3ImageBucketPackage ({ arc, cloudformation: cfn, /* stage = 'staging',*/ inventory }) {
    if (!arc['image-bucket']) return cfn;
    if (!cfn.Parameters) cfn.Parameters = {};
    let options = opts(arc['image-bucket']);
    cfn.Parameters.ImageBucketName = {
      Type: 'String',
      Default: `${arc.app}-image-bucket`
    };
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
            Function: { 'Fn:GetAtt': [ functionName, 'Arn' ] },
            Event: event
          };
          if (lambda.events[event] && lambda.events[event].length) {
            cfg.Filter = { S3Key: { Rules: lambda.events[event] } };
          }
          lambdaConfigs.push(cfg);
        });
        // give the image bucket permission to invoke each lambda trigger
        cfn.Resources[`${functionName}InvokePermission`] = {
          Type: 'AWS::Lambda::Permission',
          Properties: {
            FunctionName: { 'Fn:GetAtt': [ functionName, 'Arn' ] },
            Action: 'lambda:InvokeFunction',
            Principal: 's3.amazonaws.com',
            SourceArn: {
              'Fn::Join': [ '', [ 'arn:aws:s3:::', { Ref: 'ImageBucketName' }, '/*' ] ]
            }
          }
        };
      });
      // wire up s3 notification events for lambdas
      cfn.Resources.ImageBucket.Properties.NotificationConfiguration = {
        LambdaConfigurations: lambdaConfigs
      };
    }
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
        obj.CORS.push(opt[key]);
      } else if (key.startsWith('Lambda')) {
        if (!obj.lambdas) obj.lambdas = [];
        let lambda = {
          name: key.replace(/^Lambda/, ''),
          events: {}
        };
        let props = opt[key];
        let sortedProps = Object.keys(props).sort(a => a.indexOf('.')); // sort events before filtering rules (which rely on events)
        sortedProps.forEach(p => {
          if (p.indexOf('.')) {
            // handle filtering rule
            let names = p.split('.');
            let eventName = names[0];
            lambda.events[eventName].push({ Name: props[p][0], Value: props[p][1] });
          } else {
            // handle event
            lambda.events[props[p]] = [];
          }
        });
        obj.lambdas.push(lambda);
      } else {
        obj[key] = opt[key];
      }
    }
  }, {});
}

function lambdaPath (cwd, name) {
  return join(cwd, 'src', 'image-bucket', name.length ? name : 'lambda');
}
