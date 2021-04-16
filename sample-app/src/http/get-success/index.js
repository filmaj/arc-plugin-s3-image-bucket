let arc = require('@architect/functions');

exports.handler = arc.http.async(async function http (req) {
  // give the background lambda a sec to write the thumb..
  await new Promise(function delay (resolve) {
    setTimeout(resolve, 2000);
  });
  return {
    statusCode: 302,
    headers: {
      location: '/?uploaded'
    }
  };
});
