# HardwarePro — AWS Deployment Guide

## 📁 Your Project Files (in `DEMO/` folder)
```
DEMO/
├── index.html                    ← Your original frontend (save here manually — see Step 1)
├── razorpay-integration.js       ← Razorpay override (add 1 line to index.html — see Step 2)
├── lambda/
│   ├── createOrder/index.js      ← Lambda: creates Razorpay order
│   └── confirmPayment/index.js   ← Lambda: verifies payment + saves to DynamoDB
└── infrastructure/
    └── template.yaml             ← CloudFormation (deploys everything on AWS)
```

---

## ✅ STEP 1 — Save Your Frontend HTML

1. Copy your original HTML code
2. Save it as: `C:\Users\DRAGOO\OneDrive\Desktop\DEMO\index.html`
3. Open `index.html` in any text editor (Notepad works)
4. Find this line near the bottom (just before `</body>`):
   ```html
   </script>
   </body>
   ```
5. Insert **one line** between them:
   ```html
       </script>
       <script src="razorpay-integration.js"></script>
   </body>
   ```
6. Save the file.

> This loads the Razorpay integration without changing any of your original code.

---

## ✅ STEP 2 — Install AWS CLI

✅ **DONE** — AWS CLI v2.34.0 installed successfully.

---

## ✅ STEP 3 — Create an IAM User Access Key

> ⚠️ Do NOT use the Root account — you need an **IAM user** with an Access Key.

**If you don't have an IAM user yet:**
1. Go to → https://console.aws.amazon.com/iam/home#/users
2. Click **Create user** → Username: `hardwarepro-deploy`
3. Click **Next** → Select **Attach policies directly**
4. Check ✅ **AdministratorAccess** → Next → Create user

**Create the Access Key (do this for your IAM user):**
1. Click on your IAM user in the list
2. Go to the **Security credentials** tab
3. Scroll to **Access keys** → Click **Create access key**
4. Choose **Command Line Interface (CLI)** → Next → Create
5. **⚠️ Copy both keys NOW** — you can't see the Secret again!

---

## ✅ STEP 4 — Configure AWS CLI

Open PowerShell and run:
```powershell
aws configure
```
Enter:
- **AWS Access Key ID**: *(your new IAM key)*
- **AWS Secret Access Key**: *(your new IAM secret)*
- **Default region name**: `us-east-1`
- **Default output format**: `json`

Verify it works:
```powershell
aws sts get-caller-identity
```
You should see your **Account ID** and **UserId** printed. ✅

---

## ✅ STEP 5 — Deploy CloudFormation Stack

Run this in PowerShell from the `DEMO` folder:

```powershell
cd "C:\Users\DRAGOO\OneDrive\Desktop\DEMO"

aws cloudformation create-stack `
  --stack-name HardwarePro `
  --template-body file://infrastructure/template.yaml `
  --parameters ParameterKey=RazorpayKeySecret,ParameterValue=Eccm72H7nyOm9UTyOkgBqhG1 `
  --capabilities CAPABILITY_NAMED_IAM `
  --region us-east-1
```

Wait for completion (~3-5 minutes):
```powershell
aws cloudformation wait stack-create-complete --stack-name HardwarePro --region us-east-1
```

Get your URLs:
```powershell
aws cloudformation describe-stacks --stack-name HardwarePro --region us-east-1 --query "Stacks[0].Outputs"
```

You will see output like:
```json
[
  { "OutputKey": "ApiEndpoint",   "OutputValue": "https://abc123.execute-api.us-east-1.amazonaws.com/prod" },
  { "OutputKey": "S3BucketName",  "OutputValue": "hardwarepro-frontend-123456789" },
  { "OutputKey": "CloudFrontURL", "OutputValue": "https://d1234abcd.cloudfront.net" }
]
```

---

## ✅ STEP 6 — Update API Endpoint in Frontend

1. Open `DEMO\razorpay-integration.js` in Notepad
2. Find this line:
   ```javascript
   AWS_CONFIG.apiEndpoint = 'YOUR_API_GATEWAY_URL';
   ```
3. Replace with your actual `ApiEndpoint` value, e.g.:
   ```javascript
   AWS_CONFIG.apiEndpoint = 'https://abc123.execute-api.ap-south-1.amazonaws.com/prod';
   ```
4. Save the file.

---

## ✅ STEP 7 — Upload Frontend to S3

Replace `YOUR_BUCKET_NAME` with the `S3BucketName` from Step 5:

```powershell
cd "C:\Users\DRAGOO\OneDrive\Desktop\DEMO"

aws s3 cp index.html s3://YOUR_BUCKET_NAME/
aws s3 cp razorpay-integration.js s3://YOUR_BUCKET_NAME/
```

---

## ✅ STEP 8 — Access Your Live Website

Your site is live at the `CloudFrontURL` from Step 5, e.g.:
```
https://d1234abcd.cloudfront.net
```

> ⚠️ CloudFront can take **10-15 minutes** to fully propagate the first time.

---

## 🔄 Payment Flow (How It Works)

```
User clicks "Checkout & Pay"
        ↓
razorpay-integration.js calls:
  POST /create-order → Lambda → Razorpay API → returns order_id
        ↓
Razorpay Checkout popup opens
        ↓
User pays (test card: 4111 1111 1111 1111 / any CVV / future date)
        ↓
razorpay-integration.js calls:
  POST /confirm-payment → Lambda → Verifies HMAC signature → Saves to DynamoDB
        ↓
finalizeTransaction() runs → Bill cleared ✅
```

---

## 🔐 Security Notes

| Item | Where Stored | Safe? |
|---|---|---|
| Razorpay Key ID (`rzp_test_...`) | Frontend JS | ✅ Public (OK) |
| Razorpay Key Secret | Lambda Env Variable (encrypted) | ✅ Server-side only |
| AWS Keys | Your local machine only | ✅ Never in code |

---

## 🧪 Test Cards (Razorpay Test Mode)

| Card Number | CVV | Expiry |
|---|---|---|
| 4111 1111 1111 1111 | Any 3 digits | Any future date |
| 5267 3181 8797 5449 | Any 3 digits | Any future date |

UPI: `success@razorpay`

---

## 🗑️ Cleanup (To Avoid Charges)

```powershell
# Empty the S3 bucket first
aws s3 rm s3://YOUR_BUCKET_NAME --recursive

# Delete the CloudFormation stack (removes everything)
aws cloudformation delete-stack --stack-name HardwarePro --region us-east-1
```
