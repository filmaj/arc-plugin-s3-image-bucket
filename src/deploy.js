const { getBucketName, lambdaPath, opts } = require('./utils');

module.exports = {
  services: function s3ImageBucketVars ({ arc, stage }) {
    if (!arc['image-bucket']) return {};
    const isLocal = stage === 'testing';
    // expose the key and secret for above user in the service map
    return {
      accessKey: isLocal ? 'S3RVER' : { Ref: 'ImageBucketCreds' },
      name: isLocal ? getBucketName(arc.app, stage) : { Ref: 'ImageBucket' },
      secretKey: isLocal ? 'S3RVER' : { 'Fn::GetAtt': [ 'ImageBucketCreds', 'SecretAccessKey' ] }
    };
  },
  start: function s3ImageBucketPackage ({ arc, cloudformation: cfn, inventory, createFunction, stage }) {
    if (!arc['image-bucket']) return cfn;
    let options = opts(arc['image-bucket']);
    // we have to assign a name to the bucket otherwise we get a circular dependency between lambda, role and bucket.
    // see https://aws.amazon.com/blogs/infrastructure-and-automation/handling-circular-dependency-errors-in-aws-cloudformation/
    const bukkit = getBucketName(arc.app, stage);
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
    // grant it minimal permissions to upload
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

    // should the bucket be set up for static hosting?
    if (options.StaticWebsite) {
      cfn.Resources.ImageBucket.Properties.WebsiteConfiguration = {
        IndexDocument: 'index.html'
      };
      // TODO: support optional referer conditions provided ?
      // TODO: support exposing only particular sub-paths of the bucket?
      cfn.Resources.ImageBucketPolicy = {
        Type: 'AWS::S3::BucketPolicy',
        DependsOn: 'ImageBucket',
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
      if (inventory.inv.http && options.StaticWebsite.Map) {
        // wire the image bucket up to api gateway
        const [ httpRoute, bucketRoute ] = options.StaticWebsite.Map;
        cfn.Resources.HTTP.Properties.DefinitionBody.paths[httpRoute] = {
          get: {
            'x-amazon-apigateway-integration': {
              payloadFormatVersion: '1.0',
              type: 'http_proxy',
              httpMethod: 'GET',
              uri: {
                'Fn::Join': [ '', [
                  'http://',
                  bukkit,
                  '.s3.',
                  {
                    'Fn::Sub': [ '${AWS::Region}.amazonaws.com${proxy}', {
                      proxy: bucketRoute
                    } ]
                  }
                ] ]
              },
              connectionType: 'INTERNET',
              timeoutInMillis: 30000
            }
          }
        };
      }
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
        let [ functionName, functionDefn ] = createFunction({ inventory, src });
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
            SourceArn: { 'Fn::Join': [ '', [
              'arn:aws:s3:::',
              bukkit
            ] ] }
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
    // see outputs of
    // https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/quickref-s3.html#scenario-s3-bucket-website for ideas
    return cfn;
  },
};
