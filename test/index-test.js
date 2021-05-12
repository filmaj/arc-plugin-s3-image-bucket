const plugin = require('../');
const { join } = require('path');
const inventory = require('@architect/inventory');
const { createFunction } = require('@architect/package');
const fs = require('fs-extra');
const sampleDir = join(__dirname, '..', 'sample-app');
const appDir = join(__dirname, 'tmp');
const originalCwd = process.cwd();
const cfn = { Resources: {
  HTTP: { Properties: { DefinitionBody: { paths: {} } } },
  Role: { Properties: { Policies: [] } }
} };

describe('plugin packaging function', () => {
  let inv = {};
  let arc = {};
  beforeAll(async () => {
    // Set up integration test directory as a copy of sample app
    const appPluginDir = join(appDir, 'node_modules', 'arc-plugin-s3-image-bucket');
    await fs.mkdirp(appPluginDir);
    await fs.copy(join(sampleDir, 'app.arc'), join(appDir, 'app.arc'));
    await fs.copy(join(__dirname, '..', 'index.js'), join(appPluginDir, 'index.js'));
    process.chdir(appDir);
    inv = await inventory({});
    arc = inv.inv._project.arc;
  });
  afterAll(async () => {
    process.chdir(originalCwd);
    await fs.remove(appDir);
  });
  describe('when not present in project', () => {
    it('should not modify the CloudFormation JSON', () => {
      const app = { ...arc };
      delete app['image-bucket'];
      const output = plugin.package({ arc: app, cloudformation: cfn, createFunction, inventory: inv });
      expect(JSON.stringify(output)).toBe(JSON.stringify(cfn));
    });
  });
  describe('when present in project', () => {
    it('should create a lambda function definition for each rule defined in the arc manifest', () => {
      const app = { ...arc };
      const output = plugin.package({ arc: app, cloudformation: cfn, createFunction, inventory: inv, stage: 'staging' });
      expect(output.Resources.ImageBucketOnImageCreatePluginLambda).toBeDefined();
      expect(output.Resources.ImageBucketOnImageCreatePluginLambda.Properties.Layers.length).toEqual(1);
    });
  });
});
