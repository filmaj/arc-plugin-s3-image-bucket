# arc-plugin-s3-image-bucket

> [Architect](arc.codes) serverless framework plugin that creates an S3 bucket that users can upload to directly, with optional Lambda triggers

This plugin enables your [arc.codes](arc.codes) app to define an S3 bucket with
specific CORS rules, static asset hosting and/or Lambda triggers. It bundles native
ImageMagick binaries into any Lambda triggers it defines via the use of a Lambda
Layer.

With this combination, you can enable direct-to-bucket uploads from
clients accessing your webapp by providing a server-side API that generates
a time-limited signed set of parameters to the client used to issue POST
requests containing binary payloads directly to the S3 bucket.

This plugin takes heavy inspiration from @brianleroux's
[macro-upload](https://github.com/architect/macro-upload) Architect macro, which
itself is based on [Leonid Shevtov's deep dive into enabling direct-from-client
S3 uploads using browser-based POST requests to
S3](https://leonid.shevtsov.me/post/demystifying-s3-browser-upload/).

## Installation

1. Install this plugin: `npm i arc-plugin-s3-image-bucket`

2. Then add the following line to the `@plugins` pragma in your Architect project manifest (usually `app.arc`):

        @plugins
        arc-plugin-s3-image-bucket

3. Add a new `@image-bucket` pragma, and provide any of the options to customize
   your bucket, any Lambda triggers and their behaviours. See the
   [Usage](#usage) section for details.
4. If you defined any Lambda triggers, run `arc create` to generate the source
   directories for the Lambda triggers.
5. Edit each trigger Lambda's `index.js` file, just as you would any classic arc
   `@http`, `@events`, etc. function.
6. Run locally via `arc sandbox`, or deploy to AWS with `arc deploy`.

## Usage

This plugin creates a single S3 bucket and wires up any number of Lambdas that
trigger on events created by the bucket. To use the below options, specify them,
unindented, directly under the `@image-bucket` pragma in your `app.arc` file.

|Option|Description|Example|
|---|---|---|
|`StaticWebsite`|Configures static hosting for assets housed in the bucket. Useful for serving user-uploaded content directly from the bucket. You can optionally specify one or more URL patterns after this property to denote [referrer conditions][ref-condition] that must be obeyed on GET requests to the contents of the bucket (see the `Condition` property at the end of [this S3 Policy example][ref-docs] for details). **NOTE**: this will expose your bucket contents to the internet!|`StaticWebsite https://staging.myapp.com/*`|
|`CORS<index>`|Configure CORS rules for the bucket. The property name _must_ start with `CORS`. If you want to include multiple CORS rules, then each CORS property name must be unique and thus needs a unique suffix (i.e. `CORS1`, `CORS2`, etc.). Specify the [AWS Cloudformation-supported S3 CORS Rules Properties][cors], indented and one per line, below the CORS property name.|<pre>CORS1<br>&nbsp;&nbsp;AllowedHeaders *<br>AllowedMethods GET POST<br>AllowedOrigins *<br>CORS2<br>&nbsp;AllowedHeaders *<br>&nbsp;&nbsp;AllowedMethods PUT<br>AllowedOrigins https://staging.myapp.com</pre>|
|`Lambda<index>`|Configure Lambda notification triggers for the bucket. The property name _must_ start with `Lambda`. Each Lambda _must_ specify at least one sub-property indented below the `Lambda` of the form `Event<index>`, which specifies which S3 event triggers the Lambda (see [here][s3-events] for a full list of available events)., then each CORS property name must be unique and thus needs a unique suffix (i.e. `CORS1`, `CORS2`, etc.). Specify the [AWS Cloudformation-supported S3 CORS Rules Properties][cors], indented and one per line, below the CORS property name.|<pre>CORS1<br>&nbsp;&nbsp;AllowedHeaders *<br>AllowedMethods GET POST<br>AllowedOrigins *<br>CORS2<br>&nbsp;AllowedHeaders *<br>&nbsp;&nbsp;AllowedMethods PUT<br>AllowedOrigins https://staging.myapp.com</pre>|


## Sample Application

There is a sample application located under `sample-app/`. `cd` into that
directory, `npm install` and you can run locally via `arc sandbox` or deploy to
the internet via `arc deploy`.

### Testing Locally

This plugin extends `arc sandbox` to provide a local development experience:

1. Kick up the local development environment by running the sandbox: `arc sandbox`
   (note the additional message logged out by Sandbox informing you of an
   additional local IoT service starting up).
2. Load up http://localhost:3333 - the JSON array at the bottom of the page
   lists out all IoT events received on the IoT Rule Topic. It should initially
   be empty.
3. With sandbox running, press the "i" key to trigger an IoT Rule. You will be
   prompted to choose an IoT Rule (the sample app contains only a single rule),
   then to enter a JSON object as a payload to deliver to the rule.
4. Reload http://localhost:3333 - your JSON payload should be listed at the
   bottom of the page.

### Testing the Deployed Version

The sample application is ready deploy to staging via `arc deploy`. Then:

1. Load the URL of your deployed app; note the JSON array at the bottom of the
   page and the objects it contains (if this is the first time you have
   deployed, it will be empty).
1. Head to the [IoT Core Console's MQTT Test Page](https://us-west-1.console.aws.amazon.com/iot/home?region=us-west-1#/test)
   (sometimes, soon after deployment, this test console will not be ready as a red
   banner will inform you; if you find that, give it a few minutes and refresh the
   page). From the IoT Core page on AWS, click the "Test" menu link on the left.
2. Click "Publish to a topic."
3. In the topic input field, enter 'hithere' (it should match the `FROM` clause
   of the `@rules` section of `app.arc`). Optionally, customize the message
   payload.
4. Load the deployed URL of the app, and a list of all messages sent to the
   `hithere` topic should be displayed.

# Contributing

Thanks for considering contributing to this project! Check out the
[contribution guidelines](CONTRIBUTING.md) for details.

[cors]: https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-s3-bucket-cors-corsrule.html#aws-properties-s3-bucket-cors-corsrule-properties
[ref-docs]: https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-s3-policy.html#aws-properties-s3-policy--examples
[ref-condition]: https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_condition-keys.html#condition-keys-referer
[s3-events]: https://docs.aws.amazon.com/AmazonS3/latest/userguide/notification-how-to-event-types-and-destinations.html#supported-notification-event-types
