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
   directories for the Lambda triggers. These will be created under
   `src/image-bucket`. Lambda triggers will have ImageMagick binaries installed
   thanks to a [publicly available Lambda Layer][im-layer]. If you intend to use
   ImageMagick, it is recommended to bump the memory allocated to the Lambda
   trigger by customizing the `config.arc` file inside the Lambda trigger source
   directory.
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
|`CORS`|Configure CORS rules for the bucket. You can add multiple CORS rule sets by defining this option multiple times (you can also add characters after `CORS` for this option; helpful for naming / documenting the rules if you are using multiple CORS rule sets). Specify the [AWS Cloudformation-supported S3 CORS Rules Properties][cors], indented and one per line, below each CORS option name.|<pre>CORS<br>&nbsp;&nbsp;AllowedHeaders *<br>&nbsp;&nbsp;AllowedMethods GET POST<br>&nbsp;&nbsp;AllowedOrigins *<br>CORSStagingPut<br>&nbsp;&nbsp;AllowedHeaders *<br>&nbsp;&nbsp;AllowedMethods PUT<br>&nbsp;&nbsp;AllowedOrigins https://staging.myapp.com</pre>|
|`Lambda<name>`|Configure Lambda notification triggers for the bucket. You can configure multiple Lambda triggers by adding this option multiple times. The option name must start with `Lambda` and must be proceeded by more characters; this suffix will be used to differentiate between Lambdas (and generate their name and source directory path). Each Lambda _must_ specify at least one sub-property indented below the `Lambda` which specifies which S3 event triggers the Lambda (see [here][s3-events] for a full list of available events). Optionally, after the S3 event string, you may specify one or more event filtering rules associated to `Event`s you have defined. Follow the S3 event string with two space-separated strings: first one of `prefix` or `suffix` followed by the expected prefix or suffix string to filter event notifications by (these map to [S3 Filter Rules - click here for more details][s3-filter-rules]). You may add up to two prefix-path string pairs, and you can only add them.|<pre>LambdaRawImageHandler<br>&nbsp;&nbsp;s3:ObjectCreated:&#42; prefix raw<br>&nbsp;&nbsp;s3:ObjectRemoved:&#42; prefix raw<br>LambdaOnPngUpload<br>&nbsp;&nbsp;s3:ObjectRemoved:&#42; suffix png</pre>|


## Sample Application

There is a sample application located under `sample-app/`. `cd` into that
directory, `npm install` and you can run locally via `arc sandbox` or deploy to
the internet via `arc deploy`.

### Testing Locally

TODO: want to get local s3 mock up for sure
Might be complicated, need to take the StaticWebsite into account

### Testing the Deployed Version

TODO: The sample application is ready deploy to staging via `arc deploy`. Then:

# Contributing

Thanks for considering contributing to this project! Check out the
[contribution guidelines](CONTRIBUTING.md) for details.

[cors]: https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-s3-bucket-cors-corsrule.html#aws-properties-s3-bucket-cors-corsrule-properties
[ref-docs]: https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-s3-policy.html#aws-properties-s3-policy--examples
[ref-condition]: https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_condition-keys.html#condition-keys-referer
[s3-events]: https://docs.aws.amazon.com/AmazonS3/latest/userguide/notification-how-to-event-types-and-destinations.html#supported-notification-event-types
[s3-filter-rule]: https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-s3-bucket-notificationconfiguration-config-filter-s3key-rules.html
[im-layer]: https://serverlessrepo.aws.amazon.com/applications/arn:aws:serverlessrepo:us-east-1:145266761615:applications~image-magick-lambda-layer
