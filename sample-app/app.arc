@app
arc-plugin-s3-image-bucket-example

@http
get /

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
LambdaOnImageRemove
  s3:ObjectRemoved:* prefix raw

@plugins
arc-plugin-s3-image-bucket
