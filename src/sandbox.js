const { join } = require('path');
const { updater } = require('@architect/utils');
const S3rver = require('s3rver');
const update = updater('S3 Image Bucket', {});
const { defaultLocalOptions, getBucketName, opts } = require('./utils');

let s3Instance = null;

module.exports = {
  start: async function ({ arc, inventory, invoke }) {
    if (!arc['image-bucket']) return;
    let options = opts(arc['image-bucket']);
    const bukkit = getBucketName(arc.app, 'testing');
    let s3rverOptions = { configureBuckets: [ { name: bukkit } ], ...defaultLocalOptions };

    // TODO: static website proxy support
    if (options?.StaticWebsite?.Map) {
      // Configure s3rver for static hosting
      s3rverOptions.configureBuckets[0].configs = [ '<WebsiteConfiguration xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><IndexDocument><Suffix>index.html</Suffix></IndexDocument></WebsiteConfiguration>' ];
    }
    s3Instance = new S3rver(s3rverOptions);
    update.start('Starting up S3rver...');
    await s3Instance.run();
    update.done('S3rver for S3 Image Bucket started.');

    if (options?.lambdas?.length) {
      const { cwd } = inventory.inv._project;
      s3Instance.on('event', (event) => {
        const record = event.Records[0];
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
          lambdasToTrigger.forEach(({ name }) => {
            const src = join(cwd, 'src', 'image-bucket', name);
            update.status(`Invoking lambda ${src}...`);
            invoke({ pragma: 'customLambdas', name, payload: event }, (err) => {
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
    } catch (err) {
      update.error('Error closing down S3rver!', err);
    }
  }
};
