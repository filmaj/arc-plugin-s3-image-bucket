@app
arc-plugin-s3-image-bucket-example

@http
get /

@static

@image-bucket
StaticWebsite
CORS1
  AllowedHeaders *
  AllowedMethods GET POST
  AllowedOrigins *
  MaxAge 3000
LambdaCreateHook
  EventObjectCreated s3:ObjectCreated:* 
  EventObjectCreated.RulePrefix prefix raw
LambdaDeleteHook
  EventObjectRemoved s3:ObjectRemoved:*
  EventObjectRemoved.RulePrefix prefix raw


@plugins
arc-plugin-s3-image-bucket
