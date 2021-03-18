@app
arc-plugin-s3-image-bucket-example

@http
get /
get /success

@static

@image-bucket
StaticWebsite
CORS
  AllowedHeaders *
  AllowedMethods GET POST
  AllowedOrigins *
  MaxAge 3000
LambdaOnImageCreate
  s3:ObjectCreated:* prefix raw

@plugins
arc-plugin-s3-image-bucket
