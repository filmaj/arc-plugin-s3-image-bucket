const { updater } = require('@architect/utils');
const update = updater('S3 Image Bucket', {});
const { join } = require('path');
const S3rver = require('s3rver');
let s3Instance = null;

const defaultLocalOptions = {
  port: 4569,
  address: 'localhost',
  directory: './buckets', // TODO maybe use os.tmpdir and clean up on shutdown?
  accessKeyId: 'S3RVER',
  secretAccessKey: 'S3RVER',
  allowMismatchedSignatures: true,
  resetOnClose: true
};

module.exports = {
  variables: function s3ImageBucketVars ({ arc, stage }) {
    if (!arc['image-bucket']) return {};
    const isLocal = stage === 'testing';
    // expose the key and secret for above user in the service map
    return {
      accessKey: isLocal ? 'S3RVER' : { Ref: 'ImageBucketCreds' },
      name: isLocal ? getBucketName(arc.app, stage) : { Ref: 'ImageBucket' },
      secretKey: isLocal ? 'S3RVER' : { 'Fn::GetAtt': [ 'ImageBucketCreds', 'SecretAccessKey' ] }
    };
  },
  package: function s3ImageBucketPackage ({ arc, cloudformation: cfn, inventory, createFunction, stage }) {
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
  functions: function s3ImageBucketLambdas ({ arc, inventory }) {
    if (!arc['image-bucket']) return [];
    let options = opts(arc['image-bucket']);
    if (!options.lambdas || (Array.isArray(options.lambdas) && options.lambdas.length === 0)) return [];
    const cwd = inventory.inv._project.src;
    return options.lambdas.map(lambda => {
      return {
        src: lambdaPath(cwd, lambda.name),
        body: `exports.handler = async function (event) {
  // remember this is nodev10 running in here!
  console.log(event);
}`
      };
    });
  },
  sandbox: {
    start: async function ({ arc, inventory, services, invokeFunction }) {
      if (!arc['image-bucket']) return;
      const bukkit = getBucketName(arc.app, 'testing');
      let options = opts(arc['image-bucket']);
      let s3rverOptions = { configureBuckets: [ { name: bukkit } ], ...defaultLocalOptions };
      // TODO: static website proxy support
      if (options.StaticWebsite && options.StaticWebsite.Map) {
        // Configure s3rver for static hosting
        s3rverOptions.configureBuckets[0].configs = [ '<WebsiteConfiguration xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><IndexDocument><Suffix>index.html</Suffix></IndexDocument></WebsiteConfiguration>' ];
        // convert API Gateway proxy syntax to Router path param syntax
        let imgRequestPath = options.StaticWebsite.Map[0].replace('{proxy+}', ':proxy');
        let bucketPath = options.StaticWebsite.Map[1];
        update.status(`Mounting ${imgRequestPath} as proxy to local S3 Image Bucket`);
        // Set up a proxy on the sandbox http server to our s3rver bucket
        services.http.get(imgRequestPath, (req, res) => {
          let object = req.params.proxy;
          let pathOnBucket = bucketPath.replace('{proxy}', object);
          res.statusCode = 301;
          res.setHeader('Location', `http://${defaultLocalOptions.address}:${defaultLocalOptions.port}/${bukkit}${pathOnBucket}`);
          res.end('\n');
        });
      }
      s3Instance = new S3rver(s3rverOptions);
      update.start('Starting up S3rver...');
      await s3Instance.run();
      update.done('S3rver for S3 Image Bucket started.');
      if (options.lambdas && options.lambdas.length) {
        const cwd = inventory.inv._project.src;
        s3Instance.on('event', (e) => {
          console.log('s3rver event', e);
          const record = e.Records[0];
          const { eventName } = record;
          let triggerParts = eventName.split(':');
          let triggerEvt = triggerParts[0]; // i.e. ObjectCreated or ObjectRemoved
          let triggerApi = triggerParts[1]; // i.e. *, Put, Post, Copy
          update.status(`S3 ${triggerEvt}:${triggerApi} event for key ${record.s3.object.key} received!`);
          let lambdasToTrigger = [];
          options.lambdas.forEach(l => {
            Object.keys(l.events).forEach(e => {
              let eventParts = e.split(':');
              // TODO: prefix and suffix support
              let evt = eventParts[1]; // i.e. ObjectCreated or ObjectRemoved
              let api = eventParts[2]; // i.e. *, Put, Post, Copy
              if (evt === triggerEvt && (api === '*' || triggerApi === api)) {
                if (!lambdasToTrigger.includes(l)) lambdasToTrigger.push(l);
              }
            });
          });
          if (lambdasToTrigger.length) {
            lambdasToTrigger.forEach(lambda => {
              const src = join(cwd, 'src', 'image-bucket', lambda.name);
              update.status(`Invoking lambda ${src}...`);
              invokeFunction({ src, payload: e }, (err) => {
                if (err) update.error(`Error invoking image-bucket S3 trigger at ${src}!`, err);
              });
            });
          }
        });
      }
    },
    end: async function ({ arc }) {
      if (!arc['image-bucket']) return;
      update.start('Shutting down S3rver for Image Bucket...');
      try {
        await s3Instance.close();
        update.done('S3rver gracefully shut down.');
      } catch (e) {
        update.error('Error closing down S3rver!', e);
      }
    }
  },
  opts
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
