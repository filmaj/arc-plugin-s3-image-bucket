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

This plugin takes heavy inspiration / straight up lifting from @brianleroux's
[macro-upload](https://github.com/architect/macro-upload) and
[arc-example-macro-upload](https://github.com/architect-examples/arc-example-macro-upload)
repos, which are based on [Leonid Shevtov's deep dive into enabling direct-from-client
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
trigger on events created by the bucket. Below is a list of options that are to
be specified unindented directly under the `@image-bucket` pragma in your `app.arc`
file. Each option also accepts sub-options that can be specified indented under
the option.

### `StaticWebsite`

The `StaticWebsite` option configures public access to your image bucket over HTTP
or HTTPS. Useful for serving user-uploaded content directly from the bucket. Setting
this option turns on static website hosting for your S3 bucket, making it accessible
to the internet.

`StaticWebsite` provides the following sub-options:

|Sub-Option|Description|Example|
|---|---|---|
|`Map`|Configures an HTTP GET route between your arc app's API Gateway instance and a path on your image bucket. Takes two required string parameters: an API Gateway route (the route web clients will use) and maps it to a route on the bucket. You _must_ use the string `{proxy+}` in the first parameter to denote a variable representing a greedy URL path, and you _must_ use the string `{proxy}` (without the +) in the second parameter to denote how that path maps to a path in your image bucket. Note that you must quote these parameters due to the special character usage. Note that if this sub-option is ommitted, you will only have HTTP access to your bucket contents using the bucket's static website hosting (whereas mapping an API Gateway route to a route on your bucket gives you HTTPS access "for free")|<pre>StaticWebsite<br>&nbsp;&nbsp;Map &#34;/img/{proxy+}&#34;&nbsp;&#34;/thumb/{proxy}&#34;</pre>|

### `CORS`

The `CORS` option configures CORS rules for the image bucket.

You can define multiple CORS rule sets by defining this option multiple times.
You can also add characters after the `CORS` characters for this option; this is
helpful for naming / documenting the rules if you are using multiple CORS rule
sets.

`CORS` supports sub-options that map directly to the [AWS Cloudformation-supported S3 CORS Rules Properties][cors],
indented and one per line:

|Sub-Option|Description|Example|
|---|---|---|
|`AllowedHeaders`|[See AWS documentation for `AllowedHeaders`](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-s3-bucket-cors-corsrule.html#cfn-s3-bucket-cors-corsrule-allowedheaders)|<pre>CORS<br>&nbsp;&nbsp;AllowedHeaders *</pre>|
|`AllowedMethods`|[See AWS documentation for `AllowedMethods`](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-s3-bucket-cors-corsrule.html#cfn-s3-bucket-cors-corsrule-allowedmethods)|<pre>CORS<br>&nbsp;&nbsp;AllowedMethods GET POST</pre>|
|`AllowedOrigins`|[See AWS documentation for `AllowedOrigins`](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-s3-bucket-cors-corsrule.html#cfn-s3-bucket-cors-corsrule-allowedorigins)|<pre>CORS<br>&nbsp;&nbsp;AllowedOrigins https://myapp.com https://*.myapp.com</pre>|
|`ExposedHeaders`|[See AWS documentation for `ExposedHeaders`](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-s3-bucket-cors-corsrule.html#cfn-s3-bucket-cors-corsrule-exposedheaders)|<pre>CORS<br>&nbsp;&nbsp;ExposedHeaders *</pre>|
|`ExposedHeaders`|[See AWS documentation for `ExposedHeaders`](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-s3-bucket-cors-corsrule.html#cfn-s3-bucket-cors-corsrule-exposedheaders)|<pre>CORS<br>&nbsp;&nbsp;ExposedHeaders *</pre>|
|`MaxAge`|[See AWS documentation for `MaxAge`](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-s3-bucket-cors-corsrule.html#cfn-s3-bucket-cors-corsrule-maxage)|<pre>CORS<br>&nbsp;&nbsp;MaxAge 300</pre>|

### `Lambda`

Configure Lambda notification triggers for the image bucket. You can configure
multiple Lambda triggers by adding this option multiple times. The option name
must start with `Lambda` and must be proceeded by more characters; this suffix
will be used to differentiate between Lambdas (and generate their name and source
directory path). Each Lambda _must_ specify at least one sub-property indented
below the `Lambda` which specifies which S3 event triggers the Lambda (see
[here][s3-events] for a full list of available events).

`Lambda` supports the following sub-options:

|Sub-Option|Description|Example|
|---|---|---|
|`[event-name] [prefix/suffix] [path]`|Each Lambda _must_ specify an S3 event name that will trigger the Lambda (see [here][s3-events] for a full list of available events). Optionally, after the S3 event name, you may specify one or more event filtering rules associated to the event. Follow the S3 event string with pairs of space-separated strings: first one of `prefix` or `suffix` followed by the expected prefix or suffix string to filter event notifications by (these map to [S3 Filter Rules - click here for more details][s3-filter-rules]). You may add up to two prefix-path string pairs, and you can add up to a maximum of one `prefix` and one `suffix` filter rule.|<pre>LambdaRawImageHandler<br>&nbsp;&nbsp;s3:ObjectCreated:&#42; prefix raw<br>&nbsp;&nbsp;s3:ObjectRemoved:&#42; prefix raw<br>LambdaOnPngUpload<br>&nbsp;&nbsp;s3:ObjectCreated:&#42; suffix png</pre>|

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
