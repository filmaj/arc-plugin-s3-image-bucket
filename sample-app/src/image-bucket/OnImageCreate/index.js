let created = require('./created');

/**
 * receives a create event for raw/888-xxx
 * detects file type and writes orig/888-xxx.png
 * if the file type is png or jpg writes thumb/888-xxx.png
 * deletes raw/888-xxx
 */
exports.handler = async event => Promise.all(event.Records.map(created));
