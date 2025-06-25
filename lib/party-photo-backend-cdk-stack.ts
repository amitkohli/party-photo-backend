import { Stack, StackProps, RemovalPolicy, CfnOutput } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as path from 'path';

export class PartyPhotoBackendCdkStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    //
    // S3 bucket for frontend
    //
    const frontendBucket = new s3.Bucket(this, 'PartyFrontendBucket', {
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    });

    //
    // Origin Access Control for CloudFront
    //
    const oac = new cloudfront.CfnOriginAccessControl(this, 'PartyFrontendOAC', {
      originAccessControlConfig: {
        name: 'PartyFrontendOAC',
        originAccessControlOriginType: 's3',
        signingBehavior: 'always',
        signingProtocol: 'sigv4',
      },
    });

    //
    // CloudFront distribution
    //
    const distribution = new cloudfront.CfnDistribution(this, 'PartyFrontendDistribution', {
      distributionConfig: {
        enabled: true,
        defaultRootObject: 'index.html',
        origins: [
          {
            id: 'S3Origin',
            domainName: frontendBucket.bucketRegionalDomainName,
            originAccessControlId: oac.attrId,
            s3OriginConfig: {}, // Required for S3 + OAC
          },
        ],
        defaultCacheBehavior: {
          targetOriginId: 'S3Origin',
          viewerProtocolPolicy: 'redirect-to-https',
          allowedMethods: ['GET', 'HEAD', 'OPTIONS'],
          cachedMethods: ['GET', 'HEAD'],
          compress: true,
          cachePolicyId: cloudfront.CachePolicy.CACHING_DISABLED.cachePolicyId,
        },
        customErrorResponses: [
          {
            errorCode: 403,
            responseCode: 200,
            responsePagePath: '/index.html',
          },
          {
            errorCode: 404,
            responseCode: 200,
            responsePagePath: '/index.html',
          },
        ],
        priceClass: 'PriceClass_100',
        httpVersion: 'http2',
        viewerCertificate: {
          cloudFrontDefaultCertificate: true,
        },
      },
    });

    //
    // S3 bucket policy to allow CloudFront (OAC) access
    //
    frontendBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        actions: ['s3:GetObject'],
        resources: [`${frontendBucket.bucketArn}/*`],
        principals: [new iam.ServicePrincipal('cloudfront.amazonaws.com')],
        conditions: {
          StringEquals: {
            'AWS:SourceArn': `arn:aws:cloudfront::${this.account}:distribution/${distribution.ref}`,
          },
        },
      })
    );

    //
    // DynamoDB tables
    //
    const photosTable = new dynamodb.Table(this, 'PhotosTable', {
      partitionKey: { name: 'party', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'photoId', type: dynamodb.AttributeType.STRING },
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const tokensTable = new dynamodb.Table(this, 'TokensTable', {
      partitionKey: { name: 'token', type: dynamodb.AttributeType.STRING },
      removalPolicy: RemovalPolicy.DESTROY,
    });

    //
    // Lambda function example: getPhotosByParty
    //
    const getPhotosByPartyFn = new lambda.Function(this, 'GetPhotosByPartyFunction', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'getPhotosByParty.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda')),
      environment: {
        PHOTOS_TABLE: photosTable.tableName,
      },
    });
    photosTable.grantReadData(getPhotosByPartyFn);

    //
    // API Gateway with CORS
    //
    const api = new apigateway.RestApi(this, 'PartyPhotoApi', {
      restApiName: 'Party Photo Service',
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
      },
    });

    const photos = api.root.addResource('photos');
    photos.addMethod('GET', new apigateway.LambdaIntegration(getPhotosByPartyFn));

    //
    // Output CloudFront distribution URL
    //
    new CfnOutput(this, 'FrontendURL', {
      value: `https://${distribution.attrDomainName}`,
    });

    new CfnOutput(this, 'ApiURL', {
      value: api.url,
    });
  }
}
