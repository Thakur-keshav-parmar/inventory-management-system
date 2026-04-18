import subprocess
import json
import os

template_path = r"C:\Users\DRAGOO\OneDrive\Desktop\DEMO\infrastructure\template.yaml"

# 1. Fetch template via AWS CLI
print("Fetching original template from CloudFormation...")
cmd = [r"C:\Program Files\Amazon\AWSCLIV2\aws.exe", "cloudformation", "get-template", "--stack-name", "HardwarePro", "--region", "us-east-1"]
# Add AWS_PAGER="" to env
env = os.environ.copy()
env["AWS_PAGER"] = ""

result = subprocess.run(cmd, capture_output=True, text=True, env=env)
if result.returncode != 0:
    print(f"Error fetching template: {result.stderr}")
    exit(1)

template_data = json.loads(result.stdout)
content = template_data.get("TemplateBody", "")

if not content:
    print("Empty TemplateBody returned")
    exit(1)

print(f"Got template, size {len(content)}")

# 2. Find insertion point - just before the Outputs section
outputs_idx = content.find('Outputs:\n')
if outputs_idx == -1:
    outputs_idx = content.find('\nOutputs:\n')
    if outputs_idx == -1:
        outputs_idx = content.find('\nOutputs:\r\n')

if outputs_idx == -1:
    print("Could not find Outputs section!")
    print(content[-500:])
    exit(1)

print(f"Inserting at position {outputs_idx}")

new_resources = '''
  # ─── DYNAMODB: NEW TABLES ─────────────────────────────────────────────────
  ProductsTable:
    Type: AWS::DynamoDB::Table
    Properties:
      TableName: HardwareProProducts
      BillingMode: PAY_PER_REQUEST
      AttributeDefinitions:
        - AttributeName: productId
          AttributeType: S
      KeySchema:
        - AttributeName: productId
          KeyType: HASH

  UsersTable:
    Type: AWS::DynamoDB::Table
    Properties:
      TableName: HardwareProUsers
      BillingMode: PAY_PER_REQUEST
      AttributeDefinitions:
        - AttributeName: username
          AttributeType: S
      KeySchema:
        - AttributeName: username
          KeyType: HASH

  BillsTable:
    Type: AWS::DynamoDB::Table
    Properties:
      TableName: HardwareProBills
      BillingMode: PAY_PER_REQUEST
      AttributeDefinitions:
        - AttributeName: billId
          AttributeType: S
      KeySchema:
        - AttributeName: billId
          KeyType: HASH

  SettingsTable:
    Type: AWS::DynamoDB::Table
    Properties:
      TableName: HardwareProSettings
      BillingMode: PAY_PER_REQUEST
      AttributeDefinitions:
        - AttributeName: settingKey
          AttributeType: S
      KeySchema:
        - AttributeName: settingKey
          KeyType: HASH

  # ─── IAM: GRANT LAMBDA ACCESS TO ALL NEW TABLES ──────────────────────────
  LambdaNewTablesPolicy:
    Type: AWS::IAM::Policy
    Properties:
      PolicyName: HardwarePro-NewTables-Policy
      Roles:
        - !Ref LambdaExecutionRole
      PolicyDocument:
        Version: '2012-10-17'
        Statement:
          - Effect: Allow
            Action:
              - dynamodb:PutItem
              - dynamodb:GetItem
              - dynamodb:UpdateItem
              - dynamodb:DeleteItem
              - dynamodb:Scan
              - dynamodb:Query
            Resource:
              - !GetAtt ProductsTable.Arn
              - !GetAtt UsersTable.Arn
              - !GetAtt BillsTable.Arn
              - !GetAtt SettingsTable.Arn

  # ─── LAMBDA: PRODUCTS CRUD ────────────────────────────────────────────────
  ProductsFunction:
    Type: AWS::Lambda::Function
    Properties:
      FunctionName: HardwarePro-Products
      Runtime: nodejs18.x
      Handler: index.handler
      Role: !GetAtt LambdaExecutionRole.Arn
      Timeout: 30
      MemorySize: 128
      Environment:
        Variables:
          TABLE_NAME: !Ref ProductsTable
      Code:
        ZipFile: |
          const {DynamoDBClient,ScanCommand,PutItemCommand,DeleteItemCommand}=require('@aws-sdk/client-dynamodb');
          const {marshall,unmarshall}=require('@aws-sdk/util-dynamodb');
          const db=new DynamoDBClient({});const T=process.env.TABLE_NAME;
          const h={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type','Access-Control-Allow-Methods':'GET,POST,DELETE,OPTIONS','Content-Type':'application/json'};
          exports.handler=async(e)=>{
            if(e.httpMethod==='OPTIONS')return{statusCode:200,headers:h,body:''};
            try{
              if(e.httpMethod==='GET'){const r=await db.send(new ScanCommand({TableName:T}));return{statusCode:200,headers:h,body:JSON.stringify(r.Items.map(i=>unmarshall(i)))};}
              if(e.httpMethod==='POST'){const item=JSON.parse(e.body);await db.send(new PutItemCommand({TableName:T,Item:marshall(item,{removeUndefinedValues:true})}));return{statusCode:200,headers:h,body:JSON.stringify({success:true})};}
              if(e.httpMethod==='DELETE'){const b=JSON.parse(e.body);await db.send(new DeleteItemCommand({TableName:T,Key:{productId:{S:b.productId}}}));return{statusCode:200,headers:h,body:JSON.stringify({success:true})};}
            }catch(err){return{statusCode:500,headers:h,body:JSON.stringify({error:err.message})};}
          };

  # ─── LAMBDA: USERS CRUD ───────────────────────────────────────────────────
  UsersFunction:
    Type: AWS::Lambda::Function
    Properties:
      FunctionName: HardwarePro-Users
      Runtime: nodejs18.x
      Handler: index.handler
      Role: !GetAtt LambdaExecutionRole.Arn
      Timeout: 30
      MemorySize: 128
      Environment:
        Variables:
          TABLE_NAME: !Ref UsersTable
      Code:
        ZipFile: |
          const {DynamoDBClient,ScanCommand,PutItemCommand,DeleteItemCommand}=require('@aws-sdk/client-dynamodb');
          const {marshall,unmarshall}=require('@aws-sdk/util-dynamodb');
          const db=new DynamoDBClient({});const T=process.env.TABLE_NAME;
          const h={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type','Access-Control-Allow-Methods':'GET,POST,DELETE,OPTIONS','Content-Type':'application/json'};
          exports.handler=async(e)=>{
            if(e.httpMethod==='OPTIONS')return{statusCode:200,headers:h,body:''};
            try{
              if(e.httpMethod==='GET'){const r=await db.send(new ScanCommand({TableName:T}));return{statusCode:200,headers:h,body:JSON.stringify(r.Items.map(i=>unmarshall(i)))};}
              if(e.httpMethod==='POST'){const item=JSON.parse(e.body);await db.send(new PutItemCommand({TableName:T,Item:marshall(item,{removeUndefinedValues:true})}));return{statusCode:200,headers:h,body:JSON.stringify({success:true})};}
              if(e.httpMethod==='DELETE'){const b=JSON.parse(e.body);await db.send(new DeleteItemCommand({TableName:T,Key:{username:{S:b.username}}}));return{statusCode:200,headers:h,body:JSON.stringify({success:true})};}
            }catch(err){return{statusCode:500,headers:h,body:JSON.stringify({error:err.message})};}
          };

  # ─── LAMBDA: BILLS CRUD ───────────────────────────────────────────────────
  BillsFunction:
    Type: AWS::Lambda::Function
    Properties:
      FunctionName: HardwarePro-Bills
      Runtime: nodejs18.x
      Handler: index.handler
      Role: !GetAtt LambdaExecutionRole.Arn
      Timeout: 30
      MemorySize: 128
      Environment:
        Variables:
          TABLE_NAME: !Ref BillsTable
      Code:
        ZipFile: |
          const {DynamoDBClient,ScanCommand,PutItemCommand}=require('@aws-sdk/client-dynamodb');
          const {marshall,unmarshall}=require('@aws-sdk/util-dynamodb');
          const db=new DynamoDBClient({});const T=process.env.TABLE_NAME;
          const h={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Content-Type':'application/json'};
          exports.handler=async(e)=>{
            if(e.httpMethod==='OPTIONS')return{statusCode:200,headers:h,body:''};
            try{
              if(e.httpMethod==='GET'){const r=await db.send(new ScanCommand({TableName:T}));return{statusCode:200,headers:h,body:JSON.stringify(r.Items.map(i=>unmarshall(i)))};}
              if(e.httpMethod==='POST'){const item=JSON.parse(e.body);await db.send(new PutItemCommand({TableName:T,Item:marshall(item,{removeUndefinedValues:true})}));return{statusCode:200,headers:h,body:JSON.stringify({success:true})};}
            }catch(err){return{statusCode:500,headers:h,body:JSON.stringify({error:err.message})};}
          };

  # ─── LAMBDA: SETTINGS CRUD ────────────────────────────────────────────────
  SettingsFunction:
    Type: AWS::Lambda::Function
    Properties:
      FunctionName: HardwarePro-Settings
      Runtime: nodejs18.x
      Handler: index.handler
      Role: !GetAtt LambdaExecutionRole.Arn
      Timeout: 30
      MemorySize: 128
      Environment:
        Variables:
          TABLE_NAME: !Ref SettingsTable
      Code:
        ZipFile: |
          const {DynamoDBClient,GetItemCommand,PutItemCommand}=require('@aws-sdk/client-dynamodb');
          const {marshall,unmarshall}=require('@aws-sdk/util-dynamodb');
          const db=new DynamoDBClient({});const T=process.env.TABLE_NAME;
          const h={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Content-Type':'application/json'};
          exports.handler=async(e)=>{
            if(e.httpMethod==='OPTIONS')return{statusCode:200,headers:h,body:''};
            try{
              if(e.httpMethod==='GET'){const r=await db.send(new GetItemCommand({TableName:T,Key:{settingKey:{S:'store'}}}));return{statusCode:200,headers:h,body:JSON.stringify(r.Item?unmarshall(r.Item):{settingKey:'store'})};}
              if(e.httpMethod==='POST'){const item={...JSON.parse(e.body),settingKey:'store'};await db.send(new PutItemCommand({TableName:T,Item:marshall(item,{removeUndefinedValues:true})}));return{statusCode:200,headers:h,body:JSON.stringify({success:true})};}
            }catch(err){return{statusCode:500,headers:h,body:JSON.stringify({error:err.message})};}
          };

  # ─── API GATEWAY: /products ───────────────────────────────────────────────
  ProductsResource:
    Type: AWS::ApiGateway::Resource
    Properties:
      RestApiId: !Ref HardwareProApi
      ParentId: !GetAtt HardwareProApi.RootResourceId
      PathPart: products

  ProductsGet:
    Type: AWS::ApiGateway::Method
    Properties:
      RestApiId: !Ref HardwareProApi
      ResourceId: !Ref ProductsResource
      HttpMethod: GET
      AuthorizationType: NONE
      Integration:
        Type: AWS_PROXY
        IntegrationHttpMethod: POST
        Uri: !Sub 'arn:aws:apigateway:${AWS::Region}:lambda:path/2015-03-31/functions/${ProductsFunction.Arn}/invocations'

  ProductsPost:
    Type: AWS::ApiGateway::Method
    Properties:
      RestApiId: !Ref HardwareProApi
      ResourceId: !Ref ProductsResource
      HttpMethod: POST
      AuthorizationType: NONE
      Integration:
        Type: AWS_PROXY
        IntegrationHttpMethod: POST
        Uri: !Sub 'arn:aws:apigateway:${AWS::Region}:lambda:path/2015-03-31/functions/${ProductsFunction.Arn}/invocations'

  ProductsDelete:
    Type: AWS::ApiGateway::Method
    Properties:
      RestApiId: !Ref HardwareProApi
      ResourceId: !Ref ProductsResource
      HttpMethod: DELETE
      AuthorizationType: NONE
      Integration:
        Type: AWS_PROXY
        IntegrationHttpMethod: POST
        Uri: !Sub 'arn:aws:apigateway:${AWS::Region}:lambda:path/2015-03-31/functions/${ProductsFunction.Arn}/invocations'

  ProductsOptions:
    Type: AWS::ApiGateway::Method
    Properties:
      RestApiId: !Ref HardwareProApi
      ResourceId: !Ref ProductsResource
      HttpMethod: OPTIONS
      AuthorizationType: NONE
      Integration:
        Type: MOCK
        RequestTemplates:
          application/json: '{"statusCode":200}'
        IntegrationResponses:
          - StatusCode: 200
            ResponseParameters:
              method.response.header.Access-Control-Allow-Headers: "'Content-Type'"
              method.response.header.Access-Control-Allow-Methods: "'GET,POST,DELETE,OPTIONS'"
              method.response.header.Access-Control-Allow-Origin: "'*'"
            ResponseTemplates:
              application/json: ''
      MethodResponses:
        - StatusCode: 200
          ResponseParameters:
            method.response.header.Access-Control-Allow-Headers: true
            method.response.header.Access-Control-Allow-Methods: true
            method.response.header.Access-Control-Allow-Origin: true

  # ─── API GATEWAY: /users ──────────────────────────────────────────────────
  UsersResource:
    Type: AWS::ApiGateway::Resource
    Properties:
      RestApiId: !Ref HardwareProApi
      ParentId: !GetAtt HardwareProApi.RootResourceId
      PathPart: users

  UsersGet:
    Type: AWS::ApiGateway::Method
    Properties:
      RestApiId: !Ref HardwareProApi
      ResourceId: !Ref UsersResource
      HttpMethod: GET
      AuthorizationType: NONE
      Integration:
        Type: AWS_PROXY
        IntegrationHttpMethod: POST
        Uri: !Sub 'arn:aws:apigateway:${AWS::Region}:lambda:path/2015-03-31/functions/${UsersFunction.Arn}/invocations'

  UsersPost:
    Type: AWS::ApiGateway::Method
    Properties:
      RestApiId: !Ref HardwareProApi
      ResourceId: !Ref UsersResource
      HttpMethod: POST
      AuthorizationType: NONE
      Integration:
        Type: AWS_PROXY
        IntegrationHttpMethod: POST
        Uri: !Sub 'arn:aws:apigateway:${AWS::Region}:lambda:path/2015-03-31/functions/${UsersFunction.Arn}/invocations'

  UsersDelete:
    Type: AWS::ApiGateway::Method
    Properties:
      RestApiId: !Ref HardwareProApi
      ResourceId: !Ref UsersResource
      HttpMethod: DELETE
      AuthorizationType: NONE
      Integration:
        Type: AWS_PROXY
        IntegrationHttpMethod: POST
        Uri: !Sub 'arn:aws:apigateway:${AWS::Region}:lambda:path/2015-03-31/functions/${UsersFunction.Arn}/invocations'

  UsersOptions:
    Type: AWS::ApiGateway::Method
    Properties:
      RestApiId: !Ref HardwareProApi
      ResourceId: !Ref UsersResource
      HttpMethod: OPTIONS
      AuthorizationType: NONE
      Integration:
        Type: MOCK
        RequestTemplates:
          application/json: '{"statusCode":200}'
        IntegrationResponses:
          - StatusCode: 200
            ResponseParameters:
              method.response.header.Access-Control-Allow-Headers: "'Content-Type'"
              method.response.header.Access-Control-Allow-Methods: "'GET,POST,DELETE,OPTIONS'"
              method.response.header.Access-Control-Allow-Origin: "'*'"
            ResponseTemplates:
              application/json: ''
      MethodResponses:
        - StatusCode: 200
          ResponseParameters:
            method.response.header.Access-Control-Allow-Headers: true
            method.response.header.Access-Control-Allow-Methods: true
            method.response.header.Access-Control-Allow-Origin: true

  # ─── API GATEWAY: /bills ──────────────────────────────────────────────────
  BillsResource:
    Type: AWS::ApiGateway::Resource
    Properties:
      RestApiId: !Ref HardwareProApi
      ParentId: !GetAtt HardwareProApi.RootResourceId
      PathPart: bills

  BillsGet:
    Type: AWS::ApiGateway::Method
    Properties:
      RestApiId: !Ref HardwareProApi
      ResourceId: !Ref BillsResource
      HttpMethod: GET
      AuthorizationType: NONE
      Integration:
        Type: AWS_PROXY
        IntegrationHttpMethod: POST
        Uri: !Sub 'arn:aws:apigateway:${AWS::Region}:lambda:path/2015-03-31/functions/${BillsFunction.Arn}/invocations'

  BillsPost:
    Type: AWS::ApiGateway::Method
    Properties:
      RestApiId: !Ref HardwareProApi
      ResourceId: !Ref BillsResource
      HttpMethod: POST
      AuthorizationType: NONE
      Integration:
        Type: AWS_PROXY
        IntegrationHttpMethod: POST
        Uri: !Sub 'arn:aws:apigateway:${AWS::Region}:lambda:path/2015-03-31/functions/${BillsFunction.Arn}/invocations'

  BillsOptions:
    Type: AWS::ApiGateway::Method
    Properties:
      RestApiId: !Ref HardwareProApi
      ResourceId: !Ref BillsResource
      HttpMethod: OPTIONS
      AuthorizationType: NONE
      Integration:
        Type: MOCK
        RequestTemplates:
          application/json: '{"statusCode":200}'
        IntegrationResponses:
          - StatusCode: 200
            ResponseParameters:
              method.response.header.Access-Control-Allow-Headers: "'Content-Type'"
              method.response.header.Access-Control-Allow-Methods: "'GET,POST,OPTIONS'"
              method.response.header.Access-Control-Allow-Origin: "'*'"
            ResponseTemplates:
              application/json: ''
      MethodResponses:
        - StatusCode: 200
          ResponseParameters:
            method.response.header.Access-Control-Allow-Headers: true
            method.response.header.Access-Control-Allow-Methods: true
            method.response.header.Access-Control-Allow-Origin: true

  # ─── API GATEWAY: /settings ───────────────────────────────────────────────
  SettingsResource:
    Type: AWS::ApiGateway::Resource
    Properties:
      RestApiId: !Ref HardwareProApi
      ParentId: !GetAtt HardwareProApi.RootResourceId
      PathPart: settings

  SettingsGet:
    Type: AWS::ApiGateway::Method
    Properties:
      RestApiId: !Ref HardwareProApi
      ResourceId: !Ref SettingsResource
      HttpMethod: GET
      AuthorizationType: NONE
      Integration:
        Type: AWS_PROXY
        IntegrationHttpMethod: POST
        Uri: !Sub 'arn:aws:apigateway:${AWS::Region}:lambda:path/2015-03-31/functions/${SettingsFunction.Arn}/invocations'

  SettingsPost:
    Type: AWS::ApiGateway::Method
    Properties:
      RestApiId: !Ref HardwareProApi
      ResourceId: !Ref SettingsResource
      HttpMethod: POST
      AuthorizationType: NONE
      Integration:
        Type: AWS_PROXY
        IntegrationHttpMethod: POST
        Uri: !Sub 'arn:aws:apigateway:${AWS::Region}:lambda:path/2015-03-31/functions/${SettingsFunction.Arn}/invocations'

  SettingsOptions:
    Type: AWS::ApiGateway::Method
    Properties:
      RestApiId: !Ref HardwareProApi
      ResourceId: !Ref SettingsResource
      HttpMethod: OPTIONS
      AuthorizationType: NONE
      Integration:
        Type: MOCK
        RequestTemplates:
          application/json: '{"statusCode":200}'
        IntegrationResponses:
          - StatusCode: 200
            ResponseParameters:
              method.response.header.Access-Control-Allow-Headers: "'Content-Type'"
              method.response.header.Access-Control-Allow-Methods: "'GET,POST,OPTIONS'"
              method.response.header.Access-Control-Allow-Origin: "'*'"
            ResponseTemplates:
              application/json: ''
      MethodResponses:
        - StatusCode: 200
          ResponseParameters:
            method.response.header.Access-Control-Allow-Headers: true
            method.response.header.Access-Control-Allow-Methods: true
            method.response.header.Access-Control-Allow-Origin: true

  # ─── LAMBDA PERMISSIONS ────────────────────────────────────────────────────
  ProductsPermission:
    Type: AWS::Lambda::Permission
    Properties:
      FunctionName: !Ref ProductsFunction
      Action: lambda:InvokeFunction
      Principal: apigateway.amazonaws.com
      SourceArn: !Sub 'arn:aws:execute-api:${AWS::Region}:${AWS::AccountId}:${HardwareProApi}/*/*/*'

  UsersPermission:
    Type: AWS::Lambda::Permission
    Properties:
      FunctionName: !Ref UsersFunction
      Action: lambda:InvokeFunction
      Principal: apigateway.amazonaws.com
      SourceArn: !Sub 'arn:aws:execute-api:${AWS::Region}:${AWS::AccountId}:${HardwareProApi}/*/*/*'

  BillsPermission:
    Type: AWS::Lambda::Permission
    Properties:
      FunctionName: !Ref BillsFunction
      Action: lambda:InvokeFunction
      Principal: apigateway.amazonaws.com
      SourceArn: !Sub 'arn:aws:execute-api:${AWS::Region}:${AWS::AccountId}:${HardwareProApi}/*/*/*'

  SettingsPermission:
    Type: AWS::Lambda::Permission
    Properties:
      FunctionName: !Ref SettingsFunction
      Action: lambda:InvokeFunction
      Principal: apigateway.amazonaws.com
      SourceArn: !Sub 'arn:aws:execute-api:${AWS::Region}:${AWS::AccountId}:${HardwareProApi}/*/*/*'

  # ─── NEW DEPLOYMENT (includes all new routes) ─────────────────────────────
  ApiDeploymentV2:
    Type: AWS::ApiGateway::Deployment
    DependsOn:
      - ProductsGet
      - ProductsPost
      - ProductsDelete
      - ProductsOptions
      - UsersGet
      - UsersPost
      - UsersDelete
      - UsersOptions
      - BillsGet
      - BillsPost
      - BillsOptions
      - SettingsGet
      - SettingsPost
      - SettingsOptions
    Properties:
      RestApiId: !Ref HardwareProApi
'''

# Insert new resources before Outputs
new_content = content[:outputs_idx] + new_resources + '\n' + content[outputs_idx:]

# Also update ApiStage to use new deployment
new_content = new_content.replace(
    'DeploymentId: !Ref ApiDeployment\n',
    'DeploymentId: !Ref ApiDeploymentV2\n'
)

with open(template_path, 'w', encoding='utf-8') as f:
    f.write(new_content)

print(f"Done. Template size: {len(new_content)} chars")
